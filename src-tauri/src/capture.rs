//! Running the capture helper from the app.
//!
//! The helper (`capture-helper/`, a separate program) does the capturing. This file starts it, waits for its one-line
//! answer for at most a set time, and stops it if that time passes or the author presses Cancel, so a program that has
//! stopped responding can never freeze OpenExplainer. All the waiting happens on a background thread, never on the thread
//! that draws the window. While a capture runs the main window is hidden (so OpenExplainer never captures itself) and a
//! small always-on-top Cancel window is shown. That window is kept out of screen copies, so it is never in a picture.
//! The wording the author reads lives in the TypeScript (`src/capture/`), not here: this file only reports what happened.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

/// The name of the helper program.
pub const HELPER_FILE: &str = "openexplainer-capture.exe";
/// The label of the small Cancel window.
const BAR_LABEL: &str = "capture-bar";
const BAR_WIDTH: f64 = 440.0;
const BAR_HEIGHT: f64 = 210.0;

// ---- Running the helper (no Tauri in here, so it can be tested on its own) ------------------------------

/// What happened when the helper was asked something.
#[derive(Debug, PartialEq)]
pub enum Outcome {
    /// The helper's one-line answer.
    Reply(String),
    /// No answer within the time limit. The helper was stopped.
    Timeout,
    /// The author pressed Cancel. The helper was stopped.
    Cancelled,
    /// The helper ended without answering (it crashed, or was closed from outside).
    Stopped,
    /// The helper could not be started at all. Holds the reason from Windows.
    CannotStart(String),
}

/// A running helper, so Cancel can stop it from another thread.
pub struct HelperRun {
    child: Mutex<Child>,
}

impl HelperRun {
    fn stop(&self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
        }
    }
}

