//! Click by click, from the app's side: one session that hides OpenExplainer, shows a small Stop window, keeps the helper's
//! click lines coming, and hands every click back when the author stops it (or it stops by itself).
//!
//! The helper does the watching (`watch-clicks`, see `docs/capture-helper.md`): for each click it saves a picture of the
//! whole screen and says what was clicked. This file only runs the session. It never reads a picture and never looks inside
//! a click note; the TypeScript side checks the notes again with the project's own rules before anything is kept.

use super::{app_dir, capture_folder, find_helper, CaptureState, Choreography, HelperRun};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

/// The label of the small Stop window.
const CLICK_BAR_LABEL: &str = "click-bar";
const CLICK_BAR_WIDTH: f64 = 420.0;
const CLICK_BAR_HEIGHT: f64 = 250.0;

/// How long the helper has to say it is watching, and how long it has to finish once it is told to stop.
#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub ready: Duration,
    pub stop_grace: Duration,
}

impl Default for Limits {
    fn default() -> Self {
        Limits { ready: Duration::from_secs(5), stop_grace: Duration::from_secs(5) }
    }
}

/// Everything a session gave.
#[derive(Debug, PartialEq)]
pub struct Session {
    /// The helper's own click lines, in order, as it wrote them.
    pub clicks: Vec<Value>,
    pub skipped: u64,
    /// `stopped`, `idle`, `limit`, `hook-lost` (all from the helper), or `helper-stopped` if the helper ended by itself.
    pub ended: String,
}

#[derive(Debug, PartialEq)]
pub enum SessionEnd {
    /// It ran, and these are the clicks. Even a helper that fell over part-way gives back what it had.
    Finished(Session),
    /// The helper said no (its own reply, with plain words in `error.message`).
    Refused(Value),
    /// The helper could not be started at all. Holds the reason from Windows.
    CannotStart(String),
    /// It never said it was watching, or ended before it could.
    NoAnswer,
}

/// Runs one click session. `stop` is set when the author presses Stop; `count` is kept up to date with the clicks so far, for the
/// Stop window to show. The helper is always stopped and cleaned up before this returns, so no pictures are written afterwards.
pub fn run_click_session(
    mut command: Command,
    request_line: &str,
    stop: &AtomicBool,
    count: &AtomicU32,
    running: &Mutex<Option<Arc<HelperRun>>>,
    limits: Limits,
) -> SessionEnd {
    command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console window flashes up
    }
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(e) => return SessionEnd::CannotStart(e.to_string()),
    };
    let stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let run = Arc::new(HelperRun { child: Mutex::new(child) });
    if let Ok(mut slot) = running.lock() {
        *slot = Some(run.clone());
    }

    let end = (|| {
        let (Some(mut stdin), Some(stdout)) = (stdin, stdout) else { return SessionEnd::NoAnswer };
        if writeln!(stdin, "{request_line}").and_then(|_| stdin.flush()).is_err() {
            return SessionEnd::NoAnswer;
        }
        // The helper's lines are read on their own thread, so this one can watch the clock and the Stop flag.
        let (send, receive) = mpsc::channel::<Value>();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Ok(value) = serde_json::from_str::<Value>(line.trim()) {
                    if send.send(value).is_err() {
                        break;
                    }
                }
            }
        });
        let started = Instant::now();
        let mut ready = false;
        let mut clicks: Vec<Value> = Vec::new();
        let mut skipped = 0u64;
        let mut stop_sent: Option<Instant> = None;
        let finished = |clicks: Vec<Value>, skipped: u64, ended: &str| SessionEnd::Finished(Session { clicks, skipped, ended: ended.to_string() });
        loop {
            if stop.load(Ordering::SeqCst) && ready && stop_sent.is_none() {
                // "Stop" keeps what was captured: the helper finishes saving the last picture and says it has ended.
                if writeln!(stdin, r#"{{"id":2,"command":"stop-watching"}}"#).and_then(|_| stdin.flush()).is_err() {
                    return finished(clicks, skipped, "helper-stopped");
                }
                stop_sent = Some(Instant::now());
            }
            match receive.recv_timeout(Duration::from_millis(40)) {
                Ok(line) => match line.get("event").and_then(Value::as_str) {
                    Some("click") => {
                        clicks.push(line);
                        count.store(clicks.len() as u32, Ordering::SeqCst);
                    }
                    Some("skipped") => skipped = line.get("count").and_then(Value::as_u64).unwrap_or(skipped),
                    Some("ended") => {
                        skipped = line.get("skipped").and_then(Value::as_u64).unwrap_or(skipped);
                        let ended = line.get("ended").and_then(Value::as_str).unwrap_or("stopped").to_string();
                        return finished(clicks, skipped, &ended);
                    }
                    _ => {
                        // A reply. The one for id 1 says whether the helper is watching; the one for the stop request needs nothing.
                        if line.get("id") == Some(&json!(1)) && line.get("ok").is_some() {
                            if line.get("ok") != Some(&json!(true)) {
                                return SessionEnd::Refused(line);
                            }
                            ready = true;
                        }
                    }
                },
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return if ready { finished(clicks, skipped, "helper-stopped") } else { SessionEnd::NoAnswer };
                }
            }
            if !ready && started.elapsed() > limits.ready {
                return SessionEnd::NoAnswer;
            }
            if stop_sent.is_some_and(|at| at.elapsed() > limits.stop_grace) {
                return finished(clicks, skipped, "stopped");
            }
        }
    })();

    // However it ended, the helper must not be left running.
    run.stop();
    if let Ok(mut child) = run.child.lock() {
        let _ = child.wait();
    }
    if let Ok(mut slot) = running.lock() {
        *slot = None;
    }
    end
}

