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

/// Keeps a settings file, making its folder first.
pub fn write_settings_file(path: &PathBuf, text: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("The settings folder could not be made: {e}"))?;
    }
    std::fs::write(path, text.to_string() + "\n").map_err(|e| format!("The settings could not be saved: {e}"))
}
