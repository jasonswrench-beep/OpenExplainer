// The capture tools an AI assistant can use over MCP, so it can document a program with nobody at the keyboard: list the windows, capture one window, record the clicks it makes in one window, and look
// at a picture. The assistant does the clicking in the program itself (with its own tools); OpenExplainer watches and records, exactly as it does for a person: a picture from just before each click
// and a note of what was clicked, never anything typed. Because nobody is watching, capture is **by window only** unless the author allowed more in the MCP settings: a click session records only clicks
// inside the chosen window and keeps only that window's part of each picture, so a mail window or a password manager on the same screen never gets into a project. The Stop window of a click session
// and the Cancel window of any other capture stay visible, as they always do, so a person who comes back can stop it at once. The pictures are made by the helper (src/capture/); this file only asks.
import { addCalloutFromClick } from "../project/callouts.ts";
import { describeClick } from "../project/clicks.ts";
import type { ClickShot } from "../capture/clicks.ts";
import type { WindowInfo } from "../capture/outcome.ts";
import { findNode, type ClickInfo, type Picture, type Project, type TreeNode } from "../project/model.ts";
import { newId } from "../project/ids.ts";
import { forgetPicture } from "../project/page.ts";
import { pictureToJson } from "./blocks.ts";
import { text, type ToolContent, type ToolDef, type ToolResult } from "./protocol.ts";
import type { Session } from "./session.ts";

/** A part of a picture or of the desktop, in pixels. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A picture that was captured and is ready to keep. */
export interface Captured {
  bytes: Uint8Array;
  width: number;
  height: number;
  extension: "png" | "jpg";
}

/** A click session that finished: the shots, and what could not be used. */
export interface ClickResult {
  shots: (ClickShot & { screen?: Box })[];
  skipped: number;
  unusable: number;
  ended: string;
}

/** What the capture tools need from the app. The real one is in src/mcp/main.ts; a test gives a pretend one. */
export interface CaptureDeps {
  listWindows(): Promise<WindowInfo[]>;
  captureWindow(window: WindowInfo, options: { bringToFront: boolean }): Promise<Captured>;
  captureRegion(region: Box): Promise<Captured>;
  /** Starts a click session and returns at once; `stopClicks` ends it and gives what it captured. */
  startClicks(options: { maxClicks?: number; idleSeconds?: number }): Promise<void>;
  stopClicks(): Promise<ClickResult>;
  clickCount(): Promise<number>;
  /** The part of a picture, as a picture of its own. */
  crop(picture: Captured, part: Box): Promise<Captured>;
  /** A picture small enough to send to the assistant (a PNG no wider than `maxWidth`). */
  forAssistant(bytes: Uint8Array, maxWidth: number): Promise<Uint8Array>;
}

const FULL_SCREEN_OFF =
  "Capturing a part of the screen that is not one window is turned off. An assistant can capture one window at a time (list_windows, then capture_window). " +
  "The author can allow more in OpenExplainer, in MCP access.";

// ---- Which clicks, and which part of each picture ----------------------------------------------------------------

const intersect = (a: Box, b: Box): Box | null => {
  const left = Math.max(a.x, b.x), top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width), bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null;
};

/**
 * The window's part of one click picture, in that picture's own pixels, or `null` when the click was not inside the window. `window` is on the whole desktop and `screen` is where the picture's
 * screen is on the desktop (a picture of the main screen starts at 0, 0), so the window is moved into the picture before it is compared with the click.
 */
export function windowPartOfShot(shot: Pick<ClickShot, "click" | "width" | "height"> & { screen?: Box }, window: Box): Box | null {
  const origin = shot.screen ?? { x: 0, y: 0, width: shot.width, height: shot.height };
  const inPicture = intersect({ x: window.x - origin.x, y: window.y - origin.y, width: window.width, height: window.height }, { x: 0, y: 0, width: shot.width, height: shot.height });
  if (!inPicture) return null;
  const { x, y } = shot.click;
  return x >= inPicture.x && x < inPicture.x + inPicture.width && y >= inPicture.y && y < inPicture.y + inPicture.height ? inPicture : null;
}