/// Starts the helper, sends it one request line, and waits for one answer line.
/// `cancel` is checked every few milliseconds. `running` is filled in while the helper runs so `cancel_capture`
/// can stop it at once. The helper is always stopped and cleaned up before this returns.
pub fn run_helper(
    mut command: Command,
    request_line: &str,
    timeout: Duration,
    cancel: &AtomicBool,
    running: &Mutex<Option<Arc<HelperRun>>>,
) -> Outcome {
    if cancel.load(Ordering::SeqCst) {
        return Outcome::Cancelled;
    }
    command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console window flashes up
    }
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(e) => return Outcome::CannotStart(e.to_string()),
    };
    let stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let run = Arc::new(HelperRun { child: Mutex::new(child) });
    if let Ok(mut slot) = running.lock() {
        *slot = Some(run.clone());
    }

    let outcome = (|| {
        let (Some(mut stdin), Some(stdout)) = (stdin, stdout) else { return Outcome::Stopped };
        if writeln!(stdin, "{request_line}").and_then(|_| stdin.flush()).is_err() {
            return Outcome::Stopped;
        }
        // The answer is read on its own thread, so this thread is free to watch the clock and the Cancel flag.
        let (send, receive) = mpsc::channel::<Option<String>>();
        std::thread::spawn(move || {
            let mut line = String::new();
            let got = BufReader::new(stdout).read_line(&mut line).map(|n| n > 0).unwrap_or(false);
            let _ = send.send(if got { Some(line.trim().to_string()) } else { None });
        });
        let deadline = Instant::now() + timeout;
        loop {
            if cancel.load(Ordering::SeqCst) {
                return Outcome::Cancelled;
            }
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return Outcome::Timeout;
            }
            match receive.recv_timeout(left.min(Duration::from_millis(40))) {
                Ok(Some(line)) => return if cancel.load(Ordering::SeqCst) { Outcome::Cancelled } else { Outcome::Reply(line) },
                Ok(None) => return if cancel.load(Ordering::SeqCst) { Outcome::Cancelled } else { Outcome::Stopped },
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => return Outcome::Stopped,
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
    outcome
}

/// Where the helper is: named by `OPENEXPLAINER_CAPTURE_HELPER` (for tests), next to the app, or, while the app is
/// being developed, in the capture-helper build folder above it.
pub fn find_helper(app_dir: &Path, from_env: Option<PathBuf>) -> Option<PathBuf> {
    if let Some(path) = from_env.filter(|p| p.is_file()) {
        return Some(path);
    }
    let beside = app_dir.join(HELPER_FILE);
    if beside.is_file() {
        return Some(beside);
    }
    app_dir
        .ancestors()
        .take(6)
        .map(|folder| folder.join("capture-helper").join("target").join("release").join(HELPER_FILE))
        .find(|candidate| candidate.is_file())
}

/// A new file name for a picture inside the capture folder in the temporary folder.
pub fn new_picture_path(counter: &AtomicU64) -> PathBuf {
    let n = counter.fetch_add(1, Ordering::SeqCst);
    capture_folder().join(format!("capture-{}-{}-{}.png", std::process::id(), std::time::UNIX_EPOCH.elapsed().map(|d| d.as_millis()).unwrap_or(0), n))
}

pub fn capture_folder() -> PathBuf {
    std::env::temp_dir().join("openexplainer-capture")
}

// ---- The app's side: state, windows and commands -------------------------------------------------------

/// A rectangle as four whole numbers: left, top, width, height.
pub type Rect4 = (i32, i32, i32, i32);

#[derive(Default)]
pub struct CaptureState {
    busy: AtomicBool,
    cancel: AtomicBool,
    running: Mutex<Option<Arc<HelperRun>>>,
    counter: AtomicU64,
    /// Where the selection window sends the author's answer: a rectangle, or `None` for Cancel.
    selection: Mutex<Option<mpsc::Sender<Option<Rect4>>>>,
    /// Set by the selection window once its page has started, so the app knows it is really there.
    selection_ready: AtomicBool,
}

/// Puts the main window back, and closes the Cancel window, however the capture ended.
struct Choreography {
    app: AppHandle,
    bar: Option<WebviewWindow>,
    hid_main: bool,
}

impl Choreography {
    /// Shows the Cancel window first, so there is always a way to stop, and only then hides the main window.
    fn begin(app: &AppHandle, seconds: u64) -> Result<Self, String> {
        let bar = open_bar(app, seconds)?;
        let mut hid_main = false;
        if let Some(main) = app.get_webview_window("main") {
            hid_main = main.hide().is_ok();
        }
        Ok(Choreography { app: app.clone(), bar: Some(bar), hid_main })
    }

    /// Closes the Cancel window but keeps the main window hidden: the snapshot is taken, and the selection window is next.
    fn end_bar(&mut self) {
        if let Some(bar) = self.bar.take() {
            let _ = bar.destroy();
        }
    }
}

impl Drop for Choreography {
    fn drop(&mut self) {
        if let Some(bar) = self.bar.take() {
            let _ = bar.destroy();
        }
        if self.hid_main {
            if let Some(main) = self.app.get_webview_window("main") {
                let _ = main.show();
                let _ = main.unminimize();
                let _ = main.set_focus();
            }
        }
    }
}

fn open_bar(app: &AppHandle, seconds: u64) -> Result<WebviewWindow, String> {
    let mut builder = WebviewWindowBuilder::new(app, BAR_LABEL, WebviewUrl::App("capture-bar.html".into()))
        .title("OpenExplainer is capturing")
        .inner_size(BAR_WIDTH, BAR_HEIGHT)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .always_on_top(true)
        .content_protected(true) // Windows leaves this window out of screen copies, so it is never in a picture
        .focused(true)
        .initialization_script(format!("window.__CAPTURE_SECONDS = {seconds};"));
    // The top right corner of the main screen.
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let (size, at) = (monitor.size(), monitor.position());
        let x = (at.x as f64 + size.width as f64) / scale - BAR_WIDTH - 16.0;
        let y = at.y as f64 / scale + 16.0;
        builder = builder.position(x.max(0.0), y.max(0.0));
    }
    let bar = builder.build().map_err(|e| e.to_string())?;
    // Closing the Cancel window with its own close button counts as pressing Cancel.
    let handle = app.clone();
    bar.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { .. } = event {
            cancel_now(&handle);
        }
    });
    Ok(bar)
}

fn cancel_now(app: &AppHandle) {
    let state = app.state::<CaptureState>();
    state.cancel.store(true, Ordering::SeqCst);
    let running = state.running.lock().ok().and_then(|slot| slot.clone());
    if let Some(run) = running {
        run.stop();
    }
}

fn app_dir() -> PathBuf {
    std::env::current_exe().ok().and_then(|exe| exe.parent().map(Path::to_path_buf)).unwrap_or_default()
}

