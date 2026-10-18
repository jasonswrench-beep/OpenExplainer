// Asking the capture helper for things, from the app. The real route to the helper is the shell (src-tauri/src/capture.rs),
// reached through `shell`, so these functions can be tried with a pretend shell and no helper at all.
import { readImageInfo } from "../project/image.ts";
import {
  CAPTURE_TIMEOUT_MS, UNCHANGED, failure, failureFor, failureFromHelper,
  type CaptureResult, type Done, type ScreenInfo, type ShellOutcome, type WindowInfo,
} from "./outcome.ts";
import type { Region } from "./region.ts";

/** The app's way of running the helper. `tauri.ts` is the real one. */
export interface Shell {
  /** Runs the helper once with `request` and reports what happened. With `hideApp`, OpenExplainer hides and a Cancel window shows. */
  run(request: Record<string, unknown>, options: { timeoutMs: number; hideApp: boolean }): Promise<ShellOutcome>;
  /** Hands over the picture a capture made (and deletes its temporary file). */
  takePicture(path: string): Promise<Uint8Array>;
}

export interface CapturedPicture {
  result: CaptureResult;
  bytes: Uint8Array;
  width: number;
  height: number;
  extension: "png" | "jpg";
}

export interface CaptureClient {
  listWindows(): Promise<Done<WindowInfo[]>>;
  listScreens(): Promise<Done<ScreenInfo[]>>;
  /** With `bringToFront`, the window is made the active one first, so its title bar is not drawn grey. */
  captureWindow(window: WindowInfo, options?: { bringToFront?: boolean }): Promise<Done<CapturedPicture>>;
  /** A rectangle in real screen pixels on the whole desktop. */
  captureRegion(region: Region): Promise<Done<CapturedPicture>>;
}

export function createCaptureClient(shell: Shell, timeoutMs: () => number = () => CAPTURE_TIMEOUT_MS): CaptureClient {
  /** One question to the helper. Every way it can fail comes back as a plain-words `Failure`, never as an exception. */
  async function ask(request: Record<string, unknown>, hideApp: boolean): Promise<Done<unknown>> {
    let outcome: ShellOutcome;
    try {
      outcome = await shell.run(request, { timeoutMs: timeoutMs(), hideApp });
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      return failure("app-error", `OpenExplainer could not reach the capture helper (${why}). ${UNCHANGED}`);
    }
    if (outcome.kind !== "reply") return failureFor(outcome);
    return outcome.reply.ok ? { ok: true, value: outcome.reply.result } : failureFromHelper(outcome.reply.error);
  }

  /** After a capture worked: collects the picture file and checks it really is a picture. */
  async function collect(result: CaptureResult): Promise<Done<CapturedPicture>> {
    let bytes: Uint8Array;
    try {
      bytes = await shell.takePicture(result.path);
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      return failure("picture-unreadable", `The picture was taken but could not be collected (${why}). ${UNCHANGED}`);
    }
    const info = readImageInfo(bytes);
    if (!info) return failure("picture-unreadable", `The picture the helper made could not be read as a PNG or JPEG. ${UNCHANGED}`);
    return { ok: true, value: { result, bytes, width: info.width, height: info.height, extension: info.extension } };
  }

  return {
    async listWindows() {
      const answer = await ask({ command: "list-windows" }, false);
      if (!answer.ok) return answer;
      const windows = (answer.value as { windows?: WindowInfo[] }).windows;
      return Array.isArray(windows)
        ? { ok: true, value: windows }
        : failure("unreadable", `The capture helper's list of windows could not be read. ${UNCHANGED}`);
    },

    async listScreens() {
      const answer = await ask({ command: "list-screens" }, false);
      if (!answer.ok) return answer;
      const screens = (answer.value as { screens?: ScreenInfo[] }).screens;
      return Array.isArray(screens) && screens.length
        ? { ok: true, value: screens }
        : failure("unreadable", `The capture helper's list of screens could not be read. ${UNCHANGED}`);
    },

    async captureWindow(window, options = {}) {
      const request: Record<string, unknown> = { command: "capture-window", window: window.id };
      if (options.bringToFront) request.activate = true;
      const answer = await ask(request, true);
      return answer.ok ? collect(answer.value as CaptureResult) : answer;
    },

    async captureRegion(region) {
      const answer = await ask({ command: "capture-region", x: region.x, y: region.y, width: region.width, height: region.height }, true);
      return answer.ok ? collect(answer.value as CaptureResult) : answer;
    },
  };
}
