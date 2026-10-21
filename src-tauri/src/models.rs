//! The built-in AI model's files (see `docs/local-ai-plan.md`).
//!
//! The download itself is done in TypeScript (`src/ai/download.ts`), which asks the web server for the file in pieces. This file is the small part that needs the shell: where the
//! model is kept, how much free disk space and memory this PC has, writing the pieces to a half-finished file in exactly the right order, renaming the finished file, and working out
//! its SHA-256 fingerprint so the app can tell it is the file that was audited.
//!
//! Everything lives in one folder (`models`, inside the app's data folder) and the program only ever touches files named after the one model file, with a fixed ending. A file name
//! that could reach outside that folder is refused, so nothing here can be turned into a way to read or change other files.

use crate::config::data_folder;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Emitter};

/// The most a half-finished file may grow to, whatever a caller says (the real model is under 3 GB; this leaves room for a bigger one later and stops a runaway).
const MOST_BYTES: u64 = 16 * 1024 * 1024 * 1024;

/// A model file name that is safe to use: letters, digits, dots, dashes and underscores, ending in .gguf, and nothing that looks like a path.
fn checked_file(file: &str) -> Result<&str, String> {
    let plain = !file.is_empty()
        && file.len() <= 100
        && file.ends_with(".gguf")
        && !file.starts_with('.')
        && !file.contains("..")
        && file.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    if plain {
        Ok(file)
    } else {
        Err("That is not a model file name this program will use.".into())
    }
}

/// The four files that belong to one model, all inside the models folder.
struct Files {
    model: PathBuf,
    part: PathBuf,
    record: PathBuf,
    licence: PathBuf,
}

fn files_in(folder: &Path, file: &str) -> Result<Files, String> {
    let file = checked_file(file)?;
    Ok(Files {
        model: folder.join(file),
        part: folder.join(format!("{file}.part")),
        record: folder.join(format!("{file}.verified.json")),
        licence: folder.join(format!("LICENSE-{file}.txt")),
    })
}

fn models_folder(app: &AppHandle) -> Result<PathBuf, String> {
    let folder = data_folder(app)?.join("models");
    std::fs::create_dir_all(&folder).map_err(|e| format!("The folder for the model could not be made: {e}"))?;
    Ok(folder)
}

fn size_of(path: &Path) -> Option<u64> {
    std::fs::metadata(path).ok().filter(|m| m.is_file()).map(|m| m.len())
}

/// What is on disk for this model: the sizes of the finished file, the half-finished file and the licence text, and the record of a successful check, if there is one.
fn sizes_in(folder: &Path, file: &str) -> Result<Value, String> {
    let f = files_in(folder, file)?;
    Ok(json!({
        "model": size_of(&f.model),
        "part": size_of(&f.part),
        "licence": size_of(&f.licence),
        "record": std::fs::read_to_string(&f.record).ok(),
    }))
}

/// Adds a piece to the end of the half-finished file. `offset` is where the piece belongs: it must be exactly the file's size now (or 0, which starts the file again), so a piece can never
/// land in the wrong place or twice. Answers with the new size.
fn append_in(folder: &Path, file: &str, offset: u64, bytes: &[u8]) -> Result<u64, String> {
    let f = files_in(folder, file)?;
    let now = size_of(&f.part).unwrap_or(0);
    if offset != 0 && offset != now {
        return Err(format!("The download got out of step (the file is {now} bytes and the next piece starts at {offset}). It will start again from what is saved."));
    }
    if offset.saturating_add(bytes.len() as u64) > MOST_BYTES {
        return Err("The file is larger than this program will keep.".into());
    }
    let mut out = if offset == 0 {
        OpenOptions::new().create(true).write(true).truncate(true).open(&f.part)
    } else {
        OpenOptions::new().append(true).open(&f.part)
    }
    .map_err(|e| format!("The half-finished file could not be opened: {e}"))?;
    out.write_all(bytes).map_err(|e| format!("The file could not be written: {e}"))?;
    out.flush().map_err(|e| format!("The file could not be written: {e}"))?;
    Ok(offset + bytes.len() as u64)
}

