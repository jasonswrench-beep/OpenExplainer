// SPDX-License-Identifier: Apache-2.0
//! Reading a recording that another OpenStage tool made (OpenStage Recorder or OpenStage Author): the capture format, C1.
//!
//! A recording is a folder named `something.capture` with a manifest, one folder per take, and for each take a video
//! (`screen.mp4`) and, when the author turned it on, a log of the clicks (`events.jsonl`). The format and the code that
//! reads it belong to the shared core (`openstage-core`, tag `capture-v0.1.0`); this file only uses that code:
//! `open_project`, `list_takes` and `read_log` for the folder, `edit_from_take` and `export_frame` for a still picture out of the
//! video. What is added here is what is OpenExplainer's own: which clicks become steps, and which names may be kept.
//!
//! Two commands use it. `read-recording` is quick and shows no picture: it lists the takes and the clicks of one of them, each
//! with the moment of its picture. `recording-frames` then cuts the pictures out of the video, a few at a time.
//!
//! The rules (the same as for a click watched live, see `clicks.rs`):
//! * only buttons, menus and similar controls keep their name (`name_allowed`), never a text box, a list item, a tab or a link;
//! * a double-click is one step, using Windows' usual time and distance;
//! * the picture is taken a moment before the click, so it shows the program as it was before it reacted.

use crate::protocol::{code, CaptureError};
use openstage_capture_project::{list_takes, open_project, read_log, take_dir, LogEvent, LogLine, MediaFile, Take, TakeState};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

/// The most clicks one answer lists. A longer log is cut here and the answer says so.
pub const MOST_CLICKS: usize = 1000;
/// Windows' usual double-click: the same button again within this time and this far (in each direction).
pub const DOUBLE_CLICK_MS: u64 = 500;
pub const DOUBLE_CLICK_PIXELS: i32 = 4;
/// How long before a click its picture is taken from, in milliseconds. The live click capture copies the screen just before
/// the program reacts; a recording holds a picture every 33 milliseconds, so this is three of them.
pub const BEFORE_CLICK_MS: u64 = 100;
/// The most pictures one `recording-frames` request makes, so a request stays inside the app's time limit.
pub const MOST_FRAMES_PER_REQUEST: usize = 40;
/// Names are cut at this length, as for a live click.
const MOST_TEXT: usize = 300;

fn bad(message: impl Into<String>) -> CaptureError {
    CaptureError::new(code::BAD_REQUEST, message)
}

// ---- The folder ---------------------------------------------------------------------------------------------

/// The recording folder the app named: a full path, to a folder that holds a manifest.
pub fn check_folder(folder: &str) -> Result<PathBuf, CaptureError> {
    let path = PathBuf::from(folder);
    if !path.is_absolute() {
        return Err(bad("The helper needs the full path of the recording's folder."));
    }
    if !path.is_dir() {
        return Err(bad("That recording's folder could not be found."));
    }
    if !path.join("capture.json").is_file() {
        return Err(bad("That folder is not an OpenStage recording: it has no capture.json in it. Choose the folder whose name ends in .capture."));
    }
    Ok(path)
}

fn project_problem(error: &dyn std::fmt::Display) -> CaptureError {
    // The core's own sentences are plain ("a newer version made this", "not a recording"), so they are passed on.
    bad(format!("This recording could not be opened: {error}"))
}

// ---- What may be said about a clicked item ------------------------------------------------------------------

/// The core's word for a kind of item, in OpenExplainer's own words (the same as a live click says).
pub fn app_role(core_role: &str) -> String {
    match core_role.trim().to_ascii_lowercase().as_str() {
        "edit" => "text box",
        "spinner" => "spin box",
        "tab item" => "tab",
        "tab" => "tab list",
        other => return other.to_string(),
    }
    .to_string()
}

/// Only buttons, menus and similar controls keep their name: the same list as `clicks::details_allowed`, in words.
pub fn name_allowed(app_role: &str) -> bool {
    matches!(
        app_role,
        "button" | "check box" | "combo box" | "menu" | "menu bar" | "menu item" | "radio button" | "slider" | "spin box" | "split button"
    )
}

fn clean_name(name: &str) -> Option<String> {
    let flat = name.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.is_empty() {
        return None;
    }
    Some(flat.chars().take(MOST_TEXT).collect())
}

// ---- Clicks from the log ------------------------------------------------------------------------------------

