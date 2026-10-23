//! Where the app keeps settings that belong to the app and not to a project (MCP access, AI help).

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// The app's config folder. In a development build a test can point it somewhere else with `OPENEXPLAINER_CONFIG_DIR`, so a test never touches the real settings.
pub fn config_folder(app: &AppHandle) -> Result<PathBuf, String> {
    let folder = if cfg!(debug_assertions) {
        std::env::var_os("OPENEXPLAINER_CONFIG_DIR").map(PathBuf::from)
    } else {
        None
    };
    match folder {
        Some(f) => Ok(f),
        None => app.path().app_config_dir().map_err(|e| format!("The settings folder could not be found: {e}")),
    }
}

/// Where the app keeps big files that belong to this PC and not to a project (the built-in AI model). In a development build a test can point it somewhere else with
/// `OPENEXPLAINER_DATA_DIR`, so a test never touches the real folder.
pub fn data_folder(app: &AppHandle) -> Result<PathBuf, String> {
    let folder = if cfg!(debug_assertions) {
        std::env::var_os("OPENEXPLAINER_DATA_DIR").map(PathBuf::from)
    } else {
        None
    };
    match folder {
        Some(f) => Ok(f),
        None => app.path().app_local_data_dir().map_err(|e| format!("The folder for the app's data could not be found: {e}")),
    }
}

/// Reads a settings file as a JSON object, or `None` if there is no file or it is not one. Windows PowerShell's `Set-Content -Encoding UTF8` and some editors put three invisible bytes (a byte order
/// mark) at the start of a file; they are skipped, because to the reader a file that starts with them used to look damaged and the settings quietly fell back to "off".
pub fn read_settings_file(path: &PathBuf) -> Option<serde_json::Map<String, serde_json::Value>> {
    let text = std::fs::read_to_string(path).ok()?;
    match serde_json::from_str::<serde_json::Value>(text.strip_prefix('\u{feff}').unwrap_or(&text)) {
        Ok(serde_json::Value::Object(saved)) => Some(saved),
        _ => None,
    }
}

/// Keeps a settings file, making its folder first.
pub fn write_settings_file(path: &PathBuf, text: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("The settings folder could not be made: {e}"))?;
    }
    std::fs::write(path, text.to_string() + "\n").map_err(|e| format!("The settings could not be saved: {e}"))
}