fn outcome_to_json(outcome: Outcome, seconds: u64) -> Value {
    match outcome {
        Outcome::Reply(line) => match serde_json::from_str::<Value>(&line) {
            Ok(reply) => json!({ "kind": "reply", "reply": reply }),
            Err(_) => json!({ "kind": "stopped" }),
        },
        Outcome::Timeout => json!({ "kind": "timeout", "seconds": seconds }),
        Outcome::Cancelled => json!({ "kind": "cancelled" }),
        Outcome::Stopped => json!({ "kind": "stopped" }),
        Outcome::CannotStart(why) => json!({ "kind": "unavailable", "reason": "cannot-start", "detail": why }),
    }
}

/// Asks the helper one thing, for at most `timeout_ms`. `request` is a helper request without its `id` or `out`: for the
/// `capture-` commands the app chooses where the picture goes. With `hide_app`, the main window is hidden and the Cancel
/// window shown for the duration.
///
/// Returns `{kind: "reply", reply}`, `{kind: "timeout", seconds}`, `{kind: "cancelled"}`, `{kind: "stopped"}`,
/// `{kind: "busy"}` or `{kind: "unavailable", reason, detail?}`. `crop-picture` also gets an `out` chosen here. The picture of a successful capture is in a temporary
/// file named in the reply's `result.path`; `take_capture_picture` hands it over and deletes it.
#[tauri::command]
pub async fn capture(app: AppHandle, request: Value, timeout_ms: u64, hide_app: bool) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || capture_blocking(app, request, timeout_ms, hide_app))
        .await
        .map_err(|e| e.to_string())
}

fn capture_blocking(app: AppHandle, request: Value, timeout_ms: u64, hide_app: bool) -> Value {
    let state = app.state::<CaptureState>();
    if state.busy.swap(true, Ordering::SeqCst) {
        return json!({ "kind": "busy" });
    }
    state.cancel.store(false, Ordering::SeqCst);
    let result = capture_inner(&app, &state, request, timeout_ms, hide_app);
    state.busy.store(false, Ordering::SeqCst);
    result
}

fn capture_inner(app: &AppHandle, state: &CaptureState, request: Value, timeout_ms: u64, hide_app: bool) -> Value {
    let seconds = (timeout_ms + 999) / 1000;
    let Some(helper) = find_helper(&app_dir(), std::env::var_os("OPENEXPLAINER_CAPTURE_HELPER").map(PathBuf::from)) else {
        return json!({ "kind": "unavailable", "reason": "missing" });
    };
    let Some(mut object) = request.as_object().cloned() else {
        return json!({ "kind": "unavailable", "reason": "bad-request", "detail": "The capture request was not an object." });
    };
    let wants_picture = object.get("command").and_then(Value::as_str).map(|c| c.starts_with("capture-") || c == "crop-picture").unwrap_or(false);
    object.insert("id".into(), json!(1));
    if wants_picture {
        let path = new_picture_path(&state.counter);
        object.insert("out".into(), json!(path.to_string_lossy()));
    }
    let line = Value::Object(object).to_string();

    // The Cancel window and the hidden main window last exactly as long as `_windows`.
    let _windows = if hide_app {
        match Choreography::begin(app, seconds) {
            Ok(windows) => Some(windows),
            Err(why) => return json!({ "kind": "unavailable", "reason": "no-cancel-window", "detail": why }),
        }
    } else {
        None
    };
    let outcome = run_helper(Command::new(&helper), &line, Duration::from_millis(timeout_ms), &state.cancel, &state.running);
    outcome_to_json(outcome, seconds)
}

/// Stops the capture that is running, if any. The Cancel window calls this.
#[tauri::command]
pub fn cancel_capture(app: AppHandle) -> bool {
    cancel_now(&app);
    true
}

/// Hands over the picture a capture made, as raw bytes, and deletes the temporary file. Only files the capture made in
/// its own temporary folder can be taken.
#[tauri::command]
pub fn take_capture_picture(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = take_picture_file(Path::new(&path), &capture_folder())?;
    Ok(tauri::ipc::Response::new(bytes))
}

pub fn take_picture_file(path: &Path, folder: &Path) -> Result<Vec<u8>, String> {
    read_picture_file(path, folder, true)
}

