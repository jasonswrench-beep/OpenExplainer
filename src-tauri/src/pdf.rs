//! Making a PDF from a page of the book or a guide.
//!
//! The page itself (its layout, its page numbers, its running header) is written in TypeScript (`src/export/pdf.ts`) as an ordinary web page. This file only
//! asks the browser engine that already shows the app (WebView2, which is Chromium) to print that page to a PDF, so the PDF has real text, real page breaks,
//! tags for a screen reader and a bookmark for each heading, which a hand-made PDF writer could not easily give. Nothing is sent anywhere: the page is a
//! folder on this PC, and the PDF is written to the place the author chose.
//!
//! The printing happens in a hidden window of its own (no access to the app's commands), on a background thread, with a time limit, so a page that never
//! finishes cannot freeze OpenExplainer. The wording the author reads lives in the TypeScript; this file reports what happened in plain words.

use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::Duration;

/// The longest the whole job may take, in seconds, from the first load to the last byte.
const MOST_SECONDS: u64 = 180;
/// The folder, inside the PC's temporary folder, where pages are put together. Everything in it is cleared away afterwards.
const WORK_FOLDER: &str = "openexplainer-pdf";

/// Only one PDF is made at a time.
static BUSY: AtomicBool = AtomicBool::new(false);

/// Where the pages for a PDF are put together.
pub fn work_root() -> PathBuf {
    std::env::temp_dir().join(WORK_FOLDER)
}

/// Is `path` inside the work folder? Written without touching the disk, and refusing `..`, so it can be tested on its own.
pub fn inside_work_root(path: &Path, root: &Path) -> bool {
    path.starts_with(root) && !path.components().any(|c| matches!(c, std::path::Component::ParentDir))
}

/// Makes a fresh folder to put a page and its pictures in, and says where it is.
#[tauri::command]
pub fn pdf_workspace() -> Result<String, String> {
    let root = work_root();
    // Anything left by a run that was stopped is cleared out first.
    let _ = std::fs::remove_dir_all(&root);
    let folder = root.join(format!("job-{}", std::process::id()));
    std::fs::create_dir_all(&folder).map_err(|e| format!("A folder to build the PDF in could not be made: {e}"))?;
    Ok(folder.to_string_lossy().into_owned())
}

/// Clears away a folder made by `pdf_workspace`. Nothing outside the work folder is ever touched.
#[tauri::command]
pub fn pdf_workspace_remove(path: String) -> Result<(), String> {
    let folder = PathBuf::from(path);
    if !inside_work_root(&folder, &work_root()) {
        return Err("That folder is not one of the PDF work folders.".into());
    }
    let _ = std::fs::remove_dir_all(&folder);
    Ok(())
}

/// Prints the page at `page` (a file inside the work folder) to the PDF at `pdf`, which must be inside the work folder too: the page reads the PDF from
/// there and saves it where the author chose, through the file permissions the save dialog gave it (security review, 2026-11-13). `options` is what
/// Chromium's Page.printToPDF is asked for, as JSON.
#[tauri::command]
pub async fn print_pdf(app: tauri::AppHandle, page: String, pdf: String, options: String) -> Result<(), String> {
    let page = PathBuf::from(page);
    if !inside_work_root(&page, &work_root()) || !page.is_file() {
        return Err("The page to print was not found.".into());
    }
    let pdf = PathBuf::from(pdf);
    if pdf.extension().map(|e| e.to_ascii_lowercase()) != Some("pdf".into()) {
        return Err("The PDF must be saved with the name ending in .pdf.".into());
    }
    if !inside_work_root(&pdf, &work_root()) || pdf.parent() != page.parent() {
        return Err("A PDF is made only in the folder its page is in.".into());
    }
    let options: Value = serde_json::from_str(&options).map_err(|_| "The print options were not understood.".to_string())?;
    if !options.is_object() {
        return Err("The print options were not understood.".into());
    }
    if BUSY.swap(true, Ordering::SeqCst) {
        return Err("A PDF is already being made. Wait for it to finish.".into());
    }
    // A background thread does the waiting, never the one that draws the window.
    let result = tauri::async_runtime::spawn_blocking(move || print(&app, &page, &pdf, &options)).await;
    BUSY.store(false, Ordering::SeqCst);
    result.map_err(|_| "Making the PDF stopped unexpectedly.".to_string())?
}

#[cfg(not(windows))]
fn print(_app: &tauri::AppHandle, _page: &Path, _pdf: &Path, _options: &Value) -> Result<(), String> {
    Err("Making a PDF needs Windows.".into())
}

