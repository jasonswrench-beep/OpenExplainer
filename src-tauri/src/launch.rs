//! Opening a project by double-clicking its file in Windows (or "Open with"). Windows starts the program with the file's full name as its argument; this finds it, lets the program
//! read and save that one file, and nothing else, and tells the page, which then opens it like any project the author chose with the Open project button.

use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_fs::FsExt;

const EXTENSION: &str = "openexplainer";

/// The project file named among the program's arguments (the first of them is the program itself), if there is one that really exists. Options that start with a dash, such as `--mcp`, are
/// not file names.
pub fn project_in(args: impl IntoIterator<Item = String>) -> Option<PathBuf> {
    args.into_iter()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        .map(PathBuf::from)
        .find(|path| path.extension().is_some_and(|e| e.eq_ignore_ascii_case(EXTENSION)) && path.is_file())
}

/// The project the program was started to open, as a full path, or `None` when it was started in the ordinary way. The program may then read and write that file (the page could not
/// otherwise reach a file the author never chose in a dialog).
#[tauri::command]
pub fn launch_file(app: AppHandle) -> Result<Option<String>, String> {
    let Some(path) = project_in(std::env::args()) else { return Ok(None) };
    let path = std::path::absolute(&path).unwrap_or(path);
    app.fs_scope().allow_file(&path).map_err(|e| format!("The program could not be allowed to open that project: {e}"))?;
    Ok(Some(path_text(&path)))
}

fn path_text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn the_project_file_among_the_arguments_is_found_and_nothing_else_is() {
        let folder = std::env::temp_dir().join(format!("oe-launch-test-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        let book = folder.join("My Book.openexplainer");
        let shouting = folder.join("OTHER.OPENEXPLAINER");
        let text = folder.join("notes.txt");
        for file in [&book, &shouting, &text] {
            std::fs::write(file, "x").unwrap();
        }
        let named = |p: &Path| p.to_string_lossy().into_owned();
        assert_eq!(project_in(args(&["openexplainer.exe", &named(&book)])), Some(book.clone()), "a name with spaces, as Windows passes it");
        assert_eq!(project_in(args(&["openexplainer.exe", &named(&shouting)])), Some(shouting.clone()), "capitals do not matter");
        assert_eq!(project_in(args(&["openexplainer.exe", "--mcp", &named(&book)])), Some(book.clone()), "an option is skipped");
        assert_eq!(project_in(args(&["openexplainer.exe", &named(&text), &named(&book)])), Some(book.clone()), "only a project file counts");
        assert_eq!(project_in(args(&["openexplainer.exe"])), None, "an ordinary start");
        assert_eq!(project_in(args(&["openexplainer.exe", &named(&text)])), None, "another kind of file");
        assert_eq!(project_in(args(&["openexplainer.exe", &named(&folder.join("gone.openexplainer"))])), None, "a file that is not there");
        assert_eq!(project_in(args(&[&named(&book)])), None, "the first argument is the program itself, never a project");
        assert_eq!(project_in(args(&["openexplainer.exe", &named(&folder)])), None, "a folder is not a project");
        let _ = std::fs::remove_dir_all(&folder);
    }
}
