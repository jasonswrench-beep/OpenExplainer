// SPDX-License-Identifier: Apache-2.0
//! The rules of click-by-click capture that do not need Windows, so they can be tested on their own:
//! what is allowed to be said about a clicked item, what counts as a double-click, and what a click event looks like.
//! The part that watches the mouse is in `watch_windows.rs`.

use crate::pixels::{intersect, Rect};
use crate::protocol::{code, CaptureError};
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use std::time::{Duration, Instant};

/// A session with no click for this long ends by itself (Jason chose 10 minutes).
pub const DEFAULT_IDLE_SECONDS: u64 = 600;
pub const MOST_IDLE_SECONDS: u64 = 3600;
/// A safety limit, so a mistake can never fill the disk with whole-screen pictures.
pub const DEFAULT_MAX_CLICKS: u32 = 200;
pub const MOST_CLICKS: u32 = 1000;
/// Windows can give very long names. Anything longer is cut.
pub const MOST_TEXT: usize = 300;

/// What the app asked for, checked.
#[derive(Debug, Clone, PartialEq)]
pub struct Settings {
    pub out_dir: PathBuf,
    pub idle: Duration,
    pub max_clicks: u32,
}

pub fn check_settings(out_dir: &str, idle_seconds: Option<u64>, max_clicks: Option<u32>) -> Result<Settings, CaptureError> {
    let folder = PathBuf::from(out_dir);
    if !folder.is_absolute() || !folder.is_dir() {
        return Err(CaptureError::new(
            code::BAD_REQUEST,
            "The helper needs the full path of a folder that already exists, to keep the click pictures in.",
        ));
    }
    let idle = idle_seconds.unwrap_or(DEFAULT_IDLE_SECONDS);
    if idle == 0 || idle > MOST_IDLE_SECONDS {
        return Err(CaptureError::new(code::BAD_REQUEST, format!("The idle time must be from 1 to {MOST_IDLE_SECONDS} seconds.")));
    }
    let max_clicks = max_clicks.unwrap_or(DEFAULT_MAX_CLICKS);
    if max_clicks == 0 || max_clicks > MOST_CLICKS {
        return Err(CaptureError::new(code::BAD_REQUEST, format!("The most clicks must be from 1 to {MOST_CLICKS}.")));
    }
    Ok(Settings { out_dir: folder, idle: Duration::from_secs(idle), max_clicks })
}

// ---- Buttons and double-clicks --------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Button {
    Left,
    Right,
    Middle,
}

impl Button {
    pub fn word(self) -> &'static str {
        match self {
            Button::Left => "left",
            Button::Right => "right",
            Button::Middle => "middle",
        }
    }
}

/// The click before this one, so a quick second click in the same place can be told apart from a new step.
#[derive(Debug, Clone, Copy)]
pub struct Last {
    pub n: u32,
    pub button: Button,
    pub x: i32,
    pub y: i32,
    pub at: Instant,
}

/// Windows' own idea of a double-click: how quick, and how close.
#[derive(Debug, Clone, Copy)]
pub struct DoubleRule {
    pub time: Duration,
    pub half_width: i32,
    pub half_height: i32,
}

/// Is this click the second half of a double-click? The same button, soon enough, close enough.
pub fn is_second_of_double(last: &Last, button: Button, x: i32, y: i32, now: Instant, rule: &DoubleRule) -> bool {
    last.button == button
        && now.saturating_duration_since(last.at) <= rule.time
        && (x - last.x).abs() <= rule.half_width
        && (y - last.y).abs() <= rule.half_height
}

// ---- What may be said about the clicked item ------------------------------------------------------------