/// Reads a picture a capture made, optionally deleting the file. Only a `.png` directly inside the capture folder is allowed.
fn read_picture_file(path: &Path, folder: &Path, delete: bool) -> Result<Vec<u8>, String> {
    let file = path.canonicalize().map_err(|e| format!("The picture file could not be found: {e}"))?;
    let folder = folder.canonicalize().map_err(|e| format!("The capture folder could not be found: {e}"))?;
    let is_png = file.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("png")).unwrap_or(false);
    if file.parent() != Some(folder.as_path()) || !is_png {
        return Err("That file is not a picture made by a capture.".to_string());
    }
    let bytes = std::fs::read(&file).map_err(|e| format!("The picture file could not be read: {e}"))?;
    if delete {
        let _ = std::fs::remove_file(&file);
    }
    Ok(bytes)
}

/// Hands over a picture a capture made WITHOUT deleting it. The selection window uses this to show the snapshot.
#[tauri::command]
pub fn read_capture_picture(path: String) -> Result<tauri::ipc::Response, String> {
    Ok(tauri::ipc::Response::new(read_picture_file(Path::new(&path), &capture_folder(), false)?))
}

/// Deletes a picture a capture made. Only a `.png` directly inside the capture folder can be deleted.
#[tauri::command]
pub fn discard_capture_picture(path: String) -> Result<(), String> {
    read_picture_file(Path::new(&path), &capture_folder(), true).map(|_| ())
}

/// Deletes capture pictures that are older than `older_than`, such as the leftovers of a run that was stopped. Returns how many.
pub fn sweep_old_pictures(folder: &Path, older_than: Duration) -> usize {
    let Ok(entries) = std::fs::read_dir(folder) else { return 0 };
    let mut removed = 0;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        let ours = name.ends_with(".png") || name.ends_with(".png.partial");
        let age = entry.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok());
        if ours && age.is_some_and(|age| age >= older_than) && std::fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    removed
}

// ---- Choosing a rectangle on a snapshot of a screen ------------------------------------------------------

/// The label of the full-screen selection window.
const SELECTION_LABEL: &str = "selection";
/// How long the selection page has to start before the app gives up on it and closes the window.
const SELECTION_START_LIMIT: Duration = Duration::from_secs(5);

fn four_numbers(value: &Value, names: [&str; 4]) -> Option<Rect4> {
    let get = |name: &str| value.get(name).and_then(Value::as_i64).and_then(|n| i32::try_from(n).ok());
    Some((get(names[0])?, get(names[1])?, get(names[2])?, get(names[3])?))
}

/// `{left, top, width, height}` as numbers.
fn rect_from(value: &Value) -> Option<Rect4> {
    four_numbers(value, ["left", "top", "width", "height"])
}

/// `{x, y, width, height}` as numbers: a screen's place on the whole desktop.
fn screen_from(value: &Value) -> Option<Rect4> {
    four_numbers(value, ["x", "y", "width", "height"])
}

/// What the author did in the selection window.
#[derive(Debug, PartialEq)]
enum Answer {
    Rect(Rect4),
    Cancelled,
    /// The page never started, so nothing could be chosen.
    NeverStarted,
}

fn finish_selection(app: &AppHandle, answer: Option<Rect4>) {
    let state = app.state::<CaptureState>();
    let sender = state.selection.lock().ok().and_then(|slot| slot.clone());
    if let Some(sender) = sender {
        let _ = sender.send(answer);
    }
}

/// The selection page calls this once it has started and its snapshot is showing.
#[tauri::command]
pub fn selection_ready(app: AppHandle) {
    app.state::<CaptureState>().selection_ready.store(true, Ordering::SeqCst);
}

/// The selection page calls this when the author captures the rectangle (`rect`) or cancels (`rect` is null).
#[tauri::command]
pub fn selection_finish(app: AppHandle, rect: Option<Value>) {
    finish_selection(&app, rect.as_ref().and_then(rect_from));
}

