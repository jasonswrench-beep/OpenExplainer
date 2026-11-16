// Asking the capture helper for things, from the app. The real route to the helper is the shell (src-tauri/src/capture.rs),
// reached through `shell`, so these functions can be tried with a pretend shell and no helper at all.
import { readImageInfo } from "../project/image.ts";
import {
  CAPTURE_TIMEOUT_MS, UNCHANGED, failure, failureFor, failureFromHelper,
  type CaptureResult, type Done, type ScreenInfo, type ShellOutcome, type WindowInfo,
} from "./outcome.ts";
import { collectSession, type ClickSession } from "./clicks.ts";
import { FRAMES_PER_REQUEST, RECORDING_TIMEOUT_MS, collectRecordingShots, parseRecording, stepLimit, type RecordingInfo, type RecordingShots } from "./recording.ts";
import type { Region } from "./region.ts";
import type { Rect } from "./selection.ts";

/** The app's way of running the helper. `tauri.ts` is the real one. */
export interface Shell {
  /** Runs the helper once with `request` and reports what happened. With `hideApp`, OpenExplainer hides and a Cancel window shows. */
  run(request: Record<string, unknown>, options: { timeoutMs: number; hideApp: boolean; delayMs?: number }): Promise<ShellOutcome>;
  /** Hands over the picture a capture made (and deletes its temporary file). */
  takePicture(path: string): Promise<Uint8Array>;
  /**
   * Takes a snapshot of a screen, shows it full screen for the author to choose a rectangle on, and reports the choice.
   * `screen` is where the screen is on the desktop; `initial` is the rectangle to start with, counted from the screen's corner.
   */
  select(request: { screen: ScreenArea; initial: Rect }, options: { timeoutMs: number; delayMs?: number }): Promise<ShellOutcome>;
  /** Deletes a temporary picture (the snapshot). */
  discard(path: string): Promise<void>;
  /**
   * Runs a click-by-click session: OpenExplainer hides, a Stop window shows, and every click is captured until the author stops it (or the
   * helper's idle time or click limit is reached). `idleSeconds` and `maxClicks` change the helper's own limits; leave them out for its defaults.
   */
  watchClicks(options: { idleSeconds?: number; maxClicks?: number }): Promise<ShellOutcome>;
}

/** Where a screen is on the whole desktop, with its size. */
export interface ScreenArea {
  x: number;
  y: number;
  width: number;
  height: number;
  number?: number;
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
  /**
   * With `bringToFront`, the window is made the active one first, so its title bar is not drawn grey. With `waitSeconds`,
   * OpenExplainer hides and counts down that long first, so the author can get the program ready.
   */
  captureWindow(window: WindowInfo, options?: { bringToFront?: boolean; waitSeconds?: number }): Promise<Done<CapturedPicture>>;
  /** A rectangle in real screen pixels on the whole desktop, after an optional wait. */
  captureRegion(region: Region, options?: { waitSeconds?: number }): Promise<Done<CapturedPicture>>;
  /**
   * The author drags out a rectangle on a snapshot of the screen, and the picture is cut from that snapshot, so it is exactly
   * what was chosen even if the screen changed. `rect` is counted from the screen's top left corner.
   */
  selectOnScreen(screen: ScreenInfo, initial: Rect, options?: { waitSeconds?: number }): Promise<Done<{ picture: CapturedPicture; rect: Rect }>>;
  /**
   * Captures every click until the author stops it. Each picture is the whole screen the click was on, taken just before the program
   * reacted, with a click note. A session with no clicks is fine and gives no shots. Whatever the session gave is kept even if it ended early.
   */
  watchClicks(options?: { idleSeconds?: number; maxClicks?: number }): Promise<Done<ClickSession>>;
  /**
   * Reads a recording made by another OpenStage tool (a folder whose name ends in .capture): its takes, and the clicks of one take (`take`, else the
   * newest that can be used). Shows no picture and takes a moment.
   */
  readRecording(folder: string, take?: number): Promise<Done<RecordingInfo>>;
  /**
   * Cuts a still picture out of the recording's video for each click of `info` (at most `limit`, and 200), a little before the click, and makes the
   * same shots a live click capture makes. Asks the helper for a few at a time; `onProgress` hears how far it has got.
   */
  recordingShots(folder: string, info: RecordingInfo, options?: { limit?: number; onProgress?: (done: number, total: number) => void }): Promise<Done<RecordingShots>>;
}

/** The wait, as the shell wants it: only said when there is one. */
function delayOption(waitSeconds: number | undefined): { delayMs?: number } {
  return waitSeconds && waitSeconds > 0 ? { delayMs: Math.round(waitSeconds * 1000) } : {};
}

