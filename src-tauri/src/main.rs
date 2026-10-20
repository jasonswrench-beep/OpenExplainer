#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod capture;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(capture::CaptureState::default())
        .setup(|_app| {
            // Pictures a capture made but nobody collected (a run that was stopped) are cleared out after an hour.
            capture::sweep_old_pictures(&capture::capture_folder(), std::time::Duration::from_secs(3600));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            capture::capture,
            capture::cancel_capture,
            capture::take_capture_picture,
            capture::read_capture_picture,
            capture::discard_capture_picture,
            capture::select_region,
            capture::selection_ready,
            capture::selection_finish,
            capture::clicks::watch_clicks,
            capture::clicks::stop_clicks,
            capture::clicks::click_session_status
        ])
        .run(tauri::generate_context!())
        .expect("OpenExplainer could not start.");
}