/// Where the log's positions are counted from, to place a click in the picture.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Origin {
    /// The whole display was recorded: a click's position is a position in the video.
    Whole,
    /// Part of the display: subtract its corner.
    Region { x: i32, y: i32 },
    /// One window: subtract the corner of that program's window, as the log last said where it was.
    Window { process: String },
}

/// One click of the log, ready to become a step.
#[derive(Debug, Clone, PartialEq)]
pub struct Click {
    /// From 1, in the order of the recording.
    pub n: u32,
    /// When the click happened, milliseconds of recording time.
    pub t_ms: u64,
    /// Where in the recording its picture is taken from.
    pub picture_ms: u64,
    pub x: i32,
    pub y: i32,
    pub button: &'static str,
    pub double: bool,
    /// The kind of item, and its name when the rules allow it.
    pub role: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Default, PartialEq)]
pub struct Found {
    pub clicks: Vec<Click>,
    /// Clicks left out because the log could not say where in the picture they were (a window recording with no window place).
    pub unplaced: u32,
    /// Clicks of the back and forward buttons, which do not make steps.
    pub other_buttons: u32,
}

/// The clicks of a take's log. A second quick click in the same place is the second half of a double-click and makes no step.
pub fn clicks_from_log(lines: &[LogLine], origin: &Origin) -> Found {
    let mut found = Found::default();
    let mut window: Option<(String, i32, i32)> = None;
    // The click the next `element` line belongs to: the index in `found.clicks`, and when it happened.
    let mut open: Option<(usize, u64)> = None;
    // The last kept click, as the log gave it (before the picture's corner is taken off), for double-click.
    let mut last: Option<(u64, &str, i32, i32, usize)> = None;
    for line in lines {
        match &line.event {
            LogEvent::Window { process, bounds, .. } => {
                if let Some(b) = bounds {
                    window = Some((process.clone(), b.x, b.y));
                }
            }
            LogEvent::Click { x, y, button } => {
                open = None;
                let word = match button.as_str() {
                    "left" => "left",
                    "right" => "right",
                    "middle" => "middle",
                    _ => {
                        found.other_buttons += 1;
                        continue;
                    }
                };
                if let Some((t, b, lx, ly, index)) = last {
                    let near = (x - lx).abs() <= DOUBLE_CLICK_PIXELS && (y - ly).abs() <= DOUBLE_CLICK_PIXELS;
                    if b == word && line.t.saturating_sub(t) <= DOUBLE_CLICK_MS && near && !found.clicks[index].double {
                        found.clicks[index].double = true;
                        open = Some((index, line.t));
                        continue;
                    }
                }
                let (px, py) = match origin {
                    Origin::Whole => (*x, *y),
                    Origin::Region { x: rx, y: ry } => (x - rx, y - ry),
                    Origin::Window { process } => match &window {
                        Some((p, wx, wy)) if p.eq_ignore_ascii_case(process) => (x - wx, y - wy),
                        _ => {
                            found.unplaced += 1;
                            continue;
                        }
                    },
                };
                let n = found.clicks.len() as u32 + 1;
                found.clicks.push(Click {
                    n,
                    t_ms: line.t,
                    picture_ms: line.t.saturating_sub(BEFORE_CLICK_MS),
                    x: px,
                    y: py,
                    button: word,
                    double: false,
                    role: None,
                    name: None,
                });
                let index = found.clicks.len() - 1;
                last = Some((line.t, word, *x, *y, index));
                open = Some((index, line.t));
            }
            LogEvent::Element { name, role } => {
                if let Some((index, t)) = open {
                    let click = &mut found.clicks[index];
                    if line.t == t && click.role.is_none() {
                        let role = app_role(role);
                        click.name = if name_allowed(&role) { clean_name(name) } else { None };
                        click.role = Some(role);
                    }
                }
            }
            _ => {}
        }
    }
    found
}

fn click_json(c: &Click) -> Value {
    let mut click = json!({ "x": c.x, "y": c.y, "button": c.button });
    if c.double {
        click["double"] = json!(true);
    }
    if c.role.is_some() || c.name.is_some() {
        let mut target = json!({});
        if let Some(role) = &c.role {
            target["role"] = json!(role);
        }
        if let Some(name) = &c.name {
            target["name"] = json!(name);
        }
        click["target"] = target;
    }
    json!({ "n": c.n, "t_ms": c.t_ms, "picture_ms": c.picture_ms, "click": click })
}

// ---- Takes --------------------------------------------------------------------------------------------------

