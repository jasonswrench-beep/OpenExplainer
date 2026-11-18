import test from "node:test";
import assert from "node:assert/strict";
import { clickInPart, createCaptureTools, windowPartOfShot, type Box, type Captured, type CaptureDeps, type ClickResult } from "../src/mcp/capture-tools.ts";
import { Session, type McpFiles } from "../src/mcp/session.ts";
import { addNode, createProject, type ClickInfo } from "../src/project/model.ts";
import type { WindowInfo } from "../src/capture/outcome.ts";
import { parseRecording } from "../src/capture/recording.ts";

const FOLDER = "C:\\Docs\\OE";
const win = (id: number, title: string, x: number, y: number, width: number, height: number, extra: Partial<WindowInfo> = {}): WindowInfo => ({ id, title, process: "app.exe", pid: id, x, y, width, height, minimized: false, not_responding: false, scale_percent: 100, ...extra });

test("which clicks are in a window, and where the window is in each picture", () => {
  const w: Box = { x: 100, y: 50, width: 400, height: 300 };
  const shot = (x: number, y: number, screen?: Box) => ({ click: { x, y, button: "left" } as ClickInfo, width: 1920, height: 1080, ...(screen ? { screen } : {}) });
  assert.deepEqual(windowPartOfShot(shot(150, 100), w), { x: 100, y: 50, width: 400, height: 300 }, "a click inside the window: the window's part of the picture");
  assert.equal(windowPartOfShot(shot(50, 100), w), null, "left of the window");
  assert.equal(windowPartOfShot(shot(150, 400), w), null, "below the window");
  assert.equal(windowPartOfShot(shot(100, 50), w) !== null, true, "the corner counts");
  assert.equal(windowPartOfShot(shot(500, 100), w), null, "the right edge is outside");
  // a second screen to the right: the picture starts at 1920 on the desktop, and the window is on that screen
  const second = { x: 1920, y: 0, width: 1920, height: 1080 };
  assert.deepEqual(windowPartOfShot(shot(300, 200, second), { x: 2100, y: 100, width: 800, height: 600 }), { x: 180, y: 100, width: 800, height: 600 }, "the window is moved into the picture");
  assert.equal(windowPartOfShot(shot(10, 10, second), { x: 100, y: 100, width: 800, height: 600 }), null, "a window on the other screen is not in this picture");
  assert.deepEqual(windowPartOfShot(shot(1800, 500), { x: 1500, y: 100, width: 800, height: 600 }), { x: 1500, y: 100, width: 420, height: 600 }, "a window that reaches off the screen is cut to it");
  const click: ClickInfo = { x: 150, y: 100, button: "left", target: { name: "Save", role: "button", bounds: { x: 120, y: 90, width: 100, height: 30 } } };
  assert.deepEqual(clickInPart(click, { x: 100, y: 50, width: 400, height: 300 }), { x: 50, y: 50, button: "left", target: { name: "Save", role: "button", bounds: { x: 20, y: 40, width: 100, height: 30 } } }, "the click and the item's outline are counted from the window's corner");
  assert.equal(click.x, 150, "the original note is not changed");
  const cut = clickInPart({ x: 120, y: 60, button: "right", target: { role: "list item", bounds: { x: 50, y: 40, width: 100, height: 40 } } }, { x: 100, y: 50, width: 400, height: 300 });
  assert.deepEqual(cut.target?.bounds, { x: 0, y: 0, width: 50, height: 30 }, "an outline that reaches out of the window is cut to it");
  const gone = clickInPart({ x: 120, y: 60, button: "left", target: { role: "pane", bounds: { x: 0, y: 0, width: 50, height: 20 } } }, { x: 100, y: 50, width: 400, height: 300 });
  assert.equal(gone.target?.bounds, undefined, "an outline wholly outside is left out, the item's kind stays");
  assert.equal(gone.target?.role, "pane");
});