/** A click note moved so it is counted from the corner of the part that was kept. What was clicked keeps its details; only its places move. */
export function clickInPart(click: ClickInfo, part: Box): ClickInfo {
  const moved: ClickInfo = { ...click, x: click.x - part.x, y: click.y - part.y };
  if (click.target?.bounds) {
    const b = click.target.bounds;
    const inside = intersect({ x: b.x - part.x, y: b.y - part.y, width: b.width, height: b.height }, { x: 0, y: 0, width: part.width, height: part.height });
    moved.target = { ...click.target };
    if (inside) moved.target.bounds = inside;
    else delete moved.target.bounds;
  }
  return moved;
}

// ---- Keeping a picture --------------------------------------------------------------------------------------------

/** Puts a captured picture in a topic's list of pictures (not on its page) and its file in the project. A click picture gets its first callout, from the item that was clicked. */
export function keepPicture(session: Session, node: TreeNode, picture: Captured, kind: Picture["source"]["kind"], options: { click?: ClickInfo; name?: string; alt?: string } = {}): Picture {
  const id = newId();
  const file = `images/${id}.${picture.extension}`;
  const record: Picture = {
    id, file, width: picture.width, height: picture.height, altText: options.alt?.trim() ?? "",
    source: { kind, capturedAt: new Date().toISOString(), ...(options.name ? { originalName: options.name } : {}) },
    ...(options.click ? { click: options.click } : {}),
  };
  session.assets.set(file, picture.bytes);
  node.pictures.push(record);
  if (options.click) addCalloutFromClick(record);
  return record;
}

const mime = (extension: string) => (extension === "png" ? "image/png" : "image/jpeg");

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

type Args = Record<string, unknown>;
const schema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });

function text1(args: Args, name: string): string | undefined {
  const v = args[name];
  return typeof v === "string" && v.trim() ? v : undefined;
}

