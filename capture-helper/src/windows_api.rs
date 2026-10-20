// SPDX-License-Identifier: Apache-2.0
//! Everything that talks to Windows. Only built on Windows.

use crate::pixels::Rect;
use crate::protocol::{code, CaptureError, ScreenInfo, WindowInfo};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::ffi::c_void;
use std::path::Path;
use std::sync::mpsc;
use std::time::{Duration, Instant};
use windows::core::{BOOL, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, POINT, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, EnumDisplayMonitors, GetDC, GetDIBits,
    GetMonitorInfoW, MonitorFromPoint, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT,
    DIB_RGB_COLORS, HBITMAP, HDC, HMONITOR, MONITORINFO, MONITOR_DEFAULTTONEAREST, SRCCOPY,
};
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::System::Console::GetConsoleWindow;
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{
    GetCurrentProcessId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::HiDpi::{
    GetDpiForMonitor, GetDpiForWindow, SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, MDT_EFFECTIVE_DPI,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetAncestor, GetClassNameW, GetForegroundWindow, GetWindow, GetWindowDisplayAffinity, GetWindowLongW, GetWindowPlacement, GetWindowRect, GetWindowTextW,
    GetWindowThreadProcessId, IsHungAppWindow, IsIconic, IsWindow, IsWindowVisible, SetForegroundWindow, WindowFromPoint,
    GA_ROOTOWNER, GWL_EXSTYLE, GW_OWNER, WINDOWPLACEMENT, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
};

// Click-by-click capture lives in its own file, but is a child of this one so it can use the screen-copy functions here.
#[path = "watch_windows.rs"]
mod watch;
pub use watch::{start_watching, Watching};

/// Makes Windows give real screen pixels instead of scaled ones, whatever the display scaling is.
pub fn prepare() {
    // It is fine if this fails: it only means something already set it.
    let _ = unsafe { SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) };
}

/// The programs whose windows the helper must never list or capture: itself, the program that started
/// it (OpenExplainer), and anything else the app names. This is what stops OpenExplainer capturing itself.
fn programs_to_skip(extra: &[u32]) -> HashSet<u32> {
    let mut skip: HashSet<u32> = extra.iter().copied().collect();
    let me = unsafe { GetCurrentProcessId() };
    skip.insert(me);
    if let Some(parent) = parent_process(me) {
        skip.insert(parent);
    }
    skip
}

fn parent_process(child: u32) -> Option<u32> {
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
        let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut found = None;
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                if entry.th32ProcessID == child {
                    found = Some(entry.th32ParentProcessID);
                    break;
                }
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);
        found
    }
}

struct Walk {
    skip: HashSet<u32>,
    console: HWND,
    found: Vec<WindowInfo>,
}

/// The windows a person would call open windows, the one in front first. It follows the Alt+Tab rule:
/// visible, not hidden on another virtual desktop, with a title, not a tool window, not owned by another
/// window. Minimized windows are included and marked, so the app can explain them.
pub fn list_windows(exclude_pids: &[u32]) -> Result<Vec<WindowInfo>, CaptureError> {
    let mut walk = Walk { skip: programs_to_skip(exclude_pids), console: unsafe { GetConsoleWindow() }, found: Vec::new() };
    unsafe extern "system" fn each(hwnd: HWND, data: LPARAM) -> BOOL {
        let walk = unsafe { &mut *(data.0 as *mut Walk) };
        if let Some(info) = unsafe { describe(hwnd, walk) } {
            walk.found.push(info);
        }
        BOOL(1)
    }
    unsafe { EnumWindows(Some(each), LPARAM(&mut walk as *mut Walk as isize)) }.map_err(|e| {
        CaptureError::new(code::CAPTURE_FAILED, "Windows would not list the open windows.").with_detail(e.to_string())
    })?;
    Ok(walk.found)
}

