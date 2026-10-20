// Tries the capture helper by hand, in plain words. The "Test ... .bat" files run this.
//
//   node tools/capture-helper-test.mjs ping
//   node tools/capture-helper-test.mjs list
//   node tools/capture-helper-test.mjs capture [--title text] [--process name.exe] [--number N] [--out folder] [--no-open]
//   node tools/capture-helper-test.mjs screens
//   node tools/capture-helper-test.mjs region [--screen N] [--rect "left top width height"] [--whole] [--out folder] [--no-open]
//   node tools/capture-helper-test.mjs clicks [--seconds N] [--out folder] [--no-open]
//
// It talks to the helper exactly as OpenExplainer will: one JSON line in, one JSON line out, with a
// timeout (20 seconds unless --timeout says otherwise) after which the helper is stopped.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
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

function startHelper(onEvent) {
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
    // Click-by-click capture sends lines of its own, with an "event" and no reply id.
    if (reply.event) { if (onEvent) onEvent(reply); return; }
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

// One reader for the whole run, so lines typed (or piped in) before a question is asked are not lost.
let input = null;
const typedLines = [];
const waitingForLine = [];
let inputEnded = false;

function startInput() {
  if (input) return;
  input = createInterface({ input: process.stdin });
  input.on("line", (line) => (waitingForLine.length ? waitingForLine.shift()(line) : typedLines.push(line)));
  input.on("close", () => { inputEnded = true; while (waitingForLine.length) waitingForLine.shift()(null); });
}

function closeInput() { if (input) input.close(); }

function ask(question) {
  startInput();
  process.stdout.write(question);
  return new Promise((done) => {
    // If the keyboard input closes before an answer comes (nothing left to read), that counts as "just Enter", so the
    // test ends instead of waiting for ever.
    const answer = (line) => { if (line === null) console.log(); done(line === null ? "" : line.trim()); };
    if (typedLines.length) answer(typedLines.shift());
    else if (inputEnded) answer(null);
    else waitingForLine.push(answer);
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

function screenLine(s) {
  return `${String(s.number).padStart(3)}. ${s.primary ? "Main screen" : "Screen"}: ${s.width} x ${s.height}, its top left corner is at (${s.x}, ${s.y}), screen scale ${s.scale_percent}%`;
}

async function listScreens(helper) {
  const reply = await helper.ask("list-screens");
  if (!reply.ok) { say(`The helper could not list the screens: ${reply.error.message}`); process.exitCode = 1; return null; }
  return reply.result.screens;
}

async function runScreens(helper) {
  const screens = await listScreens(helper);
  if (!screens) return;
  say(`${screens.length} screen${screens.length === 1 ? "" : "s"} found:`);
  say();
  screens.forEach((s) => say(screenLine(s)));
  say();
}

async function runRegion(helper) {
  const screens = await listScreens(helper);
  if (!screens) return;
  say(`${screens.length} screen${screens.length === 1 ? "" : "s"} found:`);
  say();
  screens.forEach((s) => say(screenLine(s)));
  say();
  let screen = screens[0];
  let rectText = options.rect;
  const scripted = Boolean(options.screen || options.rect || options.whole);
  if (options.screen) screen = screens[Number(options.screen) - 1];
  else if (!scripted && screens.length > 1) {
    const answer = await ask("Type the number of the screen to capture from, then press Enter (just Enter for screen 1): ");
    screen = answer ? screens[Number(answer) - 1] : screens[0];
  }
  if (!screen) { say("That is not a screen number on the list."); process.exitCode = 1; return; }
  let region;
  if (options.whole) {
    region = { x: screen.x, y: screen.y, width: screen.width, height: screen.height };
  } else {
    if (!rectText) {
      say(`Pick the rectangle, counted in pixels from the top left corner of screen ${screen.number}.`);
      say("Type four numbers: how far from the left, how far from the top, how wide and how tall (for example: 100 100 800 600).");
      rectText = await ask("Or type all for the whole screen, or just press Enter to quit: ");
      if (!rectText) { say("Nothing captured."); process.exitCode = 3; return; }
    }
    if (rectText.trim().toLowerCase() === "all") {
      region = { x: screen.x, y: screen.y, width: screen.width, height: screen.height };
    } else {
      const m = /^\s*(-?\d+)[\s,]+(-?\d+)[\s,]+(\d+)[\s,]+(\d+)\s*$/.exec(rectText);
      if (!m) { say(`"${rectText}" is not four whole numbers. Try again, for example: 100 100 800 600`); process.exitCode = 1; return; }
      region = { x: screen.x + Number(m[1]), y: screen.y + Number(m[2]), width: Number(m[3]), height: Number(m[4]) };
    }
  }
  const folder = resolve(options.out ?? join(root, "Test captures"));
  const out = join(folder, `region-${stamp()}.png`);
  say(`Capturing a ${region.width} x ${region.height} rectangle of screen ${screen.number} ...`);
  const reply = await helper.ask("capture-region", { ...region, out });
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
  say(`  Taken in ${r.elapsed_ms} ms. ${r.note}`);
  if (!options.noOpen) {
    say();
    say("Opening the picture so you can check it by eye ...");
    spawn("cmd", ["/c", "start", "", r.path], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  }
}

// ---- Click by click -----------------------------------------------------------------------------------------

function sayClick(e) {
  const c = e.click;
  const how = c.double ? "Double-click" : c.button === "left" ? "Click" : c.button === "right" ? "Right-click" : "Middle-click";
  const t = c.target;
  let what;
  if (t?.password) what = "a password box (nothing else about it is kept)";
  else if (t) {
    const keys = [t.acceleratorKey ? `shortcut ${t.acceleratorKey}` : "", t.accessKey ? `access key ${t.accessKey}` : ""].filter(Boolean).join(", ");
    what = `${t.role ? `the ${t.role}` : "an item"}${t.name ? ` "${t.name}"` : ""}${keys ? ` (${keys})` : ""}`;
  } else what = "something Windows did not describe";
  say(`${String(e.n).padStart(3)}. ${how} on ${what}`);
  say(`       at ${c.x} across, ${c.y} down in a ${e.width} x ${e.height} picture of the screen; the click was held back ${e.held_ms} ms to take it`);
  say(`       ${e.path}`);
  if (e.note) say(`       Note: ${e.note}`);
}

async function runClicks(helper, finished) {
  const seconds = Math.min(120, Math.max(5, Number(options.seconds ?? 20)));
  const folder = resolve(options.out ?? join(root, "Test captures"), `clicks-${stamp()}`);
  mkdirSync(folder, { recursive: true });
  say("For the next " + seconds + " seconds the helper will watch your mouse clicks. It never watches the keyboard.");
  say("Each click, on any program, is saved as a picture of the WHOLE screen the click was on, taken just before the program reacts,");
  say("with a note of what was clicked. A click on a password box is reported only as \"a password box\". Pictures go in:");
  say("  " + folder);
  say("They show everything on your screen, so delete them if they show anything private.");
  say();
  say("Click on a few things in other programs (try opening a menu and clicking an item). Press Enter here to stop early.");
  say();
  const started = await helper.ask("watch-clicks", { out_dir: folder, idle_seconds: seconds + 10 });
  if (!started.ok) { say(`Click capture could not start: ${started.error.message}`); process.exitCode = 1; return; }
  say(`Watching now (it ends by itself after ${seconds} seconds)...`);
  say();
  startInput();
  let stopNow;
  const early = new Promise((done) => { stopNow = done; });
  const timer = setTimeout(() => stopNow("time"), seconds * 1000);
  waitingForLine.push(() => stopNow("enter"));
  await Promise.race([early, finished.ended]);
  clearTimeout(timer);
  const stop = await helper.ask("stop-watching");
  if (!stop.ok) say(`The helper would not stop cleanly: ${stop.error.message}`);
  const ended = await Promise.race([finished.ended, new Promise((r) => setTimeout(() => r(null), 8000))]);
  say();
  if (!ended) { say("The helper did not say that it had finished within 8 seconds, so it was stopped."); process.exitCode = 1; return; }
  const count = ended.clicks;
  say(`Done. ${count} click${count === 1 ? "" : "s"} captured${ended.skipped ? `, ${ended.skipped} skipped` : ""}. The slowest click was held back ${ended.slowest_hold_ms} ms.`);
  say(`It ended because: ${{ stopped: "it was stopped, by you or when the time was up", idle: "there was no click for a while", limit: "it reached the most clicks it allows", "hook-lost": "Windows took the mouse watcher away" }[ended.ended] ?? ended.ended}.`);
  if (count === 0) { say("Nothing was captured, so the folder is empty."); process.exitCode = 3; return; }
  say(`The pictures are in: ${folder}  (${readdirSync(folder).length} files)`);
  if (!options.noOpen) spawn("explorer", [folder], { detached: true, stdio: "ignore" }).unref();
}

const modes = { ping: runPing, list: runList, capture: runCapture, screens: runScreens, region: runRegion, clicks: runClicks };
if (!modes[mode]) {
  say("Usage: node tools/capture-helper-test.mjs ping | list | capture | screens | region | clicks");
  process.exit(2);
}
// Click events arrive on their own, so they are shown as they come and the end of the session is noted.
let sessionEnded;
const finished = { ended: new Promise((done) => { sessionEnded = done; }) };
const helper = startHelper((e) => {
  if (e.event === "click") sayClick(e);
  else if (e.event === "skipped") say(`       (A click was skipped: ${e.message})`);
  else if (e.event === "ended") sessionEnded(e);
});
try {
  await modes[mode](helper, finished);
} catch (e) {
  say(e.message);
  process.exitCode = 1;
} finally {
  helper.stop();
  closeInput();
}
