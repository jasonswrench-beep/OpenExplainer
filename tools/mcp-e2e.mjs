// End-to-end test of the MCP server (run by Test MCP.bat): starts the real debug app with --mcp (no window), talks to it the way an AI assistant does (JSON lines on standard input and output), and checks what it does.
// It needs the Vite dev server (the debug app loads its pages from it); this starts one if none is running. Everything happens in a temporary folder.
import { spawn, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..").split(path.sep).join("/");
// By default the debug program is tried (it loads its pages from the dev server). Give OPENEXPLAINER_EXE to try a release program instead: it has its pages inside it, and keeps its MCP
// settings in the real config folder, so this test saves what was there and puts it back at the end.
const RELEASE = !!process.env.OPENEXPLAINER_EXE;
const EXE = process.env.OPENEXPLAINER_EXE ?? `${ROOT}/src-tauri/target/debug/openexplainer.exe`;
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "  PASS" : "  FAIL"}  ${what}`); if (!ok) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function viteUp() { try { return (await fetch("http://localhost:1420/mcp.html")).ok; } catch { return false; } }
let vite = null;
if (!RELEASE && !(await viteUp())) {
  vite = spawn("npm.cmd", ["run", "dev"], { cwd: ROOT, stdio: "ignore", shell: true });
  for (let i = 0; i < 60 && !(await viteUp()); i++) await sleep(1000);
}
check(RELEASE || (await viteUp()), RELEASE ? "(testing a release program, which needs no dev server)" : "the dev server is serving the hidden page");

const work = fs.mkdtempSync(path.join(os.tmpdir(), "oe-mcp-e2e-"));
const folder = path.join(work, "projects");
const config = RELEASE ? path.join(process.env.APPDATA, "org.openexplainer.app") : path.join(work, "config");
const savedSettings = RELEASE && fs.existsSync(path.join(config, "mcp.json")) ? fs.readFileSync(path.join(config, "mcp.json")) : null;
const profile = path.join(work, "webview");
fs.mkdirSync(folder, { recursive: true });
fs.mkdirSync(config, { recursive: true });

/** One run of the app as an MCP server. */
function start(settings) {
  fs.writeFileSync(path.join(config, "mcp.json"), JSON.stringify(settings));
  const child = spawn(EXE, ["--mcp"], { env: { ...process.env, ...(RELEASE ? {} : { OPENEXPLAINER_CONFIG_DIR: config }), WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "" }, stdio: ["pipe", "pipe", "pipe"] });
  const waiting = new Map();
  const stderr = [];
  let id = 0;
  createInterface({ input: child.stdout }).on("line", (line) => {
    let message; try { message = JSON.parse(line); } catch { stderr.push(`NOT JSON ON STDOUT: ${line.slice(0, 120)}`); return; }
    const w = waiting.get(message.id); if (w) { waiting.delete(message.id); w(message); }
  });
  createInterface({ input: child.stderr }).on("line", (line) => stderr.push(line));
  const request = (method, params = {}, ms = 120000) => new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { waiting.delete(n); reject(new Error(`no answer to ${method} in ${ms} ms`)); }, ms);
    waiting.set(n, (m) => { clearTimeout(timer); resolve(m); });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n");
  });
  const call = async (name, args = {}, ms) => {
    const m = await request("tools/call", { name, arguments: args }, ms);
    if (m.error) return { error: m.error, text: "", isError: true };
    return { text: m.result.content.map((c) => c.text ?? `[${c.type}]`).join("\n"), isError: m.result.isError === true, content: m.result.content };
  };
  return { child, request, call, stderr, notify: (method, params = {}) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n"), exited: new Promise((r) => child.on("exit", (code) => r(code))) };
}

// ---- MCP off: the assistant is refused, with the reason
{
  console.log("E1. MCP is off until the author turns it on");
  const s = start({ enabled: false, folder: "", allowFullScreen: false });
  const hello = await s.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e" } });
  check(hello.error && hello.error.code === -32000 && /MCP access is off/.test(hello.error.message), `an assistant is refused and told how to turn MCP on: ${hello.error?.message?.slice(0, 70)}`);
  s.child.stdin.end();
  check((await Promise.race([s.exited, sleep(15000).then(() => "stuck")])) === 0, "closing the line ends the program");
}

// ---- MCP on
console.log("E2. The assistant documents something: a project, topics, a page, picture details, the index, a guide, the check and exports");
const s = start({ enabled: true, folder, allowFullScreen: false });
const hello = await s.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e" } });
check(!hello.error && hello.result.serverInfo.name === "OpenExplainer" && /create_project/.test(hello.result.instructions), "it introduces itself and says how to begin");
s.notify("notifications/initialized");
const listed = await s.request("tools/list");
const names = listed.result.tools.map((t) => t.name);
check(["create_project", "set_page", "describe_picture", "export_book", "check_book", "update_index"].every((n) => names.includes(n)), `it lists its tools: ${names.length} of them`);
const visible = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File ${ROOT}/tools/list-app-windows.ps1`).toString().split(/\r?\n/).filter((l) => /visible=True/.test(l) && !/Tao Thread Event Target/.test(l));
check(visible.length === 0, `no window anyone can see is showing for the program: ${visible.join(" / ") || "none"}`);

