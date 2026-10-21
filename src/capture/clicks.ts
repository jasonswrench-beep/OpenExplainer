// Click-by-click capture, from the app's side: turning what a session gave back into clicks the app can keep, and saying in plain
// words how it ended. The session itself is run by the shell (src-tauri/src/capture/clicks.rs) and the helper does the watching.
// Every click note is checked again here with the project's own rules, so a password box or text from a box can never get in.
import { cleanClick, describeClick } from "../project/clicks.ts";
import { readImageInfo } from "../project/image.ts";
import type { ClickInfo } from "../project/model.ts";

/** The helper's own limits, which the app uses when it does not ask for others (see `capture-helper/src/clicks.rs`). */
export const DEFAULT_IDLE_SECONDS = 600;
export const DEFAULT_MAX_CLICKS = 200;

/** Why a session ended. The first four are the helper's words; `helper-stopped` is the app noticing the helper ended by itself. */
export type SessionEnded = "stopped" | "idle" | "limit" | "hook-lost" | "helper-stopped";

/** What the shell hands back when a session is over. Each click is the helper's own line, which is not trusted until it is checked. */
export interface SessionOutcome {
  clicks: unknown[];
  skipped: number;
  ended: string;
}

/** One click that is ready to keep: its picture, and the note that goes beside it in the project. */
export interface ClickShot {
  /** The click's number in the session, from 1. */
  n: number;
  click: ClickInfo;
  bytes: Uint8Array;
  width: number;
  height: number;
  extension: "png" | "jpg";
  /** Something worth knowing about how this click was captured (Windows did not say what was clicked, and so on). */
  note?: string;
  /** Where the picture's screen is on the whole desktop, when the helper said (so a window's place can be found in the picture). */
  screen?: { x: number; y: number; width: number; height: number };
}

export interface ClickSession {
  shots: ClickShot[];
  /** Clicks the helper could not capture (they came too fast, or Windows would not copy the screen). */
  skipped: number;
  /** Clicks the app could not use: a picture that could not be collected, or a note that was not valid. */
  unusable: number;
  ended: SessionEnded;
}

/** The two ways the app needs to handle a picture file. The shell has both. */
export interface PictureFiles {
  takePicture(path: string): Promise<Uint8Array>;
  discard(path: string): Promise<void>;
}

const ENDED: SessionEnded[] = ["stopped", "idle", "limit", "hook-lost", "helper-stopped"];

/**
 * Collects every picture of a finished session and checks every click note. A click that cannot be used is counted and left out,
 * and its picture file is removed, so nothing is left behind in the temporary folder. The order of the session is kept.
 */
export async function collectSession(files: PictureFiles, outcome: SessionOutcome): Promise<ClickSession> {
  const shots: ClickShot[] = [];
  let unusable = 0;
  for (const raw of outcome.clicks) {
    const line = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const path = typeof line.path === "string" ? line.path : null;
    const click = cleanClick(line.click);
    if (!path) { unusable++; continue; }
    if (!click) {
      unusable++;
      try { await files.discard(path); } catch { /* already gone */ }
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = await files.takePicture(path);
    } catch {
      unusable++;
      try { await files.discard(path); } catch { /* already gone */ }
      continue;
    }
    const info = readImageInfo(bytes);
    if (!info) { unusable++; continue; }
    const note = typeof line.note === "string" && line.note.trim() ? line.note.trim() : undefined;
    const s = (typeof line.screen === "object" && line.screen !== null ? line.screen : {}) as Record<string, unknown>;
    const screen = [s.x, s.y, s.width, s.height].every((v) => typeof v === "number" && Number.isFinite(v)) ? { x: s.x as number, y: s.y as number, width: s.width as number, height: s.height as number } : undefined;
    shots.push({ n: typeof line.n === "number" ? line.n : shots.length + 1, click, bytes, width: info.width, height: info.height, extension: info.extension, ...(note ? { note } : {}), ...(screen ? { screen } : {}) });
  }
  const ended = ENDED.includes(outcome.ended as SessionEnded) ? (outcome.ended as SessionEnded) : "stopped";
  return { shots, skipped: Math.max(0, Math.round(outcome.skipped) || 0), unusable, ended };
}

function minutesOrSeconds(seconds: number): string {
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

/** What to tell the author about how the session ended, or `null` when they ended it themselves and there is nothing to say. */
export function describeEnded(ended: SessionEnded, limits: { idleSeconds?: number; maxClicks?: number } = {}): string | null {
  switch (ended) {
    case "stopped":
      return null;
    case "idle":
      return `The capture stopped by itself because there was no click for ${minutesOrSeconds(limits.idleSeconds ?? DEFAULT_IDLE_SECONDS)}.`;
    case "limit":
      return `The capture stopped by itself at the limit of ${limits.maxClicks ?? DEFAULT_MAX_CLICKS} clicks.`;
    case "hook-lost":
      return "Windows stopped the click watcher, so the capture ended early. Here is what it captured before that.";
    case "helper-stopped":
      return "The capture helper stopped unexpectedly, so the capture ended early. Here is what it captured before that.";
  }
}

/** What to tell the author about clicks that were lost, or `null` when none were. */
export function describeLost(skipped: number, unusable: number): string | null {
  const parts: string[] = [];
  if (skipped > 0) parts.push(`${skipped} click${skipped === 1 ? " was" : "s were"} not captured, because clicks came faster than the pictures could be saved or Windows would not copy the screen`);
  if (unusable > 0) parts.push(`${unusable} click${unusable === 1 ? " was" : "s were"} captured but could not be used, so ${unusable === 1 ? "it was" : "they were"} left out`);
  return parts.length ? `${parts.join(". ")}.` : null;
}

/** One click in plain words, for the review list and for a screen reader: what was clicked, and anything worth knowing. */
export function describeShot(shot: ClickShot): string {
  return describeClick(shot.click);
}