fn screen_media(take: &Take) -> Option<&MediaFile> {
    take.media.iter().find(|m| m.kind == "screen")
}

fn usable(take: &Take) -> bool {
    matches!(take.state, TakeState::Complete | TakeState::Recovered) && screen_media(take).is_some() && take.duration_ms.is_some_and(|d| d >= 100)
}

fn state_word(state: &TakeState) -> &'static str {
    match state {
        TakeState::Recording => "not finished",
        TakeState::Complete => "complete",
        TakeState::Recovered => "repaired after an interruption",
        TakeState::SetAside => "set aside",
    }
}

fn origin_of(take: &Take) -> Origin {
    if let Some(region) = screen_media(take).and_then(|m| m.region.as_ref()) {
        return Origin::Region { x: region.x as i32, y: region.y as i32 };
    }
    if let Some(process) = take.sources.iter().find_map(|s| s.strip_prefix("window:")) {
        return Origin::Window { process: process.to_string() };
    }
    Origin::Whole
}

fn log_path(folder: &Path, take: &Take) -> Option<PathBuf> {
    let entry = take.media.iter().find(|m| m.kind == "interactions")?;
    let path = take_dir(folder, take.id).join(&entry.file);
    // The file named in take.json must be a plain name inside the take's own folder.
    (!entry.file.contains(['/', '\\']) && path.is_file()).then_some(path)
}

/// Opens the recording and describes it: its takes, and the clicks of one take (the one asked for, else the newest that can be used).
pub fn read_recording(folder: &str, wanted: Option<u32>) -> Result<Value, CaptureError> {
    let path = check_folder(folder)?;
    let manifest = open_project(&path).map_err(|e| project_problem(&e))?;
    let entries = list_takes(&path).map_err(|e| project_problem(&e))?;
    let mut takes = Vec::new();
    let mut chosen: Option<Take> = None;
    for entry in entries {
        let Some(take) = entry.take else { continue };
        let can_use = usable(&take);
        let has_log = log_path(&path, &take).is_some();
        takes.push(json!({
            "id": take.id,
            "state": state_word(&take.state),
            "usable": can_use,
            "duration_ms": take.duration_ms,
            "has_picture": screen_media(&take).is_some(),
            "has_clicks": has_log,
            "region": screen_media(&take).and_then(|m| m.region.as_ref()).map(|r| json!({ "x": r.x, "y": r.y, "width": r.width, "height": r.height })),
        }));
        let wanted_this = wanted == Some(take.id);
        if can_use && (wanted_this || (wanted.is_none() && chosen.as_ref().is_none_or(|c| take.id > c.id))) {
            chosen = Some(take);
        }
    }
    if let Some(id) = wanted {
        if chosen.is_none() {
            return Err(bad(format!("Take {id} of this recording cannot be used. It may be missing, unfinished, set aside, or have no picture.")));
        }
    }
    let mut answer = json!({
        "title": manifest.title,
        "language": manifest.language,
        "schema_version": manifest.schema_version,
        "takes": takes,
        "take": null,
        "clicks": [],
        "click_count": 0,
        "truncated": false,
        "unplaced": 0,
        "other_buttons": 0,
        "has_clicks": false,
    });
    let Some(take) = chosen else {
        answer["note"] = json!("This recording has no finished take with a picture in it, so there is nothing to bring in.");
        return Ok(answer);
    };
    answer["take"] = json!(take.id);
    answer["duration_ms"] = json!(take.duration_ms);
    if let Some(log) = log_path(&path, &take) {
        let lines = read_log(&log).map_err(|e| bad(format!("The click log of this take could not be read: {e}")))?;
        let found = clicks_from_log(&lines, &origin_of(&take));
        answer["has_clicks"] = json!(true);
        answer["click_count"] = json!(found.clicks.len());
        answer["truncated"] = json!(found.clicks.len() > MOST_CLICKS);
        answer["unplaced"] = json!(found.unplaced);
        answer["other_buttons"] = json!(found.other_buttons);
        answer["clicks"] = Value::Array(found.clicks.iter().take(MOST_CLICKS).map(click_json).collect());
    } else {
        answer["note"] = json!("This take has no log of the clicks (it was recorded with interaction notes off), so there are no steps to find in it.");
    }
    Ok(answer)
}

// ---- Pictures out of the video --------------------------------------------------------------------------------

