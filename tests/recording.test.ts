import test from "node:test";
import assert from "node:assert/strict";
import { createCaptureClient, type Shell } from "../src/capture/client.ts";
import {
  FRAMES_PER_REQUEST, MOST_STEPS, collectRecordingShots, describeLeftOut, describeNotCut, describeRecording, parseRecording, stepLimit, takeWords, timeWords,
} from "../src/capture/recording.ts";
import { picturesFromReview } from "../src/capture/review.ts";
import type { ShellOutcome } from "../src/capture/outcome.ts";

/** The first bytes of a real PNG: the signature, then a header chunk that says the size. */
function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

const click = (n: number, extra: Record<string, unknown> = {}, target?: Record<string, unknown>) => ({
  n, t_ms: n * 1000, picture_ms: n * 1000 - 100, click: { x: 10 * n, y: 20, button: "left", ...extra, ...(target ? { target } : {}) },
});
const answer = (clicks: unknown[], extra: Record<string, unknown> = {}) => ({
  title: "Save a file", language: "en-US", schema_version: "0.2.5",
  takes: [
    { id: 1, state: "complete", usable: true, duration_ms: 12000, has_picture: true, has_clicks: true, region: null },
    { id: 2, state: "set aside", usable: false, duration_ms: 5000, has_picture: true, has_clicks: true, region: null },
  ],
  take: 1, duration_ms: 12000, clicks, click_count: clicks.length, truncated: false, unplaced: 0, other_buttons: 0, has_clicks: true,
  ...extra,
});

test("what the helper says about a recording is read, with every click checked by the project's own rules", () => {
  const info = parseRecording(answer([
    click(1, {}, { role: "button", name: "Save" }),
    click(2, { double: true }),
    { n: 3, t_ms: 3000, picture_ms: 2900, click: { x: "left", y: 1, button: "left" } }, // not a valid click
    { n: 4, t_ms: 4000, picture_ms: 3900, click: { x: 1, y: 1, button: "left", target: { password: true, name: "hunter2" } } },
  ]));
  assert.ok(info);
  assert.equal(info.title, "Save a file");
  assert.equal(info.take, 1);
  assert.deepEqual(info.clicks.map((c) => c.n), [1, 2, 4]);
  assert.equal(info.invalid, 1);
  assert.deepEqual(info.clicks[0].click, { x: 10, y: 20, button: "left", target: { role: "button", name: "Save" } });
  assert.equal(info.clicks[1].click.double, true);
  assert.deepEqual(info.clicks[2].click.target, { password: true }, "a password box keeps only the fact");
  assert.deepEqual(info.takes.map((t) => [t.id, t.usable]), [[1, true], [2, false]]);
});

test("an answer that is not about a recording is not accepted", () => {
  assert.equal(parseRecording(null), null);
  assert.equal(parseRecording({ takes: "no" }), null);
  assert.equal(parseRecording({ takes: [{ id: "one" }] }), null);
});

test("the summary says what was found, in words", () => {
  const info = parseRecording(answer([click(1, {}, { role: "button", name: "Save" }), click(2, { double: true }), click(3)]))!;
  assert.equal(describeRecording(info), "3 clicks found in take 1 (12 seconds); 1 is a double-click, each one step; 1 has the name of the item that was clicked.");
  const none = parseRecording(answer([], { has_clicks: false, note: "This take has no log of the clicks (it was recorded with interaction notes off), so there are no steps to find in it." }))!;
  assert.match(describeRecording(none), /no log of the clicks/);
  const nothing = parseRecording(answer([], { take: null, has_clicks: false }))!;
  assert.match(describeRecording(nothing), /no finished take/);
  const empty = parseRecording(answer([]))!;
  assert.match(describeRecording(empty), /no clicks in it that make a step/);
});

test("clicks that were left out are said, and nothing is said when none were", () => {
  const info = parseRecording(answer([click(1)], { unplaced: 2, other_buttons: 1 }))!;
  assert.equal(describeLeftOut(info), "2 clicks were left out because the log could not say where in the picture they were. 1 click of the back or forward button makes no step.");
  assert.equal(describeLeftOut(parseRecording(answer([click(1)]))!), null);
  assert.equal(describeNotCut(0, 0), null);
  assert.equal(describeNotCut(1, 2), "1 click was outside the picture (on another screen), so it was left out. 2 pictures could not be cut out of the video, so they were left out.");
});

