//! The program that runs the built-in AI model (see `docs/local-ai-plan.md`): llama.cpp's `llama-server`, started by OpenExplainer on this PC only and stopped again.
//!
//! It is started when a draft is asked for (or the Test the AI button is pressed), listens on `127.0.0.1` (this PC, not the network) on a free port, and wants a password made fresh for each run
//! that only OpenExplainer knows, so no other program can use it. The password is given to it in its environment (LLAMA_API_KEY), not on its command line, which other programs can
//! read; and before the port is used, Windows is asked which program listens on it, so a program that took the port first is never sent the book's text (security review,
//! 2026-11-13). Its own web page and slot list are switched off. It dies with OpenExplainer: it is put in a Windows "job" that ends every
//! program in it when the last handle to the job closes, which happens however OpenExplainer ends, even if it is killed. The TypeScript (`src/ai/runtime.ts`) decides when to start and stop; this
//! file only does what needs the shell: find the program, start it hidden, wait until it answers, stop it.
//!
//! The program is looked for beside OpenExplainer (the installer puts it in a `llama` folder; `Get AI Runtime.bat` puts it in `src-tauri/runtime/llama` for a development build).

use crate::config::data_folder;
use crate::models::model_path;
use serde_json::{json, Value};
use std::fs::File;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

/// The longest to wait for the model to load and the program to answer, in seconds. A cold start from a slow disk can take a while.
const MOST_SECONDS_TO_START: u64 = 180;

/// What is running, if anything.
#[derive(Default)]
pub struct RuntimeState {
    inner: Mutex<Option<Running>>,
}

struct Running {
    child: Child,
    port: u16,
    api_key: String,
    file: String,
}

/// The folder that holds `llama-server.exe`, looking in the places it can be.
fn find_runtime(app: &AppHandle) -> Result<PathBuf, String> {
    let mut places: Vec<PathBuf> = Vec::new();
    if cfg!(debug_assertions) {
        if let Some(p) = std::env::var_os("OPENEXPLAINER_LLAMA_DIR") {
            places.push(PathBuf::from(p));
        }
    }
    if let Ok(resources) = app.path().resource_dir() {
        places.push(resources.join("llama"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(folder) = exe.parent() {
            places.push(folder.join("llama"));
        }
    }
    if cfg!(debug_assertions) {
        places.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("runtime").join("llama"));
    }
    places
        .into_iter()
        .find(|p| p.join("llama-server.exe").is_file())
        .ok_or_else(|| "The program that runs the model (llama-server.exe) was not found beside OpenExplainer. Reinstalling OpenExplainer puts it back.".to_string())
}

/// A password that is safe to put on a command line: letters and digits, long enough to be hard to guess.
fn good_key(key: &str) -> bool {
    key.len() >= 16 && key.len() <= 128 && key.chars().all(|c| c.is_ascii_alphanumeric())
}

/// A port nobody is using right now on this PC.
fn free_port() -> Result<u16, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| format!("A free port on this PC could not be found: {e}"))?;
    listener.local_addr().map(|a| a.port()).map_err(|e| format!("A free port on this PC could not be found: {e}"))
}