/// What to say about a window, or `None` if it is not one a person would call an open window.
unsafe fn describe(hwnd: HWND, walk: &Walk) -> Option<WindowInfo> {
    unsafe {
        if !IsWindowVisible(hwnd).as_bool() || hwnd == walk.console || is_cloaked(hwnd) {
            return None;
        }
        let style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        let tool = style & WS_EX_TOOLWINDOW.0 != 0 && style & WS_EX_APPWINDOW.0 == 0;
        let owned = GetWindow(hwnd, GW_OWNER).map(|owner| !owner.0.is_null()).unwrap_or(false);
        if tool || (owned && style & WS_EX_APPWINDOW.0 == 0) {
            return None;
        }
        let info = measure(hwnd)?;
        if info.title.is_empty() || info.title == "Program Manager" || walk.skip.contains(&info.pid) {
            return None;
        }
        Some(info)
    }
}

pub(crate) unsafe fn is_cloaked(hwnd: HWND) -> bool {
    let mut cloaked = 0u32;
    let asked = unsafe {
        DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &mut cloaked as *mut u32 as *mut c_void, std::mem::size_of::<u32>() as u32)
    };
    asked.is_ok() && cloaked != 0
}

/// Everything the helper reports about one window, whether or not it belongs in the list.
/// `None` only when the window has no usable size.
pub(crate) unsafe fn measure(hwnd: HWND) -> Option<WindowInfo> {
    unsafe {
        let title = window_title(hwnd);
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let minimized = IsIconic(hwnd).as_bool();
        let bounds = if minimized { restored_bounds(hwnd)? } else { visible_bounds(hwnd)? };
        if bounds.is_empty() {
            return None;
        }
        let dpi = GetDpiForWindow(hwnd);
        Some(WindowInfo {
            id: hwnd.0 as isize as i64,
            title,
            process: program_name(pid),
            pid,
            x: bounds.left,
            y: bounds.top,
            width: bounds.width() as u32,
            height: bounds.height() as u32,
            minimized,
            not_responding: IsHungAppWindow(hwnd).as_bool(),
            scale_percent: if dpi == 0 { 100 } else { dpi * 100 / 96 },
        })
    }
}

/// The part of the window a person sees: without the invisible borders Windows puts round most windows.
pub(crate) unsafe fn visible_bounds(hwnd: HWND) -> Option<Rect> {
    unsafe {
        let mut frame = RECT::default();
        let measured = DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut frame as *mut RECT as *mut c_void,
            std::mem::size_of::<RECT>() as u32,
        )
        .is_ok();
        if !measured && GetWindowRect(hwnd, &mut frame).is_err() {
            return None;
        }
        Some(Rect { left: frame.left, top: frame.top, right: frame.right, bottom: frame.bottom })
    }
}

/// The whole rectangle of the window, invisible borders included.
pub(crate) unsafe fn full_bounds(hwnd: HWND) -> Option<Rect> {
    unsafe {
        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect).ok()?;
        Some(Rect { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })
    }
}

/// Where a minimized window will sit when it is brought back.
unsafe fn restored_bounds(hwnd: HWND) -> Option<Rect> {
    unsafe {
        let mut placement = WINDOWPLACEMENT { length: std::mem::size_of::<WINDOWPLACEMENT>() as u32, ..Default::default() };
        GetWindowPlacement(hwnd, &mut placement).ok()?;
        let r = placement.rcNormalPosition;
        Some(Rect { left: r.left, top: r.top, right: r.right, bottom: r.bottom })
    }
}

/// The name of the program a process runs, such as `notepad.exe`.
unsafe fn program_name(process_id: u32) -> String {
    unsafe {
        let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) else {
            return "an unknown program".to_string();
        };
        let mut buffer = [0u16; 1024];
        let mut length = buffer.len() as u32;
        let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, PWSTR(buffer.as_mut_ptr()), &mut length).is_ok();
        let _ = CloseHandle(process);
        if !ok {
            return "an unknown program".to_string();
        }
        let path = String::from_utf16_lossy(&buffer[..(length as usize).min(buffer.len())]);
        path.rsplit(['\\', '/']).next().unwrap_or(&path).to_string()
    }
}

// ---- Capturing one window -------------------------------------------------------------------------------

/// How long Windows may take to draw a program's window before the helper gives up on that method.
const DRAW_WAIT: Duration = Duration::from_secs(5);
/// How much of a window must be showing, at the points checked, for a copy of the screen to be a picture of it.
const FRONT_ENOUGH: f32 = 0.8;
/// `PrintWindow` flag that also asks for windows drawn by the graphics card (most modern programs).
const PW_RENDERFULLCONTENT: PRINT_WINDOW_FLAGS = PRINT_WINDOW_FLAGS(2);

