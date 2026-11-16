//! The author's own keys for a hosted AI service (OpenAI, Anthropic, Google), kept on this PC and protected by Windows for this Windows user (DPAPI).
//!
//! One file for each service in the app's data folder (`keys\<service>.key`), never in a project, never in a log. The file holds only what Windows made of the key: another
//! Windows user, or a copy of the file taken to another PC, cannot read it. The page asks for a key only when it is about to send a question to that service (`ai_key_get`),
//! and is told only "a key is saved" and its last four characters otherwise (`ai_key_status`). Agreed in `docs/local-ai-plan.md`, part 7. See `docs/ai-keys.md`.

use crate::config::data_folder;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// The services a key can be kept for. The name is the file's name, so nothing else may ever be used for it.
pub const SERVICES: [&str; 3] = ["openai", "anthropic", "gemini"];
/// A key is a short line of letters, digits and a few signs. Anything else is refused rather than kept.
const LEAST: usize = 8;
const MOST: usize = 400;
/// Extra bytes mixed into Windows' protection, so a program that only asks Windows to unprotect a file (without knowing this) cannot read it.
const ENTROPY: &[u8] = b"OpenExplainer AI key 1";

pub fn check_service(service: &str) -> Result<&'static str, String> {
    SERVICES.iter().copied().find(|s| *s == service).ok_or_else(|| "That is not one of the AI services a key can be kept for.".to_string())
}

/// A key as typed, put right: spaces round it are dropped. `Err` says in words what is wrong with it (and never repeats the key).
pub fn check_key(key: &str) -> Result<String, String> {
    let key = key.trim();
    if key.len() < LEAST {
        return Err("That is too short to be a key. Paste the whole key the service gave you.".into());
    }
    if key.len() > MOST {
        return Err("That is too long to be a key. Paste only the key the service gave you.".into());
    }
    if !key.chars().all(|c| c.is_ascii_graphic()) {
        return Err("A key has no spaces, line breaks or special letters in it. Paste only the key the service gave you.".into());
    }
    Ok(key.to_string())
}

#[cfg(windows)]
fn protect(plain: &[u8]) -> Result<Vec<u8>, String> {
    use windows::core::w;
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB};
    let input = CRYPT_INTEGER_BLOB { cbData: plain.len() as u32, pbData: plain.as_ptr() as *mut u8 };
    let entropy = CRYPT_INTEGER_BLOB { cbData: ENTROPY.len() as u32, pbData: ENTROPY.as_ptr() as *mut u8 };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptProtectData(&input, w!("OpenExplainer AI key"), Some(&entropy), None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut output)
            .map_err(|e| format!("Windows would not protect the key ({e})."))?;
        let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
        Ok(bytes)
    }
}

#[cfg(windows)]
fn unprotect(blob: &[u8]) -> Result<Vec<u8>, String> {
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB};
    let input = CRYPT_INTEGER_BLOB { cbData: blob.len() as u32, pbData: blob.as_ptr() as *mut u8 };
    let entropy = CRYPT_INTEGER_BLOB { cbData: ENTROPY.len() as u32, pbData: ENTROPY.as_ptr() as *mut u8 };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptUnprotectData(&input, None, Some(&entropy), None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut output)
            .map_err(|_| "Windows could not unlock the saved key. It may have been saved by another Windows user or on another PC. Save the key again.".to_string())?;
        let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
        Ok(bytes)
    }
}

#[cfg(not(windows))]
fn protect(_plain: &[u8]) -> Result<Vec<u8>, String> {
    Err("Keys can be kept only on Windows.".into())
}

#[cfg(not(windows))]
fn unprotect(_blob: &[u8]) -> Result<Vec<u8>, String> {
    Err("Keys can be kept only on Windows.".into())
}

fn key_path(folder: &Path, service: &str) -> Result<PathBuf, String> {
    Ok(folder.join("keys").join(format!("{}.key", check_service(service)?)))
}

/// Keeps a key, protected, replacing any earlier one for the service. The file is written whole or not at all.
pub fn save_key(folder: &Path, service: &str, key: &str) -> Result<(), String> {
    let path = key_path(folder, service)?;
    let key = check_key(key)?;
    let blob = protect(key.as_bytes())?;
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| format!("The folder for the key could not be made: {e}"))?;
    let part = path.with_extension("key.part");
    std::fs::write(&part, blob).map_err(|e| format!("The key could not be saved: {e}"))?;
    std::fs::rename(&part, &path).map_err(|e| {
        let _ = std::fs::remove_file(&part);
        format!("The key could not be saved: {e}")
    })
}

/// The key, or `None` when none is saved. `Err` when a file is there but Windows cannot unlock it.
pub fn load_key(folder: &Path, service: &str) -> Result<Option<String>, String> {
    let path = key_path(folder, service)?;
    let blob = match std::fs::read(&path) {
        Ok(blob) => blob,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("The saved key could not be read: {e}")),
    };
    let plain = unprotect(&blob)?;
    String::from_utf8(plain).map(Some).map_err(|_| "The saved key is damaged. Save the key again.".to_string())
}

/// Removes the key. True if there was one.
pub fn delete_key(folder: &Path, service: &str) -> Result<bool, String> {
    let path = key_path(folder, service)?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(format!("The saved key could not be removed: {e}")),
    }
}

