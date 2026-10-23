// Smoke test of the INSTALLED release app (not the dev build). It drives the real window over the WebView2 debugging port using only what a person could do on the page (clicks, typing, reading the screen);
// it imports nothing from the source, because a release app has none to import. Usage: node tools/release-smoke.mjs ["<install folder>"] (the default is the per-user install folder).
// It changes the AI help choice for a moment and puts it back; it makes nothing on disk. Use `Test Installed App.bat` to run it.
import { spawn, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const INSTALL = process.argv[2] ?? path.join(process.env.LOCALAPPDATA, "OpenExplainer");
const EXE = path.join(INSTALL, "openexplainer.exe");
const PORT = 9223;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, what) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failures++; };
const waitFor = async (fn, ms = 10000, every = 150) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(every); } return null; };

if (!fs.existsSync(EXE)) { console.log("no openexplainer.exe in " + INSTALL); process.exit(2); }
try { execSync("taskkill /F /IM openexplainer.exe /T", { stdio: "ignore" }); } catch { /* none running */ }
await sleep(1500);

const child = spawn(EXE, [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` }, stdio: "ignore", detached: false });
let exited = null;
child.on("exit", (code) => { exited = code; });

async function targets() { try { return await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { return []; } }
const target = await waitFor(async () => (await targets()).find((t) => t.type === "page" && /tauri\.localhost|localhost/.test(t.url) && !/click-bar|capture-bar|selection|mcp/.test(t.url)), 40000, 400);
check(!!target, `the installed app starts and shows its window (page ${target?.url})`);
if (!target) { console.log(`exited: ${exited}`); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const problems = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
  if (d.method === "Runtime.exceptionThrown") problems.push("exception: " + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 200));
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") problems.push("console error: " + d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200));
  if (d.method === "Log.entryAdded" && d.params.entry.level === "error") problems.push("log: " + d.params.entry.text.slice(0, 200) + " " + (d.params.entry.url ?? ""));
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "evaluation failed"); return r.result?.result?.value; };
await send("Runtime.enable"); await send("Log.enable");
const press = async (key, code, vk, text) => { await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) }); await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk }); await sleep(120); };
const typeText = async (text) => { await send("Input.insertText", { text }); await sleep(100); };
const dialogTitle = () => ev(`document.querySelector('dialog[open] h2')?.textContent ?? null`);
const openDialog = async (buttonId, title) => { await ev(`document.getElementById(${JSON.stringify(buttonId)}).click()`); return waitFor(async () => (await dialogTitle()) === title, 8000); };
const closeDialog = async () => { await press("Escape", "Escape", 27); await waitFor(async () => (await dialogTitle()) === null, 4000); };

process.on("uncaughtException", (e) => { console.log("  FAIL  the test itself stopped: " + String(e.message).slice(0, 300)); try { execSync("taskkill /F /IM openexplainer.exe /T", { stdio: "ignore" }); } catch {} process.exit(1); });
await sleep(1500);
const first = await ev(`({ title: document.title, heading: document.getElementById('project-heading')?.textContent ?? '', buttons: [...document.querySelectorAll('button[id]')].length, tauri: typeof window.__TAURI_INTERNALS__ })`);
check(first.buttons > 20 && first.tauri === "object", `the page is the whole editor and can reach the program: ${JSON.stringify(first)}`);
check(/OpenExplainer/.test(first.title) || /OpenExplainer/.test(first.heading), `its title says what it is: "${first.title}"`);

// ---- what is in the install folder
const present = (p) => fs.existsSync(path.join(INSTALL, p));
check(present("openexplainer-capture.exe"), "the capture helper is beside the program");
check(present("llama/llama-server.exe"), "the AI program (llama-server) is in the llama folder");
check(present("LICENSE.txt") && present("NOTICE.txt"), "the licence and the notices are installed");
check(present("llama/LICENSE-llama.cpp.txt"), "the AI program's own licence travels with it");

// ---- build a small book by hand
const dlgFill = async (value) => { await sleep(300); await ev(`(() => { const d = document.querySelector('dialog[open]'); d.querySelector('input').value = ${JSON.stringify(value)}; d.querySelector('button[value=ok]').click(); })()`); await sleep(400); };
await ev(`document.getElementById('b-chapter').click()`); await dlgFill("Smoke chapter");
await ev(`document.getElementById('b-topic').click()`); await dlgFill("Smoke topic");
check((await ev(`document.querySelectorAll('#tree li').length`)) >= 2, "a chapter and a topic can be made");
// ---- the Capture dialog lists real windows, which proves the helper starts from the install folder
check(!!(await openDialog("b-capture", "Capture")), "the Capture dialog opens");
await sleep(2500);
const cap = await ev(`(() => { const d = document.querySelector('dialog[open]'); const sel = [...d.querySelectorAll('select')].find((s) => s.options.length > 0); return { options: sel ? sel.options.length : 0, first: sel ? sel.options[0].textContent : '', text: d.textContent.replace(/\\s+/g, ' ').slice(0, 400) }; })()`);
check(cap.options > 0, `it lists the open windows (${cap.options}; first: ${cap.first}) ${cap.options > 0 ? "" : "| " + cap.text}`);
await closeDialog();

await ev(`document.querySelector('[data-add=paragraph]').click()`); await sleep(250);
await typeText("Choose [[Save as]] to keep the file. This is the smoke test paragraph.");
await ev(`document.querySelector('[data-add=procedure]').click()`); await sleep(250);
await typeText("Click [[OK]].");
const page = await ev(`({ blocks: document.querySelectorAll('#page-editor .block').length, dirty: /unsaved/.test(document.getElementById('project-heading').textContent) })`);
check(page.blocks === 2 && page.dirty, `a paragraph and a numbered procedure were added and the project says it has unsaved changes: ${JSON.stringify(page)}`);

// ---- the previews
for (const [tab, what] of [["tab-print", "print preview"], ["tab-help", "help site preview"], ["tab-guide", "guide preview"], ["tab-edit", "editor"]]) {
  await ev(`document.getElementById(${JSON.stringify(tab)}).click()`); await sleep(700);
  const shown = await ev(`document.body.innerText.length`);
  check(shown > 200, `the ${what} shows (${shown} letters on screen)`);
}
await ev(`document.getElementById('tab-print').click()`); await sleep(700);
check(/smoke test paragraph/.test(await ev(`document.body.innerText`)), "the print preview has the paragraph that was typed");
await ev(`document.getElementById('tab-edit').click()`); await sleep(400);

// ---- dialogs open and close by keyboard
for (const [button, title] of [["b-vars", "Project variables"], ["b-style", "Writing style"], ["b-check", "Check the book"], ["b-drafts", "Drafts"], ["b-index", "Index of the book"], ["b-guides", "Guides"], ["b-ai", "AI help"], ["b-mcp", "MCP access"], ["b-export", "Export"]]) {
  const opened = await openDialog(button, title);
  check(!!opened, `${title} opens`);
  if (opened) { await sleep(300); await closeDialog(); check((await dialogTitle()) === null, `and Escape closes ${title}`); }
  else { console.log("      dialog was: " + (await dialogTitle())); await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`); }
}