/// Takes a snapshot of one screen, shows it full screen so the author can choose a rectangle on it, and reports the
/// choice. `screen` is `{x, y, width, height}` from `list-screens`; `initial` is `{left, top, width, height}` for the
/// rectangle to start with. Like `capture`, the main window hides and the Cancel window shows while the snapshot is taken.
///
/// Returns `{kind: "selected", snapshot, rect}` (the snapshot is left in the capture folder: the app cuts the rectangle
/// out of it and then discards it), `{kind: "cancelled"}` (the snapshot is already deleted), or one of the kinds
/// `capture` returns, including `{kind: "unavailable", reason: "selection-window"}` if the selection page did not start.
#[tauri::command]
pub async fn select_region(app: AppHandle, screen: Value, initial: Value, timeout_ms: u64) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || select_blocking(app, screen, initial, timeout_ms))
        .await
        .map_err(|e| e.to_string())
}

fn select_blocking(app: AppHandle, screen: Value, initial: Value, timeout_ms: u64) -> Value {
    let state = app.state::<CaptureState>();
    if state.busy.swap(true, Ordering::SeqCst) {
        return json!({ "kind": "busy" });
    }
    state.cancel.store(false, Ordering::SeqCst);
    let result = select_inner(&app, &state, &screen, &initial, timeout_ms);
    state.busy.store(false, Ordering::SeqCst);
    result
}

fn select_inner(app: &AppHandle, state: &CaptureState, screen: &Value, initial: &Value, timeout_ms: u64) -> Value {
    let seconds = (timeout_ms + 999) / 1000;
    let Some(helper) = find_helper(&app_dir(), std::env::var_os("OPENEXPLAINER_CAPTURE_HELPER").map(PathBuf::from)) else {
        return json!({ "kind": "unavailable", "reason": "missing" });
    };
    let Some(place) = screen_from(screen) else {
        return json!({ "kind": "unavailable", "reason": "bad-request", "detail": "The screen was not described with x, y, width and height." });
    };
    let (sx, sy, sw, sh) = place;
    let snapshot = new_picture_path(&state.counter);
    let request = json!({ "id": 1, "command": "capture-region", "x": sx, "y": sy, "width": sw, "height": sh, "out": snapshot.to_string_lossy() }).to_string();

    // 1. The snapshot, with the main window hidden and the Cancel window shown, exactly like a capture.
    let mut windows = match Choreography::begin(app, seconds) {
        Ok(windows) => windows,
        Err(why) => return json!({ "kind": "unavailable", "reason": "no-cancel-window", "detail": why }),
    };
    let outcome = run_helper(Command::new(&helper), &request, Duration::from_millis(timeout_ms), &state.cancel, &state.running);
    windows.end_bar();
    let line = match outcome {
        Outcome::Reply(line) => line,
        other => return outcome_to_json(other, seconds),
    };
    let Ok(reply) = serde_json::from_str::<Value>(&line) else { return json!({ "kind": "stopped" }) };
    if reply.get("ok") != Some(&Value::Bool(true)) {
        return json!({ "kind": "reply", "reply": reply });
    }
    let snapshot_text = reply.pointer("/result/path").and_then(Value::as_str).unwrap_or_default().to_string();
    let discard = || {
        let _ = std::fs::remove_file(&snapshot_text);
    };

    // 2. The full-screen selection window. It is always closed, and the snapshot deleted unless a rectangle was chosen.
    let (send, receive) = mpsc::channel();
    if let Ok(mut slot) = state.selection.lock() {
        *slot = Some(send);
    }
    state.selection_ready.store(false, Ordering::SeqCst);
    let window = match open_selection(app, &snapshot_text, place, screen, initial) {
        Ok(window) => window,
        Err(why) => {
            discard();
            return json!({ "kind": "unavailable", "reason": "selection-window", "detail": why });
        }
    };
    let answer = wait_for_answer(app, state, &receive);
    if let Ok(mut slot) = state.selection.lock() {
        *slot = None;
    }
    let _ = window.destroy();
    match answer {
        Answer::Rect(rect @ (left, top, width, height)) if left >= 0 && top >= 0 && width >= 1 && height >= 1 && left + width <= sw && top + height <= sh => {
            json!({ "kind": "selected", "snapshot": snapshot_text, "rect": { "left": rect.0, "top": rect.1, "width": rect.2, "height": rect.3 } })
        }
        Answer::Rect(_) => {
            discard();
            json!({ "kind": "unavailable", "reason": "bad-request", "detail": "The rectangle that was chosen is not on the screen." })
        }
        Answer::Cancelled => {
            discard();
            json!({ "kind": "cancelled" })
        }
        Answer::NeverStarted => {
            discard();
            json!({ "kind": "unavailable", "reason": "selection-window", "detail": "The selection page did not start." })
        }
    }
}

