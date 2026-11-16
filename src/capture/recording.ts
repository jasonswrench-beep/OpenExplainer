// Bringing in a recording that another OpenStage tool made (OpenStage Recorder or OpenStage Author): the shared capture format, C1.
// The helper reads the folder and cuts pictures out of its video with the shared core's own code (`capture-helper/src/recording.rs`);
// this file is the part that needs no screen: checking what the helper said, saying it in words, and turning pictures and click notes
// into the same `ClickShot`s a live click-by-click capture makes, so the review list, the callouts and everything after it are the same.
import { cleanClick } from "../project/clicks.ts";
import { readImageInfo } from "../project/image.ts";
import type { ClickInfo } from "../project/model.ts";
import type { ClickShot, PictureFiles } from "./clicks.ts";

/** The most pictures one request to the helper asks for. The helper refuses more than 40. */
export const FRAMES_PER_REQUEST = 20;
/** The most clicks brought in at once, the same safety limit a live session has. */
export const MOST_STEPS = 200;
/** A recording's pictures are decoded from video, so the helper is given longer than for a screen copy. */
export const RECORDING_TIMEOUT_MS = 90_000;

export interface RecordingTake {
  id: number;
  /** In words: "complete", "repaired after an interruption", "set aside", "not finished". */
  state: string;
  /** Finished, with a picture in it. Only these can be brought in. */
  usable: boolean;
  durationMs: number | null;
  /** Whether the take has a log of the clicks. Without one there are no steps to find. */
  hasClicks: boolean;
}

/** One click of a take. `click` is already cleaned with the project's own rules, and its position is a position in the picture. */
export interface RecordingClick {
  n: number;
  tMs: number;
  /** Where in the video the click's picture is taken from. */
  pictureMs: number;
  click: ClickInfo;
}

export interface RecordingInfo {
  title: string;
  language: string;
  takes: RecordingTake[];
  /** The take the clicks are from, or null when no take can be used. */
  take: number | null;
  durationMs: number | null;
  hasClicks: boolean;
  clicks: RecordingClick[];
  /** How many clicks the take has, which can be more than the list holds. */
  clickCount: number;
  truncated: boolean;
  /** Clicks left out because the log could not say where in the picture they were. */
  unplaced: number;
  /** Clicks of the back and forward buttons, which make no step. */
  otherButtons: number;
  /** Clicks the helper listed that could not be used (not valid notes). */
  invalid: number;
  /** A plain sentence from the helper about why there is nothing to bring in, when that is so. */
  note?: string;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0);

/** What the helper said about a recording, checked. `null` when it is not an answer this program knows how to read. */
export function parseRecording(raw: unknown): RecordingInfo | null {
  if (!isObject(raw) || !Array.isArray(raw.takes)) return null;
  const takes: RecordingTake[] = [];
  for (const t of raw.takes) {
    if (!isObject(t) || typeof t.id !== "number") return null;
    takes.push({
      id: t.id,
      state: typeof t.state === "string" ? t.state : "unknown",
      usable: t.usable === true,
      durationMs: typeof t.duration_ms === "number" ? t.duration_ms : null,
      hasClicks: t.has_clicks === true,
    });
  }
  takes.sort((a, b) => a.id - b.id);
  const clicks: RecordingClick[] = [];
  let invalid = 0;
  for (const c of Array.isArray(raw.clicks) ? raw.clicks : []) {
    if (!isObject(c)) { invalid++; continue; }
    const click = cleanClick(c.click);
    if (!click || typeof c.n !== "number" || typeof c.picture_ms !== "number") { invalid++; continue; }
    clicks.push({ n: c.n, tMs: count(c.t_ms), pictureMs: count(c.picture_ms), click });
  }
  const info: RecordingInfo = {
    title: typeof raw.title === "string" ? raw.title : "",
    language: typeof raw.language === "string" ? raw.language : "",
    takes,
    take: typeof raw.take === "number" ? raw.take : null,
    durationMs: typeof raw.duration_ms === "number" ? raw.duration_ms : null,
    hasClicks: raw.has_clicks === true,
    clicks,
    clickCount: count(raw.click_count),
    truncated: raw.truncated === true,
    unplaced: count(raw.unplaced),
    otherButtons: count(raw.other_buttons),
    invalid,
  };
  if (typeof raw.note === "string" && raw.note.trim()) info.note = raw.note.trim();
  return info;
}