/// What the page is told.
fn session_to_json(end: SessionEnd) -> Value {
    match end {
        SessionEnd::Finished(session) => json!({ "kind": "clicks", "clicks": session.clicks, "skipped": session.skipped, "ended": session.ended }),
        SessionEnd::Refused(reply) => json!({ "kind": "reply", "reply": reply }),
        SessionEnd::CannotStart(why) => json!({ "kind": "unavailable", "reason": "cannot-start", "detail": why }),
        SessionEnd::NoAnswer => json!({ "kind": "stopped" }),
    }
}

// ---- The Stop window and the commands ----------------------------------------------------------------------

fn open_click_bar(app: &AppHandle) -> Result<WebviewWindow, String> {
    let mut builder = WebviewWindowBuilder::new(app, CLICK_BAR_LABEL, WebviewUrl::App("click-bar.html".into()))
        .title("OpenExplainer is capturing clicks")
        .inner_size(CLICK_BAR_WIDTH, CLICK_BAR_HEIGHT)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .always_on_top(true)
        .content_protected(true) // Windows leaves this window out of screen copies, so it is never in a picture
        // The author is working in another program, and a window that took the keyboard from it would close a menu they had open.
        .focused(false);
    // The top right corner of the main screen.
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let (size, at) = (monitor.size(), monitor.position());
        let x = (at.x as f64 + size.width as f64) / scale - CLICK_BAR_WIDTH - 16.0;
        let y = at.y as f64 / scale + 16.0;
        builder = builder.position(x.max(0.0), y.max(0.0));
    }
    let bar = builder.build().map_err(|e| e.to_string())?;
    // Closing the Stop window with its own close button counts as pressing Stop: what was captured is kept.
    let handle = app.clone();
    bar.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { .. } = event {
            handle.state::<CaptureState>().click_stop.store(true, Ordering::SeqCst);
        }
    });
    Ok(bar)
}

/// Runs a whole click session and returns its clicks. `idle_seconds` and `max_clicks` are the helper's own limits; leave them out for
/// its defaults (10 minutes with no click, 200 clicks). OpenExplainer hides and the Stop window shows for the duration, and both are
/// undone however it ends.
///
/// Returns `{kind: "clicks", clicks, skipped, ended}`, `{kind: "reply", reply}` (the helper said no), `{kind: "stopped"}`,
/// `{kind: "busy"}` or `{kind: "unavailable", reason, detail?}`. Each click is the helper's own line: a picture file (`path`, in the
/// capture folder) and a click note (`click`). `take_capture_picture` hands a picture over and deletes it.
#[tauri::command]
pub async fn watch_clicks(app: AppHandle, idle_seconds: Option<u64>, max_clicks: Option<u32>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || watch_blocking(app, idle_seconds, max_clicks)).await.map_err(|e| e.to_string())
}

fn watch_blocking(app: AppHandle, idle_seconds: Option<u64>, max_clicks: Option<u32>) -> Value {
    let state = app.state::<CaptureState>();
    if state.busy.swap(true, Ordering::SeqCst) {
        return json!({ "kind": "busy" });
    }
    state.click_stop.store(false, Ordering::SeqCst);
    state.click_count.store(0, Ordering::SeqCst);
    let result = watch_inner(&app, &state, idle_seconds, max_clicks);
    state.busy.store(false, Ordering::SeqCst);
    result
}

