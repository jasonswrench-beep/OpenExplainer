//! The AI help settings (see `docs/local-ai-plan.md`).
//!
//! Which answerer drafts text: none (the starting choice), the built-in model on this PC, or the author's own key with a cloud service (not built yet). Kept in the app's config folder,
//! not in a project, because it belongs to this PC and not to the book. Anything missing or odd is put right when it is read, and the starting choice is "none".

use crate::config::{config_folder, write_settings_file};
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::AppHandle;

const CHOICES: [&str; 3] = ["none", "builtin", "key"];

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_folder(app)?.join("ai.json"))
}

fn default_settings() -> Value {
    json!({ "choice": "none" })
}

/// The settings as they are kept; a choice that is not one of the known ones means "none".
fn read_settings(path: &PathBuf) -> Value {
    let Ok(text) = std::fs::read_to_string(path) else { return default_settings() };
    let Ok(Value::Object(saved)) = serde_json::from_str::<Value>(&text) else { return default_settings() };
    match saved.get("choice").and_then(Value::as_str) {
        Some(choice) if CHOICES.contains(&choice) => json!({ "choice": choice }),
        _ => default_settings(),
    }
}

/// The AI help settings, for the dialog and for whatever drafts.
#[tauri::command]
pub fn ai_settings_get(app: AppHandle) -> Result<Value, String> {
    Ok(read_settings(&settings_path(&app)?))
}

/// Keeps the AI help settings. An unknown choice is refused rather than quietly changed.
#[tauri::command]
pub fn ai_settings_set(app: AppHandle, settings: Value) -> Result<(), String> {
    let choice = settings.get("choice").and_then(Value::as_str).unwrap_or("");
    if !CHOICES.contains(&choice) {
        return Err("That is not one of the AI help choices.".into());
    }
    let text = serde_json::to_string_pretty(&json!({ "choice": choice })).map_err(|e| e.to_string())?;
    write_settings_file(&settings_path(&app)?, &text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_choice_starts_at_none_and_odd_files_are_put_right() {
        let folder = std::env::temp_dir().join(format!("oe-ai-test-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        let path = folder.join("ai.json");
        assert_eq!(read_settings(&path), default_settings(), "no file means no AI");
        std::fs::write(&path, "not json").unwrap();
        assert_eq!(read_settings(&path), default_settings(), "a damaged file means no AI");
        std::fs::write(&path, r#"{"choice":"telepathy"}"#).unwrap();
        assert_eq!(read_settings(&path), default_settings(), "an unknown choice means no AI");
        std::fs::write(&path, r#"{"choice":5}"#).unwrap();
        assert_eq!(read_settings(&path), default_settings(), "a choice of the wrong kind is not believed");
        std::fs::write(&path, r#"{"choice":"builtin","other":1}"#).unwrap();
        assert_eq!(read_settings(&path), json!({ "choice": "builtin" }));
        write_settings_file(&path, r#"{"choice":"key"}"#).unwrap();
        assert_eq!(read_settings(&path), json!({ "choice": "key" }));
        let _ = std::fs::remove_dir_all(&folder);
    }
}