/// Waits for the author's answer. There is no time limit on choosing, but the window must start within a few seconds, and
/// a window that has vanished counts as Cancel, so a full-screen window can never be left stuck on the screen.
fn wait_for_answer(app: &AppHandle, state: &CaptureState, receive: &mpsc::Receiver<Option<Rect4>>) -> Answer {
    let started = Instant::now();
    loop {
        match receive.recv_timeout(Duration::from_millis(100)) {
            Ok(Some(rect)) => return Answer::Rect(rect),
            Ok(None) | Err(mpsc::RecvTimeoutError::Disconnected) => return Answer::Cancelled,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if !state.selection_ready.load(Ordering::SeqCst) && started.elapsed() > SELECTION_START_LIMIT {
                    return Answer::NeverStarted;
                }
                if app.get_webview_window(SELECTION_LABEL).is_none() {
                    return Answer::Cancelled;
                }
            }
        }
    }
}

/// Opens the selection window over one screen (given by its place on the desktop, in real pixels).
fn open_selection(app: &AppHandle, snapshot: &str, place: Rect4, screen: &Value, initial: &Value) -> Result<WebviewWindow, String> {
    let (x, y, width, height) = place;
    // A page that does not exist is how a test makes the window fail to start, to prove the fail-safe works.
    let page = std::env::var("OPENEXPLAINER_SELECTION_PAGE").unwrap_or_else(|_| "selection.html".to_string());
    let data = json!({ "snapshot": snapshot, "screen": screen, "initial": initial });
    let window = WebviewWindowBuilder::new(app, SELECTION_LABEL, WebviewUrl::App(page.into()))
        .title("Select the part of the screen to capture")
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(false) // stays in the taskbar and in Alt+Tab, so there is always a way back
        .shadow(false)
        .visible(false)
        .focused(true)
        .initialization_script(format!("window.__SELECTION = {data};"))
        .build()
        .map_err(|e| e.to_string())?;
    // Exactly over the screen, in real pixels, wherever that screen is on the desktop and whatever its display scaling.
    let _ = window.set_position(PhysicalPosition::new(x, y));
    let _ = window.set_size(PhysicalSize::new(width.max(1) as u32, height.max(1) as u32));
    window.show().map_err(|e| e.to_string())?;
    let _ = window.set_focus();
    // Closing the window any other way (Alt+F4, the taskbar) counts as Cancel.
    let handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { .. } = event {
            finish_selection(&handle, None);
        }
    });
    Ok(window)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_folder(name: &str) -> PathBuf {
        let folder = std::env::temp_dir().join(format!("openexplainer-app-tests-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).unwrap();
        folder
    }

    /// A stand-in for the helper: a short PowerShell script. It reads one line, then does `body`.
    #[cfg(windows)]
    fn fake_helper(body: &str) -> Command {
        let mut command = Command::new("powershell");
        command.args(["-NoProfile", "-NonInteractive", "-Command", &format!("$null = [Console]::In.ReadLine(); {body}")]);
        command
    }

    #[cfg(windows)]
    fn idle() -> (AtomicBool, Mutex<Option<Arc<HelperRun>>>) {
        (AtomicBool::new(false), Mutex::new(None))
    }

    #[cfg(windows)]
    #[test]
    fn an_answer_comes_back_as_it_was_written() {
        let (cancel, running) = idle();
        let command = fake_helper("[Console]::Out.WriteLine('{\"id\":1,\"ok\":true,\"result\":{}}')");
        let outcome = run_helper(command, "{}", Duration::from_secs(20), &cancel, &running);
        assert_eq!(outcome, Outcome::Reply("{\"id\":1,\"ok\":true,\"result\":{}}".to_string()));
        assert!(running.lock().unwrap().is_none(), "nothing is left registered");
    }

    #[cfg(windows)]
    #[test]
    fn a_helper_that_never_answers_is_stopped_at_the_time_limit() {
        let (cancel, running) = idle();
        let started = Instant::now();
        let outcome = run_helper(fake_helper("Start-Sleep -Seconds 60"), "{}", Duration::from_millis(1200), &cancel, &running);
        assert_eq!(outcome, Outcome::Timeout);
        assert!(started.elapsed() < Duration::from_secs(10), "it did not wait for the helper to finish");
        assert!(running.lock().unwrap().is_none());
    }

    #[cfg(windows)]
    #[test]
    fn cancel_stops_the_wait_at_once() {
        let (cancel, running) = idle();
        let cancel = Arc::new(cancel);
        let running = Arc::new(running);
        let (c, r) = (cancel.clone(), running.clone());
        let canceller = std::thread::spawn(move || {
            // Wait until the helper is really running, then press "Cancel" the way the Cancel window does.
            while r.lock().unwrap().is_none() {
                std::thread::sleep(Duration::from_millis(20));
            }
            c.store(true, Ordering::SeqCst);
            if let Some(run) = r.lock().unwrap().as_ref() {
                run.stop();
            }
        });
        let started = Instant::now();
        let outcome = run_helper(fake_helper("Start-Sleep -Seconds 60"), "{}", Duration::from_secs(30), &cancel, &running);
        canceller.join().unwrap();
        assert_eq!(outcome, Outcome::Cancelled);
        assert!(started.elapsed() < Duration::from_secs(10));
    }

    #[cfg(windows)]
    #[test]
    fn cancel_pressed_before_the_helper_starts_is_not_lost() {
        let (cancel, running) = idle();
        cancel.store(true, Ordering::SeqCst);
        assert_eq!(run_helper(fake_helper("exit 0"), "{}", Duration::from_secs(5), &cancel, &running), Outcome::Cancelled);
    }

    #[cfg(windows)]
    #[test]
    fn a_helper_that_ends_without_answering_is_reported() {
        let (cancel, running) = idle();
        assert_eq!(run_helper(fake_helper("exit 3"), "{}", Duration::from_secs(20), &cancel, &running), Outcome::Stopped);
    }

    #[test]
    fn a_helper_that_cannot_start_says_why() {
        let cancel = AtomicBool::new(false);
        let running = Mutex::new(None);
        let outcome = run_helper(Command::new("C:\\no\\such\\folder\\helper.exe"), "{}", Duration::from_secs(5), &cancel, &running);
        assert!(matches!(outcome, Outcome::CannotStart(why) if !why.is_empty()));
    }

    #[test]
    fn the_helper_is_found_beside_the_app_or_in_the_build_folder_above_it() {
        let root = fresh_folder("find");
        let app = root.join("src-tauri").join("target").join("debug");
        std::fs::create_dir_all(&app).unwrap();
        assert_eq!(find_helper(&app, None), None, "nothing built yet");
        let built = root.join("capture-helper").join("target").join("release");
        std::fs::create_dir_all(&built).unwrap();
        std::fs::write(built.join(HELPER_FILE), b"x").unwrap();
        assert_eq!(find_helper(&app, None), Some(built.join(HELPER_FILE)), "found by walking up");
        std::fs::write(app.join(HELPER_FILE), b"x").unwrap();
        assert_eq!(find_helper(&app, None), Some(app.join(HELPER_FILE)), "beside the app wins");
        let named = root.join("named.exe");
        std::fs::write(&named, b"x").unwrap();
        assert_eq!(find_helper(&app, Some(named.clone())), Some(named), "the environment variable wins over both");
        assert_eq!(find_helper(&app, Some(root.join("missing.exe"))), Some(app.join(HELPER_FILE)), "a missing named file is ignored");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn picture_paths_are_new_every_time_and_inside_the_capture_folder() {
        let counter = AtomicU64::new(0);
        let (a, b) = (new_picture_path(&counter), new_picture_path(&counter));
        assert_ne!(a, b);
        assert_eq!(a.parent(), Some(capture_folder().as_path()));
        assert_eq!(a.extension().and_then(|e| e.to_str()), Some("png"));
    }

    #[test]
    fn only_a_picture_in_the_capture_folder_can_be_taken_and_it_is_deleted_after() {
        let folder = fresh_folder("take");
        let picture = folder.join("a.png");
        std::fs::write(&picture, b"png bytes").unwrap();
        assert_eq!(take_picture_file(&picture, &folder).unwrap(), b"png bytes".to_vec());
        assert!(!picture.exists(), "the temporary file is gone");

        let elsewhere = fresh_folder("elsewhere").join("b.png");
        std::fs::write(&elsewhere, b"x").unwrap();
        assert!(take_picture_file(&elsewhere, &folder).is_err(), "another folder is refused");
        assert!(elsewhere.exists(), "and the file is left alone");

        let not_a_picture = folder.join("c.txt");
        std::fs::write(&not_a_picture, b"x").unwrap();
        assert!(take_picture_file(&not_a_picture, &folder).is_err());
        let _ = std::fs::remove_dir_all(&folder);
    }

    #[test]
    fn a_picture_can_be_read_without_being_deleted_and_only_from_the_capture_folder() {
        let folder = fresh_folder("read");
        let picture = folder.join("snap.png");
        std::fs::write(&picture, b"pixels").unwrap();
        assert_eq!(read_picture_file(&picture, &folder, false).unwrap(), b"pixels".to_vec());
        assert!(picture.exists(), "reading does not delete");
        assert_eq!(read_picture_file(&picture, &folder, true).unwrap(), b"pixels".to_vec());
        assert!(!picture.exists(), "taking does");
        let elsewhere = fresh_folder("read-elsewhere").join("x.png");
        std::fs::write(&elsewhere, b"x").unwrap();
        assert!(read_picture_file(&elsewhere, &folder, false).is_err());
        let _ = std::fs::remove_dir_all(&folder);
    }

    #[test]
    fn old_pictures_are_swept_out_and_nothing_else_is_touched() {
        let folder = fresh_folder("sweep");
        std::fs::write(folder.join("a.png"), b"x").unwrap();
        std::fs::write(folder.join("b.PNG.partial"), b"x").unwrap();
        std::fs::write(folder.join("keep.txt"), b"x").unwrap();
        assert_eq!(sweep_old_pictures(&folder, Duration::from_secs(3600)), 0, "nothing is an hour old yet");
        assert!(folder.join("a.png").exists());
        std::thread::sleep(Duration::from_millis(30));
        assert_eq!(sweep_old_pictures(&folder, Duration::from_millis(10)), 2, "both pictures are older than 10 ms");
        assert!(!folder.join("a.png").exists() && !folder.join("b.PNG.partial").exists());
        assert!(folder.join("keep.txt").exists(), "a file that is not a capture picture is left alone");
        assert_eq!(sweep_old_pictures(&folder.join("missing"), Duration::ZERO), 0, "a missing folder is fine");
        let _ = std::fs::remove_dir_all(&folder);
    }

    #[test]
    fn rectangles_and_screens_are_read_from_their_numbers() {
        assert_eq!(rect_from(&json!({ "left": 1, "top": 2, "width": 3, "height": 4 })), Some((1, 2, 3, 4)));
        assert_eq!(screen_from(&json!({ "x": 7, "y": -1080, "width": 1920, "height": 1080, "primary": false })), Some((7, -1080, 1920, 1080)));
        assert_eq!(rect_from(&json!({ "left": 1, "top": 2, "width": 3 })), None, "a missing number");
        assert_eq!(rect_from(&json!({ "left": "1", "top": 2, "width": 3, "height": 4 })), None, "text is not a number");
        assert_eq!(rect_from(&json!({ "left": 1.5, "top": 2, "width": 3, "height": 4 })), None, "a fraction is not a whole number");
        assert_eq!(rect_from(&json!({ "left": 99999999999i64, "top": 2, "width": 3, "height": 4 })), None, "too large");
    }

    #[test]
    fn outcomes_become_the_messages_the_app_expects() {
        assert_eq!(outcome_to_json(Outcome::Timeout, 20), json!({ "kind": "timeout", "seconds": 20 }));
        assert_eq!(outcome_to_json(Outcome::Cancelled, 20), json!({ "kind": "cancelled" }));
        assert_eq!(outcome_to_json(Outcome::Stopped, 20), json!({ "kind": "stopped" }));
        assert_eq!(outcome_to_json(Outcome::Reply("{\"ok\":true}".into()), 20), json!({ "kind": "reply", "reply": { "ok": true } }));
        assert_eq!(outcome_to_json(Outcome::Reply("not json".into()), 20), json!({ "kind": "stopped" }), "an unreadable answer counts as no answer");
    }
}