/// The options the program is started with. Kept as a plain list so it can be tested: this PC only, no web page, no slot list, no thinking, one request at a time. The password is not
/// among them: it goes in the environment (`environment`).
fn arguments(model: &Path, port: u16, context: u32, threads: u32) -> Vec<String> {
    let context = context.clamp(1024, 32768);
    let threads = threads.clamp(1, 64);
    [
        "--model",
        &model.to_string_lossy(),
        "--host",
        "127.0.0.1",
        "--port",
        &port.to_string(),
        "--ctx-size",
        &context.to_string(),
        "--threads",
        &threads.to_string(),
        "--parallel",
        "1",
        "--no-webui",
        "--no-slots",
        "--reasoning",
        "off",
        "--cache-ram",
        "256",
        "--timeout",
        "600",
        // The app's page calls this program from the browser engine, which only sends the password if the program says it may.
        "--cors-headers",
        "authorization,content-type",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

/// What the program is given in its environment: the password for this run, which llama-server reads from LLAMA_API_KEY as it would from --api-key.
fn environment(api_key: &str) -> Vec<(&'static str, String)> {
    vec![("LLAMA_API_KEY", api_key.to_string())]
}

/// The programs listening on `port` on this PC (on 127.0.0.1, or on every address), by process number, from Windows' own table of connections.
#[cfg(windows)]
fn listeners(port: u16) -> Vec<u32> {
    use std::ffi::c_void;
    use windows::Win32::NetworkManagement::IpHelper::{GetExtendedTcpTable, MIB_TCPROW_OWNER_PID, MIB_TCPTABLE_OWNER_PID, TCP_TABLE_OWNER_PID_LISTENER};
    const AF_INET: u32 = 2;
    let loopback = u32::from_ne_bytes([127, 0, 0, 1]);
    unsafe {
        let mut size = 0u32;
        let _ = GetExtendedTcpTable(None, &mut size, false, AF_INET, TCP_TABLE_OWNER_PID_LISTENER, 0);
        // Room for a few more rows in case some appear between the two calls; u32s, so the table is aligned.
        let mut buffer = vec![0u32; (size as usize + 4096) / 4 + 1];
        let mut size = (buffer.len() * 4) as u32;
        if GetExtendedTcpTable(Some(buffer.as_mut_ptr() as *mut c_void), &mut size, false, AF_INET, TCP_TABLE_OWNER_PID_LISTENER, 0) != 0 {
            return Vec::new();
        }
        let table = &*(buffer.as_ptr() as *const MIB_TCPTABLE_OWNER_PID);
        let rows: &[MIB_TCPROW_OWNER_PID] = std::slice::from_raw_parts(table.table.as_ptr(), table.dwNumEntries as usize);
        rows.iter()
            .filter(|r| u16::from_be(r.dwLocalPort as u16) == port && (r.dwLocalAddr == loopback || r.dwLocalAddr == 0))
            .map(|r| r.dwOwningPid)
            .collect()
    }
}

#[cfg(not(windows))]
fn listeners(_port: u16) -> Vec<u32> {
    Vec::new()
}

/// The process that started process `pid`, from Windows' list of processes (which needs no right to open either of them), or None.
#[cfg(windows)]
fn parent_of(pid: u32) -> Option<u32> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
        let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut found = None;
        let mut more = Process32FirstW(snapshot, &mut entry).is_ok();
        while more {
            if entry.th32ProcessID == pid {
                found = Some(entry.th32ParentProcessID);
                break;
            }
            more = Process32NextW(snapshot, &mut entry).is_ok();
        }
        let _ = CloseHandle(snapshot);
        found
    }
}

#[cfg(not(windows))]
fn parent_of(_pid: u32) -> Option<u32> {
    None
}

/// Is every program listening on `port` the one with process number `pid`, or one that it started itself? (llama-server's launcher may hand the
/// work to a server it starts.) While `pid` is running its number cannot be given to another process, so this cannot be fooled by a reused number.
/// On a system where this cannot be asked, it is taken as yes.
fn only_listener(port: u16, pid: u32) -> bool {
    if cfg!(not(windows)) {
        return true;
    }
    let found = listeners(port);
    !found.is_empty() && found.iter().all(|&p| p == pid || parent_of(p) == Some(pid))
}

/// Does the program answer on `port` with "ok"? (`/health` needs no password.) A plain request over a socket, so no extra library is needed.
fn answers(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(500)) else { return false };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    if stream.write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n").is_err() {
        return false;
    }
    let mut reply = Vec::new();
    let _ = stream.read_to_end(&mut reply);
    reply.starts_with(b"HTTP/1.1 200")
}

/// The last few lines of the program's log, for a message when it stops unexpectedly.
fn tail_of(log: &Path) -> String {
    let text = std::fs::read_to_string(log).unwrap_or_default();
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    let from = lines.len().saturating_sub(4);
    lines[from..].join(" | ").chars().take(400).collect()
}

/// Puts a program in a Windows job that ends it when OpenExplainer's last handle to the job closes, which is when OpenExplainer ends, however it ends.
#[cfg(windows)]
fn tie_to_this_program(child: &Child) {
    use std::os::windows::io::AsRawHandle;
    use std::sync::OnceLock;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::JobObjects::{AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE};
    // The job is made once and its handle is kept for as long as OpenExplainer runs (as a number, so it can be shared between threads).
    static JOB: OnceLock<isize> = OnceLock::new();
    let job = *JOB.get_or_init(|| unsafe {
        let Ok(job) = CreateJobObjectW(None, PCWSTR::null()) else { return 0 };
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if SetInformationJobObject(job, JobObjectExtendedLimitInformation, &info as *const _ as *const std::ffi::c_void, std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32).is_err() {
            return 0;
        }
        job.0 as isize
    });
    if job != 0 {
        let _ = unsafe { AssignProcessToJobObject(HANDLE(job as *mut std::ffi::c_void), HANDLE(child.as_raw_handle())) };
    }
}

#[cfg(not(windows))]
fn tie_to_this_program(_child: &Child) {}

