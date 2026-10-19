import test from "node:test";
import assert from "node:assert/strict";
import { createCaptureClient, type Shell } from "../src/capture/client.ts";
import { MOST_WAIT_SECONDS, checkWait, describeWait } from "../src/capture/wait.ts";
import type { ScreenInfo, ShellOutcome, WindowInfo } from "../src/capture/outcome.ts";

test("a whole number of seconds from 0 to 60 is a good wait, and an empty box means no wait", () => {
  assert.deepEqual(checkWait("5"), { ok: true, seconds: 5 });
  assert.deepEqual(checkWait(" 10 "), { ok: true, seconds: 10 });
  assert.deepEqual(checkWait("0"), { ok: true, seconds: 0 });
  assert.deepEqual(checkWait("60"), { ok: true, seconds: 60 });
  assert.deepEqual(checkWait(""), { ok: true, seconds: 0 });
  assert.deepEqual(checkWait("   "), { ok: true, seconds: 0 });
  assert.equal(MOST_WAIT_SECONDS, 60);
});

test("anything else is explained in plain words", () => {
  for (const bad of ["ten", "-5", "2.5", "5 s", "1,000", "0x10"]) {
    const checked = checkWait(bad);
    assert.equal(checked.ok, false, bad);
    if (!checked.ok) assert.match(checked.message, /whole number of seconds from 0 to 60, such as 5/, bad);
  }
  const tooLong = checkWait("61");
  assert.ok(!tooLong.ok && /longest wait is 60 seconds\. Type a number from 0 to 60\./.test(tooLong.message));
  assert.ok(!checkWait("99999999999999").ok);
});

test("a wait is said in words", () => {
  assert.equal(describeWait(0), "no wait");
  assert.equal(describeWait(1), "1 second");
  assert.equal(describeWait(5), "5 seconds");
});

// ---- the client passes the wait on, and only when there is one ----

const screen: ScreenInfo = { number: 1, x: 0, y: 0, width: 1920, height: 1080, primary: true, scale_percent: 100 };
const window1: WindowInfo = { id: 7, title: "T", process: "p.exe", pid: 1, x: 0, y: 0, width: 1, height: 1, minimized: false, not_responding: false, scale_percent: 100 };

function png(): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, 10);
  new DataView(bytes.buffer).setUint32(20, 10);
  return bytes;
}

function pretend() {
  const asked: { request: Record<string, unknown>; options: Record<string, unknown> }[] = [];
  const selects: Record<string, unknown>[] = [];
  const reply: ShellOutcome = { kind: "reply", reply: { id: 1, ok: true, result: { path: "C:\\t\\a.png", width: 10, height: 10, method: "screen-copy", note: "n", scale_percent: 100, elapsed_ms: 1, windows: [], screens: [screen] } } };
  const shell: Shell = {
    async run(request, options) { asked.push({ request, options }); return reply; },
    async takePicture() { return png(); },
    async select(_request, options) { selects.push(options); return { kind: "cancelled" }; },
    async discard() { /* nothing */ },
  };
  return { shell, asked, selects };
}

test("a wait is sent to the shell in milliseconds for each kind of capture", async () => {
  const { shell, asked, selects } = pretend();
  const client = createCaptureClient(shell, () => 20_000);
  await client.captureWindow(window1, { waitSeconds: 5 });
  await client.captureRegion({ x: 0, y: 0, width: 5, height: 5 }, { waitSeconds: 3 });
  await client.selectOnScreen(screen, { left: 0, top: 0, width: 5, height: 5 }, { waitSeconds: 10 });
  assert.deepEqual(asked.map((a) => a.options), [
    { timeoutMs: 20_000, hideApp: true, delayMs: 5000 },
    { timeoutMs: 20_000, hideApp: true, delayMs: 3000 },
  ]);
  assert.deepEqual(selects, [{ timeoutMs: 20_000, delayMs: 10_000 }]);
});

test("with no wait, nothing about a wait is sent, and a list never waits", async () => {
  const { shell, asked, selects } = pretend();
  const client = createCaptureClient(shell, () => 20_000);
  await client.captureWindow(window1);
  await client.captureWindow(window1, { waitSeconds: 0 });
  await client.captureRegion({ x: 0, y: 0, width: 5, height: 5 }, {});
  await client.selectOnScreen(screen, { left: 0, top: 0, width: 5, height: 5 });
  await client.listWindows();
  await client.listScreens();
  for (const a of asked) assert.ok(!("delayMs" in a.options), JSON.stringify(a));
  assert.deepEqual(selects, [{ timeoutMs: 20_000 }]);
  assert.deepEqual(asked.slice(-2).map((a) => a.options.hideApp), [false, false], "lists do not hide the app");
});
