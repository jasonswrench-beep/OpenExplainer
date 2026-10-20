import test from "node:test";
import assert from "node:assert/strict";
import { createCaptureClient, type Shell } from "../src/capture/client.ts";
import { UNCHANGED, failureFor, type ScreenInfo, type ShellOutcome } from "../src/capture/outcome.ts";

const above: ScreenInfo = { number: 2, x: 7, y: -1080, width: 1920, height: 1080, primary: false, scale_percent: 100 };

function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

/** A pretend shell for choosing on a snapshot: `selection` is what the author did, `cut` is what the helper says about the cut-out. */
function pretend(selection: ShellOutcome | Error, cut: ShellOutcome | Error, picture: Uint8Array | Error = pngBytes(300, 200)) {
  const log = {
    selections: [] as unknown[],
    cuts: [] as { request: Record<string, unknown>; hideApp: boolean }[],
    taken: [] as string[],
    discarded: [] as string[],
  };
  const shell: Shell = {
    async run(request, options) {
      log.cuts.push({ request, hideApp: options.hideApp });
      if (cut instanceof Error) throw cut;
      return cut;
    },
    async takePicture(path) {
      log.taken.push(path);
      if (picture instanceof Error) throw picture;
      return picture;
    },
    async select(request, options) {
      log.selections.push({ request, timeoutMs: options.timeoutMs });
      if (selection instanceof Error) throw selection;
      return selection;
    },
    async discard(path) {
      log.discarded.push(path);
    },
    async watchClicks() { throw new Error("these tests do not watch clicks"); },
  };
  return { shell, log };
}

const SNAPSHOT = "C:\\temp\\openexplainer-capture\\snap.png";
const selected: ShellOutcome = { kind: "selected", snapshot: SNAPSHOT, rect: { left: 100, top: 50, width: 300, height: 200 } };
const goodCut: ShellOutcome = {
  kind: "reply",
  reply: { id: 1, ok: true, result: { path: "C:\\temp\\openexplainer-capture\\cut.png", width: 300, height: 200, method: "crop", note: "n", scale_percent: 100, elapsed_ms: 5 } },
};
const start = { left: 0, top: 0, width: 800, height: 600 };

test("choosing on a snapshot sends the screen's place and the starting rectangle, then cuts the choice out of the snapshot", async () => {
  const { shell, log } = pretend(selected, goodCut);
  const answer = await createCaptureClient(shell, () => 20_000).selectOnScreen(above, start);
  assert.ok(answer.ok);
  assert.deepEqual(log.selections, [
    { request: { screen: { x: 7, y: -1080, width: 1920, height: 1080, number: 2 }, initial: start }, timeoutMs: 20_000 },
  ]);
  assert.deepEqual(
    log.cuts,
    [{ request: { command: "crop-picture", source: SNAPSHOT, x: 100, y: 50, width: 300, height: 200 }, hideApp: false }],
    "the cut is made without hiding the app: the snapshot is already taken",
  );
  if (answer.ok) {
    assert.deepEqual(answer.value.rect, { left: 100, top: 50, width: 300, height: 200 });
    assert.deepEqual([answer.value.picture.width, answer.value.picture.height], [300, 200]);
  }
  assert.deepEqual(log.discarded, [SNAPSHOT], "the snapshot of the whole screen is deleted");
});

test("cancelling the selection is a failure with plain words and no cut is made", async () => {
  const outcomes: ShellOutcome[] = [
    { kind: "cancelled" },
    { kind: "timeout", seconds: 20 },
    { kind: "stopped" },
    { kind: "unavailable", reason: "selection-window" },
  ];
  for (const outcome of outcomes) {
    const { shell, log } = pretend(outcome, goodCut);
    const answer = await createCaptureClient(shell).selectOnScreen(above, start);
    assert.equal(answer.ok, false, outcome.kind);
    assert.deepEqual(log.cuts, [], "nothing was cut");
    assert.deepEqual(log.taken, []);
    if (!answer.ok) assert.ok(answer.message.includes(UNCHANGED), answer.message);
  }
  const cancelled = await createCaptureClient(pretend({ kind: "cancelled" }, goodCut).shell).selectOnScreen(above, start);
  if (!cancelled.ok) assert.equal(cancelled.code, "cancelled", "so the app can treat it quietly");
});

test("when the helper refuses the snapshot, its own plain words are kept", async () => {
  const refusal: ShellOutcome = { kind: "reply", reply: { id: 1, ok: false, error: { code: "off-screen", message: "Part of that rectangle is not on any screen." } } };
  const answer = await createCaptureClient(pretend(refusal, goodCut).shell).selectOnScreen(above, start);
  assert.equal(answer.ok, false);
  if (!answer.ok) assert.equal(answer.message, `Part of that rectangle is not on any screen. ${UNCHANGED}`);
});

test("a cut that fails still deletes the snapshot, and gives plain words", async () => {
  const refusal: ShellOutcome = {
    kind: "reply",
    reply: { id: 1, ok: false, error: { code: "bad-request", message: "The rectangle reaches past the edge of the picture, which is 1920 by 1080 pixels." } },
  };
  const { shell, log } = pretend(selected, refusal);
  const answer = await createCaptureClient(shell).selectOnScreen(above, start);
  assert.equal(answer.ok, false);
  if (!answer.ok) assert.ok(answer.message.includes("past the edge of the picture") && answer.message.includes(UNCHANGED));
  assert.equal(log.discarded.length, 1, "the snapshot is deleted even though the cut failed");
});

test("a cut-out that cannot be collected or is not a picture still deletes the snapshot", async () => {
  const broken = pretend(selected, goodCut, new Error("the file is gone"));
  assert.equal((await createCaptureClient(broken.shell).selectOnScreen(above, start)).ok, false);
  assert.equal(broken.log.discarded.length, 1);
  const notPicture = pretend(selected, goodCut, new Uint8Array([1, 2, 3]));
  assert.equal((await createCaptureClient(notPicture.shell).selectOnScreen(above, start)).ok, false);
  assert.equal(notPicture.log.discarded.length, 1);
});

test("if the shell itself breaks while choosing, that is a plain failure, not an exception", async () => {
  const answer = await createCaptureClient(pretend(new Error("no such command"), goodCut).shell).selectOnScreen(above, start);
  assert.equal(answer.ok, false);
  if (!answer.ok) assert.ok(answer.message.includes("no such command") && answer.message.includes(UNCHANGED));
});

test("the plain words for a selection window that did not start say what to do instead", () => {
  const words = failureFor({ kind: "unavailable", reason: "selection-window" }).message;
  assert.match(words, /did not start, so nothing was captured/);
  assert.match(words, /type the four numbers instead/);
});