function number(args: Args, name: string): number {
  const v = args[name];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${name} is needed, as a number.`);
  return Math.round(v);
}

function topicOf(project: Project, id: string | undefined): TreeNode {
  if (!id) throw new Error("topic_id is needed: the topic the pictures go into (get_outline lists them).");
  const node = findNode(project.tree, id);
  if (!node) throw new Error(`There is no topic with the id "${id}". get_outline lists the topics and their ids.`);
  return node;
}

/** The one window the assistant meant, by its title (a part of it is enough) or its id. */
function chooseWindow(windows: WindowInfo[], args: Args): WindowInfo {
  const id = typeof args.window_id === "number" ? args.window_id : undefined;
  const wanted = text1(args, "window_title")?.toLowerCase();
  if (id === undefined && !wanted) throw new Error("Say which window: window_title (a part of its title) or window_id. list_windows shows them.");
  const found = windows.filter((w) => (id !== undefined ? w.id === id : w.title.toLowerCase().includes(wanted!)));
  if (found.length === 0) throw new Error(`No open window matches ${id !== undefined ? `the id ${id}` : `"${wanted}"`}. The windows are: ${windows.map((w) => `"${w.title}" (${w.process})`).join("; ") || "none"}.`);
  if (found.length > 1) throw new Error(`More than one window matches "${wanted}": ${found.map((w) => `"${w.title}" (id ${w.id})`).join("; ")}. Use window_id, or more of the title.`);
  return found[0];
}

function windowJson(w: WindowInfo) {
  return { id: w.id, title: w.title, program: w.process, x: w.x, y: w.y, width: w.width, height: w.height, minimized: w.minimized, not_responding: w.not_responding };
}

/** What a click session is doing right now, if one is running. */
interface Running {
  topicId: string;
  /** The window the session is limited to, or `null` when the author allowed whole screens. */
  window: WindowInfo | null;
  startedAt: number;
}

export function createCaptureTools(session: Session, deps: CaptureDeps): ToolDef[] {
  let running: Running | null = null;

  const keep = async (): Promise<string> => (session.filePath ? `\nSaved to ${await session.save()}.` : "");

  return [
    {
      name: "list_windows",
      description: "The open windows an assistant may capture: id, title, program, where it is and how big. Minimized windows cannot be captured until they are restored.",
      inputSchema: schema({}),
      handler: async () => text(JSON.stringify((await deps.listWindows()).map(windowJson), null, 2)),
    },
    {
      name: "capture_window",
      description:
        "Captures one window and keeps the picture in a topic's list of pictures (it is not on the page until set_page uses it). Returns the picture's id and a small copy of the picture so you can see it. " +
        "Name the window with window_title (part of its title) or window_id.",
      inputSchema: schema({
        topic_id: str("The topic the picture goes into."), window_title: str("Part of the window's title."), window_id: num("The window's id from list_windows."),
        alt_text: str("What the picture shows, if you know already."), bring_to_front: { type: "boolean", description: "Make the window the active one first, so its title bar is not grey." },
      }, ["topic_id"]),
      handler: async (args) => {
        const project = session.require();
        const node = topicOf(project, text1(args, "topic_id"));
        const window = chooseWindow(await deps.listWindows(), args);
        if (running) throw new Error("A click capture is running. Stop it with stop_click_capture first.");
        const picture = await deps.captureWindow(window, { bringToFront: args.bring_to_front === true });
        const kept = keepPicture(session, node, picture, "window", { name: window.title, alt: text1(args, "alt_text") });
        const saved = await keep();
        return {
          content: [{ type: "text", text: `Captured "${window.title}" into "${node.title}" as picture ${kept.id} (${kept.width} by ${kept.height}).${saved}` }, await image(deps, picture.bytes)],
        };
      },
    },
    {
      name: "capture_region",
      description: "Captures a rectangle of the whole desktop. Turned off unless the author allowed it in the MCP settings, because it can show more than one program. Prefer capture_window.",
      inputSchema: schema({ topic_id: str("The topic the picture goes into."), x: num("Left edge on the desktop."), y: num("Top edge."), width: num("Width."), height: num("Height."), alt_text: str("What it shows.") }, ["topic_id", "x", "y", "width", "height"]),
      handler: async (args) => {
        const project = session.require();
        if (!session.settings.allowFullScreen) throw new Error(FULL_SCREEN_OFF);
        const node = topicOf(project, text1(args, "topic_id"));
        const region = { x: number(args, "x"), y: number(args, "y"), width: number(args, "width"), height: number(args, "height") };
        if (running) throw new Error("A click capture is running. Stop it with stop_click_capture first.");
        const picture = await deps.captureRegion(region);
        const kept = keepPicture(session, node, picture, "region", { alt: text1(args, "alt_text") });
        return { content: [{ type: "text", text: `Captured the region into "${node.title}" as picture ${kept.id}.${await keep()}` }, await image(deps, picture.bytes)] };
      },
    },
    {
      name: "start_click_capture",
      description:
        "Starts recording the clicks made in one window, until stop_click_capture. You then use the program yourself (click through the task); each click is recorded as a picture of the window from just before the click and a note of what was clicked " +
        "(never what you type). Clicks outside the window are ignored, and only the window's part of the picture is kept. It returns at once. A Stop window stays visible on the screen the whole time.",
      inputSchema: schema({
        topic_id: str("The topic the click pictures go into."), window_title: str("Part of the title of the window to record."), window_id: num("Or the window's id from list_windows."),
        max_clicks: num("Stop by itself after this many clicks (1 to 1000, default 200)."), idle_seconds: num("Stop by itself after this many seconds with no click (1 to 3600, default 600)."),
      }, ["topic_id"]),
      handler: async (args) => {
        const project = session.require();
        const node = topicOf(project, text1(args, "topic_id"));
        if (running) throw new Error(`A click capture is already running for the topic with the id ${running.topicId}. Stop it with stop_click_capture.`);
        let window: WindowInfo | null = null;
        if (!session.settings.allowFullScreen || args.window_title !== undefined || args.window_id !== undefined) {
          window = chooseWindow(await deps.listWindows(), args);
          if (window.minimized) throw new Error(`The window "${window.title}" is minimized. Restore it first, then start again.`);
        }
        const options = { maxClicks: typeof args.max_clicks === "number" ? Math.round(args.max_clicks) : undefined, idleSeconds: typeof args.idle_seconds === "number" ? Math.round(args.idle_seconds) : undefined };
        await deps.startClicks(options);
        running = { topicId: node.id, window, startedAt: Date.now() };
        return text(`Recording clicks${window ? ` in "${window.title}"` : " on the whole screen"} for "${node.title}". Use the program now, then call stop_click_capture. The Stop window is showing, so a person can stop it too.`);
      },
    },
    {
      name: "click_capture_status",
      description: "Whether a click capture is running, and how many clicks it has recorded so far.",
      inputSchema: schema({}),
      handler: async () => text(running ? `Recording${running.window ? ` in "${running.window.title}"` : ""}: ${await deps.clickCount()} click(s) so far, for ${Math.round((Date.now() - running.startedAt) / 1000)} seconds.` : "No click capture is running."),
    },
    {
      name: "stop_click_capture",
      description:
        "Stops recording and keeps the pictures: one for each click inside the window, in the topic's list of pictures, each with a note of what was clicked and a first callout at that item. " +
        "Returns the pictures in order with what was clicked, so you can write the steps. Use view_picture to look at one.",
      inputSchema: schema({}),
      handler: async () => {
        const project = session.require();
        if (!running) throw new Error("No click capture is running.");
        const job = running;
        running = null;
        const result = await deps.stopClicks();
        const node = findNode(project.tree, job.topicId);
        if (!node) throw new Error("The topic the pictures were for is gone, so they were not kept.");
        const kept: Picture[] = [];
        let outside = 0;
        const rect = job.window ? { x: job.window.x, y: job.window.y, width: job.window.width, height: job.window.height } : null;
        for (const shot of result.shots) {
          if (!rect) {
            kept.push(keepPicture(session, node, shot, "click", { click: shot.click, name: describeClick(shot.click).replace(/\.$/, "") }));
            continue;
          }
          const part = windowPartOfShot(shot, rect);
          if (!part) { outside++; continue; }
          const cropped = await deps.crop(shot, part);
          kept.push(keepPicture(session, node, cropped, "click", { click: clickInPart(shot.click, part), name: describeClick(shot.click).replace(/\.$/, "") }));
        }
        const saved = await keep();
        const notes = [
          `Stopped (${result.ended}). Kept ${kept.length} click picture(s) in "${node.title}".`,
          outside ? `${outside} click(s) were outside the window and were left out.` : "",
          result.skipped ? `${result.skipped} click(s) came too fast or could not be captured.` : "",
          result.unusable ? `${result.unusable} click(s) could not be used.` : "",
        ].filter(Boolean);
        return text(`${notes.join(" ")}${saved}\n${JSON.stringify(kept.map((p, i) => ({ step: i + 1, ...pictureToJson(p) })), null, 2)}`);
      },
    },
    {
      name: "view_picture",
      description: "Shows you one of a topic's pictures (a PNG no wider than max_width), so you can see what to write about it.",
      inputSchema: schema({ topic_id: str("The topic's id."), picture_id: str("The picture's id from get_topic."), max_width: num("The widest the copy may be, in pixels (default 1280).") }, ["topic_id", "picture_id"]),
      handler: async (args) => {
        const node = topicOf(session.require(), text1(args, "topic_id"));
        const picture = node.pictures.find((p) => p.id === text1(args, "picture_id"));
        if (!picture) throw new Error(`The topic "${node.title}" has no picture with the id "${String(args.picture_id)}". Its pictures are: ${node.pictures.map((p) => p.id).join(", ") || "none yet"}.`);
        const bytes = session.assets.get(picture.file);
        if (!bytes) throw new Error("That picture's file is missing from the project.");
        const wide = typeof args.max_width === "number" && args.max_width >= 100 ? Math.round(args.max_width) : 1280;
        return { content: [{ type: "text", text: JSON.stringify(pictureToJson(picture)) }, { type: "image", data: toBase64(await deps.forAssistant(bytes, wide)), mimeType: "image/png" }] };
      },
    },
    {
      name: "remove_picture",
      description: "Takes a picture out of a topic (and off its page). Use it for a capture that came out wrong.",
      inputSchema: schema({ topic_id: str("The topic's id."), picture_id: str("The picture's id.") }, ["topic_id", "picture_id"]),
      handler: async (args) => {
        const node = topicOf(session.require(), text1(args, "topic_id"));
        const id = text1(args, "picture_id");
        const at = node.pictures.findIndex((p) => p.id === id);
        if (at < 0) throw new Error(`The topic "${node.title}" has no picture with the id "${String(args.picture_id)}".`);
        const [gone] = node.pictures.splice(at, 1);
        session.assets.delete(gone.file);
        if (node.page) forgetPicture(node.page, gone.id);
        return text(`Removed the picture.${await keep()}`);
      },
    },
  ];
}

/** A small copy of a picture, for the assistant to look at. */
async function image(deps: CaptureDeps, bytes: Uint8Array): Promise<ToolContent> {
  return { type: "image", data: toBase64(await deps.forAssistant(bytes, 1280)), mimeType: mime("png") };
}

export type { ToolResult };