// ---- the book check finds the consistency notes, in the installed app
await openDialog("b-check", "Check the book"); await sleep(400);
const ck = await ev(`document.getElementById('ck-summary')?.textContent ?? ''`);
check(/thing|note|Nothing/.test(ck), `the book check answers: ${ck}`);
await closeDialog();

// ---- AI help: the model is on this PC, the program starts from the install folder, and a sentence comes back
const aiBefore = await ev(`window.__TAURI_INTERNALS__.invoke('ai_settings_get')`);
await ev(`window.__TAURI_INTERNALS__.invoke('ai_settings_set', { settings: { choice: 'builtin' } })`);
await openDialog("b-ai", "AI help"); await sleep(1500);
const ai = await ev(`document.querySelector('dialog[open]').textContent.replace(/\\s+/g, ' ')`);
const ready = /Ready/.test(ai);
check(ready, `AI help sees the downloaded model (${ready ? "Ready" : ai.slice(0, 200)})`);
if (ready) {
  const t0 = Date.now();
  await ev(`document.getElementById('ai-test').click()`);
  const answered = await waitFor(async () => { const t = await ev(`document.getElementById('ai-test-result')?.textContent ?? ''`); return /The built-in model answered in/.test(t) || /could not|did not|problem|too long|stopped/i.test(t) ? t : null; }, 150000, 1000);
  check(/The built-in model answered in/.test(answered ?? ""), `Test the AI gets an answer from the installed program in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${(answered ?? "no answer").slice(0, 260)}`);
}
await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
await ev(`window.__TAURI_INTERNALS__.invoke('ai_settings_set', { settings: ${JSON.stringify(aiBefore)} })`);
await ev(`window.__TAURI_INTERNALS__.invoke('ai_runtime_stop')`).catch(() => {});

check(problems.length === 0, `no error reached the page's console or log${problems.length ? ": " + [...new Set(problems)].slice(0, 6).join(" | ") : ""}`);

ws.close();
try { execSync("taskkill /F /IM openexplainer.exe /T", { stdio: "ignore" }); } catch { /* gone */ }
await sleep(1500);
// (tasklist combines its filters with AND, so each program is asked about on its own)
const running = (image) => { try { return execSync(`tasklist /FI "IMAGENAME eq ${image}" /NH`, { encoding: "utf8" }).toLowerCase().includes(image); } catch { return false; } };
check(!running("openexplainer-capture.exe"), "no capture helper is left running after the app is closed");
// The AI program is started by a small launcher that starts the real server, and the real server cannot be reached by OpenExplainer (Windows refuses every request to open it), so it ends on its own about
// 25 seconds after OpenExplainer is closed or killed. That is known (docs/release.md); the check is that it does end, and it says how long it took.
const t0 = Date.now();
const ended = await waitFor(async () => !running("llama-server.exe"), 60000, 500);
check(!!ended, `the AI program ends by itself after the app is closed (took ${((Date.now() - t0) / 1000).toFixed(0)} s; about 25 s is normal)`);
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