/// The kind of item, in plain words, from the Windows UI Automation control type number. `None` for one with no name worth giving.
pub fn role_name(control_type: i32) -> Option<&'static str> {
    Some(match control_type {
        50000 => "button",
        50001 => "calendar",
        50002 => "check box",
        50003 => "combo box",
        50004 => "text box",
        50005 => "link",
        50006 => "image",
        50007 => "list item",
        50008 => "list",
        50009 => "menu",
        50010 => "menu bar",
        50011 => "menu item",
        50012 => "progress bar",
        50013 => "radio button",
        50014 => "scroll bar",
        50015 => "slider",
        50016 => "spin box",
        50017 => "status bar",
        50018 => "tab list",
        50019 => "tab",
        50020 => "text",
        50021 => "tool bar",
        50022 => "tool tip",
        50023 => "tree",
        50024 => "tree item",
        50026 => "group",
        50027 => "thumb",
        50028 => "data grid",
        50029 => "data item",
        50030 => "document",
        50031 => "split button",
        50032 => "window",
        50033 => "pane",
        50034 => "header",
        50035 => "header item",
        50036 => "table",
        50037 => "title bar",
        50038 => "separator",
        _ => return None,
    })
}

/// Only buttons, menus and similar controls have their name, description and keys kept. A list item's name can be private (an
/// email subject), a document's name is a file name, a text box's can be its contents, and a browser tab's name is a page title or a
/// link's text is content. For those only the kind of item and its outline are kept. This is the one place to change that rule.
pub fn details_allowed(control_type: i32) -> bool {
    matches!(
        control_type,
        50000 // button
        | 50002 // check box
        | 50003 // combo box
        | 50009 // menu
        | 50010 // menu bar
        | 50011 // menu item
        | 50013 // radio button
        | 50015 // slider
        | 50016 // spin box
        | 50031 // split button
    )
}

/// How many levels above the item under the pointer are looked at when the item is only the writing or picture inside something else.
pub const MOST_CLIMB: usize = 3;

/// A click on a button's label is answered by Windows with the label itself (a piece of text or a picture inside the button), and a label's
/// name is not kept, so the click used to be recorded with no name at all. This says which item of a chain of items, from the one under
/// the pointer (`chain[0]`) up through its parents, is the one the click was meant for: the first parent whose details may be kept, as
/// long as everything between it and the pointer is only text, a picture or a plain grouping (so a label inside a button names the button,
/// but a piece of text inside a list item, a link or a text box still names nothing). Returns the position in `chain`; 0 means "no change".
/// It only ever picks an item whose details `details_allowed` accepts, or the first one, so no new kind of name can be kept this way.
pub fn climb_to(chain: &[i32]) -> usize {
    const TEXT: i32 = 50020;
    const IMAGE: i32 = 50006;
    const GROUP: i32 = 50026;
    if !matches!(chain.first(), Some(&TEXT) | Some(&IMAGE)) {
        return 0;
    }
    for (i, &kind) in chain.iter().enumerate().skip(1).take(MOST_CLIMB) {
        if details_allowed(kind) {
            return i;
        }
        if !matches!(kind, TEXT | IMAGE | GROUP) {
            return 0;
        }
    }
    0
}

/// What UI Automation said about the item under the pointer. Only filled in as far as the rules allow, so private text never
/// even enters the helper's memory.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RawTarget {
    pub password: bool,
    pub control_type: i32,
    pub name: Option<String>,
    pub accelerator_key: Option<String>,
    pub access_key: Option<String>,
    pub help_text: Option<String>,
    /// left, top, right, bottom on the whole desktop.
    pub bounds: Option<(i32, i32, i32, i32)>,
}

fn clean_text(text: &Option<String>) -> Option<String> {
    let squeezed = text.as_deref()?.split_whitespace().collect::<Vec<_>>().join(" ");
    let cut: String = squeezed.chars().take(MOST_TEXT).collect();
    if cut.is_empty() { None } else { Some(cut) }
}

