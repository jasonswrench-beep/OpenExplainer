//! The MCP server's shell part (see `docs/ai-and-mcp-plan.md`).
//!
//! `openexplainer.exe --mcp` starts the app with no window anyone can see. An AI assistant talks to it over standard input and output, one JSON message on each line (the Model Context
//! Protocol). The messages are not understood here: this file only carries them to the hidden window (`mcp.html`, which is TypeScript, so the whole app's own code does the work, including
//! drawing marks onto pictures and making a PDF) and carries its answers back. Nothing is printed to standard output except answers, because the assistant reads it as the protocol;
//! messages for people go to standard error.
//!
//! MCP is **off** until the author turns it on in the app (a setting, kept in the app's config folder) and names the folder projects may be opened from. The hidden window can read and write
//! only inside that folder. Whether it may capture a whole screen is a setting too, off to begin with. The wording an assistant reads when something is refused is in the TypeScript.

use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_fs::FsExt;

/// Is the program being run as an MCP server?
pub fn requested() -> bool {
    std::env::args().skip(1).any(|a| a == "--mcp")
}

/// Messages that arrived before the hidden page was listening are kept and handed over when it says it is ready.
#[derive(Default)]
pub struct McpState {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    ready: bool,
    pending: Vec<String>,
}

/// Where the settings are kept: the app's config folder (see `config.rs`).
fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::config::config_folder(app)?.join("mcp.json"))
}

/// The starting settings: off, no folder, no whole-screen capture.
fn default_settings() -> Value {
    json!({ "enabled": false, "folder": "", "allowFullScreen": false })
}

/// The settings as they are kept, with anything missing or odd replaced by the starting value.
fn read_settings(path: &PathBuf) -> Value {
    let start = default_settings();
    let Some(saved) = crate::config::read_settings_file(path) else { return start };
    json!({
        "enabled": saved.get("enabled").and_then(Value::as_bool).unwrap_or(false),
        "folder": saved.get("folder").and_then(Value::as_str).unwrap_or(""),
        "allowFullScreen": saved.get("allowFullScreen").and_then(Value::as_bool).unwrap_or(false),
    })
}

/// The MCP settings, for the settings dialog and for the hidden page.
#[tauri::command]
pub fn mcp_settings_get(app: AppHandle) -> Result<Value, String> {
    Ok(read_settings(&settings_path(&app)?))
}

/// Where this program is, so the settings dialog can give an assistant the exact command to start it.
#[tauri::command]
pub fn mcp_exe_path() -> Result<String, String> {
    std::env::current_exe().map(|p| p.to_string_lossy().into_owned()).map_err(|e| format!("The program's place could not be found: {e}"))
}

/// Keeps the MCP settings. Turning MCP on needs a folder that exists.
#[tauri::command]
pub fn mcp_settings_set(app: AppHandle, settings: Value) -> Result<(), String> {
    let enabled = settings.get("enabled").and_then(Value::as_bool).unwrap_or(false);
    let folder = settings.get("folder").and_then(Value::as_str).unwrap_or("").trim().to_string();
    let full = settings.get("allowFullScreen").and_then(Value::as_bool).unwrap_or(false);
    if enabled && !PathBuf::from(&folder).is_dir() {
        return Err("Choose a folder that exists before turning MCP on. An assistant can only open and save projects inside it.".into());
    }
    let text = serde_json::to_string_pretty(&json!({ "enabled": enabled, "folder": folder, "allowFullScreen": full })).map_err(|e| e.to_string())?;
    crate::config::write_settings_file(&settings_path(&app)?, &text)
}

/// Hands a line from the assistant to the hidden page, or keeps it until the page is listening.
fn deliver(app: &AppHandle, line: String) {
    let state = app.state::<McpState>();
    let mut inner = state.inner.lock().unwrap();
    if inner.ready {
        let _ = app.emit_to("main", "mcp-request", line);
    } else {
        inner.pending.push(line);
    }
}

/// The hidden page is listening: whatever came before is handed over, in order.
#[tauri::command]
pub fn mcp_ready(app: AppHandle) {
    let state = app.state::<McpState>();
    let mut inner = state.inner.lock().unwrap();
    inner.ready = true;
    for line in inner.pending.drain(..) {
        let _ = app.emit_to("main", "mcp-request", line);
    }
}

/// An answer for the assistant: one line on standard output. A line with a line break in it would be two messages, so it is refused.
#[tauri::command]
pub fn mcp_reply(line: String) -> Result<(), String> {
    if line.contains('\n') || line.contains('\r') {
        return Err("An answer must be one line.".into());
    }
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    out.write_all(line.as_bytes()).and_then(|_| out.write_all(b"\n")).and_then(|_| out.flush()).map_err(|e| format!("The answer could not be sent: {e}"))
}

/// Starts MCP mode: lets the hidden page work inside the chosen folder (when MCP is on), makes the page, and reads the assistant's lines until it goes away.
pub fn start(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let settings = read_settings(&settings_path(&handle)?);
    if settings["enabled"].as_bool() == Some(true) {
        let folder = PathBuf::from(settings["folder"].as_str().unwrap_or(""));
        if folder.is_dir() {
            handle.fs_scope().allow_directory(&folder, true)?;
        }
    }
    // The hidden page has the label "main", so the same permissions apply as to the app's own window. Nobody can see it, and it stays out of the taskbar.
    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("mcp.html".into()))
        .title("OpenExplainer MCP")
        .visible(false)
        .skip_taskbar(true)
        .inner_size(1280.0, 800.0)
        .build()?;
    eprintln!("OpenExplainer MCP mode: waiting for the assistant.");
    std::thread::spawn(move || {
        let stdin = std::io::stdin();
        for line in stdin.lock().lines() {
            match line {
                Ok(text) if !text.trim().is_empty() => deliver(&handle, text),
                Ok(_) => {}
                Err(_) => break,
            }
        }
        // The assistant closed the line: the program ends with it.
        handle.exit(0);
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_start_off_and_odd_files_are_put_right() {
        let folder = std::env::temp_dir().join(format!("oe-mcp-test-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        let path = folder.join("mcp.json");
        assert_eq!(read_settings(&path), default_settings(), "no file means off");
        std::fs::write(&path, "not json").unwrap();
        assert_eq!(read_settings(&path), default_settings(), "a damaged file means off");
        std::fs::write(&path, r#"{"enabled":"yes","folder":7,"allowFullScreen":1}"#).unwrap();
        assert_eq!(read_settings(&path), default_settings(), "values of the wrong kind are not believed");
        std::fs::write(&path, r#"{"enabled":true,"folder":"C:\\Docs","allowFullScreen":true,"other":1}"#).unwrap();
        assert_eq!(read_settings(&path), json!({ "enabled": true, "folder": "C:\\Docs", "allowFullScreen": true }));
        // A byte order mark at the start (what Windows PowerShell's Set-Content -Encoding UTF8 writes) is not a reason to call the file damaged.
        std::fs::write(&path, "\u{feff}{\"enabled\":true,\"folder\":\"C:\\\\Docs\",\"allowFullScreen\":false}").unwrap();
        assert_eq!(read_settings(&path), json!({ "enabled": true, "folder": "C:\\Docs", "allowFullScreen": false }), "a byte order mark is skipped");
        let _ = std::fs::remove_dir_all(&folder);
    }

    #[test]
    fn an_answer_is_one_line() {
        assert!(mcp_reply("a\nb".into()).is_err());
        assert!(mcp_reply("a\rb".into()).is_err());
    }
}
