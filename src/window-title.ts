// The title of the program's own window, the one Windows shows in the title bar, the taskbar and the Alt+Tab list, and that a screen reader says when the window gets the keyboard.
// It names the project and says in words when there are unsaved changes, the same words as the heading on the page.

/** The window title for a project: "Name (unsaved changes) - OpenExplainer". */
export function windowTitle(projectName: string, unsavedChanges: boolean): string {
  const name = projectName.trim() || "Untitled project";
  return `${name}${unsavedChanges ? " (unsaved changes)" : ""} - OpenExplainer`;
}

/** Puts the title on the program's window. Quietly does nothing outside the program (a test or a browser). */
export async function setWindowTitle(title: string): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setTitle(title);
  } catch {
    // not running inside the program
  }
}