/** What the helper says about a recording with three clicks in it. */
let recording: unknown = {
  title: "Save a file", language: "en-US", schema_version: "0.2.5",
  takes: [{ id: 1, state: "complete", usable: true, duration_ms: 12000, has_picture: true, has_clicks: true }],
  take: 1, duration_ms: 12000, click_count: 3, truncated: false, unplaced: 0, other_buttons: 0, has_clicks: true,
  clicks: [
    // A recording's log says what was clicked, not how big it was: no click here has an outline.
    { n: 1, t_ms: 1200, picture_ms: 1100, click: { x: 640, y: 480, button: "left", target: { role: "button", name: "Save" } } },
    { n: 2, t_ms: 4000, picture_ms: 3900, click: { x: 700, y: 300, button: "right", target: { role: "list item" } } },
    { n: 3, t_ms: 6000, picture_ms: 5900, click: { x: 10, y: 10, button: "left", double: true } },
  ],
};

function setup(options: { full?: boolean; windows?: boolean } = {}) {
  const store = new Map<string, Uint8Array>();
  const files: McpFiles = {
    read: async (p) => store.get(p.toLowerCase())!, write: async (p, b) => { store.set(p.toLowerCase(), b); }, exists: async (p) => store.has(p.toLowerCase()), list: async () => [], makeFolder: async () => {}, append: async () => {},
  };
  const session = new Session({ enabled: true, folder: FOLDER, allowWindows: options.windows !== false, allowFullScreen: options.full === true }, files);
  const project = createProject("Capture test");
  const topic = addNode(project.tree, null, "Saving");
  session.project = project;
  session.filePath = `${FOLDER}\\capture.openexplainer`;
  const log: string[] = [];
  const windows = [win(1, "Notepad - notes.txt", 100, 50, 400, 300), win(2, "Notepad - other.txt", 600, 50, 400, 300), win(3, "Calculator", 50, 400, 300, 400), win(4, "Hidden thing", 0, 0, 100, 100, { minimized: true })];
  let session1: ClickResult | null = null;
  let count = 0;
  const deps: CaptureDeps = {
    listWindows: async () => windows,
    captureWindow: async (w, o) => { log.push(`capture ${w.title} front=${o.bringToFront}`); return { bytes: new Uint8Array([1, 2, 3]), width: w.width, height: w.height, extension: "png" }; },
    captureRegion: async (r) => { log.push(`region ${JSON.stringify(r)}`); return { bytes: new Uint8Array([4]), width: r.width, height: r.height, extension: "png" }; },
    startClicks: async (o) => { log.push(`start ${JSON.stringify(o)}`); },
    stopClicks: async () => { log.push("stop"); return session1 ?? { shots: [], skipped: 0, unusable: 0, ended: "stopped" }; },
    clickCount: async () => count,
    crop: async (_picture: Captured, part: Box) => { log.push(`crop ${JSON.stringify(part)}`); return { bytes: new Uint8Array([9, 9]), width: part.width, height: part.height, extension: "png" }; },
    forAssistant: async (b) => b,
    readRecording: async (folder, take) => {
      log.push(`read ${folder} take=${take}`);
      return parseRecording(recording)!;
    },
    recordingShots: async (folder, info, limit) => {
      log.push(`shots ${folder} limit=${limit}`);
      const shots = info.clicks.slice(0, limit ?? 200).map((c) => ({ n: c.n, click: c.click, bytes: new Uint8Array([7, c.n]), width: 1920, height: 1080, extension: "png" as const }));
      return { shots, outside: 0, failed: 0 };
    },
  };
  const tools = createCaptureTools(session, deps);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await tools.find((t) => t.name === name)!.handler(args).catch((e: Error) => ({ content: [{ type: "text" as const, text: e.message }], isError: true }));
    return { text: r.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n"), images: r.content.filter((c) => c.type === "image").length, isError: (r as { isError?: boolean }).isError === true };
  };
  return { session, topic, log, call, setSession: (r: ClickResult, n = 0) => { session1 = r; count = n; }, store, tools };
}