test("times and takes are said as a person would", () => {
  assert.equal(timeWords(40_000), "40 seconds");
  assert.equal(timeWords(65_000), "1 minute 5 seconds");
  assert.equal(timeWords(120_000), "2 minutes");
  assert.equal(timeWords(1_000), "1 second");
  assert.equal(takeWords({ id: 2, state: "set aside", usable: false, durationMs: 5000, hasClicks: true }), "Take 2, 5 seconds, set aside, cannot be brought in");
  assert.equal(takeWords({ id: 1, state: "complete", usable: true, durationMs: null, hasClicks: false }), "Take 1, complete, no click log");
});

test("how many clicks to bring in is kept between one and what the take has", () => {
  const many = parseRecording(answer(Array.from({ length: 300 }, (_, i) => click(i + 1))))!;
  assert.equal(stepLimit(many, null), MOST_STEPS);
  assert.equal(stepLimit(many, 50), 50);
  assert.equal(stepLimit(many, 0), 1);
  assert.equal(stepLimit(many, 5000), MOST_STEPS);
  const few = parseRecording(answer([click(1), click(2)]))!;
  assert.equal(stepLimit(few, null), 2);
  assert.equal(stepLimit(few, Number.NaN), 2);
});

/** A pretend shell for a recording: answers read-recording and recording-frames, and remembers what was asked and what was deleted. */
function pretend(clicks: unknown[], options: { frameFailsAt?: number; outside?: number[]; unreadable?: number[] } = {}) {
  const log = { requests: [] as Record<string, unknown>[], timeouts: [] as number[], taken: [] as string[], discarded: [] as string[] };
  const shell: Shell = {
    async run(request, opts): Promise<ShellOutcome> {
      log.requests.push(request);
      log.timeouts.push(opts.timeoutMs);
      if (request.command === "read-recording") return { kind: "reply", reply: { id: 1, ok: true, result: answer(clicks) } };
      const asked = request.frames as { n: number }[];
      if (options.frameFailsAt !== undefined && asked.some((f) => f.n === options.frameFailsAt)) return { kind: "timeout", seconds: 90 };
      return {
        kind: "reply",
        reply: { id: 1, ok: true, result: { frames: asked.map((f) => ({ n: f.n, path: `C:\\temp\\openexplainer-capture\\recording-1-${f.n}.png`, width: 1920, height: 1080, inside: !(options.outside ?? []).includes(f.n) })), failed: [] } },
      };
    },
    async takePicture(path) {
      log.taken.push(path);
      if ((options.unreadable ?? []).some((n) => path.endsWith(`-${n}.png`))) return new Uint8Array([1, 2, 3]);
      return pngBytes(1920, 1080);
    },
    async select() { throw new Error("not used"); },
    async discard(path) { log.discarded.push(path); },
    async watchClicks() { throw new Error("not used"); },
  };
  return { shell, log };
}

test("a recording is read by asking the helper, and its folder and take go in the request", async () => {
  const { shell, log } = pretend([click(1)]);
  const client = createCaptureClient(shell);
  const read = await client.readRecording("C:\\Users\\a\\Talk.capture");
  assert.ok(read.ok);
  assert.deepEqual(log.requests[0], { command: "read-recording", folder: "C:\\Users\\a\\Talk.capture" });
  await client.readRecording("C:\\Users\\a\\Talk.capture", 3);
  assert.deepEqual(log.requests[1], { command: "read-recording", folder: "C:\\Users\\a\\Talk.capture", take: 3 });
});

test("the pictures are asked for a few at a time, a little before each click, and come back as shots in click order", async () => {
  const total = FRAMES_PER_REQUEST * 2 + 5;
  const { shell, log } = pretend(Array.from({ length: total }, (_, i) => click(i + 1)));
  const client = createCaptureClient(shell);
  const read = await client.readRecording("C:\\r.capture");
  assert.ok(read.ok);
  if (!read.ok) return;
  const progress: string[] = [];
  const made = await client.recordingShots("C:\\r.capture", read.value, { onProgress: (done, all) => progress.push(`${done}/${all}`) });
  assert.ok(made.ok);
  if (!made.ok) return;
  assert.equal(made.value.shots.length, total);
  assert.deepEqual(made.value.shots.slice(0, 3).map((s) => s.n), [1, 2, 3]);
  assert.deepEqual([made.value.shots[0].width, made.value.shots[0].height, made.value.shots[0].extension], [1920, 1080, "png"]);
  const frameRequests = log.requests.filter((r) => r.command === "recording-frames");
  assert.equal(frameRequests.length, 3);
  assert.deepEqual((frameRequests[0].frames as unknown[]).length, FRAMES_PER_REQUEST);
  assert.deepEqual((frameRequests[0].frames as { n: number; at_ms: number; x: number; y: number }[])[0], { n: 1, at_ms: 900, x: 10, y: 20 });
  assert.equal(frameRequests[0].take, 1);
  assert.ok(log.timeouts[log.timeouts.length - 1] >= 60_000, "the pictures are decoded from video, so the helper is given longer");
  assert.deepEqual(progress, [`${FRAMES_PER_REQUEST}/${total}`, `${FRAMES_PER_REQUEST * 2}/${total}`, `${total}/${total}`]);
});