/// Ends the program if it is running.
pub fn stop_all(app: &AppHandle) {
    let state = app.state::<RuntimeState>();
    let taken = state.inner.lock().ok().and_then(|mut g| g.take());
    if let Some(mut running) = taken {
        let _ = running.child.kill();
        let _ = running.child.wait();
    }
}

/// Starts the model's program if it is not already running with this model, waits until it answers, and says where it is. `api_key` is the password for this run (the TypeScript makes it).
#[tauri::command]
pub async fn ai_runtime_start(app: AppHandle, state: State<'_, RuntimeState>, file: String, api_key: String, context: u32, threads: u32) -> Result<Value, String> {
    if !good_key(&api_key) {
        return Err("The password for the model's program is not in the right form.".into());
    }
    let model = model_path(&app, &file)?;
    let program = find_runtime(&app)?;
    // Already running with this model: its place and password are handed back.
    {
        let mut guard = state.inner.lock().map_err(|_| "The model's program could not be checked.".to_string())?;
        if let Some(running) = guard.as_mut() {
            if running.file == file && matches!(running.child.try_wait(), Ok(None)) {
                return Ok(json!({ "port": running.port, "apiKey": running.api_key }));
            }
            let _ = running.child.kill();
            let _ = running.child.wait();
            *guard = None;
        }
    }
    let log_path = data_folder(&app)?.join("llama-server.log");
    // A port is free when it is chosen and taken by the program a moment later, so another program could take it in between. Windows is asked who listens on it once the
    // program answers; if it is not the program just started, that one is stopped and a fresh port is tried.
    for _try in 0..3 {
        let log = File::create(&log_path).map_err(|e| format!("The model program's log could not be made: {e}"))?;
        let log_again = log.try_clone().map_err(|e| format!("The model program's log could not be made: {e}"))?;
        let port = free_port()?;
        let mut command = Command::new(program.join("llama-server.exe"));
        command.args(arguments(&model, port, context, threads)).envs(environment(&api_key)).current_dir(&program).stdin(Stdio::null()).stdout(Stdio::from(log)).stderr(Stdio::from(log_again));
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: nothing appears on screen.
        }
        let child = command.spawn().map_err(|e| format!("The model's program could not be started: {e}"))?;
        let pid = child.id();
        tie_to_this_program(&child);
        {
            let mut guard = state.inner.lock().map_err(|_| "The model's program could not be checked.".to_string())?;
            *guard = Some(Running { child, port, api_key: api_key.clone(), file: file.clone() });
        }
        // Wait for it to load the model and answer. The state is looked at each time round, so a stop from elsewhere ends the wait at once.
        let waiter = app.clone();
        let waited_log = log_path.clone();
        tauri::async_runtime::spawn_blocking(move || wait_until_ready(&waiter, port, &waited_log)).await.map_err(|e| format!("The wait for the model's program stopped unexpectedly: {e}"))??;
        if only_listener(port, pid) {
            return Ok(json!({ "port": port, "apiKey": api_key }));
        }
        stop_all(&app);
    }
    Err("Another program kept answering on the port chosen for the model, so the model was not used. Close other programs and try again.".into())
}

/// Waits until the program on `port` answers, it stops, or it has been too long.
fn wait_until_ready(app: &AppHandle, port: u16, log: &Path) -> Result<(), String> {
    let started = Instant::now();
    loop {
        if answers(port) {
            return Ok(());
        }
        if started.elapsed() > Duration::from_secs(MOST_SECONDS_TO_START) {
            stop_all(app);
            return Err(format!("The model did not finish loading within {MOST_SECONDS_TO_START} seconds, so it was stopped."));
        }
        std::thread::sleep(Duration::from_millis(200));
        let state = app.state::<RuntimeState>();
        let mut guard = state.inner.lock().map_err(|_| "The model's program could not be checked.".to_string())?;
        match guard.as_mut() {
            Some(running) if running.port == port => {
                if let Ok(Some(status)) = running.child.try_wait() {
                    *guard = None;
                    return Err(format!("The model's program stopped ({status}). {}", tail_of(log)));
                }
            }
            _ => return Err("The model's program was stopped before it was ready.".into()),
        }
    }
}

/// Ends the model's program.
#[tauri::command]
pub fn ai_runtime_stop(app: AppHandle) {
    stop_all(&app);
}

