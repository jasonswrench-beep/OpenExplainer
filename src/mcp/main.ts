// The page nobody sees: the app running for an AI assistant (`openexplainer.exe --mcp`). The shell (src-tauri/src/mcp.rs) hands it each line the assistant sent; it answers through the protocol
// in src/mcp/protocol.ts and the tools in src/mcp/tools.ts, which use the app's own code for everything (the project, the drawing of marks onto pictures, the exports, the PDF).
// It lets an assistant in only when the author turned MCP on in the app's settings, and the files it can reach are only inside the folder the author chose.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { exists, mkdir, readDir, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { makeExport } from "../export/make.ts";
import { flattenPicture } from "../render/flatten.ts";
import { isInside } from "./paths.ts";
import { createServer } from "./protocol.ts";
import { Session, type McpFiles, type McpSettings } from "./session.ts";
import { createTools, INSTRUCTIONS } from "./tools.ts";

const VERSION = "0.1.0";

const settings: McpSettings = { enabled: false, folder: "", allowFullScreen: false };

/** Real files, and every path is checked to be inside the chosen folder first, whatever asked for it. */
function guard(path: string): string {
  if (!isInside(path, settings.folder)) throw new Error(`That path is outside the folder MCP may use (${settings.folder}).`);
  return path;
}

const files: McpFiles = {
  read: (path) => readFile(guard(path)),
  write: (path, bytes) => writeFile(guard(path), bytes),
  exists: (path) => exists(guard(path)),
  list: async (folder) => (await readDir(guard(folder))).map((e) => ({ name: e.name, isDirectory: e.isDirectory })),
  makeFolder: (path) => mkdir(guard(path), { recursive: true }),
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

const tools = createTools({
  session,
  exporter: (kind, options) => makeExport(session.require(), session.assets, kind, { ...options, flatten: flattenPicture, now: new Date().toISOString() }),
});

const server = createServer({ name: "OpenExplainer", version: VERSION, instructions: INSTRUCTIONS, tools, gate });

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
