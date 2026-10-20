// The small always-on-top window shown while clicks are being captured. OpenExplainer's main window is hidden during a
// click-by-click capture, so this is what the author sees: how many clicks have been captured so far, and a Stop button.
// Windows keeps it out of screen copies, and the helper ignores clicks on it, so pressing Stop is never a step.
// It does not take the keyboard from the program the author is working in. Stop, the Escape key (once the window has the
// keyboard, after Alt+Tab) and the window's close button all stop the capture and keep every click so far.
import { invoke } from "@tauri-apps/api/core";

const $ = (id: string) => document.getElementById(id)!;
const what = $("what");
const count = $("count");
const announce = $("announce");
const stop = $("stop") as HTMLButtonElement;

let shown = 0;
let stopping = false;

async function refresh() {
  try {
    const status = await invoke<{ count: number }>("click_session_status");
    if (status.count === shown) return;
    shown = status.count;
    count.textContent = String(shown);
    announce.textContent = `${shown} click${shown === 1 ? "" : "s"} captured.`;
  } catch {
    // The count is only for show. If it cannot be read, the capture carries on and Stop still works.
  }
}

const timer = setInterval(() => void refresh(), 400);

function stopNow() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  what.textContent = "Stopping. Saving the last picture.";
  stop.disabled = true;
  void invoke("stop_clicks");
}

stop.addEventListener("click", stopNow);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { event.preventDefault(); stopNow(); }
});
// Once the window has the keyboard (after Alt+Tab), Enter or Space on the focused button stops the capture.
stop.focus();
