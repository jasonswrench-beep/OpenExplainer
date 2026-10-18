// The small always-on-top window shown while a capture runs. It is the "always visible Cancel": OpenExplainer's main
// window is hidden during a capture, so this is what the author sees. Windows keeps it out of screen copies.
// Cancel, the Escape key and this window's close button all stop the capture.
import { invoke } from "@tauri-apps/api/core";

const total = (window as unknown as { __CAPTURE_SECONDS?: number }).__CAPTURE_SECONDS ?? 20;
const left = document.getElementById("left")!;
const limit = document.getElementById("limit")!;
const what = document.getElementById("what")!;
const cancel = document.getElementById("cancel") as HTMLButtonElement;

limit.textContent = String(total);
left.textContent = String(total);
let remaining = total;
const tick = setInterval(() => {
  remaining = Math.max(0, remaining - 1);
  left.textContent = String(remaining);
  if (remaining === 0) clearInterval(tick);
}, 1000);

let cancelling = false;
function stop() {
  if (cancelling) return;
  cancelling = true;
  what.textContent = "Cancelling the capture.";
  cancel.disabled = true;
  void invoke("cancel_capture");
}

cancel.addEventListener("click", stop);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { event.preventDefault(); stop(); }
});
// Focus goes straight to Cancel, so Enter or Space stops the capture without reaching for the mouse.
cancel.focus();