test("capture_window finds exactly one window by a part of its title, keeps the picture in the topic and shows it to the assistant", async () => {
  const { call, session, topic, log, tools } = setup();
  assert.ok(tools.every((t) => t.description.length > 20), "every tool says what it does");
  const listed = JSON.parse((await call("list_windows")).text);
  assert.deepEqual(listed.map((w: { title: string }) => w.title), ["Notepad - notes.txt", "Notepad - other.txt", "Calculator", "Hidden thing"]);
  const done = await call("capture_window", { topic_id: topic.id, window_title: "calc", alt_text: "  The calculator.  " });
  assert.equal(done.isError, false, done.text);
  assert.equal(done.images, 1, "a picture comes back for the assistant to see");
  assert.match(done.text, /Captured "Calculator" into "Saving" as picture \w+ \(300 by 400\)\./);
  assert.equal(topic.pictures.length, 1);
  // Kept under a plain name, never the window's title (security review, 2026-11-13); the assistant is still told which window it captured.
  assert.deepEqual([topic.pictures[0].source.kind, topic.pictures[0].source.originalName, topic.pictures[0].altText], ["window", "Window capture 1", "The calculator."]);
  assert.ok(session.assets.has(topic.pictures[0].file), "the picture's file is in the project");
  assert.ok(done.text.includes("Saved to"), "and it is saved at once");
  assert.equal(log[0], "capture Calculator front=false");
  const more = await call("capture_window", { topic_id: topic.id, window_title: "notepad" });
  assert.match(more.text, /More than one window matches "notepad": "Notepad - notes.txt" \(id 1\); "Notepad - other.txt" \(id 2\)\. Use window_id/);
  assert.equal((await call("capture_window", { topic_id: topic.id, window_id: 2, bring_to_front: true })).isError, false);
  assert.equal(log.at(-1), "capture Notepad - other.txt front=true");
  const none = await call("capture_window", { topic_id: topic.id, window_title: "excel" });
  assert.match(none.text, /No open window matches "excel". The windows are: "Notepad - notes.txt" \(app\.exe\)/);
  assert.match((await call("capture_window", { topic_id: topic.id })).text, /Say which window/);
  assert.match((await call("capture_window", { window_title: "calc" })).text, /topic_id is needed/);
  assert.match((await call("capture_window", { topic_id: "nope", window_title: "calc" })).text, /There is no topic with the id "nope"/);
  assert.equal(topic.pictures.length, 2, "a refused call keeps nothing");
});

test("capturing more than one window is off unless the author allowed it", async () => {
  const off = setup();
  const refused = await off.call("capture_region", { topic_id: off.topic.id, x: 0, y: 0, width: 100, height: 100 });
  assert.ok(refused.isError && /turned off/.test(refused.text) && /MCP access/.test(refused.text));
  assert.equal(off.log.length, 0, "nothing was captured");
  const on = setup({ full: true });
  const ok = await on.call("capture_region", { topic_id: on.topic.id, x: 10.4, y: 20, width: 300, height: 200, alt_text: "A part." });
  assert.equal(ok.isError, false, ok.text);
  assert.equal(on.log[0], 'region {"x":10,"y":20,"width":300,"height":200}');
  assert.equal(on.topic.pictures[0].source.kind, "region");
  assert.match((await on.call("capture_region", { topic_id: on.topic.id, x: "a", y: 0, width: 1, height: 1 })).text, /x is needed, as a number/);
});