#[cfg(windows)]
fn print(app: &tauri::AppHandle, page: &Path, pdf: &Path, options: &Value) -> Result<(), String> {
    use base64::Engine;
    use tauri::{webview::PageLoadEvent, Manager, WebviewUrl, WebviewWindowBuilder};

    const LABEL: &str = "pdf-maker";
    if app.get_webview_window(LABEL).is_some() {
        return Err("A PDF is already being made. Wait for it to finish.".into());
    }
    let url = tauri::Url::from_file_path(page).map_err(|_| "The page to print could not be opened.".to_string())?;
    let (loaded_tx, loaded_rx) = mpsc::channel::<()>();
    // The window is hidden, is the size of a letter page, and has no permission to use any of the app's commands (it is not in the capability list).
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::External(url))
        .title("OpenExplainer PDF")
        .visible(false)
        .inner_size(816.0, 1056.0)
        .on_page_load(move |_, payload| {
            if matches!(payload.event(), PageLoadEvent::Finished) {
                let _ = loaded_tx.send(());
            }
        })
        .build()
        .map_err(|e| format!("The page to print could not be opened: {e}"))?;
    // Whatever happens next, the hidden window is closed again.
    struct Closer(tauri::WebviewWindow);
    impl Drop for Closer {
        fn drop(&mut self) {
            let _ = self.0.destroy();
        }
    }
    let closer = Closer(window);
    let limit = Duration::from_secs(MOST_SECONDS);
    loaded_rx.recv_timeout(limit).map_err(|_| "The page took too long to open, so no PDF was made.".to_string())?;
    // Fonts and pictures are ready before it is printed, so nothing is missing from the PDF. If this step cannot run the print is still tried.
    let _ = devtools(
        &closer.0,
        "Runtime.evaluate",
        r#"{"expression":"document.fonts.ready.then(() => Promise.all(Array.from(document.images, (i) => i.decode().catch(() => null)))).then(() => true)","awaitPromise":true,"returnByValue":true}"#,
        limit,
    );
    let reply = devtools(&closer.0, "Page.printToPDF", &options.to_string(), limit)?;
    let reply: Value = serde_json::from_str(&reply).map_err(|_| "The browser's answer was not understood.".to_string())?;
    let data = reply.get("data").and_then(Value::as_str).ok_or("The page could not be printed.")?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|_| "The browser's PDF was damaged.".to_string())?;
    std::fs::write(pdf, bytes).map_err(|e| format!("The PDF could not be saved: {e}"))?;
    Ok(())
}

/// Asks the browser engine for one thing (a Chrome DevTools protocol method) in the hidden window and waits for its answer, for at most `limit`.
#[cfg(windows)]
fn devtools(window: &tauri::WebviewWindow, method: &str, params: &str, limit: Duration) -> Result<String, String> {
    use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
    use windows::core::HSTRING;

    let (tx, rx) = mpsc::channel::<Result<String, String>>();
    let method = HSTRING::from(method);
    let params = HSTRING::from(params);
    window
        .with_webview(move |webview| {
            let tx_failed = tx.clone();
            let asked = unsafe {
                webview.controller().CoreWebView2().and_then(|core| {
                    core.CallDevToolsProtocolMethod(
                        &method,
                        &params,
                        &CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |error, json| {
                            let _ = tx.send(match error {
                                Ok(()) => Ok(json),
                                Err(e) => Err(format!("The browser could not do it: {e}")),
                            });
                            Ok(())
                        })),
                    )
                })
            };
            if let Err(e) = asked {
                let _ = tx_failed.send(Err(format!("The browser could not be asked: {e}")));
            }
        })
        .map_err(|e| format!("The browser could not be reached: {e}"))?;
    rx.recv_timeout(limit).map_err(|_| "Making the PDF took too long, so it was stopped.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_paths_inside_the_work_folder_count() {
        let root = Path::new("C:\\Temp\\openexplainer-pdf");
        assert!(inside_work_root(&root.join("job-1").join("book.html"), root));
        assert!(!inside_work_root(Path::new("C:\\Temp\\other\\book.html"), root));
        assert!(!inside_work_root(Path::new("C:\\Temp\\openexplainer-pdf\\..\\other\\book.html"), root));
        assert!(!inside_work_root(Path::new("C:\\Temp\\openexplainer-pdf-extra\\book.html"), root));
    }
}
