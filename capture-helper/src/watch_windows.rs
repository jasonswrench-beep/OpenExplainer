// SPDX-License-Identifier: Apache-2.0
//! Click-by-click capture on Windows.
//!
//! A low-level mouse hook sees every click before the program under the pointer does. For each click the hook holds the click
//! back for about a tenth of a second while it copies the whole screen the click is on, so the picture shows the screen just
//! BEFORE the program reacts. At the same moment a second thread asks Windows UI Automation what is under the pointer. A third
//! thread then saves the picture and tells the app about the click, one JSON line each.
//!
//! What this never does: it does not watch the keyboard, it writes nothing to disk except the pictures, it ignores clicks in
//! OpenExplainer's own windows (so the Stop button is not a step), and it never reads what is typed in a box. The pointer's
//! movement is looked at only to get the window under it ready to be asked about (see `get_ready`); where it went is not kept.

use super::{copy_area, is_cloaked, programs_to_skip, visible_bounds};
use crate::clicks::{self, Button, ClickRecord, DoubleRule, Ended, Last, RawTarget, Settings};
use crate::pixels::Rect;
use crate::protocol::{code, send_line, CaptureError};
use serde_json::{json, Value};
use std::cell::RefCell;
use std::collections::HashSet;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use windows::core::{Interface, BOOL};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation, IUIAutomation2, IUIAutomationElement};
use windows::Win32::UI::Input::KeyboardAndMouse::GetDoubleClickTime;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, EnumWindows, GetAncestor, GetCursorPos, GetMessageW, GetSystemMetrics, GetWindowLongW, GetWindowThreadProcessId,
    IsIconic, IsWindowVisible, PostThreadMessageW, SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, WindowFromPoint, GA_ROOT, GWL_EXSTYLE,
    MSG, MSLLHOOKSTRUCT, SM_CXDOUBLECLK, SM_CYDOUBLECLK, WH_MOUSE_LL, WM_LBUTTONDOWN, WM_MBUTTONDOWN, WM_MOUSEMOVE, WM_QUIT, WM_RBUTTONDOWN,
    WS_EX_TRANSPARENT,
};

/// If the hook holds a click back longer than this, the app is told, because Windows gives up on a hook that is too slow.
const SLOW_HOLD_MS: u64 = 250;
/// How long to wait for Windows to say what was clicked before giving up on that part.
const UIA_WAIT: Duration = Duration::from_millis(2500);
/// How many pictures may be waiting to be saved. More than this and the click is skipped (and counted).
const MOST_WAITING: u32 = 6;
/// A program built on a web browser engine (WebView2, Electron, Chrome) only builds what a screen reader would read once something asks
/// for it, so its first answers about what is under the pointer are just "document" or "window". The first time the pointer is over a
/// window, it is asked about a few times, `WARM_ROUNDS` at most, `WARM_PAUSE` apart, so the answer is ready when a click comes.
const WARM_ROUNDS: u32 = 4;
const WARM_PAUSE: Duration = Duration::from_millis(200);
/// The pointer is looked at no more often than this, and no more than `MOST_WARM_WAITING` of those looks may wait for Windows.
const MOVE_EVERY: Duration = Duration::from_millis(150);
const MOST_WARM_WAITING: u32 = 2;

struct Shared {
    stop: AtomicBool,
    done: AtomicBool,
    /// Clicks whose picture was taken.
    taken: AtomicU32,
    /// Clicks whose picture was not taken or not saved.
    skipped: AtomicU32,
    /// Clicks that were reported to the app.
    reported: AtomicU32,
    waiting: AtomicU32,
    /// Looks at the pointer (see `WARM_ROUNDS`) that are waiting for Windows.
    warm_waiting: AtomicU32,
    last_activity_ms: AtomicU64,
    slowest_hold_ms: AtomicU64,
    started: Instant,
}

/// A session in progress. The app asks it to stop; it says it is `done` after it has sent its last line.
pub struct Watching {
    shared: Arc<Shared>,
}

impl Watching {
    pub fn request_stop(&self) {
        self.shared.stop.store(true, Ordering::SeqCst);
    }

    pub fn is_done(&self) -> bool {
        self.shared.done.load(Ordering::SeqCst)
    }
}

enum Msg {
    Click(Box<Down>),
    Double(u32),
    Stop,
}

