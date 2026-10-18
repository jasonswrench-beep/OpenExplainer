#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod capture;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(capture::CaptureState::default())
        .invoke_handler(tauri::generate_handler![capture::capture, capture::cancel_capture, capture::take_capture_picture])
        .run(tauri::generate_context!())
        .expect("OpenExplainer could not start.");
}