/// What the page may know without being given the key: whether one is saved, and its last four characters (so the author can tell which key it is).
pub fn key_status(folder: &Path, service: &str) -> Result<Value, String> {
    match load_key(folder, service) {
        Ok(Some(key)) => {
            let last4: String = key.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
            Ok(json!({ "saved": true, "last4": last4, "problem": null }))
        }
        Ok(None) => Ok(json!({ "saved": false, "last4": null, "problem": null })),
        // A file that cannot be unlocked is said, not hidden: the author saves the key again.
        Err(problem) => Ok(json!({ "saved": true, "last4": null, "problem": problem })),
    }
}

#[tauri::command]
pub fn ai_key_set(app: AppHandle, service: String, key: String) -> Result<(), String> {
    save_key(&data_folder(&app)?, &service, &key)
}

#[tauri::command]
pub fn ai_key_status(app: AppHandle, service: String) -> Result<Value, String> {
    key_status(&data_folder(&app)?, &service)
}

/// The key itself, for the one moment the page sends a question to the service it is for.
#[tauri::command]
pub fn ai_key_get(app: AppHandle, service: String) -> Result<Option<String>, String> {
    load_key(&data_folder(&app)?, &service)
}

#[tauri::command]
pub fn ai_key_delete(app: AppHandle, service: String) -> Result<bool, String> {
    delete_key(&data_folder(&app)?, &service)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh(name: &str) -> PathBuf {
        let folder = std::env::temp_dir().join(format!("openexplainer-keys-tests-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).unwrap();
        folder
    }

    #[test]
    fn only_the_known_services_have_keys_and_nothing_can_name_another_file() {
        assert_eq!(check_service("openai"), Ok("openai"));
        assert_eq!(check_service("anthropic"), Ok("anthropic"));
        assert_eq!(check_service("gemini"), Ok("gemini"));
        for odd in ["", "OpenAI", "../openai", "openai.key", "a\\b", "claude"] {
            assert!(check_service(odd).is_err(), "{odd}");
        }
        assert!(key_path(Path::new("C:\\data"), "../x").is_err());
    }

    #[test]
    fn a_key_is_put_right_or_refused_without_repeating_it() {
        assert_eq!(check_key("  sk-abcdef123456\n").unwrap(), "sk-abcdef123456");
        assert!(check_key("short").unwrap_err().contains("too short"));
        assert!(check_key(&"k".repeat(401)).unwrap_err().contains("too long"));
        let secret = "sk-abc def-123456";
        let said = check_key(secret).unwrap_err();
        assert!(said.contains("no spaces") && !said.contains("sk-abc"), "the key is never in the words");
        assert!(check_key("sk-abcdef\u{e9}123").is_err());
    }

    #[cfg(windows)]
    #[test]
    fn windows_protects_a_key_and_gives_it_back_and_the_file_does_not_hold_the_key() {
        let folder = fresh("round");
        let key = "sk-test-0123456789abcdef";
        save_key(&folder, "openai", key).unwrap();
        let file = std::fs::read(folder.join("keys").join("openai.key")).unwrap();
        assert!(!String::from_utf8_lossy(&file).contains("0123456789"), "the key is not in the file as it was typed");
        assert!(!file.windows(key.len()).any(|w| w == key.as_bytes()));
        assert_eq!(load_key(&folder, "openai").unwrap().as_deref(), Some(key));
        assert_eq!(load_key(&folder, "gemini").unwrap(), None, "another service has none");
        let status = key_status(&folder, "openai").unwrap();
        assert_eq!(status["saved"], true);
        assert_eq!(status["last4"], "cdef");
        assert!(!status.to_string().contains("sk-test"), "the page is never told the key");
        // a new key replaces the old
        save_key(&folder, "openai", "sk-second-0123456789").unwrap();
        assert_eq!(load_key(&folder, "openai").unwrap().as_deref(), Some("sk-second-0123456789"));
        assert!(delete_key(&folder, "openai").unwrap());
        assert!(!delete_key(&folder, "openai").unwrap());
        assert_eq!(key_status(&folder, "openai").unwrap()["saved"], false);
        assert!(!folder.join("keys").join("openai.key.part").exists(), "no half-written file is left");
        let _ = std::fs::remove_dir_all(&folder);
    }

    #[cfg(windows)]
    #[test]
    fn a_damaged_file_or_one_from_another_pc_is_said_in_words_not_read() {
        let folder = fresh("damaged");
        save_key(&folder, "anthropic", "sk-ant-0123456789abcdef").unwrap();
        let path = folder.join("keys").join("anthropic.key");
        let mut blob = std::fs::read(&path).unwrap();
        let last = blob.len() - 1;
        blob[last] ^= 0xFF;
        std::fs::write(&path, blob).unwrap();
        let said = load_key(&folder, "anthropic").unwrap_err();
        assert!(said.contains("Save the key again"), "{said}");
        let status = key_status(&folder, "anthropic").unwrap();
        assert_eq!(status["saved"], true);
        assert!(status["problem"].as_str().unwrap().contains("Save the key again"));
        std::fs::write(&path, b"not a protected key at all").unwrap();
        assert!(load_key(&folder, "anthropic").is_err());
        let _ = std::fs::remove_dir_all(&folder);
    }
}