let r = await s.call("create_project", { name: "Acme Draw guide" });
check(!r.isError && /Created and opened/.test(r.text), `a project is made: ${r.text.slice(0, 80)}`);
check(fs.existsSync(path.join(folder, "Acme Draw guide.openexplainer")), "and its file is in the chosen folder");
r = await s.call("create_project", { name: "Outside", file: "C:\\Windows\\Temp\\outside" });
check(r.isError && /not inside the folder/.test(r.text) && !fs.existsSync("C:\\Windows\\Temp\\outside.openexplainer"), "a file outside the folder is refused and nothing is written there");
await s.call("set_variables", { values: { PRODUCT: "Acme Draw", VERSION: "2.0" } });
const chapter = /id is (\w+)/.exec((await s.call("add_topic", { title: "Getting started" })).text)[1];
const topic = /id is (\w+)/.exec((await s.call("add_topic", { title: "Saving your work", parent_id: chapter })).text)[1];
r = await s.call("set_page", { topic_id: topic, blocks: [
  { type: "paragraph", text: "Press [[Save]] in {{PRODUCT}} to keep your **work** safe." },
  { type: "procedure", steps: [{ text: "Open the [[File]] menu.", result: "The menu opens." }, { text: "Click [[Save]]." }] },
  { type: "callout", kind: "caution", text: "Save before you close." },
] });
check(!r.isError && /now has 3 block/.test(r.text) && /Saved to/.test(r.text), `a page is written and saved: ${r.text.split("\n")[0]}`);
r = await s.call("get_topic", { topic_id: topic });
const got = JSON.parse(r.text);
check(got.page[0].text === "Press [[Save]] in {{PRODUCT}} to keep your **work** safe." && got.number === "1.1", "reading it back gives the same words with their marks");
r = await s.call("update_index", {});
check(/Updated: \d+ term\(s\) added/.test(r.text), `the index first pass: ${r.text.split("\n")[0]}`);
r = await s.call("create_guide", { name: "Saving guide", chapter_id: chapter });
check(/Made the guide/.test(r.text), `a guide: ${r.text.split("\n")[0]}`);
const guideId = JSON.parse((await s.call("list_guides")).text)[0].id;
r = await s.call("check_book", {});
check(!r.isError && typeof JSON.parse(r.text).summary === "string", `the book check answers: ${JSON.parse(r.text).summary}`);

// exports, made by the app's own code in the hidden window
for (const [kind, file, magic] of [["json", "out\\Acme json", "PK"], ["markdown", "out\\Acme md", "PK"], ["help-site", "out\\Acme site", "PK"], ["word", "out\\Acme", "PK"], ["pdf", "out\\Acme", "%PDF"], ["guide-word", "out\\Guide", "PK"], ["guide-pdf", "out\\Guide", "%PDF"]]) {
  r = await s.call("export_book", { kind, file, guide_id: guideId }, 180000);
  const ext = { json: "zip", markdown: "zip", "help-site": "zip", word: "docx", pdf: "pdf", "guide-word": "docx", "guide-pdf": "pdf" }[kind];
  const out = path.join(folder, `${file}.${ext}`);
  const ok = !r.isError && fs.existsSync(out);
  const head = ok ? fs.readFileSync(out).subarray(0, 4).toString("latin1") : "";
  check(ok && head.startsWith(magic) && fs.statSync(out).size > 300, `export ${kind} made a real file: ${ok ? `${fs.statSync(out).size} bytes, starts ${JSON.stringify(head)}` : r.text.slice(0, 160)}`);
}
check(!fs.existsSync("C:\\Windows\\Temp\\outside.openexplainer"), "(still nothing outside the folder)");
r = await s.call("export_book", { kind: "pdf", file: "C:\\Windows\\Temp\\x" });
check(r.isError && /not inside the folder/.test(r.text), "an export outside the folder is refused");

// a second assistant session opens the same project from the file
r = await s.call("open_project", { file: "Acme Draw guide" });
check(/Opened "Acme Draw guide" \(2 topics\)/.test(r.text), `the saved project opens again: ${r.text}`);
const logFile = path.join(folder, "OpenExplainer MCP log.txt");
const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
check(/create_project  OK  Created and opened/.test(log) && /create_project  REFUSED  That file name is not inside the folder/.test(log) && /export_book  OK  Made the pdf export/.test(log), `a plain log was kept beside the projects: ${log.split("\n").filter(Boolean).length} lines`);
check(!log.includes("Save before you close") && !log.includes("keep your work"), "and what was written on the pages is not in it");
check(!s.stderr.some((l) => l.startsWith("NOT JSON")), "nothing but protocol was written to standard output");
s.child.stdin.end();
check((await Promise.race([s.exited, sleep(20000).then(() => "stuck")])) === 0, "closing the line ends the program");
let gone = false; try { process.kill(s.child.pid, 0); } catch { gone = true; }
check(gone, "and it is gone");

if (vite) { try { execSync(`taskkill /F /T /PID ${vite.pid}`, { stdio: "ignore" }); } catch {} }
try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
if (RELEASE) { try { if (savedSettings) fs.writeFileSync(path.join(config, "mcp.json"), savedSettings); else fs.rmSync(path.join(config, "mcp.json")); } catch {} }
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
