// The small always-on-top window shown while a capture runs. It is the "always visible Cancel": OpenExplainer's main
// window is hidden during a capture, so this is what the author sees. Windows keeps it out of screen copies.
// Cancel, the Escape key and this window's close button all stop the capture.
//
// If the author asked to wait before capturing, it has two phases: first a count-down to the capture, during which the
// author is using another program (so this window does not take the keyboard from it), then the capture itself.
import { invoke } from "@tauri-apps/api/core";

const page = window as unknown as { __CAPTURE_SECONDS?: number; __CAPTURE_WAIT?: number };
const total = page.__CAPTURE_SECONDS ?? 20;
const wait = page.__CAPTURE_WAIT ?? 0;
const $ = (id: string) => document.getElementById(id)!;
const heading = $("heading");
const what = $("what");
const label = $("label");
const left = $("left");
const cancel = $("cancel") as HTMLButtonElement;

let phase: "waiting" | "capturing" = wait > 0 ? "waiting" : "capturing";
let remaining = phase === "waiting" ? wait : total;

function show() {
  if (phase === "waiting") {
    heading.textContent = "Waiting to capture";
    what.textContent = `OpenExplainer is hidden so you can get the other program ready. It captures by itself in ${remaining} seconds. Press Cancel to stop, or use Alt+Tab to come back to this window and press Esc.`;
    label.textContent = "Capturing in:";
    document.title = "OpenExplainer will capture soon";
  } else {
    heading.textContent = "Capturing";
    what.textContent = `OpenExplainer is hidden while it takes the picture. It stops by itself after ${total} seconds.`;
    label.textContent = "Time left:";
    document.title = "OpenExplainer is capturing";
  }
  left.textContent = String(remaining);
}
show();

const tick = setInterval(() => {
  remaining = Math.max(0, remaining - 1);
  left.textContent = String(remaining);
  if (remaining > 0) return;
  if (phase === "waiting") {
    // The wait is over: the app takes the picture now.
    phase = "capturing";
    remaining = total;
    show();
  } else {
    clearInterval(tick);
  }
}, 1000);

let cancelling = false;
function stop() {
  if (cancelling) return;
  cancelling = true;
  clearInterval(tick);
  what.textContent = "Cancelling the capture.";
  cancel.disabled = true;
  void invoke("cancel_capture");
}

cancel.addEventListener("click", stop);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { event.preventDefault(); stop(); }
});
// The Cancel button is the focused control in this window, so Enter or Space stops the capture once the window has the keyboard.
cancel.focus();
