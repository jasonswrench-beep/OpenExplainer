// The page nobody sees: the app running for an AI assistant (`openexplainer.exe --mcp`). The shell (src-tauri/src/mcp.rs) hands it each line the assistant sent; it answers through the protocol
// in src/mcp/protocol.ts and the tools in src/mcp/tools.ts, which use the app's own code for everything (the project, the drawing of marks onto pictures, the exports, the PDF).
// It lets an assistant in only when the author turned MCP on in the app's settings, and the files it can reach are only inside the folder the author chose.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { exists, mkdir, readDir, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { createCaptureClient } from "../capture/client.ts";
import { captureTimeoutMs, tauriShell } from "../capture/tauri.ts";
import type { Done } from "../capture/outcome.ts";
import { makeExport } from "../export/make.ts";
import { flattenPicture, scaleToWidth } from "../render/flatten.ts";
import { isInside } from "./paths.ts";
import { LOG_FILE, withLog } from "./log.ts";
import { createServer } from "./protocol.ts";
import { createCaptureTools, type CaptureDeps, type ClickResult } from "./capture-tools.ts";
import { Session, type McpFiles, type McpSettings } from "./session.ts";
import { createTools, INSTRUCTIONS } from "./tools.ts";

const VERSION = "0.2.0";

const settings: McpSettings = { enabled: false, folder: "", allowWindows: false, allowFullScreen: false };

/**
 * Real files, and every path is checked to be inside the chosen folder first, whatever asked for it: by its name (no `..`), and then by where it really leads,
 * with links and junctions followed by the shell (mcp_real_path), so a junction inside the folder is not a way out of it (security review, 2026-11-13).
 */
async function guard(path: string): Promise<string> {
  if (!isInside(path, settings.folder)) throw new Error(`That path is outside the folder MCP may use (${settings.folder}).`);
  const [real, folder] = await Promise.all([invoke<string>("mcp_real_path", { path }), invoke<string>("mcp_real_path", { path: settings.folder })]);
  if (!isInside(real, folder)) throw new Error(`That path leads outside the folder MCP may use (${settings.folder}), through a link or a junction.`);
  return path;
}

const files: McpFiles = {
  read: async (path) => readFile(await guard(path)),
  write: async (path, bytes) => writeFile(await guard(path), bytes),
  exists: async (path) => exists(await guard(path)),
  list: async (folder) => (await readDir(await guard(folder))).map((e) => ({ name: e.name, isDirectory: e.isDirectory })),
  makeFolder: async (path) => mkdir(await guard(path), { recursive: true }),
  append: async (path, words) => writeFile(await guard(path), new TextEncoder().encode(words), { append: true }),
};

const session = new Session(settings, files);

/** MCP is for an assistant only once the author turned it on and chose a folder. Settings are read each time, so changing them in the app takes effect for the next assistant. */
async function gate(): Promise<string | null> {
  const fresh = await invoke<McpSettings>("mcp_settings_get");
  Object.assign(settings, fresh);
  if (!settings.enabled) return "MCP access is off. In OpenExplainer, open MCP access in the settings, turn it on and choose the folder projects may be kept in. Then ask again.";
  if (!settings.folder.trim()) return "MCP access is on but no folder is chosen. In OpenExplainer, choose the folder projects may be kept in.";
  return null;
}

// Capture goes through the same helper and shell the app's own Capture dialog uses.
const client = createCaptureClient(tauriShell, captureTimeoutMs);
const sure = <T>(done: Done<T>): T => {
  if (!done.ok) throw new Error(done.message);
  return done.value;
};
/** The click session that is running, so it can be stopped and its pictures collected. */
let clickSession: ReturnType<typeof client.watchClicks> | null = null;

const capture: CaptureDeps = {
  listWindows: async () => sure(await client.listWindows()),
  captureWindow: async (window, options) => {
    const picture = sure(await client.captureWindow(window, { bringToFront: options.bringToFront }));
    return { bytes: picture.bytes, width: picture.width, height: picture.height, extension: picture.extension };
  },
  captureRegion: async (region) => {
    const picture = sure(await client.captureRegion(region));
    return { bytes: picture.bytes, width: picture.width, height: picture.height, extension: picture.extension };
  },
  startClicks: async (options) => {
    const started = client.watchClicks(options);
    clickSession = started;
    // A session that cannot start (another capture is running, or the helper is missing) answers almost at once with the reason.
    const early = await Promise.race([started, new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200))]);
    if (early) {
      clickSession = null;
      if (!early.ok) throw new Error(early.message);
    }
  },
  stopClicks: async (): Promise<ClickResult> => {
    const session = clickSession;
    clickSession = null;
    await invoke("stop_clicks");
    if (!session) throw new Error("No click capture is running.");
    const ended = sure(await session);
    return { shots: ended.shots, skipped: ended.skipped, unusable: ended.unusable, ended: ended.ended };
  },
  clickCount: async () => (await invoke<{ count: number }>("click_session_status")).count,
  crop: async (picture, part) => {
    const bytes = await flattenPicture(picture.bytes, `picture.${picture.extension}`, part, null);
    return { bytes, width: part.width, height: part.height, extension: "png" };
  },
  forAssistant: (bytes, maxWidth) => scaleToWidth(bytes, "picture.png", maxWidth),
};

const tools = [
  ...createTools({
    session,
    exporter: (kind, options) => makeExport(session.require(), session.assets, kind, { ...options, flatten: flattenPicture, now: new Date().toISOString() }),
  }),
  ...createCaptureTools(session, capture),
];

// Every use of a tool is written to a plain log beside the projects, so the author can read afterwards what happened while nobody was watching.
const logged = withLog(tools, (line) => files.append(`${settings.folder}\\${LOG_FILE}`, `${line}\n`));

const server = createServer({ name: "OpenExplainer", version: VERSION, instructions: INSTRUCTIONS, tools: logged, gate });

await listen<string>("mcp-request", async (event) => {
  let answer: string | null;
  try {
    answer = await server.handle(event.payload);
  } catch (error) {
    // Something unexpected: the assistant is told, and the next message is still answered.
    answer = JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: `OpenExplainer had a problem: ${error instanceof Error ? error.message : String(error)}` } });
  }
  if (answer !== null) await invoke("mcp_reply", { line: answer });
});
await invoke("mcp_ready");
