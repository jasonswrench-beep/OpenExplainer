import test from "node:test";
import assert from "node:assert/strict";
import { createCaptureClient, type Shell } from "../src/capture/client.ts";
import { checkRegionInput, regionName, screenLabel, screenName, wholeScreen } from "../src/capture/region.ts";
import { UNCHANGED, type ScreenInfo, type ShellOutcome, type WindowInfo } from "../src/capture/outcome.ts";

// The two screens of the author's PC: the main one, and one above it and 7 pixels to the right.
const main: ScreenInfo = { number: 1, x: 0, y: 0, width: 1920, height: 1080, primary: true, scale_percent: 100 };
const above: ScreenInfo = { number: 2, x: 7, y: -1080, width: 1920, height: 1080, primary: false, scale_percent: 100 };

const box = (left: string, top: string, width: string, height: string) => ({ left, top, width, height });

test("a rectangle on the main screen is passed on as it is", () => {
  const checked = checkRegionInput(main, box("100", "50", "400", "300"));
  assert.deepEqual(checked, { ok: true, region: { x: 100, y: 50, width: 400, height: 300 } });
});

test("a rectangle on the second screen is counted from that screen's own corner, so its desktop position is negative", () => {
  const checked = checkRegionInput(above, box("100", "50", "400", "300"));
  assert.deepEqual(checked, { ok: true, region: { x: 107, y: -1030, width: 400, height: 300 } });
});

test("the whole of either screen is a valid rectangle", () => {
  assert.deepEqual(checkRegionInput(main, wholeScreen(main)), { ok: true, region: { x: 0, y: 0, width: 1920, height: 1080 } });
  assert.deepEqual(checkRegionInput(above, wholeScreen(above)), { ok: true, region: { x: 7, y: -1080, width: 1920, height: 1080 } });
});

test("spaces around a number do not matter", () => {
  assert.equal(checkRegionInput(main, box(" 10 ", "20 ", " 30", "40")).ok, true);
});

test("an empty box or something that is not a whole number names the box and says what to type", () => {
  const empty = checkRegionInput(main, box("", "0", "10", "10"));
  assert.ok(!empty.ok && empty.field === "left" && /Type the distance from the left edge in pixels/.test(empty.message));
  for (const bad of ["12a", "-5", "1.5", "ten", "1,000"]) {
    const checked = checkRegionInput(main, box("0", "0", bad, "10"));
    assert.ok(!checked.ok && checked.field === "width", bad);
    if (!checked.ok) assert.match(checked.message, /whole number of pixels, such as 100/);
  }
  const huge = checkRegionInput(main, box("0", "0", "99999999", "10"));
  assert.ok(!huge.ok && /too large to fit on any screen/.test(huge.message));
});

test("a width or height of nothing is refused", () => {
  const a = checkRegionInput(main, box("0", "0", "0", "10"));
  assert.ok(!a.ok && a.field === "width" && /at least 1 pixel/.test(a.message));
  const b = checkRegionInput(main, box("0", "0", "10", "0"));
  assert.ok(!b.ok && b.field === "height");
});

test("a rectangle that reaches past an edge says which edge, how big the screen is, and what would fit", () => {
  const right = checkRegionInput(main, box("100", "0", "2000", "10"));
  assert.ok(!right.ok && right.field === "width");
  if (!right.ok) {
    assert.match(right.message, /reaches past the right edge of Screen 1, which is 1920 pixels wide/);
    assert.match(right.message, /Make the width 1820 or less/);
  }
  const bottom = checkRegionInput(above, box("0", "1000", "10", "200"));
  assert.ok(!bottom.ok && bottom.field === "height");
  if (!bottom.ok) assert.match(bottom.message, /past the bottom edge of Screen 2, which is 1080 pixels tall.*Make the height 80 or less/);
});

test("a starting point off the screen is refused", () => {
  const left = checkRegionInput(main, box("1920", "0", "10", "10"));
  assert.ok(!left.ok && left.field === "left" && /less than 1920/.test(left.message));
  const top = checkRegionInput(main, box("0", "1080", "10", "10"));
  assert.ok(!top.ok && top.field === "top");
});