test("a click capture records only the chosen window, keeps only its part of each picture, and each click picture gets a callout at what was clicked", async () => {
  const { call, topic, log, setSession, session } = setup();
  assert.match((await call("start_click_capture", { topic_id: topic.id })).text, /Say which window/, "with whole screens off, a window must be named");
  assert.match((await call("start_click_capture", { topic_id: topic.id, window_title: "hidden" })).text, /is minimized/);
  const started = await call("start_click_capture", { topic_id: topic.id, window_title: "calculator", max_clicks: 20, idle_seconds: 60 });
  assert.match(started.text, /Recording clicks in "Calculator" for "Saving"\. .*Stop window is showing/);
  assert.equal(log.at(-1), 'start {"maxClicks":20,"idleSeconds":60}');
  assert.match((await call("start_click_capture", { topic_id: topic.id, window_title: "calculator" })).text, /already running/);
  assert.match((await call("capture_window", { topic_id: topic.id, window_title: "notepad - n" })).text, /click capture is running/);
  setSession({
    ended: "stopped", skipped: 1, unusable: 0,
    shots: [
      { n: 1, width: 1920, height: 1080, bytes: new Uint8Array([1]), extension: "png", click: { x: 100, y: 450, button: "left", target: { name: "7", role: "button", bounds: { x: 80, y: 430, width: 40, height: 40 } } } },
      { n: 2, width: 1920, height: 1080, bytes: new Uint8Array([2]), extension: "png", click: { x: 1500, y: 900, button: "left", target: { role: "pane" } } },
      { n: 3, width: 1920, height: 1080, bytes: new Uint8Array([3]), extension: "png", click: { x: 200, y: 600, button: "right", target: { name: "Equals", role: "button" } } },
    ],
  }, 3);
  assert.match((await call("click_capture_status")).text, /Recording in "Calculator": 3 click\(s\) so far/);
  const stopped = await call("stop_click_capture");
  assert.equal(stopped.isError, false, stopped.text);
  assert.match(stopped.text, /^Stopped \(stopped\)\. Kept 2 click picture\(s\) in "Saving"\. 1 click\(s\) were outside the window and were left out\. 1 click\(s\) came too fast or could not be captured\./);
  assert.equal(log.filter((l) => l.startsWith("crop")).length, 2);
  assert.equal(log.find((l) => l.startsWith("crop")), 'crop {"x":50,"y":400,"width":300,"height":400}', "the picture is cut to the window");
  assert.equal(topic.pictures.length, 2);
  const [first, second] = topic.pictures;
  assert.deepEqual([first.width, first.height, first.source.kind], [300, 400, "click"]);
  assert.deepEqual(first.click, { x: 50, y: 50, button: "left", target: { name: "7", role: "button", bounds: { x: 30, y: 30, width: 40, height: 40 } } }, "the click is counted from the window's corner");
  assert.equal(first.callouts?.length, 1, "a callout at the item that was clicked");
  assert.equal(first.callouts![0].name, "7");
  assert.deepEqual([second.click?.x, second.click?.y, second.click?.button], [150, 200, "right"]);
  assert.ok(session.assets.has(first.file) && session.assets.has(second.file), "the pictures' files are in the project");
  assert.deepEqual(JSON.parse(stopped.text.slice(stopped.text.indexOf("\n[") + 1)).map((s: { step: number }) => s.step), [1, 2], "the assistant gets the steps in order");
  assert.match((await call("stop_click_capture")).text, /No click capture is running/);
  assert.match((await call("click_capture_status")).text, /No click capture is running/);
});

test("with whole screens allowed a click capture needs no window, and keeps the whole pictures", async () => {
  const { call, topic, log, setSession } = setup({ full: true });
  assert.equal((await call("start_click_capture", { topic_id: topic.id })).isError, false);
  setSession({ ended: "idle", skipped: 0, unusable: 0, shots: [{ n: 1, width: 1920, height: 1080, bytes: new Uint8Array([1]), extension: "png", click: { x: 10, y: 10, button: "left" } }] });
  const stopped = await call("stop_click_capture");
  assert.match(stopped.text, /^Stopped \(idle\)\. Kept 1 click picture\(s\)/);
  assert.equal(log.filter((l) => l.startsWith("crop")).length, 0);
  assert.equal(topic.pictures[0].width, 1920);
});

test("a topic's picture can be looked at and removed", async () => {
  const { call, topic, session } = setup();
  await call("capture_window", { topic_id: topic.id, window_title: "calc" });
  const id = topic.pictures[0].id;
  const seen = await call("view_picture", { topic_id: topic.id, picture_id: id, max_width: 640 });
  assert.equal(seen.images, 1);
  assert.match((await call("view_picture", { topic_id: topic.id, picture_id: "nope" })).text, /has no picture with the id "nope". Its pictures are: /);
  const file = topic.pictures[0].file;
  assert.match((await call("remove_picture", { topic_id: topic.id, picture_id: id })).text, /^Removed the picture\./);
  assert.equal(topic.pictures.length, 0);
  assert.equal(session.assets.has(file), false);
  assert.match((await call("remove_picture", { topic_id: topic.id, picture_id: id })).text, /has no picture/);
});