/// One click, with the picture taken before the program reacted.
struct Down {
    n: u32,
    button: Button,
    point: POINT,
    screen: Rect,
    bgra: Vec<u8>,
    held_ms: u64,
    uia: Receiver<Option<RawTarget>>,
    at: Instant,
}

/// A question for the thread that talks to UI Automation: what is at this point (a click, with somewhere to send the answer), or only
/// "get ready for this window" (the pointer moved, no answer wanted).
struct UiaJob {
    point: POINT,
    reply: Option<Sender<Option<RawTarget>>>,
}

// ---- The mouse hook ---------------------------------------------------------------------------------------

struct Hook {
    shared: Arc<Shared>,
    skip: HashSet<u32>,
    to_emitter: Sender<Msg>,
    to_uia: Sender<UiaJob>,
    rule: DoubleRule,
    last: Option<Last>,
    next_n: u32,
    max_clicks: u32,
    last_move: Option<Instant>,
}

thread_local! {
    // The hook procedure is a plain function with no way to carry data, so what it needs lives on the hook's own thread.
    static HOOK: RefCell<Option<Hook>> = const { RefCell::new(None) };
}

unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let message = wparam.0 as u32;
        if message == WM_MOUSEMOVE {
            let point = unsafe { (*(lparam.0 as *const MSLLHOOKSTRUCT)).pt };
            let _ = catch_unwind(AssertUnwindSafe(|| {
                HOOK.with(|cell| {
                    if let Some(hook) = cell.borrow_mut().as_mut() {
                        hook.mouse_moved(point);
                    }
                })
            }));
        }
        if message == WM_LBUTTONDOWN || message == WM_RBUTTONDOWN || message == WM_MBUTTONDOWN {
            let point = unsafe { (*(lparam.0 as *const MSLLHOOKSTRUCT)).pt };
            // A bug here must never stop the click reaching its program.
            let _ = catch_unwind(AssertUnwindSafe(|| {
                HOOK.with(|cell| {
                    if let Some(hook) = cell.borrow_mut().as_mut() {
                        hook.mouse_down(message, point);
                    }
                })
            }));
        }
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

impl Hook {
    /// The pointer moved. Now and then (not on every move: the hook must stay quick) the thread that talks to UI Automation is told where it is,
    /// so it can get ready for the window under it before a click comes.
    fn mouse_moved(&mut self, point: POINT) {
        let now = Instant::now();
        if self.last_move.is_some_and(|before| now.duration_since(before) < MOVE_EVERY) || self.shared.stop.load(Ordering::Relaxed) {
            return;
        }
        self.last_move = Some(now);
        if self.shared.warm_waiting.load(Ordering::Relaxed) >= MOST_WARM_WAITING {
            return;
        }
        self.shared.warm_waiting.fetch_add(1, Ordering::Relaxed);
        let _ = self.to_uia.send(UiaJob { point, reply: None });
    }

    fn mouse_down(&mut self, message: u32, point: POINT) {
        let started = Instant::now();
        if self.shared.stop.load(Ordering::Relaxed) || self.shared.taken.load(Ordering::Relaxed) >= self.max_clicks {
            return;
        }
        // A click in one of OpenExplainer's own windows (the Stop button) is not a step.
        if let Some(pid) = unsafe { owner_of_top_window_at(point) } {
            if self.skip.contains(&pid) {
                return;
            }
        }
        let button = match message {
            WM_LBUTTONDOWN => Button::Left,
            WM_RBUTTONDOWN => Button::Right,
            _ => Button::Middle,
        };
        // The second click of a double-click is the same step as the first.
        if let Some(last) = self.last {
            if clicks::is_second_of_double(&last, button, point.x, point.y, started, &self.rule) {
                let _ = self.to_emitter.send(Msg::Double(last.n));
                self.last = None;
                return;
            }
        }
        if self.shared.waiting.load(Ordering::Relaxed) >= MOST_WAITING {
            self.shared.skipped.fetch_add(1, Ordering::Relaxed);
            return;
        }
        // Ask Windows what is there while the screen is copied.
        let (reply, uia) = mpsc::channel();
        let _ = self.to_uia.send(UiaJob { point, reply: Some(reply) });
        let screen = unsafe { monitor_rect(point) };
        let bgra = match unsafe { copy_area(screen) } {
            Ok(pixels) => pixels,
            Err(_) => {
                self.shared.skipped.fetch_add(1, Ordering::Relaxed);
                return;
            }
        };
        let held_ms = started.elapsed().as_millis() as u64;
        let n = self.next_n;
        self.next_n += 1;
        self.shared.taken.fetch_add(1, Ordering::Relaxed);
        self.shared.waiting.fetch_add(1, Ordering::Relaxed);
        self.shared.slowest_hold_ms.fetch_max(held_ms, Ordering::Relaxed);
        self.shared.last_activity_ms.store(self.shared.started.elapsed().as_millis() as u64, Ordering::Relaxed);
        let _ = self.to_emitter.send(Msg::Click(Box::new(Down { n, button, point, screen, bgra, held_ms, uia, at: started })));
        self.last = Some(Last { n, button, x: point.x, y: point.y, at: started });
    }
}