fn watch_inner(app: &AppHandle, state: &CaptureState, idle_seconds: Option<u64>, max_clicks: Option<u32>) -> Value {
    let Some(helper) = find_helper(&app_dir(), std::env::var_os("OPENEXPLAINER_CAPTURE_HELPER").map(PathBuf::from)) else {
        return json!({ "kind": "unavailable", "reason": "missing" });
    };
    let folder = capture_folder();
    if let Err(e) = std::fs::create_dir_all(&folder) {
        return json!({ "kind": "unavailable", "reason": "bad-request", "detail": format!("The folder for the pictures could not be made: {e}") });
    }
    let mut request = json!({ "id": 1, "command": "watch-clicks", "out_dir": folder.to_string_lossy() });
    if let Some(seconds) = idle_seconds {
        request["idle_seconds"] = json!(seconds);
    }
    if let Some(clicks) = max_clicks {
        request["max_clicks"] = json!(clicks);
    }
    // The Stop window first, so there is always a way to stop, and only then is the main window hidden. Both last as long as `_windows`.
    let _windows = match open_click_bar(app).map(|bar| Choreography::with_bar(app, bar)) {
        Ok(windows) => windows,
        Err(why) => return json!({ "kind": "unavailable", "reason": "no-cancel-window", "detail": why }),
    };
    let end = run_click_session(Command::new(&helper), &request.to_string(), &state.click_stop, &state.click_count, &state.running, Limits::default());
    session_to_json(end)
}

/// Stops the click session, keeping every click captured so far. The Stop window calls this.
#[tauri::command]
pub fn stop_clicks(app: AppHandle) -> bool {
    app.state::<CaptureState>().click_stop.store(true, Ordering::SeqCst);
    true
}