/// Is the model's program running, and where.
#[tauri::command]
pub fn ai_runtime_status(state: State<'_, RuntimeState>) -> Value {
    let mut guard = state.inner.lock().unwrap();
    match guard.as_mut() {
        Some(running) => {
            if matches!(running.child.try_wait(), Ok(None)) {
                json!({ "running": true, "port": running.port, "file": running.file })
            } else {
                json!({ "running": false })
            }
        }
        None => json!({ "running": false }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_options_keep_it_on_this_pc_behind_a_password_with_nothing_extra_switched_on() {
        let args = arguments(Path::new("C:\\m\\model.gguf"), 18080, 8192, 4);
        let value_after = |flag: &str| args.iter().position(|a| a == flag).map(|i| args[i + 1].clone());
        assert_eq!(value_after("--host").as_deref(), Some("127.0.0.1"), "this PC only");
        assert_eq!(value_after("--port").as_deref(), Some("18080"));
        assert!(!args.iter().any(|a| a == "--api-key"), "the password is never on the command line, which other programs can read");
        assert_eq!(environment("abcdefghijklmnop1234"), vec![("LLAMA_API_KEY", "abcdefghijklmnop1234".to_string())], "it goes in the environment");
        assert_eq!(value_after("--model").as_deref(), Some("C:\\m\\model.gguf"));
        assert_eq!(value_after("--parallel").as_deref(), Some("1"));
        assert_eq!(value_after("--reasoning").as_deref(), Some("off"));
        assert!(args.contains(&"--no-webui".to_string()) && args.contains(&"--no-slots".to_string()));
        assert!(!args.iter().any(|a| a == "0.0.0.0" || a == "::"), "never the network");
        // The numbers are kept sensible whatever is asked.
        assert_eq!(value_after("--ctx-size").as_deref(), Some("8192"));
        let wild = arguments(Path::new("m"), 1, 99, 0);
        let wild_after = |flag: &str| wild.iter().position(|a| a == flag).map(|i| wild[i + 1].clone());
        assert_eq!(wild_after("--ctx-size").as_deref(), Some("1024"));
        assert_eq!(wild_after("--threads").as_deref(), Some("1"));
        let big = arguments(Path::new("m"), 1, 10_000_000, 1000);
        let big_after = |flag: &str| big.iter().position(|a| a == flag).map(|i| big[i + 1].clone());
        assert_eq!(big_after("--ctx-size").as_deref(), Some("32768"));
        assert_eq!(big_after("--threads").as_deref(), Some("64"));
    }

    #[test]
    fn only_a_long_plain_password_is_accepted() {
        assert!(good_key("abcdefghijklmnop"));
        assert!(good_key(&"a1".repeat(32)));
        for bad in ["", "short", "has space in it 1234", "quote\"inside12345678", "dash-dash-dash-dash", &"a".repeat(129), "semi;colon12345678901"] {
            assert!(!good_key(bad), "{bad}");
        }
    }

    #[test]
    fn a_free_port_can_really_be_used_and_the_health_check_reads_the_status_line() {
        let port = free_port().unwrap();
        assert!(port > 0);
        assert!(!answers(port), "nothing is listening yet");
        let listener = TcpListener::bind(("127.0.0.1", port)).unwrap();
        let server = std::thread::spawn(move || {
            for reply in [&b"HTTP/1.1 503 Service Unavailable\r\n\r\n"[..], &b"HTTP/1.1 200 OK\r\nContent-Length: 15\r\n\r\n{\"status\":\"ok\"}"[..]] {
                let (mut s, _) = listener.accept().unwrap();
                let mut buf = [0u8; 256];
                let _ = s.read(&mut buf);
                s.write_all(reply).unwrap();
            }
        });
        assert!(!answers(port), "a 503 is not ready");
        assert!(answers(port), "a 200 is");
        server.join().unwrap();
    }

    #[test]
    fn windows_says_which_program_listens_on_a_port() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(only_listener(port, std::process::id()), "this test listens on it, and no one else");
        assert!(!only_listener(port, std::process::id() + 1), "another process number is not the listener");
        // The program that started this test is this test's parent: a listener started by the program OpenExplainer started counts as its own.
        let parent = parent_of(std::process::id()).expect("this test has a parent process");
        assert!(only_listener(port, parent), "a listener the started program started itself");
        drop(listener);
        assert!(!only_listener(port, std::process::id()), "nobody listens on it any more");
    }

    #[test]
    fn the_end_of_a_log_is_short_and_in_one_line() {
        let folder = std::env::temp_dir().join(format!("oe-llama-test-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        let log = folder.join("log.txt");
        std::fs::write(&log, "one\n\ntwo\nthree\nfour\nfive\nsix\n").unwrap();
        assert_eq!(tail_of(&log), "three | four | five | six");
        std::fs::write(&log, "x".repeat(2000)).unwrap();
        assert_eq!(tail_of(&log).len(), 400);
        assert_eq!(tail_of(&folder.join("missing.txt")), "");
        let _ = std::fs::remove_dir_all(&folder);
    }
}