/// Takes a picture of one window and saves it as a PNG.
///
/// Method 1 asks Windows to draw the window itself (`PrintWindow`), which works even when other windows
/// are in front of it. If a program will not do that (a blank picture, no reply, or not responding), method 2
/// copies the window's rectangle from the screen, which only gives the right picture when the window is
/// really in front. The reply says which was used.
pub fn capture_window(id: i64, out: &Path, exclude_pids: &[u32], activate: bool) -> Result<Value, CaptureError> {
    let started = Instant::now();
    let hwnd = HWND(id as isize as *mut c_void);
    let (info, full, visible) = unsafe { check_window(hwnd, exclude_pids)? };
    let crop = crate::pixels::visible_part(full, visible);
    if i64::from(full.width()) * i64::from(full.height()) > crate::pixels::MOST_PIXELS {
        return Err(CaptureError::new(code::TOO_LARGE, "That window is far bigger than any screen. Nothing was captured."));
    }

    // Asked for: bring the window to the front first, so it is drawn as the active window (a dark title bar, not a grey one).
    // A program that is not responding is left alone: there is nothing to gain, and it must not be given focus.
    let activated: Option<bool> = if activate { Some(!info.not_responding && unsafe { bring_to_front(hwnd) }) } else { None };
    let suffix = if activated == Some(false) {
        " The window could not be brought to the front first, so its title bar may look inactive."
    } else {
        ""
    };

    // Why the first method was not used, in words. Only reached when it did not give a picture.
    let reason: String = if info.not_responding {
        "This program is not responding, so Windows could not ask it to draw itself (its title bar may say \"Not Responding\")."
            .to_string()
    } else {
        // Windows can wait forever on a program that is stuck, so the request goes to a side thread that the
        // helper stops waiting for after a few seconds.
        let (send, receive) = mpsc::channel();
        let (window, width, height) = (id as isize, full.width(), full.height());
        std::thread::spawn(move || {
            let _ = send.send(unsafe { print_window_bgra(window, width, height) });
        });
        match receive.recv_timeout(DRAW_WAIT) {
            Ok(Ok(bgra)) if crate::pixels::looks_blank(&bgra) => {
                "Windows gave back a blank picture when it asked the program to draw itself.".to_string()
            }
            Ok(Ok(bgra)) => match crate::pixels::crop_bgra(&bgra, full.width() as u32, full.height() as u32, crop) {
                Some(cut) => {
                    return finish(
                        out,
                        cut,
                        crop,
                        "print-window",
                        format!("Windows drew the window itself, so anything in front of it does not matter.{suffix}"),
                        info,
                        activated,
                        started,
                    );
                }
                None => "The picture Windows drew did not have the expected size.".to_string(),
            },
            Ok(Err(why)) => format!("Windows would not ask the program to draw itself ({why})."),
            Err(_) => format!("The program did not draw itself within {} seconds.", DRAW_WAIT.as_secs()),
        }
    };

    let bgra = unsafe { screen_copy(hwnd, visible)? };
    if crate::pixels::looks_blank(&bgra) {
        return Err(CaptureError::new(
            code::BLANK,
            "Windows would not give a picture of that window. Some programs block screen capture on purpose.",
        )
        .with_detail(reason));
    }
    let note = format!("{reason} The picture was copied from the screen instead, as the window looks right now.{suffix}");
    let size = Rect { left: 0, top: 0, right: visible.width(), bottom: visible.height() };
    finish(out, bgra, size, "screen-copy", note, info, activated, started)
}

#[allow(clippy::too_many_arguments)]
fn finish(
    out: &Path,
    bgra: Vec<u8>,
    size: Rect,
    method: &str,
    note: String,
    window: WindowInfo,
    activated: Option<bool>,
    started: Instant,
) -> Result<Value, CaptureError> {
    let (width, height) = save_picture(out, &bgra, size)?;
    let mut result = json!({
        "path": out.to_string_lossy(),
        "width": width,
        "height": height,
        "method": method,
        "note": note,
        "scale_percent": window.scale_percent,
        "elapsed_ms": started.elapsed().as_millis() as u64,
        "window": window,
    });
    // Only said when the window was asked to be brought to the front: whether that worked.
    if let (Some(done), Some(object)) = (activated, result.as_object_mut()) {
        object.insert("activated".to_string(), json!(done));
    }
    Ok(result)
}