export function createCaptureClient(shell: Shell, timeoutMs: () => number = () => CAPTURE_TIMEOUT_MS): CaptureClient {
  /** One question to the helper. Every way it can fail comes back as a plain-words `Failure`, never as an exception. */
  async function ask(request: Record<string, unknown>, hideApp: boolean, waitSeconds = 0, limitMs?: number): Promise<Done<unknown>> {
    let outcome: ShellOutcome;
    try {
      outcome = await shell.run(request, { timeoutMs: limitMs ?? timeoutMs(), hideApp, ...delayOption(waitSeconds) });
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      return failure("app-error", `OpenExplainer could not reach the capture helper (${why}). ${UNCHANGED}`);
    }
    if (outcome.kind === "selected" || outcome.kind === "clicks") return failure("app-error", `OpenExplainer got an answer it did not ask for. ${UNCHANGED}`);
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
      const answer = await ask(request, true, options.waitSeconds);
      return answer.ok ? collect(answer.value as CaptureResult) : answer;
    },

    async captureRegion(region, options = {}) {
      const answer = await ask({ command: "capture-region", x: region.x, y: region.y, width: region.width, height: region.height }, true, options.waitSeconds);
      return answer.ok ? collect(answer.value as CaptureResult) : answer;
    },

    async selectOnScreen(screen, initial, options = {}) {
      let outcome: ShellOutcome;
      try {
        const area = { x: screen.x, y: screen.y, width: screen.width, height: screen.height, number: screen.number };
        outcome = await shell.select({ screen: area, initial }, { timeoutMs: timeoutMs(), ...delayOption(options.waitSeconds) });
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        return failure("app-error", `OpenExplainer could not reach the capture helper (${why}). ${UNCHANGED}`);
      }
      // The snapshot step already succeeded when the shell says "selected"; a plain reply here is the helper refusing it.
      if (outcome.kind === "reply") {
        return outcome.reply.ok ? failure("unreadable", `The snapshot could not be used. ${UNCHANGED}`) : failureFromHelper(outcome.reply.error);
      }
      if (outcome.kind === "clicks") return failure("app-error", `OpenExplainer got an answer it did not ask for. ${UNCHANGED}`);
      if (outcome.kind !== "selected") return failureFor(outcome);
      const { snapshot, rect } = outcome;
      try {
        const cut = await ask({ command: "crop-picture", source: snapshot, x: rect.left, y: rect.top, width: rect.width, height: rect.height }, false);
        if (!cut.ok) return cut;
        const picture = await collect(cut.value as CaptureResult);
        return picture.ok ? { ok: true, value: { picture: picture.value, rect } } : picture;
      } finally {
        // The snapshot shows the author's whole screen, so it never stays behind.
        try { await shell.discard(snapshot); } catch { /* already gone */ }
      }
    },

    async watchClicks(options = {}) {
      let outcome: ShellOutcome;
      try {
        outcome = await shell.watchClicks(options);
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        return failure("app-error", `OpenExplainer could not reach the capture helper (${why}). ${UNCHANGED}`);
      }
      // A plain reply means the helper said no (for example, Windows would not let it watch the mouse): its words are already plain.
      if (outcome.kind === "reply") {
        return outcome.reply.ok ? failure("unreadable", `The capture helper's answer could not be used. ${UNCHANGED}`) : failureFromHelper(outcome.reply.error);
      }
      if (outcome.kind === "selected") return failure("app-error", `OpenExplainer got an answer it did not ask for. ${UNCHANGED}`);
      if (outcome.kind !== "clicks") return failureFor(outcome);
      return { ok: true, value: await collectSession(shell, outcome) };
    },

    async readRecording(folder, take) {
      const answer = await ask({ command: "read-recording", folder, ...(take === undefined ? {} : { take }) }, false);
      if (!answer.ok) return answer;
      const info = parseRecording(answer.value);
      return info ? { ok: true, value: info } : failure("unreadable", `The capture helper's answer about the recording could not be read. ${UNCHANGED}`);
    },

    async recordingShots(folder, info, options = {}) {
      if (info.take === null) return failure("nothing", `This recording has no take that can be brought in. ${UNCHANGED}`);
      const clicks = info.clicks.slice(0, stepLimit(info, options.limit ?? null));
      const total: RecordingShots = { shots: [], outside: 0, failed: 0 };
      for (let from = 0; from < clicks.length; from += FRAMES_PER_REQUEST) {
        const batch = clicks.slice(from, from + FRAMES_PER_REQUEST);
        const frames = batch.map((c) => ({ n: c.n, at_ms: c.pictureMs, x: c.click.x, y: c.click.y }));
        const answer = await ask({ command: "recording-frames", folder, take: info.take, frames }, false, 0, RECORDING_TIMEOUT_MS);
        // Pictures already cut stay out of the project: nothing is added unless the whole run worked.
        if (!answer.ok) return answer;
        const result = answer.value as { frames?: unknown[]; failed?: unknown[] };
        const made = await collectRecordingShots(shell, batch, Array.isArray(result.frames) ? result.frames : [], Array.isArray(result.failed) ? result.failed.length : 0);
        total.shots.push(...made.shots);
        total.outside += made.outside;
        total.failed += made.failed;
        options.onProgress?.(Math.min(from + batch.length, clicks.length), clicks.length);
      }
      total.shots.sort((a, b) => a.n - b.n);
      return { ok: true, value: total };
    },
  };
}