/// One picture asked for: the click's number, the moment in the recording, and where the click is in the picture (to say whether it is inside).
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
pub struct FrameAsk {
    pub n: u32,
    pub at_ms: u64,
    pub x: i32,
    pub y: i32,
}

/// A name for the pictures a request makes: letters, digits and dashes only, so it can never name another folder.
pub fn check_prefix(prefix: &str) -> Result<&str, CaptureError> {
    if prefix.is_empty() || prefix.len() > 60 || !prefix.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(bad("The picture name must be letters, digits and dashes."));
    }
    Ok(prefix)
}

pub fn check_frames_request(folder: &str, out_dir: &str, prefix: &str, asks: &[FrameAsk]) -> Result<(PathBuf, PathBuf), CaptureError> {
    let recording = check_folder(folder)?;
    check_prefix(prefix)?;
    let out = PathBuf::from(out_dir);
    if !out.is_absolute() || !out.is_dir() {
        return Err(bad("The helper needs the full path of a folder that already exists, to keep the pictures in."));
    }
    if asks.is_empty() {
        return Err(bad("No pictures were asked for."));
    }
    if asks.len() > MOST_FRAMES_PER_REQUEST {
        return Err(bad(format!("Ask for at most {MOST_FRAMES_PER_REQUEST} pictures at a time.")));
    }
    Ok((recording, out))
}

/// Cuts the pictures out of take `take`'s video. Each picture is a PNG named `<prefix>-<n>.png` in `out_dir`.
#[cfg(windows)]
pub fn recording_frames(folder: &str, take: u32, asks: &[FrameAsk], out_dir: &str, prefix: &str) -> Result<Value, CaptureError> {
    use openstage_capture_project::read_take;
    use openstage_capture_render::RenderSettings;
    use openstage_capture_windows::{edit_from_take, export_frame, EditOptions, ExportJob, PictureReader, WindowsPictures, WindowsText};

    let (recording, out) = check_frames_request(folder, out_dir, prefix, asks)?;
    let record = read_take(&recording, take).map_err(|e| project_problem(&e))?;
    if !usable(&record) {
        return Err(bad(format!("Take {take} of this recording cannot be used. It may be unfinished, set aside, or have no picture.")));
    }
    let last_ms = record.duration_ms.unwrap_or(0).saturating_sub(40);
    let edit = edit_from_take(&recording, take, EditOptions::default()).map_err(|why| bad(why))?;
    let mut pictures = WindowsPictures::new(&recording, None, PictureReader::default())
        .map_err(|why| CaptureError::new(code::CAPTURE_FAILED, why))?;
    let text = WindowsText;
    let mut size: Option<(u32, u32)> = None;
    let (mut frames, mut failed) = (Vec::new(), Vec::new());
    // Asked for in the order of the recording, the video is read forward and not jumped about in.
    let mut ordered: Vec<&FrameAsk> = asks.iter().collect();
    ordered.sort_by_key(|a| a.at_ms);
    for ask in ordered {
        let file = out.join(format!("{prefix}-{}.png", ask.n));
        let job = ExportJob {
            settings: RenderSettings { require_complete: false, ..RenderSettings::default() },
            size,
            bitrate_kbps: None,
            out: file.clone(),
        };
        match export_frame(&edit, &job, ask.at_ms.min(last_ms), &mut pictures, &text) {
            Ok(report) => {
                size = Some((report.width, report.height));
                let inside = ask.x >= 0 && ask.y >= 0 && (ask.x as i64) < report.width as i64 && (ask.y as i64) < report.height as i64;
                frames.push(json!({
                    "n": ask.n,
                    "path": file.to_string_lossy(),
                    "width": report.width,
                    "height": report.height,
                    "inside": inside,
                }));
            }
            Err(error) => failed.push(json!({ "n": ask.n, "message": error.to_string() })),
        }
    }
    frames.sort_by_key(|f| f["n"].as_u64().unwrap_or(0));
    Ok(json!({ "frames": frames, "failed": failed }))
}

#[cfg(not(windows))]
pub fn recording_frames(_folder: &str, _take: u32, _asks: &[FrameAsk], _out_dir: &str, _prefix: &str) -> Result<Value, CaptureError> {
    Err(CaptureError::new(code::NOT_SUPPORTED, "Cutting pictures out of a recording works only on Windows."))
}