/// How many clicks the session has captured so far, for the Stop window to show.
#[tauri::command]
pub fn click_session_status(app: AppHandle) -> Value {
    json!({ "count": app.state::<CaptureState>().click_count.load(Ordering::SeqCst) })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A stand-in for the helper: a short PowerShell script. It reads one line (the request), then does `body`.
    #[cfg(windows)]
    fn fake_helper(body: &str) -> Command {
        let mut command = Command::new("powershell");
        command.args(["-NoProfile", "-NonInteractive", "-Command", &format!("$null = [Console]::In.ReadLine(); {body}")]);
        command
    }

    const READY: &str = r#"[Console]::Out.WriteLine('{"id":1,"ok":true,"result":{"watching":true}}');"#;
    const CLICK_1: &str = r#"[Console]::Out.WriteLine('{"event":"click","watch":1,"n":1,"path":"C:\\t\\a.png","width":10,"height":10,"click":{"x":1,"y":2,"button":"left"},"held_ms":40}');"#;
    const CLICK_2: &str = r#"[Console]::Out.WriteLine('{"event":"click","watch":1,"n":2,"path":"C:\\t\\b.png","width":10,"height":10,"click":{"x":3,"y":4,"button":"right"},"held_ms":41}');"#;

    #[cfg(windows)]
    fn fresh() -> (AtomicBool, AtomicU32, Mutex<Option<Arc<HelperRun>>>) {
        (AtomicBool::new(false), AtomicU32::new(0), Mutex::new(None))
    }

    /// A short time to say it is watching (starting PowerShell alone can take a second, so only the test that wants a timeout uses this).
    #[cfg(windows)]
    fn quick_ready() -> Limits {
        Limits { ready: Duration::from_millis(1500), stop_grace: Duration::from_secs(5) }
    }

    /// A short time to finish once told to stop.
    #[cfg(windows)]
    fn quick_stop() -> Limits {
        Limits { ready: Duration::from_secs(20), stop_grace: Duration::from_millis(800) }
    }

    #[cfg(windows)]
    #[test]
    fn clicks_come_back_in_order_with_the_way_the_session_ended() {
        let (stop, count, running) = fresh();
        let body = format!(r#"{READY} {CLICK_1} {CLICK_2} [Console]::Out.WriteLine('{{"event":"ended","watch":1,"ended":"idle","clicks":2,"skipped":1,"slowest_hold_ms":41}}')"#);
        let end = run_click_session(fake_helper(&body), "{}", &stop, &count, &running, Limits::default());
        let SessionEnd::Finished(session) = end else { panic!("expected a finished session, got {end:?}") };
        assert_eq!(session.ended, "idle");
        assert_eq!(session.skipped, 1);
        assert_eq!(session.clicks.iter().map(|c| c["n"].clone()).collect::<Vec<_>>(), vec![json!(1), json!(2)]);
        assert_eq!(session.clicks[1]["click"]["button"], "right");
        assert_eq!(count.load(Ordering::SeqCst), 2, "the Stop window can show the count");
        assert!(running.lock().unwrap().is_none(), "nothing is left registered");
    }

    #[cfg(windows)]
    #[test]
    fn stop_keeps_the_clicks_and_waits_for_the_helper_to_say_it_has_ended() {
        let (stop, count, running) = fresh();
        let (stop, count, running) = (Arc::new(stop), Arc::new(count), Arc::new(running));
        let (s, c) = (stop.clone(), count.clone());
        let presser = std::thread::spawn(move || {
            // Press Stop once the first click has been seen, the way the author does.
            while c.load(Ordering::SeqCst) < 1 {
                std::thread::sleep(Duration::from_millis(20));
            }
            s.store(true, Ordering::SeqCst);
        });
        // This helper only finishes when it is told to stop, like the real one.
        let body = format!(r#"{READY} {CLICK_1} $null = [Console]::In.ReadLine(); [Console]::Out.WriteLine('{{"event":"ended","watch":1,"ended":"stopped","clicks":1,"skipped":0,"slowest_hold_ms":40}}')"#);
        let started = Instant::now();
        let end = run_click_session(fake_helper(&body), "{}", &stop, &count, &running, Limits::default());
        presser.join().unwrap();
        let SessionEnd::Finished(session) = end else { panic!("expected a finished session, got {end:?}") };
        assert_eq!((session.ended.as_str(), session.clicks.len()), ("stopped", 1));
        assert!(started.elapsed() < Duration::from_secs(15));
    }

    #[cfg(windows)]
    #[test]
    fn a_helper_that_ignores_stop_is_given_a_short_time_and_then_stopped_with_the_clicks_kept() {
        let (stop, count, running) = fresh();
        stop.store(true, Ordering::SeqCst);
        let body = format!("{READY} {CLICK_1} Start-Sleep -Seconds 60");
        let started = Instant::now();
        let end = run_click_session(fake_helper(&body), "{}", &stop, &count, &running, quick_stop());
        let SessionEnd::Finished(session) = end else { panic!("expected a finished session, got {end:?}") };
        assert_eq!(session.ended, "stopped");
        assert!(started.elapsed() < Duration::from_secs(10), "it did not wait for the helper to finish");
        assert!(running.lock().unwrap().is_none());
    }

    #[cfg(windows)]
    #[test]
    fn a_helper_that_falls_over_part_way_still_gives_back_its_clicks() {
        let (stop, count, running) = fresh();
        let body = format!("{READY} {CLICK_1} {CLICK_2} exit 3");
        let end = run_click_session(fake_helper(&body), "{}", &stop, &count, &running, Limits::default());
        let SessionEnd::Finished(session) = end else { panic!("expected a finished session, got {end:?}") };
        assert_eq!((session.ended.as_str(), session.clicks.len()), ("helper-stopped", 2));
    }

    #[cfg(windows)]
    #[test]
    fn a_helper_that_says_no_is_reported_with_its_own_words() {
        let (stop, count, running) = fresh();
        let body = r#"[Console]::Out.WriteLine('{"id":1,"ok":false,"error":{"code":"capture-failed","message":"Windows would not let the helper watch the mouse."}}')"#;
        let end = run_click_session(fake_helper(body), "{}", &stop, &count, &running, Limits::default());
        let SessionEnd::Refused(reply) = end else { panic!("expected a refusal, got {end:?}") };
        assert_eq!(reply["error"]["message"], "Windows would not let the helper watch the mouse.");
        assert_eq!(session_to_json(SessionEnd::Refused(reply))["kind"], "reply");
    }

    #[cfg(windows)]
    #[test]
    fn a_helper_that_never_says_it_is_watching_is_stopped() {
        let (stop, count, running) = fresh();
        let started = Instant::now();
        let end = run_click_session(fake_helper("Start-Sleep -Seconds 60"), "{}", &stop, &count, &running, quick_ready());
        assert_eq!(end, SessionEnd::NoAnswer);
        assert!(started.elapsed() < Duration::from_secs(10));
        assert!(running.lock().unwrap().is_none());
    }

    #[cfg(windows)]
    #[test]
    fn a_helper_that_ends_without_a_word_is_no_answer() {
        let (stop, count, running) = fresh();
        assert_eq!(run_click_session(fake_helper("exit 3"), "{}", &stop, &count, &running, Limits::default()), SessionEnd::NoAnswer);
    }

    #[test]
    fn a_helper_that_cannot_start_says_why() {
        let stop = AtomicBool::new(false);
        let count = AtomicU32::new(0);
        let running = Mutex::new(None);
        let end = run_click_session(Command::new("C:\\no\\such\\folder\\helper.exe"), "{}", &stop, &count, &running, Limits::default());
        assert!(matches!(&end, SessionEnd::CannotStart(why) if !why.is_empty()));
        assert_eq!(session_to_json(end)["reason"], "cannot-start");
    }

    #[test]
    fn what_the_page_is_told_has_the_clicks_and_the_way_it_ended() {
        let session = Session { clicks: vec![json!({ "n": 1 })], skipped: 2, ended: "limit".into() };
        assert_eq!(
            session_to_json(SessionEnd::Finished(session)),
            json!({ "kind": "clicks", "clicks": [{ "n": 1 }], "skipped": 2, "ended": "limit" })
        );
        assert_eq!(session_to_json(SessionEnd::NoAnswer), json!({ "kind": "stopped" }));
    }
}