/// Makes the window the active one, so Windows draws its title bar the way a person using it sees it.
/// Windows only lets a program do this in some situations. One is when the program that started it is the one in front,
/// and the helper is started by OpenExplainer, which is in front while it captures. Returns whether it worked.
unsafe fn bring_to_front(hwnd: HWND) -> bool {
    unsafe {
        let _ = SetForegroundWindow(hwnd);
        let deadline = Instant::now() + Duration::from_millis(600);
        loop {
            let front = GetForegroundWindow();
            if front == hwnd || GetAncestor(front, GA_ROOTOWNER) == hwnd {
                break;
            }
            if Instant::now() >= deadline {
                return false;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        // Give the window a moment to draw itself as the active window.
        std::thread::sleep(Duration::from_millis(150));
        true
    }
}

/// Turns blue-green-red pixels into a PNG file. Returns the picture's width and height.
fn save_picture(out: &Path, bgra: &[u8], size: Rect) -> Result<(u32, u32), CaptureError> {
    let (width, height) = (size.width() as u32, size.height() as u32);
    crate::png_out::write_png(out, &crate::pixels::bgra_to_rgb(bgra), width, height)?;
    Ok((width, height))
}

/// Everything that must be true before a picture is worth taking, each with its own plain-words refusal.
unsafe fn check_window(hwnd: HWND, exclude_pids: &[u32]) -> Result<(WindowInfo, Rect, Rect), CaptureError> {
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool() {
            return Err(CaptureError::new(
                code::WINDOW_GONE,
                "That window has closed or is no longer there. Make a new list of windows and choose again.",
            ));
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if hwnd == GetConsoleWindow() || programs_to_skip(exclude_pids).contains(&pid) {
            return Err(CaptureError::new(
                code::OWN_WINDOW,
                "That is a window of OpenExplainer itself, or of the program running this test. The helper never captures the program that started it.",
            ));
        }
        if !IsWindowVisible(hwnd).as_bool() {
            return Err(CaptureError::new(code::HIDDEN, "That window is hidden, so there is nothing to capture."));
        }
        if is_cloaked(hwnd) {
            return Err(CaptureError::new(
                code::OTHER_DESKTOP,
                "That window is on another virtual desktop, or its program is suspended. Switch to it, then try again.",
            ));
        }
        if IsIconic(hwnd).as_bool() {
            return Err(CaptureError::new(
                code::MINIMIZED,
                "That window is minimized. Open it from the taskbar so it shows on the screen, then try again.",
            ));
        }
        let info = measure(hwnd).ok_or_else(|| {
            CaptureError::new(code::HIDDEN, "That window has no size on the screen, so there is nothing to capture.")
        })?;
        let (Some(full), Some(visible)) = (full_bounds(hwnd), visible_bounds(hwnd)) else {
            return Err(CaptureError::new(code::CAPTURE_FAILED, "Windows would not say where that window is."));
        };
        Ok((info, full, visible))
    }
}

/// Asks Windows to draw the window into a picture of its own. Runs on a side thread.
unsafe fn print_window_bgra(window: isize, width: i32, height: i32) -> Result<Vec<u8>, String> {
    unsafe {
        let hwnd = HWND(window as *mut c_void);
        let screen = GetDC(None);
        let memory = CreateCompatibleDC(Some(screen));
        let bitmap = CreateCompatibleBitmap(screen, width, height);
        let result = if screen.is_invalid() || memory.is_invalid() || bitmap.is_invalid() {
            Err("Windows could not make room for the picture".to_string())
        } else {
            let old = SelectObject(memory, bitmap.into());
            let drawn = PrintWindow(hwnd, memory, PW_RENDERFULLCONTENT).as_bool();
            SelectObject(memory, old);
            if drawn {
                read_pixels(memory, bitmap, width, height)
            } else {
                Err("PrintWindow said no".to_string())
            }
        };
        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(memory);
        ReleaseDC(None, screen);
        result
    }
}

/// Copies the window's rectangle from the screen. Only right if the window is in front, so this checks, and
/// tries to bring the window forward if it is not.
unsafe fn screen_copy(hwnd: HWND, area: Rect) -> Result<Vec<u8>, CaptureError> {
    unsafe {
        if !crate::pixels::covered_by(area, &screen_rects()) {
            return Err(CaptureError::new(
                code::OFF_SCREEN,
                "Part of that window is off the edge of the screen, and Windows would not draw the window itself. Move it fully onto the screen, then try again.",
            ));
        }
        if front_share(hwnd, area) < FRONT_ENOUGH {
            let _ = SetForegroundWindow(hwnd);
            std::thread::sleep(Duration::from_millis(300));
            if front_share(hwnd, area) < FRONT_ENOUGH {
                return Err(CaptureError::new(
                    code::COVERED,
                    "Another window is in front of it, and Windows would not draw the window itself. Click the window to bring it to the front, then try again.",
                ));
            }
        }
        copy_area(area)
    }
}

/// Copies a rectangle of the screen, as it looks right now: every window in front of it is included, and the mouse
/// pointer is not. The caller must already know the rectangle is on the screens.
unsafe fn copy_area(area: Rect) -> Result<Vec<u8>, CaptureError> {
    unsafe {
        let (width, height) = (area.width(), area.height());
        let screen = GetDC(None);
        let memory = CreateCompatibleDC(Some(screen));
        let bitmap = CreateCompatibleBitmap(screen, width, height);
        let result = if screen.is_invalid() || memory.is_invalid() || bitmap.is_invalid() {
            Err("Windows could not make room for the picture".to_string())
        } else {
            let old = SelectObject(memory, bitmap.into());
            let copied = BitBlt(memory, 0, 0, width, height, Some(screen), area.left, area.top, SRCCOPY | CAPTUREBLT);
            SelectObject(memory, old);
            match copied {
                Ok(()) => read_pixels(memory, bitmap, width, height),
                Err(e) => Err(format!("copying from the screen failed: {e}")),
            }
        };
        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(memory);
        ReleaseDC(None, screen);
        result.map_err(|why| CaptureError::new(code::CAPTURE_FAILED, "Windows would not copy the picture from the screen.").with_detail(why))
    }
}

/// The share (0 to 1) of points spread over the window where this window, and not another, is what shows.
unsafe fn front_share(hwnd: HWND, area: Rect) -> f32 {
    unsafe {
        let points = crate::pixels::grid_points(area, 5, 5, 6);
        if points.is_empty() {
            return 1.0;
        }
        let mine = GetAncestor(hwnd, GA_ROOTOWNER);
        let mine = if mine.0.is_null() { hwnd } else { mine };
        let title = window_title(hwnd);
        let showing = points
            .iter()
            .filter(|(x, y)| {
                let top = visible_root_at(POINT { x: *x, y: *y });
                top == mine || is_ghost_of(top, &title)
            })
            .count();
        showing as f32 / points.len() as f32
    }
}

/// The affinity value Windows gives a window that is kept out of screen captures and recordings. OpenExplainer's own
/// Cancel window uses it, so it can sit anywhere without ever appearing in a picture.
const WDA_EXCLUDEFROMCAPTURE: u32 = 0x11;

/// Is this window kept out of screen copies? A copy of the screen shows what is behind such a window.
unsafe fn is_protected(hwnd: HWND) -> bool {
    let mut affinity = 0u32;
    unsafe { GetWindowDisplayAffinity(hwnd, &mut affinity) }.is_ok() && affinity == WDA_EXCLUDEFROMCAPTURE
}

/// The top-level window a copy of the screen would show at this point. Normally that is the window under the point, but
/// a window kept out of screen copies is looked through to the next one down.
unsafe fn visible_root_at(point: POINT) -> HWND {
    unsafe {
        let top = GetAncestor(WindowFromPoint(point), GA_ROOTOWNER);
        if !is_protected(top) {
            return top;
        }
        struct Look {
            point: POINT,
            found: HWND,
        }
        let mut look = Look { point, found: top };
        unsafe extern "system" fn each(hwnd: HWND, data: LPARAM) -> BOOL {
            let look = unsafe { &mut *(data.0 as *mut Look) };
            let hidden = unsafe { !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() || is_cloaked(hwnd) || is_protected(hwnd) };
            if hidden {
                return BOOL(1);
            }
            if let Some(b) = unsafe { visible_bounds(hwnd) } {
                let (x, y) = (look.point.x, look.point.y);
                if x >= b.left && x < b.right && y >= b.top && y < b.bottom {
                    look.found = hwnd;
                    return BOOL(0);
                }
            }
            BOOL(1)
        }
        // EnumWindows goes from the front window to the back one. Stopping early makes it report "false", which is expected.
        let _ = EnumWindows(Some(each), LPARAM(&mut look as *mut Look as isize));
        let found = GetAncestor(look.found, GA_ROOTOWNER);
        if found.0.is_null() { look.found } else { found }
    }
}

/// When a program stops responding, Windows puts a stand-in "ghost" window in front of it, with the same title
/// plus "(Not Responding)". What a person sees is that ghost, so it counts as the window itself.
unsafe fn is_ghost_of(candidate: HWND, title: &str) -> bool {
    unsafe {
        let mut class = [0u16; 32];
        let length = GetClassNameW(candidate, &mut class).max(0) as usize;
        String::from_utf16_lossy(&class[..length.min(class.len())]) == "Ghost" && window_title(candidate).starts_with(title)
    }
}

unsafe fn window_title(hwnd: HWND) -> String {
    unsafe {
        let mut text = [0u16; 512];
        let length = GetWindowTextW(hwnd, &mut text).max(0) as usize;
        String::from_utf16_lossy(&text[..length.min(text.len())])
    }
}

// ---- Screens and regions --------------------------------------------------------------------------------

/// The `dwFlags` bit Windows sets on the main screen.
const MONITORINFOF_PRIMARY: u32 = 1;

/// The screens (monitors), the main one first. Positions are on the whole desktop, so a screen above or to the
/// left of the main one has negative numbers.
pub fn list_screens() -> Result<Vec<ScreenInfo>, CaptureError> {
    let mut found: Vec<ScreenInfo> = Vec::new();
    unsafe extern "system" fn each(monitor: HMONITOR, _dc: HDC, _area: *mut RECT, data: LPARAM) -> BOOL {
        let found = unsafe { &mut *(data.0 as *mut Vec<ScreenInfo>) };
        let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if unsafe { GetMonitorInfoW(monitor, &mut info) }.as_bool() {
            let r = info.rcMonitor;
            found.push(ScreenInfo {
                number: 0,
                x: r.left,
                y: r.top,
                width: (r.right - r.left).max(0) as u32,
                height: (r.bottom - r.top).max(0) as u32,
                primary: info.dwFlags & MONITORINFOF_PRIMARY != 0,
                scale_percent: unsafe { monitor_scale(monitor) },
            });
        }
        BOOL(1)
    }
    let asked = unsafe { EnumDisplayMonitors(None, None, Some(each), LPARAM(&mut found as *mut Vec<ScreenInfo> as isize)) };
    if !asked.as_bool() || found.is_empty() {
        return Err(CaptureError::new(code::CAPTURE_FAILED, "Windows would not list the screens."));
    }
    Ok(crate::pixels::number_screens(found))
}

/// The display scaling of one screen: 100, 125, 150 and so on.
unsafe fn monitor_scale(monitor: HMONITOR) -> u32 {
    let (mut x, mut y) = (0u32, 0u32);
    if unsafe { GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut x, &mut y) }.is_ok() && x != 0 {
        x * 100 / 96
    } else {
        100
    }
}

/// Where each screen is, as rectangles.
fn screen_rects() -> Vec<Rect> {
    list_screens()
        .unwrap_or_default()
        .iter()
        .map(|s| Rect { left: s.x, top: s.y, right: s.x + s.width as i32, bottom: s.y + s.height as i32 })
        .collect()
}

/// Takes a picture of a rectangle of the screen and saves it as a PNG. It is a copy of what is on the screen right
/// now, so every window in front of the rectangle is in the picture. Before copying it checks that the whole
/// rectangle is on a screen, and that no window of OpenExplainer (or of any program named in `exclude_pids`) is
/// showing in that area, so the app can never end up in its own picture.
pub fn capture_region(region: Rect, out: &Path, exclude_pids: &[u32]) -> Result<Value, CaptureError> {
    let started = Instant::now();
    if !crate::pixels::covered_by(region, &screen_rects()) {
        return Err(CaptureError::new(
            code::OFF_SCREEN,
            "Part of that rectangle is not on any screen. It may be off the edge, or in the gap between two screens. Choose a rectangle that is fully on your screens.",
        ));
    }
    if unsafe { own_window_showing(region, &programs_to_skip(exclude_pids)) } {
        return Err(CaptureError::new(
            code::OWN_WINDOW,
            "A window of OpenExplainer is showing in that area, so the picture would show OpenExplainer itself. Hide or move it first.",
        ));
    }
    let bgra = unsafe { copy_area(region)? };
    let (width, height) = save_picture(out, &bgra, Rect { left: 0, top: 0, right: region.width(), bottom: region.height() })?;
    let centre = POINT { x: region.left + region.width() / 2, y: region.top + region.height() / 2 };
    let scale_percent = unsafe { monitor_scale(MonitorFromPoint(centre, MONITOR_DEFAULTTONEAREST)) };
    Ok(json!({
        "path": out.to_string_lossy(),
        "width": width,
        "height": height,
        "method": "screen-copy",
        "note": "A copy of what is on the screen in that rectangle, with every window in front of it. The mouse pointer is not included.",
        "scale_percent": scale_percent,
        "elapsed_ms": started.elapsed().as_millis() as u64,
        "region": { "x": region.left, "y": region.top, "width": width, "height": height },
    }))
}

struct OwnWalk {
    skip: HashSet<u32>,
    console: HWND,
    region: Rect,
    showing: bool,
}

/// Is a window of one of the programs to skip really showing (not hidden behind another window) anywhere in `region`?
/// This looks at every top-level window, including tool windows and pop-ups, not only the Alt+Tab list.
unsafe fn own_window_showing(region: Rect, skip: &HashSet<u32>) -> bool {
    let mut walk = OwnWalk { skip: skip.clone(), console: unsafe { GetConsoleWindow() }, region, showing: false };
    unsafe extern "system" fn each(hwnd: HWND, data: LPARAM) -> BOOL {
        let walk = unsafe { &mut *(data.0 as *mut OwnWalk) };
        if unsafe { shows_in_region(hwnd, walk) } {
            walk.showing = true;
            return BOOL(0); // found one: stop looking
        }
        BOOL(1)
    }
    // Stopping the walk early makes EnumWindows report "false", which is expected here.
    let _ = unsafe { EnumWindows(Some(each), LPARAM(&mut walk as *mut OwnWalk as isize)) };
    walk.showing
}

unsafe fn shows_in_region(hwnd: HWND, walk: &OwnWalk) -> bool {
    unsafe {
        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() || hwnd == walk.console || is_cloaked(hwnd) {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if !walk.skip.contains(&pid) {
            return false;
        }
        // A window kept out of screen copies (the Cancel window) is never in the picture, so it is allowed to be there.
        if is_protected(hwnd) {
            return false;
        }
        let Some(bounds) = visible_bounds(hwnd) else { return false };
        let shared = crate::pixels::intersect(bounds, walk.region);
        if shared.is_empty() {
            return false;
        }
        // The window overlaps the region on paper. It only matters if it is what actually shows at some point there.
        let mine = GetAncestor(hwnd, GA_ROOTOWNER);
        let mine = if mine.0.is_null() { hwnd } else { mine };
        crate::pixels::grid_points(shared, 5, 5, 0).iter().any(|(x, y)| visible_root_at(POINT { x: *x, y: *y }) == mine)
    }
}

/// Reads a finished picture out of Windows as blue, green, red, spare bytes, top row first.
unsafe fn read_pixels(memory: HDC, bitmap: HBITMAP, width: i32, height: i32) -> Result<Vec<u8>, String> {
    unsafe {
        let mut format = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // a minus sign means top row first
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut pixels = vec![0u8; width as usize * height as usize * 4];
        let rows = GetDIBits(memory, bitmap, 0, height as u32, Some(pixels.as_mut_ptr() as *mut c_void), &mut format, DIB_RGB_COLORS);
        if rows == 0 {
            return Err("Windows would not hand over the picture's pixels".to_string());
        }
        Ok(pixels)
    }
}