/// Makes the half-finished file the finished one.
fn finish_in(folder: &Path, file: &str) -> Result<(), String> {
    let f = files_in(folder, file)?;
    // Windows only lets a file be flushed to disk if it was opened for writing.
    OpenOptions::new().append(true).open(&f.part).and_then(|p| p.sync_all()).map_err(|e| format!("The half-finished file could not be closed properly: {e}"))?;
    let _ = std::fs::remove_file(&f.model);
    std::fs::rename(&f.part, &f.model).map_err(|e| format!("The finished file could not be put in place: {e}"))
}

/// Deletes the half-finished file only, or everything kept for this model.
fn remove_in(folder: &Path, file: &str, what: &str) -> Result<(), String> {
    let f = files_in(folder, file)?;
    let gone = |p: &Path| match std::fs::remove_file(p) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("A file could not be deleted: {e}")),
    };
    match what {
        "part" => gone(&f.part),
        "all" => {
            gone(&f.part)?;
            gone(&f.model)?;
            gone(&f.record)?;
            gone(&f.licence)
        }
        _ => Err("That is not something this program deletes.".into()),
    }
}

/// The SHA-256 of a file as lower-case hex, telling `progress` how far it has got (at most about ten times a second).
fn sha256_of(path: &Path, mut progress: impl FnMut(u64, u64)) -> Result<String, String> {
    let mut input = File::open(path).map_err(|e| format!("The file could not be opened to check it: {e}"))?;
    let total = input.metadata().map(|m| m.len()).unwrap_or(0);
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 8 * 1024 * 1024];
    let mut done = 0u64;
    let mut last = Instant::now();
    loop {
        let n = input.read(&mut buffer).map_err(|e| format!("The file could not be read to check it: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
        done += n as u64;
        if last.elapsed() >= Duration::from_millis(100) {
            progress(done, total);
            last = Instant::now();
        }
    }
    progress(done, total);
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

// ---- What this PC has -------------------------------------------------------------------------------------------

/// Free space, in bytes, on the drive that holds `folder` (what this user may use).
#[cfg(windows)]
fn free_disk_bytes(folder: &Path) -> Result<u64, String> {
    use windows::core::HSTRING;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let mut free = 0u64;
    let path = HSTRING::from(folder.as_os_str());
    unsafe { GetDiskFreeSpaceExW(&path, Some(&mut free), None, None) }.map_err(|e| format!("The free space on the disk could not be read: {e}"))?;
    Ok(free)
}

/// The memory this PC has, in bytes.
#[cfg(windows)]
fn total_memory_bytes() -> Result<u64, String> {
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    let mut status = MEMORYSTATUSEX { dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32, ..Default::default() };
    unsafe { GlobalMemoryStatusEx(&mut status) }.map_err(|e| format!("The PC's memory could not be read: {e}"))?;
    Ok(status.ullTotalPhys)
}

#[cfg(not(windows))]
fn free_disk_bytes(_folder: &Path) -> Result<u64, String> {
    Err("Free disk space can only be read on Windows.".into())
}

#[cfg(not(windows))]
fn total_memory_bytes() -> Result<u64, String> {
    Err("The PC's memory can only be read on Windows.".into())
}

// ---- Commands -----------------------------------------------------------------------------------------------------

/// How much free disk space the model's drive has and how much memory the PC has, for the words in the AI help dialog.
#[tauri::command]
pub fn ai_machine_facts(app: AppHandle) -> Result<Value, String> {
    let folder = models_folder(&app)?;
    Ok(json!({ "freeDiskBytes": free_disk_bytes(&folder)?, "totalMemoryBytes": total_memory_bytes()?, "folder": folder.to_string_lossy() }))
}

/// What is on disk for the model called `file`.
#[tauri::command]
pub fn ai_model_files(app: AppHandle, file: String) -> Result<Value, String> {
    sizes_in(&models_folder(&app)?, &file)
}

/// Adds one piece to the half-finished model file. The piece is the raw body of the request; the headers say which file (`file`) and where the piece belongs (`offset`).
#[tauri::command]
pub fn ai_model_append(app: AppHandle, request: Request<'_>) -> Result<u64, String> {
    let InvokeBody::Raw(bytes) = request.body() else { return Err("The piece of the file was not sent as bytes.".into()) };
    let header = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok()).map(str::to_string).ok_or_else(|| format!("The request is missing \"{name}\"."));
    let file = header("file")?;
    let offset: u64 = header("offset")?.parse().map_err(|_| "The place for the piece is not a number.".to_string())?;
    append_in(&models_folder(&app)?, &file, offset, bytes)
}

/// The half-finished file becomes the finished one.
#[tauri::command]
pub fn ai_model_finish(app: AppHandle, file: String) -> Result<(), String> {
    finish_in(&models_folder(&app)?, &file)
}

/// Deletes the half-finished file (`what` = "part") or everything kept for the model ("all").
#[tauri::command]
pub fn ai_model_remove(app: AppHandle, file: String, what: String) -> Result<(), String> {
    remove_in(&models_folder(&app)?, &file, &what)
}

/// Works out the SHA-256 of the finished file (`which` = "model") or the half-finished one ("part"). Tells the window how far it has got with the event `ai-hash-progress`.
#[tauri::command]
pub async fn ai_model_hash(app: AppHandle, file: String, which: String) -> Result<String, String> {
    let folder = models_folder(&app)?;
    let f = files_in(&folder, &file)?;
    let path = match which.as_str() {
        "model" => f.model,
        "part" => f.part,
        _ => return Err("That is not a file this program checks.".into()),
    };
    tauri::async_runtime::spawn_blocking(move || {
        sha256_of(&path, |done, total| {
            let _ = app.emit("ai-hash-progress", json!({ "done": done, "total": total }));
        })
    })
    .await
    .map_err(|e| format!("The check stopped unexpectedly: {e}"))?
}

/// Keeps the note that the finished file was checked and was the right one.
#[tauri::command]
pub fn ai_model_save_record(app: AppHandle, file: String, text: String) -> Result<(), String> {
    let f = files_in(&models_folder(&app)?, &file)?;
    std::fs::write(&f.record, text + "\n").map_err(|e| format!("The note about the check could not be saved: {e}"))
}

/// Keeps the model's licence text beside it.
#[tauri::command]
pub fn ai_model_write_licence(app: AppHandle, file: String, text: String) -> Result<(), String> {
    let f = files_in(&models_folder(&app)?, &file)?;
    std::fs::write(&f.licence, text).map_err(|e| format!("The licence text could not be saved: {e}"))
}

/// The licence text kept beside the model, if there is one.
#[tauri::command]
pub fn ai_model_read_licence(app: AppHandle, file: String) -> Result<Option<String>, String> {
    let f = files_in(&models_folder(&app)?, &file)?;
    Ok(std::fs::read_to_string(&f.licence).ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let folder = std::env::temp_dir().join(format!("oe-models-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).unwrap();
        folder
    }

    #[test]
    fn only_plain_model_file_names_are_used() {
        for good in ["Qwen3.5-4B-Q4_K_M.gguf", "a.gguf", "x_y-z.1.gguf"] {
            assert!(checked_file(good).is_ok(), "{good}");
        }
        for bad in ["", ".gguf.gguf", "..\\x.gguf", "../x.gguf", "a/b.gguf", "a\\b.gguf", "C:x.gguf", "x.exe", "x.gguf.part", "a b.gguf", ".hidden.gguf", "a..b.gguf", &"a".repeat(120)] {
            assert!(checked_file(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn pieces_go_on_the_end_in_order_and_never_out_of_step() {
        let folder = scratch("append");
        assert_eq!(sizes_in(&folder, "m.gguf").unwrap(), json!({ "model": null, "part": null, "licence": null, "record": null }));
        assert_eq!(append_in(&folder, "m.gguf", 0, b"hello ").unwrap(), 6);
        assert_eq!(append_in(&folder, "m.gguf", 6, b"world").unwrap(), 11);
        assert!(append_in(&folder, "m.gguf", 3, b"x").unwrap_err().contains("out of step"), "a piece in the wrong place is refused");
        assert!(append_in(&folder, "m.gguf", 20, b"x").unwrap_err().contains("out of step"), "so is one after a gap");
        assert_eq!(std::fs::read(folder.join("m.gguf.part")).unwrap(), b"hello world", "and nothing was changed by them");
        assert_eq!(append_in(&folder, "m.gguf", 0, b"again").unwrap(), 5, "offset 0 starts the file again");
        assert_eq!(std::fs::read(folder.join("m.gguf.part")).unwrap(), b"again");
        assert!(append_in(&folder, "../m.gguf", 0, b"x").is_err(), "a name that reaches outside is refused");
        let _ = std::fs::remove_dir_all(&folder);
    }

    #[test]
    fn finishing_deleting_and_the_note_about_the_check() {
        let folder = scratch("finish");
        append_in(&folder, "m.gguf", 0, b"abc").unwrap();
        finish_in(&folder, "m.gguf").unwrap();
        assert_eq!(sizes_in(&folder, "m.gguf").unwrap()["model"], json!(3));
        assert_eq!(sizes_in(&folder, "m.gguf").unwrap()["part"], json!(null));
        std::fs::write(folder.join("m.gguf.verified.json"), "{\"ok\":true}\n").unwrap();
        std::fs::write(folder.join("LICENSE-m.gguf.txt"), "licence").unwrap();
        append_in(&folder, "m.gguf", 0, b"new").unwrap();
        // A second finish replaces the first.
        finish_in(&folder, "m.gguf").unwrap();
        assert_eq!(std::fs::read(folder.join("m.gguf")).unwrap(), b"new");
        append_in(&folder, "m.gguf", 0, b"zz").unwrap();
        remove_in(&folder, "m.gguf", "part").unwrap();
        assert!(folder.join("m.gguf").exists() && !folder.join("m.gguf.part").exists(), "only the half-finished file went");
        remove_in(&folder, "m.gguf", "all").unwrap();
        assert_eq!(sizes_in(&folder, "m.gguf").unwrap(), json!({ "model": null, "part": null, "licence": null, "record": null }));
        remove_in(&folder, "m.gguf", "all").unwrap();
        assert!(remove_in(&folder, "m.gguf", "everything else").is_err());
        let _ = std::fs::remove_dir_all(&folder);
    }

    #[test]
    fn the_fingerprint_is_the_real_sha256_and_progress_ends_at_the_whole() {
        let folder = scratch("hash");
        let path = folder.join("m.gguf");
        std::fs::write(&path, b"abc").unwrap();
        let mut last = (0, 0);
        let hash = sha256_of(&path, |d, t| last = (d, t)).unwrap();
        assert_eq!(hash, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "the well-known SHA-256 of \"abc\"");
        assert_eq!(last, (3, 3));
        std::fs::write(&path, b"").unwrap();
        assert_eq!(sha256_of(&path, |_, _| {}).unwrap(), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "and of nothing");
        assert!(sha256_of(&folder.join("missing.gguf"), |_, _| {}).is_err());
        let _ = std::fs::remove_dir_all(&folder);
    }

    #[cfg(windows)]
    #[test]
    fn this_pc_reports_some_space_and_memory() {
        let folder = scratch("facts");
        assert!(free_disk_bytes(&folder).unwrap() > 0);
        assert!(total_memory_bytes().unwrap() > 512 * 1024 * 1024);
        let _ = std::fs::remove_dir_all(&folder);
    }
}
