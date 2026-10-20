import test from "node:test";
import assert from "node:assert/strict";
import { createCaptureClient, type Shell } from "../src/capture/client.ts";
import { collectSession, describeEnded, describeLost, describeShot } from "../src/capture/clicks.ts";
import { UNCHANGED, type ShellOutcome } from "../src/capture/outcome.ts";

/** The first bytes of a real PNG: the signature, then a header chunk that says the size. */
function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

const line = (n: number, click: unknown, extra: Record<string, unknown> = {}) => ({
  event: "click", watch: 1, n, path: `C:\\temp\\openexplainer-capture\\click-${n}.png`, width: 1920, height: 1080, click, held_ms: 40, ...extra,
});
const left = { x: 10, y: 20, button: "left", target: { role: "button", name: "Save", accessKey: "Alt+S", bounds: { x: 1, y: 2, width: 30, height: 10 } } };

/** A pretend shell for a click session: answers with what it is told, and remembers the pictures it was asked for and told to delete. */
function pretend(outcome: ShellOutcome | Error, pictures: Record<string, Uint8Array | Error> = {}) {
  const log = { watched: [] as unknown[], taken: [] as string[], discarded: [] as string[] };
  const shell: Shell = {
    async run() { throw new Error("a click session does not use run"); },
    async takePicture(path) {
      log.taken.push(path);
      const picture = pictures[path] ?? pngBytes(1920, 1080);
      if (picture instanceof Error) throw picture;
      return picture;
    },
    async select() { throw new Error("a click session does not choose on a snapshot"); },
    async discard(path) { log.discarded.push(path); },
    async watchClicks(options) {
      log.watched.push(options);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
  return { shell, log };
}

const session = (clicks: unknown[], extra: Partial<{ skipped: number; ended: string }> = {}): ShellOutcome => ({ kind: "clicks", clicks, skipped: 0, ended: "stopped", ...extra });

test("a finished session gives every click in order, with its picture's size read from the file and the click note kept", async () => {
  const { shell, log } = pretend(session([line(1, left), line(2, { x: 5, y: 6, button: "right", double: false })]));
  const done = await createCaptureClient(shell).watchClicks();
  assert.ok(done.ok);
  if (!done.ok) return;
  assert.deepEqual(done.value.shots.map((s) => s.n), [1, 2]);
  assert.deepEqual(done.value.shots[0].click, left);
  assert.deepEqual(done.value.shots[1].click, { x: 5, y: 6, button: "right" });
  assert.deepEqual([done.value.shots[0].width, done.value.shots[0].height, done.value.shots[0].extension], [1920, 1080, "png"]);
  assert.equal(done.value.ended, "stopped");
  assert.deepEqual([done.value.skipped, done.value.unusable], [0, 0]);
  assert.deepEqual(log.taken, ["C:\\temp\\openexplainer-capture\\click-1.png", "C:\\temp\\openexplainer-capture\\click-2.png"]);
});

test("the limits are passed to the shell, and with none the helper's own are used", async () => {
  const { shell, log } = pretend(session([]));
  const client = createCaptureClient(shell);
  await client.watchClicks();
  await client.watchClicks({ idleSeconds: 120, maxClicks: 50 });
  assert.deepEqual(log.watched, [{}, { idleSeconds: 120, maxClicks: 50 }]);
});

test("a session with no clicks is fine and gives no shots", async () => {
  const done = await createCaptureClient(pretend(session([])).shell).watchClicks();
  assert.ok(done.ok);
  if (done.ok) assert.deepEqual(done.value.shots, []);
});

test("a password box and anything typed in a box are cleaned out of every note, whatever the helper said", async () => {
  const dirty = { x: 1, y: 2, button: "left", typed: "my secret", target: { password: true, name: "Password", description: "hunter2", value: "hunter2" } };
  const alsoDirty = { x: 3, y: 4, button: "left", target: { role: "text box", name: "Notes", value: "private words", text: "private words" } };
  const done = await createCaptureClient(pretend(session([line(1, dirty), line(2, alsoDirty)])).shell).watchClicks();
  assert.ok(done.ok);
  if (!done.ok) return;
  assert.deepEqual(done.value.shots[0].click, { x: 1, y: 2, button: "left", target: { password: true } });
  assert.deepEqual(done.value.shots[1].click, { x: 3, y: 4, button: "left", target: { role: "text box", name: "Notes" } });
  assert.ok(!JSON.stringify(done.value.shots.map((s) => s.click)).match(/hunter2|my secret|private words/));
});

test("a click that cannot be used is counted and left out, its picture is removed, and the rest are kept in order", async () => {
  const bad = line(2, { x: 1, y: 2, button: "thumb" });
  const noPicture = line(3, left);
  const notAPicture = line(4, left);
  const good = [line(1, left), line(5, left)];
  const { shell, log } = pretend(
    session([good[0], bad, noPicture, notAPicture, good[1]]),
    { [noPicture.path]: new Error("gone"), [notAPicture.path]: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) },
  );
  const done = await createCaptureClient(shell).watchClicks();
  assert.ok(done.ok);
  if (!done.ok) return;
  assert.deepEqual(done.value.shots.map((s) => s.n), [1, 5]);
  assert.equal(done.value.unusable, 3);
  assert.ok(log.discarded.includes(bad.path), "the picture of an invalid click is deleted");
  assert.ok(log.discarded.includes(noPicture.path), "so is one that could not be collected");
});

test("a line with no picture path, or with no valid click note, is not a click", async () => {
  const files = { async takePicture() { return pngBytes(10, 10); }, async discard() { /* nothing */ } };
  const got = await collectSession(files, { clicks: [{ event: "click" }, 7, null, { path: "C:\\x.png" }], skipped: 0, ended: "stopped" });
  assert.deepEqual([got.shots.length, got.unusable], [0, 4]);
});

test("a note from the helper about a click is kept, trimmed, and left out when blank", async () => {
  const done = await createCaptureClient(pretend(session([line(1, left, { note: "  Windows did not say what was clicked. " }), line(2, left, { note: "   " }), line(3, left)])).shell).watchClicks();
  assert.ok(done.ok);
  if (!done.ok) return;
  assert.equal(done.value.shots[0].note, "Windows did not say what was clicked.");
  assert.equal("note" in done.value.shots[1], false);
  assert.equal("note" in done.value.shots[2], false);
});

test("the way a session ended and the clicks it skipped are carried through; an unknown ending counts as stopped", async () => {
  const done = await createCaptureClient(pretend(session([line(1, left)], { skipped: 2, ended: "limit" })).shell).watchClicks();
  assert.ok(done.ok);
  if (done.ok) assert.deepEqual([done.value.ended, done.value.skipped], ["limit", 2]);
  const odd = await createCaptureClient(pretend(session([], { ended: "something new" })).shell).watchClicks();
  assert.ok(odd.ok);
  if (odd.ok) assert.equal(odd.value.ended, "stopped");
});

test("a helper that says no gives its own plain words, and everything else is a plain failure that leaves the project alone", async () => {
  const refused = await createCaptureClient(pretend({ kind: "reply", reply: { id: 1, ok: false, error: { code: "capture-failed", message: "Windows would not let the helper watch the mouse, so click-by-click capture cannot start." } } }).shell).watchClicks();
  assert.ok(!refused.ok);
  if (!refused.ok) { assert.equal(refused.code, "capture-failed"); assert.ok(refused.message.endsWith(UNCHANGED)); }
  const others: ShellOutcome[] = [
    { kind: "busy" }, { kind: "stopped" }, { kind: "unavailable", reason: "missing" }, { kind: "unavailable", reason: "cannot-start", detail: "access denied" },
    { kind: "unavailable", reason: "no-cancel-window", detail: "x" },
  ];
  for (const outcome of others) {
    const done = await createCaptureClient(pretend(outcome).shell).watchClicks();
    assert.ok(!done.ok, outcome.kind);
    if (!done.ok) assert.ok(done.message.length > 20 && !/undefined|\[object|Error:/i.test(done.message), done.message);
  }
});

test("if the shell itself breaks, that is a plain failure too, not an exception", async () => {
  const done = await createCaptureClient(pretend(new Error("channel closed")).shell).watchClicks();
  assert.ok(!done.ok);
  if (!done.ok) { assert.equal(done.code, "app-error"); assert.ok(done.message.includes("channel closed") && done.message.endsWith(UNCHANGED)); }
});

test("what to tell the author about how a session ended", () => {
  assert.equal(describeEnded("stopped"), null, "they stopped it themselves: nothing to say");
  assert.equal(describeEnded("idle"), "The capture stopped by itself because there was no click for 10 minutes.");
  assert.equal(describeEnded("idle", { idleSeconds: 60 }), "The capture stopped by itself because there was no click for 1 minute.");
  assert.equal(describeEnded("idle", { idleSeconds: 90 }), "The capture stopped by itself because there was no click for 90 seconds.");
  assert.equal(describeEnded("limit"), "The capture stopped by itself at the limit of 200 clicks.");
  assert.equal(describeEnded("limit", { maxClicks: 3 }), "The capture stopped by itself at the limit of 3 clicks.");
  assert.match(describeEnded("hook-lost") ?? "", /Windows stopped the click watcher.*before that\.$/);
  assert.match(describeEnded("helper-stopped") ?? "", /stopped unexpectedly.*before that\.$/);
});

test("lost clicks are counted in plain words, and nothing is said when none were lost", () => {
  assert.equal(describeLost(0, 0), null);
  assert.match(describeLost(1, 0) ?? "", /^1 click was not captured, because clicks came faster/);
  assert.match(describeLost(3, 0) ?? "", /^3 clicks were not captured/);
  assert.match(describeLost(0, 2) ?? "", /^2 clicks were captured but could not be used, so they were left out\.$/);
  assert.match(describeLost(1, 1) ?? "", /not captured.*\. 1 click was captured but could not be used, so it was left out\.$/);
});

test("a click is said in plain words for the review list", async () => {
  const done = await createCaptureClient(pretend(session([line(1, left)])).shell).watchClicks();
  assert.ok(done.ok);
  if (done.ok) assert.equal(describeShot(done.value.shots[0]), 'Click on the button "Save" (access key Alt+S).');
});