test("only as many clicks as were asked for are cut, and a click that was outside the picture is left out and its file removed", async () => {
  const { shell, log } = pretend(Array.from({ length: 10 }, (_, i) => click(i + 1)), { outside: [2] });
  const client = createCaptureClient(shell);
  const read = await client.readRecording("C:\\r.capture");
  if (!read.ok) return assert.fail("read");
  const made = await client.recordingShots("C:\\r.capture", read.value, { limit: 4 });
  assert.ok(made.ok);
  if (!made.ok) return;
  assert.deepEqual(made.value.shots.map((s) => s.n), [1, 3, 4]);
  assert.equal(made.value.outside, 1);
  assert.deepEqual(log.discarded, ["C:\\temp\\openexplainer-capture\\recording-1-2.png"]);
  assert.equal((log.requests.filter((r) => r.command === "recording-frames")[0].frames as unknown[]).length, 4);
});

test("a picture that cannot be read is counted and left out, and the others are kept", async () => {
  const { shell } = pretend([click(1), click(2), click(3)], { unreadable: [2] });
  const client = createCaptureClient(shell);
  const read = await client.readRecording("C:\\r.capture");
  if (!read.ok) return assert.fail("read");
  const made = await client.recordingShots("C:\\r.capture", read.value);
  assert.ok(made.ok);
  if (!made.ok) return;
  assert.deepEqual(made.value.shots.map((s) => s.n), [1, 3]);
  assert.equal(made.value.failed, 1);
});

test("if the helper stops in the middle, nothing is returned and the words say the project is unchanged", async () => {
  const { shell } = pretend(Array.from({ length: 30 }, (_, i) => click(i + 1)), { frameFailsAt: 25 });
  const client = createCaptureClient(shell);
  const read = await client.readRecording("C:\\r.capture");
  if (!read.ok) return assert.fail("read");
  const made = await client.recordingShots("C:\\r.capture", read.value);
  assert.equal(made.ok, false);
  if (!made.ok) assert.match(made.message, /Your project was not changed\./);
});

test("a recording with no take that can be used has nothing to bring in", async () => {
  const { shell } = pretend([]);
  const client = createCaptureClient(shell);
  const info = parseRecording(answer([], { take: null, has_clicks: false }))!;
  const made = await client.recordingShots("C:\\r.capture", info);
  assert.equal(made.ok, false);
});

test("the shots from a recording go through the same review as a live capture and keep the click note", async () => {
  const picked = await collectRecordingShots(
    { async takePicture() { return pngBytes(800, 600); }, async discard() {} },
    parseRecording(answer([click(1, {}, { role: "menu item", name: "Open" })]))!.clicks,
    [{ n: 1, path: "C:\\x\\recording-1.png", inside: true }],
  );
  assert.equal(picked.shots.length, 1);
  let next = 0;
  const kept = picturesFromReview(picked.shots, [{ keep: true, description: "The File menu with Open chosen" }], () => `id${++next}`, "2026-11-16T00:00:00Z");
  assert.equal(kept.pictures.length, 1);
  assert.deepEqual(kept.pictures[0].click, { x: 10, y: 20, button: "left", target: { role: "menu item", name: "Open" } });
  assert.equal(kept.pictures[0].source.kind, "click");
  assert.equal(kept.pictures[0].source.originalName, 'Click on the menu item "Open"');
});

test("a frame line with no number or path is counted as a failure and a stray file is not taken", async () => {
  const taken: string[] = [];
  const picked = await collectRecordingShots(
    { async takePicture(path) { taken.push(path); return pngBytes(10, 10); }, async discard() {} },
    parseRecording(answer([click(1)]))!.clicks,
    [{ n: 1 }, "nonsense", { n: 99, path: "C:\\x\\recording-99.png", inside: true }],
  );
  assert.equal(picked.shots.length, 0);
  assert.equal(picked.failed, 3);
  assert.deepEqual(taken, [], "a picture the app did not ask for is never collected");
});
