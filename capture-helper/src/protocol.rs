// SPDX-License-Identifier: Apache-2.0
//! The messages between OpenExplainer and the capture helper.
//!
//! One JSON message per line goes in on stdin, and one JSON reply per line comes out on stdout.
//! Anything meant for a human to read while debugging goes to stderr, never stdout.
//! The same text is written up in `docs/capture-helper.md`.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The commands the helper knows, in the order `docs/capture-helper.md` lists them.
pub const COMMANDS: [&str; 5] = ["ping", "list-windows", "list-screens", "capture-window", "capture-region"];

/// Error codes. The app can switch on these; `message` is always plain words for the author.
pub mod code {
    pub const BAD_REQUEST: &str = "bad-request";
    #[allow(dead_code)] // only the non-Windows build says this
    pub const NOT_SUPPORTED: &str = "not-supported";
    pub const WINDOW_GONE: &str = "window-gone";
    pub const HIDDEN: &str = "hidden";
    pub const MINIMIZED: &str = "minimized";
    pub const OTHER_DESKTOP: &str = "other-desktop";
    pub const OWN_WINDOW: &str = "own-window";
    pub const COVERED: &str = "covered";
    pub const OFF_SCREEN: &str = "off-screen";
    pub const BLANK: &str = "blank";
    pub const TOO_LARGE: &str = "too-large";
    pub const CAPTURE_FAILED: &str = "capture-failed";
    pub const WRITE_FAILED: &str = "write-failed";
    pub const HELPER_CRASHED: &str = "helper-crashed";
}

/// One request line: `{"id": 1, "command": "list-windows"}`. The `id` is handed back unchanged.
#[derive(Debug, Deserialize)]
pub struct Envelope {
    #[serde(default)]
    pub id: Value,
    #[serde(flatten)]
    pub request: Request,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(tag = "command", rename_all = "kebab-case")]
pub enum Request {
    Ping,
    /// `exclude_pids`: programs whose windows must not be listed (the app passes its own).
    ListWindows {
        #[serde(default)]
        exclude_pids: Vec<u32>,
    },
    ListScreens,
    /// `window`: a window `id` from `list-windows`. `out`: full path of the PNG to write.
    CaptureWindow {
        window: i64,
        out: String,
        #[serde(default)]
        exclude_pids: Vec<u32>,
    },
    /// A rectangle of the screen: `x` and `y` are its top left corner, in real screen pixels (negative on a screen
    /// left of or above the main one). `out` is the full path of the PNG to write.
    CaptureRegion {
        x: i32,
        y: i32,
        width: i32,
        height: i32,
        out: String,
        #[serde(default)]
        exclude_pids: Vec<u32>,
    },
}

/// What the helper says about one screen (monitor).
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ScreenInfo {
    /// 1 is the main screen. The rest are numbered left to right, then top to bottom.
    pub number: u32,
    /// Where the screen's top left corner is on the whole desktop. Negative for a screen left of or above the main one.
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub primary: bool,
    /// The display scaling: 100, 125, 150 and so on.
    pub scale_percent: u32,
}

/// What the helper says about one open window.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct WindowInfo {
    /// Windows' own number for the window. Only good while the window stays open.
    pub id: i64,
    pub title: String,
    /// The program, such as `notepad.exe`.
    pub process: String,
    pub pid: u32,
    /// Where the visible part of the window sits on the screen, in real screen pixels.
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub minimized: bool,
    pub not_responding: bool,
    /// How big the screen makes things on that window: 100, 125, 150 and so on.
    pub scale_percent: u32,
}

/// A failed request, in words the author can read.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct CaptureError {
    pub code: &'static str,
    pub message: String,
    /// Technical detail for a bug report. Not shown to the author by default.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl CaptureError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        CaptureError { code, message: message.into(), detail: None }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }
}

/// One reply line: `{"id": 1, "ok": true, "result": {...}}` or `{"id": 1, "ok": false, "error": {...}}`.
#[derive(Debug, Serialize, PartialEq)]
pub struct Reply {
    pub id: Value,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<CaptureError>,
}

impl Reply {
    pub fn success(id: Value, result: Value) -> Self {
        Reply { id, ok: true, result: Some(result), error: None }
    }

    pub fn failure(id: Value, error: CaptureError) -> Self {
        Reply { id, ok: false, result: None, error: Some(error) }
    }
}

