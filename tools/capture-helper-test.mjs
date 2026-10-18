// Tries the capture helper by hand, in plain words. The "Test ... .bat" files run this.
//
//   node tools/capture-helper-test.mjs ping
//   node tools/capture-helper-test.mjs list
//   node tools/capture-helper-test.mjs capture [--title text] [--process name.exe] [--number N] [--out folder] [--no-open]
//
// It talks to the helper exactly as OpenExplainer will: one JSON line in, one JSON line out, with a
// timeout (20 seconds unless --timeout says otherwise) after which the helper is stopped.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const exe = join(root, "capture-helper", "target", "release", "openexplainer-capture.exe");
// The title the .bat files give their own window, so the test window does not clutter the list.
const TEST_WINDOW_TITLE = "OpenExplainer capture test";

const [mode, ...rest] = process.argv.slice(2);
const options = {};
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a === "--no-open") options.noOpen = true;
  else if (a.startsWith("--")) options[a.slice(2)] = rest[++i];
}
const timeoutSeconds = Number(options.timeout ?? 20);

function say(text = "") { console.log(text); }

function startHelper() {
  if (!existsSync(exe)) {
    say("The capture helper has not been built yet.");
    say("Double-click \"Test Helper.bat\" first. It builds the helper and tries it.");
    process.exit(2);
  }
  const child = spawn(exe, [], { stdio: ["pipe", "pipe", "inherit"], windowsHide: true });
  const waiting = new Map();
  let nextId = 1;
  let stopped = false;
  const fail = (message) => { for (const w of waiting.values()) { clearTimeout(w.timer); w.reject(new Error(message)); } waiting.clear(); };
  createInterface({ input: child.stdout }).on("line", (line) => {
    let reply;
    try { reply = JSON.parse(line); } catch { say(`The helper said something that is not a reply: ${line}`); return; }
    const w = waiting.get(reply.id);
    if (!w) return;
    waiting.delete(reply.id);
    clearTimeout(w.timer);
    w.resolve(reply);
  });
  child.on("exit", () => { if (!stopped) fail("The helper stopped unexpectedly."); });
  child.on("error", (e) => fail(`The helper could not start: ${e.message}`));
  return {
    ask(command, params = {}) {
      return new Promise((resolvePromise, reject) => {
        const id = nextId++;
        const timer = setTimeout(() => {
          waiting.delete(id);
          stopped = true;
          child.kill();
          reject(new Error(`The helper did not answer within ${timeoutSeconds} seconds, so it was stopped. Nothing was saved. (In OpenExplainer, this is where the project stays unchanged and you are told in plain words.)`));
        }, timeoutSeconds * 1000);
        waiting.set(id, { resolve: resolvePromise, reject, timer });
        child.stdin.write(JSON.stringify({ id, command, ...params }) + "\n");
      });
    },
    stop() { stopped = true; child.stdin.end(); },
  };
}

function windowLine(w, number) {
  const flags = [w.minimized ? "MINIMIZED" : "", w.not_responding ? "NOT RESPONDING" : ""].filter(Boolean).join(", ");
  return `${String(number).padStart(3)}. ${w.title}\n       ${w.process}  |  ${w.width} x ${w.height} at (${w.x}, ${w.y})  |  screen scale ${w.scale_percent}%${flags ? `  |  ${flags}` : ""}`;
}

async function listWindows(helper) {
  const reply = await helper.ask("list-windows");
  if (!reply.ok) { say(`The helper could not list the windows: ${reply.error.message}`); process.exitCode = 1; return null; }
  return reply.result.windows.filter((w) => !w.title.includes(TEST_WINDOW_TITLE));
}

function showList(windows) {
  say(`${windows.length} open window${windows.length === 1 ? "" : "s"} found (the one in front is first; this test window is left out):`);
  say();
  windows.forEach((w, i) => say(windowLine(w, i + 1)));
  say();
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((done) => {
    let answered = false;
    // If the keyboard input closes before an answer comes (nothing left to read), treat it as "just Enter" so the
    // test ends instead of waiting for ever.
    rl.on("close", () => { if (!answered) { console.log(); done(""); } });
    rl.question(question, (answer) => { answered = true; rl.close(); done(answer.trim()); });
  });
}

async function runPing(helper) {
  const reply = await helper.ask("ping");
  if (!reply.ok) { say(`The helper answered, but with a problem: ${reply.error.message}`); process.exitCode = 1; return; }
  const r = reply.result;
  say("The capture helper started and answered. The connection works.");
  say(`  Name:        ${r.helper}, version ${r.version}`);
  say(`  Running on:  ${r.os}, ${r.arch}`);
  say(`  Understands: ${r.commands.join(", ")}`);
}

async function runList(helper) {
  const windows = await listWindows(helper);
  if (windows) showList(windows);
}

async function runCapture(helper) {
  const windows = await listWindows(helper);
  if (!windows) return;
  let chosen;
  if (options.title || options.process || options.number) {
    if (options.number) chosen = windows[Number(options.number) - 1];
    else chosen = windows.find((w) =>
      (!options.title || w.title.toLowerCase().includes(options.title.toLowerCase())) &&
      (!options.process || w.process.toLowerCase() === options.process.toLowerCase()));
    if (!chosen) { say("No open window matches that. Here is what is open:"); say(); showList(windows); process.exitCode = 1; return; }
  } else {
    showList(windows);
    const answer = await ask("Type the number of the window to capture, then press Enter (just Enter to quit): ");
    if (!answer) { say("Nothing captured."); process.exitCode = 3; return; } // 3 = you chose to quit, not an error
    chosen = windows[Number(answer) - 1];
    if (!chosen) { say(`"${answer}" is not a number on the list.`); process.exitCode = 1; return; }
  }
  const folder = resolve(options.out ?? join(root, "Test captures"));
  const out = join(folder, `window-${stamp()}.png`);
  say(`Capturing "${chosen.title}" (${chosen.process}) ...`);
  const reply = await helper.ask("capture-window", { window: chosen.id, out });
  if (!reply.ok) {
    say();
    say("The capture did not work, and nothing was saved.");
    say(`  Why: ${reply.error.message}`);
    say(`  (Code for a bug report: ${reply.error.code}${reply.error.detail ? `; ${reply.error.detail}` : ""})`);
    process.exitCode = 1;
    return;
  }
  const r = reply.result;
  say();
  say("The picture was saved.");
  say(`  File:   ${r.path}  (${Math.round(statSync(r.path).size / 1024)} KB)`);
  say(`  Size:   ${r.width} x ${r.height} pixels, screen scale ${r.scale_percent}%`);
  say(`  Method: ${r.method}`);
  say(`  ${r.note}`);
  if (!options.noOpen) {
    say();
    say("Opening the picture so you can check it by eye ...");
    spawn("cmd", ["/c", "start", "", r.path], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  }
}

const modes = { ping: runPing, list: runList, capture: runCapture };
if (!modes[mode]) {
  say("Usage: node tools/capture-helper-test.mjs ping | list | capture");
  process.exit(2);
}
const helper = startHelper();
try {
  await modes[mode](helper);
} catch (e) {
  say(e.message);
  process.exitCode = 1;
} finally {
  helper.stop();
}