test("with capturing not allowed, an assistant sees no window titles and captures nothing, and is told how the author can allow it", async () => {
  const { call, topic, log } = setup({ windows: false, full: true });
  for (const [name, args] of [
    ["list_windows", {}],
    ["capture_window", { topic_id: topic.id, window_title: "calc" }],
    ["capture_region", { topic_id: topic.id, x: 0, y: 0, width: 100, height: 100 }],
    ["start_click_capture", { topic_id: topic.id, window_title: "notepad - notes" }],
  ] as const) {
    const answer = await call(name, args);
    assert.equal(answer.isError, true, name);
    assert.match(answer.text, /^Capturing is turned off: an assistant may not see or capture the windows on this PC\..*Let an assistant capture windows/, name);
    assert.ok(!answer.text.includes("Notepad") && !answer.text.includes("Calculator"), `${name} names no window`);
  }
  assert.equal(topic.pictures.length, 0);
  assert.deepEqual(log, [], "the capture helper was never asked for anything");
});

test("import_recording brings in a picture and a note for each click of a recording inside the MCP folder, with a first callout, and works with capture off", async () => {
  const { call, topic, log, session } = setup({ windows: false });
  const done = await call("import_recording", { topic_id: topic.id, folder: `${FOLDER}\\Save a file.capture` });
  assert.equal(done.isError, false, done.text);
  assert.match(done.text, /Brought in 3 click picture\(s\) from take 1 of "Save a file" into "Saving"\./);
  assert.ok(done.text.includes("Saved to"));
  assert.deepEqual(log, [`read ${FOLDER}\\Save a file.capture take=undefined`, `shots ${FOLDER}\\Save a file.capture limit=undefined`]);
  assert.deepEqual(topic.pictures.map((p) => p.source.kind), ["click", "click", "click"]);
  assert.equal(topic.pictures[0].source.originalName, 'Click on the button "Save"');
  // The recording has no outline of any clicked item, so each picture's first callout is a small box round its click; only the button keeps a name.
  assert.deepEqual(topic.pictures.map((p) => (p.callouts ?? []).length), [1, 1, 1], "every click picture gets a first callout");
  assert.deepEqual(topic.pictures.map((p) => p.callouts![0].name), ["Save", "", ""]);
  assert.deepEqual(topic.pictures[0].callouts![0].target, { x: 640 - 48, y: 480 - 48, width: 96, height: 96 });
  assert.deepEqual(topic.pictures[2].callouts![0].target, { x: 0, y: 0, width: 58, height: 58 }, "a click near the corner: the box is cut to the picture");
  assert.equal(topic.pictures[2].click?.double, true);
  assert.ok(topic.pictures.every((p) => session.assets.has(p.file)));
  assert.equal(JSON.stringify(topic.pictures).includes("Save a file.capture"), false, "the folder's name is not kept in the project");
});

test("import_recording takes a take and a limit, and refuses a folder outside the MCP folder or a topic that is not there", async () => {
  const { call, topic, log } = setup();
  const some = await call("import_recording", { topic_id: topic.id, folder: `${FOLDER}\\r.capture`, take: 1, limit: 2 });
  assert.equal(some.isError, false, some.text);
  assert.equal(topic.pictures.length, 2);
  assert.deepEqual(log, [`read ${FOLDER}\\r.capture take=1`, `shots ${FOLDER}\\r.capture limit=2`]);
  assert.match(some.text, /only the first 2 were asked for/);
  const outside = await call("import_recording", { topic_id: topic.id, folder: "C:\\Other\\r.capture" });
  assert.ok(outside.isError && /not inside the folder MCP may use/.test(outside.text));
  assert.equal(log.length, 2, "nothing was read from outside");
  assert.match((await call("import_recording", { topic_id: "nope", folder: `${FOLDER}\\r.capture` })).text, /There is no topic with the id "nope"/);
  assert.match((await call("import_recording", { folder: `${FOLDER}\\r.capture` })).text, /topic_id is needed/);
});

test("import_recording says why there is nothing to bring in, and adds nothing", async () => {
  const { call, topic } = setup();
  recording = { title: "Talk", language: "en-US", takes: [{ id: 1, state: "complete", usable: true, duration_ms: 5000, has_picture: true, has_clicks: false }], take: 1, duration_ms: 5000, clicks: [], click_count: 0, has_clicks: false, note: "This take has no log of the clicks (it was recorded with interaction notes off), so there are no steps to find in it." };
  const none = await call("import_recording", { topic_id: topic.id, folder: `${FOLDER}\\talk.capture` });
  assert.equal(none.isError, false);
  assert.match(none.text, /no log of the clicks.*Nothing was added\./);
  assert.equal(topic.pictures.length, 0);
});
