#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod capture;
mod mcp;
mod pdf;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(capture::CaptureState::default())
        .manage(mcp::McpState::default())
        .setup(|app| {
            // Pictures a capture made but nobody collected (a run that was stopped) are cleared out after an hour.
            capture::sweep_old_pictures(&capture::capture_folder(), std::time::Duration::from_secs(3600));
            if mcp::requested() {
                // `--mcp`: an AI assistant talks to the app over standard input and output, and nobody sees a window.
                mcp::start(app)?;
            } else {
                tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                    .title("OpenExplainer")
                    .inner_size(1200.0, 800.0)
                    .min_inner_size(800.0, 600.0)
                    .build()?;
            }
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
            capture::clicks::click_session_status,
            pdf::pdf_workspace,
            pdf::pdf_workspace_remove,
            pdf::print_pdf,
            mcp::mcp_ready,
            mcp::mcp_reply,
            mcp::mcp_settings_get,
            mcp::mcp_exe_path,
            mcp::mcp_settings_set
        ])
        .run(tauri::generate_context!())
        .expect("OpenExplainer could not start.");
}