/// The `target` of a click note (see `docs/format-spec.md`), with the rules applied. `screen` is the picture's place on the desktop,
/// so the outline can be given in picture pixels. `None` when there is nothing worth saying.
pub fn target_json(raw: &RawTarget, screen: Rect) -> Option<Value> {
    if raw.password {
        return Some(json!({ "password": true }));
    }
    let mut target = Map::new();
    if let Some(role) = role_name(raw.control_type) {
        target.insert("role".into(), json!(role));
    }
    if details_allowed(raw.control_type) {
        for (key, value) in [("name", &raw.name), ("acceleratorKey", &raw.accelerator_key), ("accessKey", &raw.access_key), ("description", &raw.help_text)] {
            if let Some(text) = clean_text(value) {
                target.insert(key.into(), json!(text));
            }
        }
    }
    if let Some((left, top, right, bottom)) = raw.bounds {
        let shown = intersect(Rect { left, top, right, bottom }, screen);
        if !shown.is_empty() {
            target.insert(
                "bounds".into(),
                json!({ "x": shown.left - screen.left, "y": shown.top - screen.top, "width": shown.width(), "height": shown.height() }),
            );
        }
    }
    if target.is_empty() { None } else { Some(Value::Object(target)) }
}

// ---- The event the app is told about ---------------------------------------------------------------------

/// Everything known about one finished click.
#[derive(Debug, Clone)]
pub struct ClickRecord {
    pub n: u32,
    pub button: Button,
    pub double: bool,
    /// Where the pointer was, on the whole desktop.
    pub x: i32,
    pub y: i32,
    /// The screen that was copied.
    pub screen: Rect,
    pub target: Option<Value>,
    /// How long the click was held back while the screen was copied, in milliseconds.
    pub held_ms: u64,
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub note: Option<String>,
}

/// One click, as a line of JSON. `click` is exactly a click note of the project format (`ClickInfo` in `src/project/model.ts`),
/// so the app can keep it as it is.
pub fn click_event(watch: &Value, record: &ClickRecord) -> Value {
    let mut click = Map::new();
    click.insert("x".into(), json!(record.x - record.screen.left));
    click.insert("y".into(), json!(record.y - record.screen.top));
    click.insert("button".into(), json!(record.button.word()));
    if record.double {
        click.insert("double".into(), json!(true));
    }
    if let Some(target) = &record.target {
        click.insert("target".into(), target.clone());
    }
    let mut event = json!({
        "event": "click",
        "watch": watch,
        "n": record.n,
        "path": record.path,
        "width": record.width,
        "height": record.height,
        "screen": { "x": record.screen.left, "y": record.screen.top, "width": record.screen.width(), "height": record.screen.height() },
        "click": Value::Object(click),
        "held_ms": record.held_ms,
    });
    if let Some(note) = &record.note {
        event["note"] = json!(note);
    }
    event
}

/// Why a session ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ended {
    Stopped,
    Idle,
    Limit,
    HookLost,
}