// ---- Tests --------------------------------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use openstage_capture_project::LogBounds;

    fn line(t: u64, event: LogEvent) -> LogLine {
        LogLine { t, event }
    }
    fn click(t: u64, x: i32, y: i32, button: &str) -> LogLine {
        line(t, LogEvent::Click { x, y, button: button.into() })
    }
    fn element(t: u64, name: &str, role: &str) -> LogLine {
        line(t, LogEvent::Element { name: name.into(), role: role.into() })
    }
    fn window(t: u64, process: &str, x: i32, y: i32) -> LogLine {
        line(t, LogEvent::Window { title: "private title".into(), process: process.into(), bounds: Some(LogBounds { x, y, width: 800, height: 600 }) })
    }

    #[test]
    fn a_click_and_the_item_after_it_make_a_step_with_the_picture_a_moment_earlier() {
        let found = clicks_from_log(&[click(1200, 640, 480, "left"), element(1200, "Save", "button")], &Origin::Whole);
        assert_eq!(found.clicks.len(), 1);
        let c = &found.clicks[0];
        assert_eq!((c.n, c.t_ms, c.picture_ms, c.x, c.y), (1, 1200, 1100, 640, 480));
        assert_eq!((c.role.as_deref(), c.name.as_deref()), (Some("button"), Some("Save")));
    }

    #[test]
    fn a_click_in_the_first_moments_takes_its_picture_from_the_very_start() {
        let found = clicks_from_log(&[click(40, 1, 1, "left")], &Origin::Whole);
        assert_eq!(found.clicks[0].picture_ms, 0);
    }

    #[test]
    fn only_buttons_menus_and_the_like_keep_their_names() {
        let lines = [
            click(100, 10, 10, "left"),
            element(100, "Dear Jason, your invoice", "list item"),
            click(2000, 20, 20, "left"),
            element(2000, "secret page title", "link"),
            click(4000, 30, 30, "left"),
            element(4000, "Search the web for passwords", "edit"),
            click(6000, 40, 40, "left"),
            element(6000, "Open", "menu item"),
            click(8000, 50, 50, "left"),
            element(8000, "Remember me", "check box"),
        ];
        let found = clicks_from_log(&lines, &Origin::Whole);
        let said: Vec<(&str, Option<&str>)> = found.clicks.iter().map(|c| (c.role.as_deref().unwrap(), c.name.as_deref())).collect();
        assert_eq!(
            said,
            vec![("list item", None), ("link", None), ("text box", None), ("menu item", Some("Open")), ("check box", Some("Remember me"))]
        );
    }

    #[test]
    fn the_core_s_words_for_items_become_the_apps_words() {
        assert_eq!(app_role("edit"), "text box");
        assert_eq!(app_role("spinner"), "spin box");
        assert_eq!(app_role("tab item"), "tab");
        assert_eq!(app_role("Button"), "button");
        assert_eq!(app_role("menu item"), "menu item");
    }

    #[test]
    fn an_element_line_from_another_moment_is_not_taken_for_the_click() {
        let found = clicks_from_log(&[click(1000, 5, 5, "left"), element(1400, "Save", "button")], &Origin::Whole);
        assert_eq!(found.clicks[0].role, None);
    }

    #[test]
    fn a_quick_second_click_in_the_same_place_is_a_double_click_and_one_step() {
        let lines = [click(1000, 100, 100, "left"), element(1000, "Open", "button"), click(1300, 102, 99, "left"), element(1300, "Open", "button")];
        let found = clicks_from_log(&lines, &Origin::Whole);
        assert_eq!(found.clicks.len(), 1);
        assert!(found.clicks[0].double);
        assert_eq!(found.clicks[0].name.as_deref(), Some("Open"));
    }

    #[test]
    fn a_slow_or_far_or_other_button_second_click_is_a_new_step() {
        let slow = clicks_from_log(&[click(1000, 100, 100, "left"), click(1700, 100, 100, "left")], &Origin::Whole);
        let far = clicks_from_log(&[click(1000, 100, 100, "left"), click(1200, 140, 100, "left")], &Origin::Whole);
        let other = clicks_from_log(&[click(1000, 100, 100, "left"), click(1200, 100, 100, "right")], &Origin::Whole);
        assert_eq!((slow.clicks.len(), far.clicks.len(), other.clicks.len()), (2, 2, 2));
        assert!(!slow.clicks[0].double && !far.clicks[0].double && !other.clicks[0].double);
    }

    #[test]
    fn a_third_quick_click_is_not_folded_into_the_double() {
        let found = clicks_from_log(&[click(1000, 9, 9, "left"), click(1200, 9, 9, "left"), click(1400, 9, 9, "left")], &Origin::Whole);
        assert_eq!(found.clicks.len(), 2);
        assert!(found.clicks[0].double && !found.clicks[1].double);
    }

    #[test]
    fn the_back_and_forward_buttons_make_no_step() {
        let found = clicks_from_log(&[click(100, 1, 1, "back"), click(200, 1, 1, "forward"), click(300, 1, 1, "middle")], &Origin::Whole);
        assert_eq!((found.clicks.len(), found.other_buttons), (1, 2));
        assert_eq!(found.clicks[0].button, "middle");
    }

    #[test]
    fn a_region_recording_counts_from_the_regions_corner() {
        let found = clicks_from_log(&[click(100, 350, 260, "left")], &Origin::Region { x: 100, y: 200 });
        assert_eq!((found.clicks[0].x, found.clicks[0].y), (250, 60));
    }

    #[test]
    fn a_window_recording_counts_from_that_windows_corner_and_leaves_out_clicks_with_no_known_place() {
        let lines = [
            click(50, 500, 500, "left"), // before any window line: no place known
            window(100, "notepad.exe", 80, 40),
            click(1000, 640, 480, "left"),
            window(1500, "other.exe", 0, 0),
            click(2000, 700, 500, "left"), // another program is in front
        ];
        let found = clicks_from_log(&lines, &Origin::Window { process: "Notepad.exe".into() });
        assert_eq!(found.clicks.len(), 1);
        assert_eq!((found.clicks[0].x, found.clicks[0].y), (560, 440));
        assert_eq!(found.unplaced, 2);
        // The window's title is private and is never carried into a step.
        assert!(!format!("{:?}", found).contains("private title"));
    }

    #[test]
    fn the_answer_for_a_click_is_the_note_the_app_already_keeps() {
        let found = clicks_from_log(&[click(1200, 640, 480, "left"), click(1300, 640, 480, "left"), element(1300, "Save", "button")], &Origin::Whole);
        let v = click_json(&found.clicks[0]);
        assert_eq!(v["click"]["double"], true);
        assert_eq!(v["click"]["target"]["role"], "button");
        assert_eq!(v["click"]["x"], 640);
        assert_eq!(v["picture_ms"], 1100);
    }

    #[test]
    fn long_names_are_cut_and_blank_ones_are_left_out() {
        assert_eq!(clean_name("   "), None);
        assert_eq!(clean_name("a\n  b").as_deref(), Some("a b"));
        assert_eq!(clean_name(&"x".repeat(500)).unwrap().len(), MOST_TEXT);
    }

    #[test]
    fn a_picture_name_cannot_name_another_folder() {
        assert!(check_prefix("recording-12").is_ok());
        assert!(check_prefix("..\\x").is_err());
        assert!(check_prefix("a/b").is_err());
        assert!(check_prefix("").is_err());
    }

    #[test]
    fn a_folder_that_is_not_a_recording_is_refused_in_words() {
        assert!(check_folder("rel/path").unwrap_err().message.contains("full path"));
        let here = std::env::temp_dir().to_string_lossy().to_string();
        let not_one = check_folder(&here).unwrap_err();
        assert!(not_one.message.contains("capture.json"));
    }

    // ---- A real recording folder, written the way the format says -----------------------------------------------

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("oe-recording-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_recording(dir: &Path, takes: &[(&str, &str, &str)]) {
        std::fs::write(
            dir.join("capture.json"),
            r#"{"format":"openstage-capture-project","schemaVersion":"0.2.5","id":"cap-1","title":"Save a file","language":"en-US","created":"2026-11-15T12:00:00Z","tracks":{"captions":[],"transcript":null,"audioDescription":[],"altText":[]},"edit":null}"#,
        )
        .unwrap();
        for (id, take_json, events) in takes {
            let folder = dir.join("takes").join(format!("take-{id}"));
            std::fs::create_dir_all(&folder).unwrap();
            std::fs::write(folder.join("take.json"), take_json).unwrap();
            if !events.is_empty() {
                std::fs::write(folder.join("events.jsonl"), events).unwrap();
            }
        }
    }

    const TAKE_WITH_CLICKS: &str = r#"{"id":1,"state":"complete","startedAt":"2026-11-15T12:00:00Z","endedAt":"2026-11-15T12:00:12Z","setAsideAt":null,"sources":["screen:1"],"target":null,"flushMs":2000,"durationMs":12000,"maxLossMs":null,"segments":1,"media":[{"file":"screen.mp4","kind":"screen","container":"fragmented-mp4"},{"file":"events.jsonl","kind":"interactions","container":"jsonl","interactions":{"display":1,"keys":false}}]}"#;
    const EVENTS: &str = "{\"t\":0,\"type\":\"window\",\"title\":\"Untitled - Notepad\",\"process\":\"notepad.exe\",\"bounds\":{\"x\":80,\"y\":40,\"width\":800,\"height\":600}}\n{\"t\":1200,\"type\":\"click\",\"x\":640,\"y\":480,\"button\":\"left\"}\n{\"t\":1200,\"type\":\"element\",\"name\":\"Save\",\"role\":\"button\"}\n{\"t\":3000,\"type\":\"marker\",\"label\":\"look here\"}\n{\"t\":4000,\"type\":\"click\",\"x\":700,\"y\":300,\"button\":\"right\"}\n{\"t\":4000,\"type\":\"element\",\"name\":\"Inbox: Dear Jason\",\"role\":\"list item\"}\n{\"t\":5000,\"type\":\"click\"";

    #[test]
    fn a_recording_folder_is_read_with_its_takes_and_clicks_and_a_cut_off_last_line_is_skipped() {
        let dir = scratch("read");
        write_recording(&dir, &[("001", TAKE_WITH_CLICKS, EVENTS)]);
        let answer = read_recording(dir.to_str().unwrap(), None).unwrap();
        assert_eq!(answer["title"], "Save a file");
        assert_eq!(answer["take"], 1);
        assert_eq!(answer["has_clicks"], true);
        assert_eq!(answer["click_count"], 2);
        assert_eq!(answer["clicks"][0]["click"]["target"]["name"], "Save");
        assert_eq!(answer["clicks"][1]["click"]["button"], "right");
        assert!(answer["clicks"][1]["click"]["target"].get("name").is_none(), "a list item's name is not kept");
        assert!(!answer.to_string().contains("Dear Jason") && !answer.to_string().contains("Untitled - Notepad"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_newest_usable_take_is_chosen_and_one_can_be_asked_for() {
        let dir = scratch("takes");
        let set_aside = TAKE_WITH_CLICKS.replace("\"id\":1", "\"id\":3").replace("\"complete\"", "\"setAside\"");
        let second = TAKE_WITH_CLICKS.replace("\"id\":1", "\"id\":2");
        write_recording(&dir, &[("001", TAKE_WITH_CLICKS, EVENTS), ("002", &second, ""), ("003", &set_aside, EVENTS)]);
        let newest = read_recording(dir.to_str().unwrap(), None).unwrap();
        assert_eq!(newest["take"], 2);
        assert_eq!(newest["takes"].as_array().unwrap().len(), 3);
        assert_eq!(newest["has_clicks"], false, "take 2 has no log file");
        assert!(newest["note"].as_str().unwrap().contains("no log of the clicks"));
        let first = read_recording(dir.to_str().unwrap(), Some(1)).unwrap();
        assert_eq!(first["click_count"], 2);
        let refused = read_recording(dir.to_str().unwrap(), Some(3)).unwrap_err();
        assert!(refused.message.contains("cannot be used"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_recording_with_no_finished_picture_says_so_and_is_not_an_error() {
        let dir = scratch("none");
        let unfinished = TAKE_WITH_CLICKS.replace("\"complete\"", "\"recording\"");
        write_recording(&dir, &[("001", &unfinished, EVENTS)]);
        let answer = read_recording(dir.to_str().unwrap(), None).unwrap();
        assert!(answer["take"].is_null());
        assert!(answer["note"].as_str().unwrap().contains("no finished take"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_newer_schema_is_refused_in_words() {
        let dir = scratch("newer");
        write_recording(&dir, &[("001", TAKE_WITH_CLICKS, EVENTS)]);
        let text = std::fs::read_to_string(dir.join("capture.json")).unwrap().replace("0.2.5", "9.0.0");
        std::fs::write(dir.join("capture.json"), text).unwrap();
        let refused = read_recording(dir.to_str().unwrap(), None).unwrap_err();
        assert!(refused.message.starts_with("This recording could not be opened"), "{}", refused.message);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_frames_request_is_checked_before_anything_is_read() {
        let dir = scratch("frames-check");
        write_recording(&dir, &[("001", TAKE_WITH_CLICKS, EVENTS)]);
        let ask = FrameAsk { n: 1, at_ms: 0, x: 0, y: 0 };
        let folder = dir.to_str().unwrap();
        assert!(check_frames_request(folder, folder, "recording-1", &[ask.clone()]).is_ok());
        assert!(check_frames_request(folder, "relative", "recording-1", &[ask.clone()]).is_err());
        assert!(check_frames_request(folder, folder, "recording-1", &[]).is_err());
        assert!(check_frames_request(folder, folder, "a\\b", &[ask.clone()]).is_err());
        let many = vec![ask; MOST_FRAMES_PER_REQUEST + 1];
        assert!(check_frames_request(folder, folder, "recording-1", &many).unwrap_err().message.contains("at most"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ---- Real pictures out of a real video (Windows only) ---------------------------------------------------------

    /// Makes a three second video, red then green then blue, with Windows' own encoder, and cuts pictures out of it.
    #[cfg(windows)]
    #[test]
    fn pictures_are_cut_out_of_a_real_video_at_the_moments_asked_for() {
        use openstage_capture_windows::{system_video_platform, Frame, SinkSpec};
        let dir = scratch("video");
        let take = TAKE_WITH_CLICKS.replace("\"durationMs\":12000", "\"durationMs\":3000");
        write_recording(&dir, &[("001", &take, EVENTS)]);
        let video = system_video_platform();
        video.start_media().expect("Windows' video tools start");
        let (w, h) = (320u32, 180u32);
        let spec = SinkSpec { path: dir.join("takes").join("take-001").join("screen.mp4"), width: w, height: h, fps: 30, bitrate_kbps: 2000, fragmented: true, audio: None };
        let mut sink = video.create_sink(&spec).expect("a video file is made");
        for i in 0..90u64 {
            let (b, g, r) = match i / 30 {
                0 => (0u8, 0u8, 255u8),
                1 => (0, 255, 0),
                _ => (255, 0, 0),
            };
            let mut bgra = Vec::with_capacity((w * h * 4) as usize);
            for _ in 0..w * h {
                bgra.extend_from_slice(&[b, g, r, 255]);
            }
            let frame = Frame { width: w, height: h, t_ms: i * 1000 / 30, captured_100ns: None, arrived_100ns: None, bgra };
            sink.write(&frame, (i * 10_000_000 / 30) as i64, 10_000_000 / 30).expect("a picture is written");
        }
        sink.finish().expect("the video is finished");

        let asks = vec![
            FrameAsk { n: 3, at_ms: 2500, x: 10, y: 10 },
            FrameAsk { n: 1, at_ms: 500, x: 10, y: 10 },
            FrameAsk { n: 2, at_ms: 1500, x: 9999, y: 10 },
        ];
        let folder = dir.to_str().unwrap();
        let answer = recording_frames(folder, 1, &asks, folder, "recording-test").expect("pictures are cut");
        assert_eq!(answer["failed"].as_array().unwrap().len(), 0, "{answer}");
        let frames = answer["frames"].as_array().unwrap();
        assert_eq!(frames.len(), 3);
        assert_eq!(frames[0]["n"], 1);
        assert_eq!((frames[0]["width"].as_u64(), frames[0]["height"].as_u64()), (Some(w as u64), Some(h as u64)));
        assert_eq!(frames[0]["inside"], true);
        assert_eq!(frames[1]["inside"], false, "a click outside the picture is said to be outside");
        let dominant = |n: usize| {
            let file = std::fs::File::open(frames[n]["path"].as_str().unwrap()).unwrap();
            let decoder = png::Decoder::new(std::io::BufReader::new(file));
            let mut reader = decoder.read_info().unwrap();
            let mut buffer = vec![0u8; reader.output_buffer_size().unwrap()];
            let info = reader.next_frame(&mut buffer).unwrap();
            let bytes = info.line_size / info.width as usize;
            let middle = (info.height as usize / 2 * info.line_size) + (info.width as usize / 2) * bytes;
            let (r, g, b) = (buffer[middle] as i32, buffer[middle + 1] as i32, buffer[middle + 2] as i32);
            if r > g + 80 && r > b + 80 { "red" } else if g > r + 80 && g > b + 80 { "green" } else if b > r + 80 && b > g + 80 { "blue" } else { "other" }
        };
        assert_eq!((dominant(0), dominant(1), dominant(2)), ("red", "green", "blue"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
