import test from "node:test";
import assert from "node:assert/strict";
import { createCaptureClient, type Shell } from "../src/capture/client.ts";
import { CAPTURE_TIMEOUT_MS, UNCHANGED, failureFor, failureFromHelper, type ShellOutcome, type WindowInfo } from "../src/capture/outcome.ts";
import { windowLabel } from "../src/dialogs.ts";

const window1: WindowInfo = {
  id: 394822, title: "Notes - Notepad", process: "notepad.exe", pid: 10, x: 0, y: 0, width: 600, height: 400,
  minimized: false, not_responding: false, scale_percent: 100,
};

/** The first bytes of a real PNG: the signature, then a header chunk that says the size. */
function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

/** A pretend shell: answers with whatever it is told, and remembers what it was asked. */
function pretendShell(outcome: ShellOutcome | Error, picture: Uint8Array | Error = pngBytes(600, 400)) {
  const asked: { request: Record<string, unknown>; timeoutMs: number; hideApp: boolean }[] = [];
  const taken: string[] = [];
  const shell: Shell = {
    async run(request, options) {
      asked.push({ request, ...options });
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    async takePicture(path) {
      taken.push(path);
      if (picture instanceof Error) throw picture;
      return picture;
    },
    async select() {
      throw new Error("these tests do not choose on a snapshot");
    },
    async discard() {
      // nothing to delete
    },
    async watchClicks() { throw new Error("these tests do not watch clicks"); },
  };
  return { shell, asked, taken };
}

const goodReply = (result: unknown): ShellOutcome => ({ kind: "reply", reply: { id: 1, ok: true, result } });
const captured = { path: "C:\\temp\\openexplainer-capture\\a.png", width: 600, height: 400, method: "print-window", note: "n", scale_percent: 100, elapsed_ms: 30 };

const everyKindOfFailure: ShellOutcome[] = [
  { kind: "timeout", seconds: 20 },
  { kind: "cancelled" },
  { kind: "stopped" },
  { kind: "unavailable", reason: "missing" },
  { kind: "unavailable", reason: "cannot-start", detail: "access denied" },
  { kind: "unavailable", reason: "no-cancel-window", detail: "x" },
  { kind: "unavailable", reason: "bad-request", detail: "x" },
  { kind: "unavailable", reason: "selection-window", detail: "x" },
];

test("every way a capture can fail says so in plain words, and that the project was not changed", () => {
  for (const outcome of everyKindOfFailure) {
    if (outcome.kind === "reply" || outcome.kind === "selected" || outcome.kind === "clicks") continue;
    const failed = failureFor(outcome);
    assert.equal(failed.ok, false);
    assert.ok(failed.message.includes(UNCHANGED), `${outcome.kind}: ${failed.message}`);
    assert.ok(!/undefined|\[object|Error:|exception/i.test(failed.message), failed.message);
  }
});

test("a timeout names the seconds, a cancel says you did it, and a busy helper says to wait", () => {
  assert.match(failureFor({ kind: "timeout", seconds: 20 }).message, /within 20 seconds, so the capture was stopped/);
  assert.match(failureFor({ kind: "cancelled" }).message, /You cancelled the capture/);
  assert.match(failureFor({ kind: "busy" }).message, /Another capture is still running/);
  assert.match(failureFor({ kind: "unavailable", reason: "missing" }).message, /Test Helper\.bat/);
});

test("the helper's own plain-words error is kept and the reassurance added once", () => {
  const failed = failureFromHelper({ code: "minimized", message: "That window is minimized. Open it from the taskbar, then try again." });
  assert.equal(failed.code, "minimized");
  assert.equal(failed.message, `That window is minimized. Open it from the taskbar, then try again. ${UNCHANGED}`);
  assert.equal(failureFromHelper({ code: "x", message: "No full stop" }).message, `No full stop. ${UNCHANGED}`);
});

test("listing windows asks without hiding the app and returns the windows", async () => {
  const { shell, asked } = pretendShell(goodReply({ windows: [window1] }));
  const answer = await createCaptureClient(shell).listWindows();
  assert.deepEqual(answer, { ok: true, value: [window1] });
  assert.deepEqual(asked, [{ request: { command: "list-windows" }, timeoutMs: CAPTURE_TIMEOUT_MS, hideApp: false }]);
});

test("capturing a window hides the app, names the window, and uses the 20 second limit", async () => {
  const { shell, asked } = pretendShell(goodReply(captured));
  const answer = await createCaptureClient(shell).captureWindow(window1);
  assert.ok(answer.ok);
  assert.deepEqual(asked, [{ request: { command: "capture-window", window: 394822 }, timeoutMs: 20_000, hideApp: true }]);
});

test("a successful capture hands over the picture with its size and type read from the file itself", async () => {
  const { shell, taken } = pretendShell(goodReply(captured), pngBytes(1234, 567));
  const answer = await createCaptureClient(shell).captureWindow(window1);
  assert.ok(answer.ok);
  if (!answer.ok) return;
  assert.deepEqual(taken, [captured.path]);
  assert.equal(answer.value.width, 1234);
  assert.equal(answer.value.height, 567);
  assert.equal(answer.value.extension, "png");
  assert.equal(answer.value.bytes.length, 33);
});

test("the time limit comes from the function given, so a test can shorten it", async () => {
  const { shell, asked } = pretendShell(goodReply(captured));
  await createCaptureClient(shell, () => 1500).captureWindow(window1);
  assert.equal(asked[0].timeoutMs, 1500);
});

test("a failed capture gives no picture and never asks for the picture file", async () => {
  for (const outcome of everyKindOfFailure) {
    const { shell, taken } = pretendShell(outcome);
    const answer = await createCaptureClient(shell).captureWindow(window1);
    assert.equal(answer.ok, false, outcome.kind);
    if (!answer.ok) assert.ok(answer.message.includes(UNCHANGED), answer.message);
    assert.deepEqual(taken, [], "nothing was collected");
  }
});

test("the helper refusing (a minimized window, say) is a plain failure with its own words", async () => {
  const refusal: ShellOutcome = { kind: "reply", reply: { id: 1, ok: false, error: { code: "minimized", message: "That window is minimized. Restore it, then try again." } } };
  const { shell, taken } = pretendShell(refusal);
  const answer = await createCaptureClient(shell).captureWindow(window1);
  assert.equal(answer.ok, false);
  if (!answer.ok) {
    assert.equal(answer.code, "minimized");
    assert.match(answer.message, /^That window is minimized\. Restore it, then try again\. Your project was not changed\.$/);
  }
  assert.deepEqual(taken, []);
});

test("if the shell itself breaks, that is a plain failure too, not an exception", async () => {
  const { shell } = pretendShell(new Error("the command was not found"));
  const answer = await createCaptureClient(shell).captureWindow(window1);
  assert.equal(answer.ok, false);
  if (!answer.ok) {
    assert.equal(answer.code, "app-error");
    assert.ok(answer.message.includes("the command was not found") && answer.message.includes(UNCHANGED));
  }
  const listed = await createCaptureClient(pretendShell(new Error("boom")).shell).listWindows();
  assert.equal(listed.ok, false);
});

test("a picture that cannot be collected, or is not a PNG or JPEG, is a failure and nothing is kept", async () => {
  const cannot = await createCaptureClient(pretendShell(goodReply(captured), new Error("the file is gone")).shell).captureWindow(window1);
  assert.equal(cannot.ok, false);
  if (!cannot.ok) assert.ok(cannot.message.includes("the file is gone") && cannot.message.includes(UNCHANGED));

  const notAPicture = await createCaptureClient(pretendShell(goodReply(captured), new Uint8Array([1, 2, 3, 4, 5])).shell).captureWindow(window1);
  assert.equal(notAPicture.ok, false);
  if (!notAPicture.ok) assert.equal(notAPicture.code, "picture-unreadable");
});

test("a list the helper garbled is a failure, not a crash", async () => {
  const answer = await createCaptureClient(pretendShell(goodReply({ nothing: true })).shell).listWindows();
  assert.equal(answer.ok, false);
});

test("a window in the list is described by title first, then what it is, how big, and any problem", () => {
  assert.equal(windowLabel(window1), "Notes - Notepad (notepad.exe, 600 by 400 pixels)");
  assert.equal(
    windowLabel({ ...window1, minimized: true, not_responding: true }),
    "Notes - Notepad (notepad.exe, 600 by 400 pixels, minimized, restore it first, not responding)",
  );
});