unsafe fn monitor_rect(point: POINT) -> Rect {
    unsafe {
        let monitor = MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        let _ = GetMonitorInfoW(monitor, &mut info);
        let r = info.rcMonitor;
        Rect { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }
}

/// The program that owns the top-level window showing at this point. Windows kept out of screen copies (the Cancel and Stop
/// windows) count, which is the point: a click on one of them belongs to OpenExplainer.
unsafe fn owner_of_top_window_at(point: POINT) -> Option<u32> {
    struct Look {
        point: POINT,
        found: Option<u32>,
    }
    unsafe extern "system" fn each(hwnd: HWND, data: LPARAM) -> BOOL {
        let look = unsafe { &mut *(data.0 as *mut Look) };
        unsafe {
            let see_through = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TRANSPARENT.0 != 0;
            if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() || is_cloaked(hwnd) || see_through {
                return BOOL(1);
            }
            if let Some(b) = visible_bounds(hwnd) {
                if look.point.x >= b.left && look.point.x < b.right && look.point.y >= b.top && look.point.y < b.bottom {
                    let mut pid = 0u32;
                    GetWindowThreadProcessId(hwnd, Some(&mut pid));
                    look.found = Some(pid);
                    return BOOL(0);
                }
            }
        }
        BOOL(1)
    }
    let mut look = Look { point, found: None };
    // Stopping the walk early makes EnumWindows report "false", which is expected here.
    let _ = unsafe { EnumWindows(Some(each), LPARAM(&mut look as *mut Look as isize)) };
    look.found
}

fn run_hook(hook: Hook, ready: Sender<Result<u32, String>>) {
    unsafe {
        let installed = SetWindowsHookExW(WH_MOUSE_LL, Some(hook_proc), None, 0);
        let handle = match installed {
            Ok(handle) => handle,
            Err(e) => {
                let _ = ready.send(Err(e.to_string()));
                return;
            }
        };
        HOOK.with(|cell| *cell.borrow_mut() = Some(hook));
        let _ = ready.send(Ok(GetCurrentThreadId()));
        let mut message = MSG::default();
        // The hook only works while this thread keeps taking messages. Zero is WM_QUIT; minus one is an error.
        while GetMessageW(&mut message, None, 0, 0).0 > 0 {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
        let _ = UnhookWindowsHookEx(handle);
        HOOK.with(|cell| *cell.borrow_mut() = None);
    }
}

// ---- Asking Windows what was clicked ------------------------------------------------------------------------

fn run_uia(jobs: Receiver<UiaJob>, skip: HashSet<u32>, shared: Arc<Shared>) {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let automation: Option<IUIAutomation> = CoCreateInstance(&CUIAutomation, None::<&windows::core::IUnknown>, CLSCTX_INPROC_SERVER).ok();
        if let Some(two) = automation.as_ref().and_then(|a| a.cast::<IUIAutomation2>().ok()) {
            // A program that has stopped responding must not hold this up for the usual 20 seconds.
            let _ = two.SetConnectionTimeout(1500);
            let _ = two.SetTransactionTimeout(1500);
        }
        let mut warmed: HashSet<isize> = HashSet::new();
        for job in jobs {
            match job.reply {
                Some(reply) => {
                    let found = automation.as_ref().and_then(|a| describe(a, job.point));
                    let _ = reply.send(found);
                }
                None => {
                    if let Some(a) = automation.as_ref() {
                        get_ready(a, job.point, &skip, &mut warmed);
                    }
                    shared.warm_waiting.fetch_sub(1, Ordering::Relaxed);
                }
            }
        }
    }
}

/// What is under the pointer, asking only for what the rules in `clicks.rs` allow. A password box is not asked about at all.
unsafe fn describe(automation: &IUIAutomation, point: POINT) -> Option<RawTarget> {
    unsafe {
        let element = automation.ElementFromPoint(point).ok()?;
        if element.CurrentIsPassword().map(|b| b.as_bool()).unwrap_or(false) {
            return Some(RawTarget { password: true, ..Default::default() });
        }
        let mut control_type = element.CurrentControlType().map(|c| c.0).unwrap_or(0);
        // A click on a button's label is answered with the label (text or a picture inside the button). If a button, check box or the like is
        // just above it, the click was meant for that, so it is the one described. The rule is `clicks::climb_to`.
        let element = climb(automation, element, &mut control_type);
        let mut raw = RawTarget { control_type, ..Default::default() };
        if clicks::details_allowed(control_type) {
            raw.name = element.CurrentName().ok().map(|s| s.to_string());
            raw.accelerator_key = element.CurrentAcceleratorKey().ok().map(|s| s.to_string());
            raw.access_key = element.CurrentAccessKey().ok().map(|s| s.to_string());
            raw.help_text = element.CurrentHelpText().ok().map(|s| s.to_string());
        }
        raw.bounds = element.CurrentBoundingRectangle().ok().map(|r| (r.left, r.top, r.right, r.bottom));
        Some(raw)
    }
}

/// The item a click was meant for: the one under the pointer, or, when that is only writing or a picture inside a control, the control.
/// `control_type` is the kind of the item under the pointer, and is changed to the kind of the item returned. Only the kinds of the
/// parents are asked about here, never their names.
unsafe fn climb(automation: &IUIAutomation, element: IUIAutomationElement, control_type: &mut i32) -> IUIAutomationElement {
    unsafe {
        let mut chain = vec![*control_type];
        let mut items = vec![element.clone()];
        if matches!(*control_type, 50020 | 50006) {
            if let Ok(walker) = automation.ControlViewWalker() {
                let mut current = element.clone();
                for _ in 0..clicks::MOST_CLIMB {
                    let Ok(parent) = walker.GetParentElement(&current) else { break };
                    chain.push(parent.CurrentControlType().map(|c| c.0).unwrap_or(0));
                    items.push(parent.clone());
                    current = parent;
                }
            }
        }
        let pick = clicks::climb_to(&chain).min(items.len() - 1);
        *control_type = chain[pick];
        items.swap_remove(pick)
    }
}

/// Gets ready for the window under `point`, the first time the pointer is over it: asks what is there a few times, a moment apart, until the
/// answer is more than "document", "window" or "pane". Only the kind of item is read, nothing else, and nothing is kept. Windows of
/// OpenExplainer itself are left alone.
unsafe fn get_ready(automation: &IUIAutomation, point: POINT, skip: &HashSet<u32>, warmed: &mut HashSet<isize>) {
    unsafe {
        let under = WindowFromPoint(point);
        if under.0.is_null() {
            return;
        }
        let top = GetAncestor(under, GA_ROOT);
        let top = if top.0.is_null() { under } else { top };
        let mut pid = 0u32;
        GetWindowThreadProcessId(top, Some(&mut pid));
        if skip.contains(&pid) || !warmed.insert(top.0 as isize) {
            return;
        }
        for _ in 0..WARM_ROUNDS {
            let kind = automation.ElementFromPoint(point).ok().and_then(|e| e.CurrentControlType().ok()).map(|c| c.0).unwrap_or(0);
            if !matches!(kind, 0 | 50030 | 50032 | 50033) {
                break;
            }
            thread::sleep(WARM_PAUSE);
        }
    }
}

// ---- Saving pictures and telling the app -----------------------------------------------------------------

struct Pending {
    down: Down,
    double: bool,
}

fn run_emitter(rx: Receiver<Msg>, watch: Value, folder: PathBuf, tag: u128, double_time: Duration, shared: Arc<Shared>) {
    let mut pending: Option<(Pending, Instant)> = None;
    let mut told_about_skips = 0u32;
    loop {
        let wait = match &pending {
            Some((_, deadline)) => deadline.saturating_duration_since(Instant::now()),
            None => Duration::from_millis(200),
        };
        let message = rx.recv_timeout(wait.min(Duration::from_millis(200)));
        let skipped = shared.skipped.load(Ordering::Relaxed);
        if skipped > told_about_skips {
            told_about_skips = skipped;
            send_line(
                &json!({
                    "event": "skipped",
                    "watch": watch,
                    "count": skipped,
                    "message": "A click was not captured: clicks came faster than pictures could be saved, or Windows would not copy the screen.",
                })
                .to_string(),
            );
        }
        match message {
            Ok(Msg::Click(down)) => {
                if let Some((earlier, _)) = pending.take() {
                    finish(earlier, &watch, &folder, tag, &shared);
                }
                // The next click may turn this into a double-click, so it is held for as long as that can happen.
                let deadline = down.at + double_time + Duration::from_millis(40);
                pending = Some((Pending { down: *down, double: false }, deadline));
            }
            Ok(Msg::Double(n)) => {
                if let Some((mut earlier, _)) = pending.take() {
                    if earlier.down.n == n {
                        earlier.double = true;
                    }
                    finish(earlier, &watch, &folder, tag, &shared);
                }
            }
            Ok(Msg::Stop) | Err(RecvTimeoutError::Disconnected) => {
                if let Some((earlier, _)) = pending.take() {
                    finish(earlier, &watch, &folder, tag, &shared);
                }
                return;
            }
            Err(RecvTimeoutError::Timeout) => {
                if matches!(&pending, Some((_, deadline)) if Instant::now() >= *deadline) {
                    if let Some((earlier, _)) = pending.take() {
                        finish(earlier, &watch, &folder, tag, &shared);
                    }
                }
            }
        }
    }
}

fn finish(pending: Pending, watch: &Value, folder: &PathBuf, tag: u128, shared: &Shared) {
    let Pending { down, double } = pending;
    shared.waiting.fetch_sub(1, Ordering::Relaxed);
    let mut notes: Vec<String> = Vec::new();
    let answer = down.uia.recv_timeout(UIA_WAIT.saturating_sub(down.at.elapsed()).max(Duration::from_millis(50)));
    let target = match answer {
        Ok(Some(raw)) => clicks::target_json(&raw, down.screen),
        Ok(None) => {
            notes.push("Windows did not say what was clicked.".to_string());
            None
        }
        Err(_) => {
            notes.push("Windows did not answer in time about what was clicked.".to_string());
            None
        }
    };
    if down.held_ms > SLOW_HOLD_MS {
        notes.push(format!(
            "The click was held back for {} ms while the screen was copied. That is slow, and Windows may give up on the helper if it is slower still.",
            down.held_ms
        ));
    }
    let path = folder.join(format!("click-{tag}-{:03}.png", down.n));
    let (width, height) = (down.screen.width() as u32, down.screen.height() as u32);
    let saved = crate::png_out::write_png(&path, &crate::pixels::bgra_to_rgb(&down.bgra), width, height);
    match saved {
        Ok(()) => {
            let record = ClickRecord {
                n: down.n,
                button: down.button,
                double,
                x: down.point.x,
                y: down.point.y,
                screen: down.screen,
                target,
                held_ms: down.held_ms,
                path: path.to_string_lossy().into_owned(),
                width,
                height,
                note: if notes.is_empty() { None } else { Some(notes.join(" ")) },
            };
            shared.reported.fetch_add(1, Ordering::Relaxed);
            send_line(&clicks::click_event(watch, &record).to_string());
        }
        Err(error) => {
            shared.skipped.fetch_add(1, Ordering::Relaxed);
            send_line(&json!({ "event": "skipped", "watch": watch, "count": shared.skipped.load(Ordering::Relaxed), "message": error.message }).to_string());
        }
    }
}

// ---- Starting and ending a session ---------------------------------------------------------------------------

pub fn start_watching(id: Value, settings: Settings, exclude_pids: Vec<u32>) -> Result<(Watching, Value), CaptureError> {
    let shared = Arc::new(Shared {
        stop: AtomicBool::new(false),
        done: AtomicBool::new(false),
        taken: AtomicU32::new(0),
        skipped: AtomicU32::new(0),
        reported: AtomicU32::new(0),
        waiting: AtomicU32::new(0),
        warm_waiting: AtomicU32::new(0),
        last_activity_ms: AtomicU64::new(0),
        slowest_hold_ms: AtomicU64::new(0),
        started: Instant::now(),
    });
    let double_time = Duration::from_millis(unsafe { GetDoubleClickTime() } as u64);
    let rule = DoubleRule {
        time: double_time,
        half_width: (unsafe { GetSystemMetrics(SM_CXDOUBLECLK) } / 2).max(1),
        half_height: (unsafe { GetSystemMetrics(SM_CYDOUBLECLK) } / 2).max(1),
    };
    let (to_emitter, emitter_rx) = mpsc::channel::<Msg>();
    let (to_uia, uia_rx) = mpsc::channel::<UiaJob>();
    let (ready_tx, ready_rx) = mpsc::channel();
    let tag = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);

    // Windows' answers about what was clicked. It is never joined: a program that hangs may keep it busy.
    let skip = programs_to_skip(&exclude_pids);
    {
        let (skip, shared) = (skip.clone(), shared.clone());
        thread::spawn(move || run_uia(uia_rx, skip, shared));
    }
    let emitter = {
        let (watch, folder, shared) = (id.clone(), settings.out_dir.clone(), shared.clone());
        thread::spawn(move || run_emitter(emitter_rx, watch, folder, tag, double_time, shared))
    };
    let hook = Hook {
        shared: shared.clone(),
        skip,
        to_emitter: to_emitter.clone(),
        to_uia: to_uia.clone(),
        rule,
        last: None,
        next_n: 1,
        max_clicks: settings.max_clicks,
        last_move: None,
    };
    let hook_thread = thread::spawn(move || run_hook(hook, ready_tx));
    let hook_thread_id = match ready_rx.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(thread_id)) => thread_id,
        failed => {
            let _ = to_emitter.send(Msg::Stop);
            let detail = match failed {
                Ok(Err(why)) => why,
                _ => "it did not start in time".to_string(),
            };
            return Err(CaptureError::new(code::CAPTURE_FAILED, "Windows would not let the helper watch the mouse, so click-by-click capture cannot start.")
                .with_detail(detail));
        }
    };

    // The window the pointer is over now is got ready at once, without waiting for the pointer to move.
    let mut at = POINT::default();
    if unsafe { GetCursorPos(&mut at) }.is_ok() {
        shared.warm_waiting.fetch_add(1, Ordering::Relaxed);
        let _ = to_uia.send(UiaJob { point: at, reply: None });
    }

    let supervisor_shared = shared.clone();
    let idle = settings.idle;
    let max_clicks = settings.max_clicks;
    let watch = id;
    thread::spawn(move || {
        let shared = supervisor_shared;
        let reason = loop {
            thread::sleep(Duration::from_millis(50));
            if shared.stop.load(Ordering::SeqCst) {
                break Ended::Stopped;
            }
            let quiet_for = shared.started.elapsed().saturating_sub(Duration::from_millis(shared.last_activity_ms.load(Ordering::Relaxed)));
            if quiet_for >= idle {
                break Ended::Idle;
            }
            if shared.taken.load(Ordering::Relaxed) >= max_clicks {
                break Ended::Limit;
            }
            if hook_thread.is_finished() {
                break Ended::HookLost;
            }
        };
        // No more pictures from here on, then take the hook down and let the last click be saved.
        shared.stop.store(true, Ordering::SeqCst);
        unsafe {
            let _ = PostThreadMessageW(hook_thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
        }
        let _ = hook_thread.join();
        let _ = to_emitter.send(Msg::Stop);
        let _ = emitter.join();
        send_line(
            &json!({
                "event": "ended",
                "watch": watch,
                "ended": reason.word(),
                "clicks": shared.reported.load(Ordering::Relaxed),
                "skipped": shared.skipped.load(Ordering::Relaxed),
                "slowest_hold_ms": shared.slowest_hold_ms.load(Ordering::Relaxed),
            })
            .to_string(),
        );
        shared.done.store(true, Ordering::SeqCst);
    });

    let info = json!({
        "watching": true,
        "idle_seconds": settings.idle.as_secs(),
        "max_clicks": settings.max_clicks,
        "double_click_ms": double_time.as_millis() as u64,
    });
    Ok((Watching { shared }, info))
}