/** A length of time in words, for a person: "1 minute 5 seconds", "40 seconds". */
export function timeWords(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const m = `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const s = `${seconds} second${seconds === 1 ? "" : "s"}`;
  if (minutes === 0) return s;
  return seconds === 0 ? m : `${m} ${s}`;
}

/** One take, as a line of a list: "Take 2, 1 minute 5 seconds, complete, 14 clicks noted". */
export function takeWords(take: RecordingTake): string {
  const length = take.durationMs === null ? "" : `, ${timeWords(take.durationMs)}`;
  const clicks = take.hasClicks ? ", has a click log" : ", no click log";
  return `Take ${take.id}${length}, ${take.state}${take.usable ? clicks : ", cannot be brought in"}`;
}

/** What was found in the chosen take, in plain words, for the dialog and for the assistant tool. */
export function describeRecording(info: RecordingInfo): string {
  if (info.take === null) return info.note ?? "This recording has no finished take with a picture in it, so there is nothing to bring in.";
  if (!info.hasClicks) return info.note ?? "This take has no log of the clicks, so there are no steps to find in it.";
  if (info.clickCount === 0) return "The click log of this take has no clicks in it that make a step.";
  const parts = [`${info.clickCount} click${info.clickCount === 1 ? "" : "s"} found in take ${info.take}${info.durationMs === null ? "" : ` (${timeWords(info.durationMs)})`}`];
  if (info.truncated) parts.push(`only the first ${info.clicks.length} are listed`);
  const doubles = info.clicks.filter((c) => c.click.double).length;
  if (doubles > 0) parts.push(`${doubles} ${doubles === 1 ? "is a double-click" : "are double-clicks"}, each one step`);
  const named = info.clicks.filter((c) => c.click.target?.name).length;
  parts.push(`${named} ${named === 1 ? "has" : "have"} the name of the item that was clicked`);
  return `${parts.join("; ")}.`;
}

/** Things the author should know about clicks that were left out, or null when none were. */
export function describeLeftOut(info: RecordingInfo): string | null {
  const parts: string[] = [];
  if (info.unplaced > 0) parts.push(`${info.unplaced} click${info.unplaced === 1 ? " was" : "s were"} left out because the log could not say where in the picture ${info.unplaced === 1 ? "it was" : "they were"}`);
  if (info.otherButtons > 0) parts.push(`${info.otherButtons} click${info.otherButtons === 1 ? "" : "s"} of the back or forward button ${info.otherButtons === 1 ? "makes" : "make"} no step`);
  if (info.invalid > 0) parts.push(`${info.invalid} click${info.invalid === 1 ? "" : "s"} could not be read`);
  return parts.length ? `${parts.join(". ")}.` : null;
}

/** The most clicks to bring in: what the author asked for, kept between 1 and what the take has (and the safety limit). */
export function stepLimit(info: RecordingInfo, asked: number | null): number {
  const most = Math.min(info.clicks.length, MOST_STEPS);
  if (asked === null || !Number.isFinite(asked)) return most;
  return Math.max(1, Math.min(Math.round(asked), most));
}

/** What the helper gave back for one picture. */
interface FrameLine {
  n: number;
  path: string;
  inside: boolean;
}

export interface RecordingShots {
  shots: ClickShot[];
  /** Clicks whose place was outside the picture (a click on another screen), left out. */
  outside: number;
  /** Pictures the helper could not cut, or that could not be read as pictures. */
  failed: number;
}

/**
 * Turns the pictures a batch gave back into shots. `clicks` are the clicks that batch asked for; `lines` is the helper's `frames` list.
 * A picture whose click was outside it is left out and its file removed; so is one that cannot be read. Nothing is left behind.
 */
export async function collectRecordingShots(files: PictureFiles, clicks: RecordingClick[], lines: unknown[], failedByHelper = 0): Promise<RecordingShots> {
  const byNumber = new Map(clicks.map((c) => [c.n, c]));
  const shots: ClickShot[] = [];
  let outside = 0;
  let failed = failedByHelper;
  const frames: FrameLine[] = [];
  for (const raw of lines) {
    if (!isObject(raw) || typeof raw.n !== "number" || typeof raw.path !== "string") { failed++; continue; }
    frames.push({ n: raw.n, path: raw.path, inside: raw.inside !== false });
  }
  frames.sort((a, b) => a.n - b.n);
  for (const frame of frames) {
    const click = byNumber.get(frame.n);
    const discard = async () => { try { await files.discard(frame.path); } catch { /* already gone */ } };
    if (!click) { failed++; await discard(); continue; }
    if (!frame.inside) { outside++; await discard(); continue; }
    let bytes: Uint8Array;
    try {
      bytes = await files.takePicture(frame.path);
    } catch {
      failed++;
      await discard();
      continue;
    }
    const info = readImageInfo(bytes);
    if (!info) { failed++; continue; }
    shots.push({ n: click.n, click: click.click, bytes, width: info.width, height: info.height, extension: info.extension });
  }
  return { shots, outside, failed };
}

/** What to tell the author about the pictures that were not made, or null when every click got one. */
export function describeNotCut(outside: number, failed: number): string | null {
  const parts: string[] = [];
  if (outside > 0) parts.push(`${outside} click${outside === 1 ? " was" : "s were"} outside the picture (on another screen), so ${outside === 1 ? "it was" : "they were"} left out`);
  if (failed > 0) parts.push(`${failed} picture${failed === 1 ? " could" : "s could"} not be cut out of the video, so ${failed === 1 ? "it was" : "they were"} left out`);
  return parts.length ? `${parts.join(". ")}.` : null;
}