/// Reads one request line. A line that cannot be read becomes a ready-made failure reply, and the
/// `id` is kept when it can be found so the app still knows which request failed.
pub fn parse_line(line: &str) -> Result<Envelope, Reply> {
    let raw: Value = serde_json::from_str(line).map_err(|e| {
        Reply::failure(
            Value::Null,
            CaptureError::new(code::BAD_REQUEST, "The helper received something that is not a JSON message.")
                .with_detail(e.to_string()),
        )
    })?;
    let id = raw.get("id").cloned().unwrap_or(Value::Null);
    if let Some(name) = raw.get("command").and_then(Value::as_str) {
        if !COMMANDS.contains(&name) {
            return Err(Reply::failure(
                id,
                CaptureError::new(code::BAD_REQUEST, format!("The helper does not know the command \"{name}\".")),
            ));
        }
    } else {
        return Err(Reply::failure(
            id,
            CaptureError::new(code::BAD_REQUEST, "The helper message has no \"command\" in it."),
        ));
    }
    serde_json::from_value::<Envelope>(raw).map_err(|e| {
        Reply::failure(
            id,
            CaptureError::new(code::BAD_REQUEST, "The helper could not understand that request. Something it needs is missing or the wrong kind.")
                .with_detail(e.to_string()),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_ping_is_read_and_keeps_its_id() {
        let e = parse_line(r#"{"id": 7, "command": "ping"}"#).unwrap();
        assert_eq!(e.id, json!(7));
        assert_eq!(e.request, Request::Ping);
    }

    #[test]
    fn the_id_may_be_text_and_may_be_left_out() {
        assert_eq!(parse_line(r#"{"id": "abc", "command": "ping"}"#).unwrap().id, json!("abc"));
        assert_eq!(parse_line(r#"{"command": "ping"}"#).unwrap().id, Value::Null);
    }

    #[test]
    fn list_windows_reads_the_programs_to_leave_out() {
        let e = parse_line(r#"{"id":1,"command":"list-windows","exclude_pids":[10,20]}"#).unwrap();
        assert_eq!(e.request, Request::ListWindows { exclude_pids: vec![10, 20] });
        let e = parse_line(r#"{"id":1,"command":"list-windows"}"#).unwrap();
        assert_eq!(e.request, Request::ListWindows { exclude_pids: vec![] });
    }

    #[test]
    fn capture_window_reads_the_window_and_the_file() {
        let e = parse_line(r#"{"id":2,"command":"capture-window","window":394822,"out":"C:\\a\\b.png"}"#).unwrap();
        assert_eq!(
            e.request,
            Request::CaptureWindow { window: 394822, out: "C:\\a\\b.png".to_string(), exclude_pids: vec![] }
        );
    }

    #[test]
    fn list_screens_needs_nothing_else() {
        assert_eq!(parse_line(r#"{"id":3,"command":"list-screens"}"#).unwrap().request, Request::ListScreens);
    }

    #[test]
    fn capture_region_reads_four_numbers_and_allows_negative_positions() {
        let e = parse_line(r#"{"id":4,"command":"capture-region","x":-100,"y":-900,"width":640,"height":480,"out":"C:\\a.png"}"#).unwrap();
        assert_eq!(
            e.request,
            Request::CaptureRegion { x: -100, y: -900, width: 640, height: 480, out: "C:\\a.png".to_string(), exclude_pids: vec![] }
        );
    }

    #[test]
    fn capture_region_with_a_missing_number_is_explained() {
        let reply = parse_line(r#"{"id":5,"command":"capture-region","x":0,"y":0,"width":10,"out":"C:\\a.png"}"#).unwrap_err();
        assert_eq!(reply.id, json!(5));
        assert!(reply.error.unwrap().detail.unwrap().contains("height"));
    }

    #[test]
    fn something_that_is_not_json_gets_a_plain_failure() {
        let reply = parse_line("hello there").unwrap_err();
        assert!(!reply.ok);
        let error = reply.error.unwrap();
        assert_eq!(error.code, code::BAD_REQUEST);
        assert!(error.message.contains("not a JSON message"));
    }

    #[test]
    fn an_unknown_command_is_named_and_the_id_is_kept() {
        let reply = parse_line(r#"{"id": 9, "command": "make-coffee"}"#).unwrap_err();
        assert_eq!(reply.id, json!(9));
        assert!(reply.error.unwrap().message.contains("make-coffee"));
    }

    #[test]
    fn a_missing_command_is_explained() {
        let reply = parse_line(r#"{"id": 3}"#).unwrap_err();
        assert_eq!(reply.id, json!(3));
        assert!(reply.error.unwrap().message.contains("no \"command\""));
    }

    #[test]
    fn a_missing_field_is_explained_and_keeps_the_technical_detail_apart() {
        let reply = parse_line(r#"{"id": 4, "command": "capture-window", "window": 5}"#).unwrap_err();
        assert_eq!(reply.id, json!(4));
        let error = reply.error.unwrap();
        assert_eq!(error.code, code::BAD_REQUEST);
        assert!(!error.message.contains("serde"));
        assert!(error.detail.unwrap().contains("out"));
    }

    #[test]
    fn replies_serialize_the_way_the_documents_say() {
        let ok = serde_json::to_value(Reply::success(json!(1), json!({"a": 1}))).unwrap();
        assert_eq!(ok, json!({"id": 1, "ok": true, "result": {"a": 1}}));
        let bad = serde_json::to_value(Reply::failure(json!(2), CaptureError::new(code::MINIMIZED, "It is minimized."))).unwrap();
        assert_eq!(bad, json!({"id": 2, "ok": false, "error": {"code": "minimized", "message": "It is minimized."}}));
    }
}