impl Ended {
    pub fn word(self) -> &'static str {
        match self {
            Ended::Stopped => "stopped",
            Ended::Idle => "idle",
            Ended::Limit => "limit",
            Ended::HookLost => "hook-lost",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: Rect = Rect { left: 1920, top: 0, right: 3840, bottom: 1080 };

    fn raw(control_type: i32) -> RawTarget {
        RawTarget {
            control_type,
            name: Some("Save".into()),
            accelerator_key: Some("Ctrl+S".into()),
            access_key: Some("Alt+S".into()),
            help_text: Some("Saves the file".into()),
            bounds: Some((2000, 100, 2100, 130)),
            ..Default::default()
        }
    }

    #[test]
    fn a_button_keeps_its_name_keys_description_and_outline_in_picture_pixels() {
        let t = target_json(&raw(50000), SCREEN).unwrap();
        assert_eq!(
            t,
            json!({ "role": "button", "name": "Save", "acceleratorKey": "Ctrl+S", "accessKey": "Alt+S", "description": "Saves the file",
                    "bounds": { "x": 80, "y": 100, "width": 100, "height": 30 } })
        );
    }

    #[test]
    fn menus_and_the_like_keep_their_names_too() {
        for kind in [50002, 50003, 50009, 50010, 50011, 50013, 50015, 50016, 50031] {
            assert_eq!(target_json(&raw(kind), SCREEN).unwrap()["name"], "Save", "control type {kind}");
        }
    }

    #[test]
    fn list_items_text_boxes_documents_tabs_links_and_windows_keep_no_name_or_description() {
        for kind in [50007, 50004, 50030, 50019, 50005, 50032, 50033, 50029, 50024, 50020, 50037, 50008, 50023] {
            let t = target_json(&raw(kind), SCREEN).unwrap();
            for key in ["name", "description", "acceleratorKey", "accessKey"] {
                assert!(t.get(key).is_none(), "control type {kind} must not keep {key}");
            }
            assert!(t.get("role").is_some() && t.get("bounds").is_some());
        }
    }

    #[test]
    fn the_writing_or_picture_inside_a_button_names_the_button() {
        assert_eq!(climb_to(&[50020, 50000]), 1, "a label in a button");
        assert_eq!(climb_to(&[50006, 50000]), 1, "a picture in a button");
        assert_eq!(climb_to(&[50020, 50020, 50000]), 2, "text in text in a button");
        assert_eq!(climb_to(&[50020, 50026, 50011]), 2, "text in a grouping in a menu item");
        assert_eq!(climb_to(&[50020, 50002]), 1, "a label of a check box");
        assert_eq!(climb_to(&[50020, 50026, 50006, 50031]), 3, "as far up as the limit");
    }

    #[test]
    fn nothing_is_climbed_when_the_text_is_content_or_the_click_was_on_the_control_itself() {
        assert_eq!(climb_to(&[50020, 50007, 50000]), 0, "text in a list item names nothing");
        assert_eq!(climb_to(&[50020, 50005]), 0, "text in a link names nothing");
        assert_eq!(climb_to(&[50020, 50004]), 0, "text in a text box names nothing");
        assert_eq!(climb_to(&[50020, 50030]), 0, "text in a document names nothing");
        assert_eq!(climb_to(&[50020, 50033, 50000]), 0, "a pane in between stops the climb");
        assert_eq!(climb_to(&[50000, 50000]), 0, "a button is already the control");
        assert_eq!(climb_to(&[50007, 50000]), 0, "only text and pictures are climbed from");
        assert_eq!(climb_to(&[50026, 50000]), 0, "a grouping is not climbed from");
        assert_eq!(climb_to(&[50020]), 0, "no parent known");
        assert_eq!(climb_to(&[]), 0);
        assert_eq!(climb_to(&[50020, 50020, 50020, 50020, 50000]), 0, "too far up");
    }

    #[test]
    fn a_password_box_is_only_ever_the_fact_that_it_was_clicked() {
        let mut p = raw(50004);
        p.password = true;
        assert_eq!(target_json(&p, SCREEN).unwrap(), json!({ "password": true }));
        // even a name that somehow got in is not repeated
        p.control_type = 50000;
        assert_eq!(target_json(&p, SCREEN).unwrap(), json!({ "password": true }));
    }

    #[test]
    fn an_outline_is_cut_to_the_screen_and_dropped_when_it_is_not_on_it() {
        let mut big = raw(50000);
        big.bounds = Some((1800, -50, 4000, 2000));
        assert_eq!(target_json(&big, SCREEN).unwrap()["bounds"], json!({ "x": 0, "y": 0, "width": 1920, "height": 1080 }));
        let mut away = raw(50000);
        away.bounds = Some((0, 0, 100, 100));
        assert!(target_json(&away, SCREEN).unwrap().get("bounds").is_none());
        let mut flat = raw(50000);
        flat.bounds = Some((2000, 100, 2000, 130));
        assert!(target_json(&flat, SCREEN).unwrap().get("bounds").is_none());
    }

    #[test]
    fn long_and_untidy_text_is_cut_and_squeezed_and_blank_text_is_left_out() {
        let mut r = raw(50000);
        r.name = Some(format!("  Save\n   as {}", "x".repeat(1000)));
        r.help_text = Some("   ".into());
        let t = target_json(&r, SCREEN).unwrap();
        let name = t["name"].as_str().unwrap();
        assert!(name.starts_with("Save as x") && name.chars().count() == MOST_TEXT);
        assert!(t.get("description").is_none());
    }

    #[test]
    fn nothing_known_means_no_target() {
        assert!(target_json(&RawTarget::default(), SCREEN).is_none());
    }

    #[test]
    fn a_second_click_is_a_double_click_only_when_the_same_button_is_quick_and_close() {
        let start = Instant::now();
        let last = Last { n: 1, button: Button::Left, x: 100, y: 100, at: start };
        let rule = DoubleRule { time: Duration::from_millis(500), half_width: 2, half_height: 2 };
        let at = |ms: u64| start + Duration::from_millis(ms);
        assert!(is_second_of_double(&last, Button::Left, 101, 99, at(300), &rule));
        assert!(!is_second_of_double(&last, Button::Left, 100, 100, at(600), &rule), "too slow");
        assert!(!is_second_of_double(&last, Button::Left, 110, 100, at(100), &rule), "too far");
        assert!(!is_second_of_double(&last, Button::Right, 100, 100, at(100), &rule), "another button");
    }

    #[test]
    fn settings_need_a_real_folder_and_sensible_numbers() {
        let folder = std::env::temp_dir();
        let ok = check_settings(&folder.to_string_lossy(), None, None).unwrap();
        assert_eq!(ok.idle, Duration::from_secs(600));
        assert_eq!(ok.max_clicks, 200);
        assert!(check_settings("relative\\folder", None, None).unwrap_err().message.contains("full path of a folder"));
        assert!(check_settings("C:\\no\\such\\folder\\anywhere", None, None).unwrap_err().message.contains("already exists"));
        assert!(check_settings(&folder.to_string_lossy(), Some(0), None).unwrap_err().message.contains("idle time"));
        assert!(check_settings(&folder.to_string_lossy(), Some(3601), None).is_err());
        assert!(check_settings(&folder.to_string_lossy(), None, Some(0)).unwrap_err().message.contains("most clicks"));
        assert!(check_settings(&folder.to_string_lossy(), None, Some(1001)).is_err());
        assert_eq!(check_settings(&folder.to_string_lossy(), Some(5), Some(3)).unwrap().max_clicks, 3);
    }

    #[test]
    fn a_click_event_is_a_click_note_with_the_picture_beside_it() {
        let record = ClickRecord {
            n: 3,
            button: Button::Right,
            double: false,
            x: 2020,
            y: 115,
            screen: SCREEN,
            target: target_json(&raw(50000), SCREEN),
            held_ms: 90,
            path: "C:\\t\\click-1-003.png".into(),
            width: 1920,
            height: 1080,
            note: None,
        };
        let e = click_event(&json!(7), &record);
        assert_eq!(e["event"], "click");
        assert_eq!(e["watch"], 7);
        assert_eq!(e["n"], 3);
        assert_eq!(e["click"]["x"], 100);
        assert_eq!(e["click"]["y"], 115);
        assert_eq!(e["click"]["button"], "right");
        assert!(e["click"].get("double").is_none());
        assert_eq!(e["click"]["target"]["name"], "Save");
        assert_eq!(e["screen"], json!({ "x": 1920, "y": 0, "width": 1920, "height": 1080 }));
        assert!(e.get("note").is_none());
        let mut d = record.clone();
        d.double = true;
        d.note = Some("hello".into());
        let e = click_event(&json!(7), &d);
        assert_eq!(e["click"]["double"], true);
        assert_eq!(e["note"], "hello");
    }

    #[test]
    fn every_way_to_end_has_a_word_for_the_app() {
        assert_eq!(
            [Ended::Stopped, Ended::Idle, Ended::Limit, Ended::HookLost].map(Ended::word),
            ["stopped", "idle", "limit", "hook-lost"]
        );
    }
}
