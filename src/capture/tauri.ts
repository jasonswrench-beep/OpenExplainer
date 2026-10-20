// The real route from the app to the capture helper: the commands in src-tauri/src/capture.rs.
import { invoke } from "@tauri-apps/api/core";
import { CAPTURE_TIMEOUT_MS, type ShellOutcome } from "./outcome.ts";
import type { Shell } from "./client.ts";

export const tauriShell: Shell = {
  run: (request, { timeoutMs, hideApp, delayMs }) => invoke<ShellOutcome>("capture", { request, timeoutMs, hideApp, delayMs }),
  takePicture: async (path) => new Uint8Array(await invoke<ArrayBuffer>("take_capture_picture", { path })),
  select: ({ screen, initial }, { timeoutMs, delayMs }) => invoke<ShellOutcome>("select_region", { screen, initial, timeoutMs, delayMs }),
  discard: async (path) => { await invoke("discard_capture_picture", { path }); },
  watchClicks: ({ idleSeconds, maxClicks }) => invoke<ShellOutcome>("watch_clicks", { idleSeconds, maxClicks }),
};

/** 20 seconds. In a development build only, a test can make it shorter with `window.__openexplainerCaptureTimeoutMs`. */
export function captureTimeoutMs(): number {
  if (import.meta.env.DEV) {
    const shorter = (window as unknown as { __openexplainerCaptureTimeoutMs?: number }).__openexplainerCaptureTimeoutMs;
    if (typeof shorter === "number" && shorter > 0) return shorter;
  }
  return CAPTURE_TIMEOUT_MS;
}