test("screens and rectangles are named in words a person can follow", () => {
  assert.equal(screenName(above), "Screen 2");
  assert.equal(screenLabel(main), "Screen 1 (the main screen), 1920 by 1080 pixels");
  assert.equal(screenLabel(above), "Screen 2, 1920 by 1080 pixels");
  assert.equal(regionName(main, 100, 50, 800, 600), "Screen 1, 800 by 600 pixels, 100 from the left and 50 from the top");
});

// ---- the client's screens and rectangles ----

function pretend(outcome: ShellOutcome, picture: Uint8Array = pngBytes(40, 30)) {
  const asked: { request: Record<string, unknown>; hideApp: boolean }[] = [];
  const taken: string[] = [];
  const shell: Shell = {
    async run(request, options) { asked.push({ request, hideApp: options.hideApp }); return outcome; },
    async takePicture(path) { taken.push(path); return picture; },
    async select() { throw new Error("these tests do not choose on a snapshot"); },
    async discard() { /* nothing to delete */ },
  };
  return { shell, asked, taken };
}
function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}
const reply = (result: unknown): ShellOutcome => ({ kind: "reply", reply: { id: 1, ok: true, result } });
const result = { path: "C:\\temp\\a.png", width: 40, height: 30, method: "screen-copy", note: "n", scale_percent: 100, elapsed_ms: 20 };
const window1: WindowInfo = { id: 7, title: "T", process: "p.exe", pid: 1, x: 0, y: 0, width: 1, height: 1, minimized: false, not_responding: false, scale_percent: 100 };

test("listing screens asks without hiding the app", async () => {
  const { shell, asked } = pretend(reply({ screens: [main, above] }));
  const answer = await createCaptureClient(shell).listScreens();
  assert.deepEqual(answer, { ok: true, value: [main, above] });
  assert.deepEqual(asked, [{ request: { command: "list-screens" }, hideApp: false }]);
});

test("an empty or garbled list of screens is a failure, not a crash", async () => {
  assert.equal((await createCaptureClient(pretend(reply({ screens: [] })).shell).listScreens()).ok, false);
  assert.equal((await createCaptureClient(pretend(reply({})).shell).listScreens()).ok, false);
});

test("capturing a rectangle hides the app and sends the four numbers on the whole desktop", async () => {
  const { shell, asked, taken } = pretend(reply(result));
  const answer = await createCaptureClient(shell).captureRegion({ x: 107, y: -1030, width: 40, height: 30 });
  assert.ok(answer.ok);
  assert.deepEqual(asked, [{ request: { command: "capture-region", x: 107, y: -1030, width: 40, height: 30 }, hideApp: true }]);
  assert.deepEqual(taken, [result.path]);
  if (answer.ok) assert.deepEqual([answer.value.width, answer.value.height], [40, 30]);
});

test("a rectangle capture that fails gives plain words and never asks for a picture", async () => {
  const refusal: ShellOutcome = { kind: "reply", reply: { id: 1, ok: false, error: { code: "off-screen", message: "Part of that rectangle is not on any screen." } } };
  for (const outcome of [refusal, { kind: "timeout", seconds: 20 } as ShellOutcome, { kind: "cancelled" } as ShellOutcome]) {
    const { shell, taken } = pretend(outcome);
    const answer = await createCaptureClient(shell).captureRegion({ x: 0, y: 0, width: 5, height: 5 });
    assert.equal(answer.ok, false);
    if (!answer.ok) assert.ok(answer.message.includes(UNCHANGED), answer.message);
    assert.deepEqual(taken, []);
  }
});

test("asking for the window to be brought to the front is sent only when asked for", async () => {
  const off = pretend(reply(result));
  await createCaptureClient(off.shell).captureWindow(window1);
  assert.deepEqual(off.asked[0].request, { command: "capture-window", window: 7 });
  const on = pretend(reply(result));
  await createCaptureClient(on.shell).captureWindow(window1, { bringToFront: true });
  assert.deepEqual(on.asked[0].request, { command: "capture-window", window: 7, activate: true });
  const explicitlyOff = pretend(reply(result));
  await createCaptureClient(explicitlyOff.shell).captureWindow(window1, { bringToFront: false });
  assert.deepEqual(explicitlyOff.asked[0].request, { command: "capture-window", window: 7 });
});
