#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai;
mod capture;
mod config;
mod launch;
mod llama;
mod mcp;
mod models;
mod pdf;
mod updates;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(capture::CaptureState::default())
        .manage(mcp::McpState::default())
        .manage(llama::RuntimeState::default())
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
            launch::launch_file,
            mcp::mcp_ready,
            mcp::mcp_reply,
            mcp::mcp_settings_get,
            mcp::mcp_exe_path,
            mcp::mcp_real_path,
            mcp::mcp_settings_set,
            ai::ai_settings_get,
            ai::ai_settings_set,
            models::ai_machine_facts,
            models::ai_model_files,
            models::ai_model_append,
            models::ai_model_finish,
            models::ai_model_remove,
            models::ai_model_hash,
            models::ai_model_save_record,
            models::ai_model_write_licence,
            models::ai_model_read_licence,
            llama::ai_runtime_start,
            llama::ai_runtime_stop,
            llama::ai_runtime_status,
            updates::app_release,
            updates::check_for_updates,
            updates::open_release_page
        ])
        .build(tauri::generate_context!())
        .expect("OpenExplainer could not start.")
        .run(|app, event| {
            // The model's program goes when OpenExplainer does (a Windows job makes sure of it even if this never runs).
            if let tauri::RunEvent::Exit = event {
                llama::stop_all(app);
            }
        });
}
