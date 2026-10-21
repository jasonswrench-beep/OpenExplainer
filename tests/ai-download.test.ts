import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { ModelDownloader, machineWords, modelStateOf, progressWords, timeWords, type DownloadState, type DownloaderDeps } from "../src/ai/download.ts";
import { fakeFiles, type FakeFiles } from "./fake-model-files.ts";
import { sampleBytes, sha256, startFakeHub, type FakeHub } from "./fake-hub.ts";

const hex = async (bytes: Uint8Array) => Buffer.from(await webcrypto.subtle.digest("SHA-256", bytes)).toString("hex");

interface Setup {
  hub: FakeHub;
  files: FakeFiles;
  downloader: ModelDownloader;
  states: DownloadState[];
  sleeps: number[];
  close(): Promise<void>;
}

async function setup(options: { length?: number; chunk?: number; waits?: number[]; facts?: Parameters<typeof fakeFiles>[0]; fetch?: typeof fetch } = {}): Promise<Setup> {
  const hub = await startFakeHub(options.length);
  const files = fakeFiles(options.facts);
  const sleeps: number[] = [];
  const deps: DownloaderDeps = {
    fetch: options.fetch ?? fetch,
    files,
    sleep: async (ms, signal) => {
      sleeps.push(ms);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 1);
        signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
      });
    },
    now: () => Date.now(),
    sha256Hex: hex,
    chunkBytes: options.chunk ?? 256 * 1024,
    retryWaitsMs: options.waits ?? [2000, 5000, 15000],
  };
  const downloader = new ModelDownloader(hub.model, deps);
  const states: DownloadState[] = [];
  downloader.subscribe((s) => states.push(s));
  return { hub, files, downloader, states, sleeps, close: () => hub.close() };
}

const modelRequests = (hub: FakeHub) => hub.requests.filter((r) => r.url.startsWith("/cdn/"));

test("looking at the files says where things stand, in words", async () => {
  const t = await setup();
  try {
    const { files, downloader, hub } = t;
    assert.deepEqual([(await downloader.refresh()).status, downloader.getState().message], ["absent", "Not downloaded."]);
    files.part = hub.bytes.subarray(0, 1024 * 1024);
    let s = await downloader.refresh();
    assert.equal(s.status, "partial");
    assert.equal(s.doneBytes, 1024 * 1024);
    assert.ok(s.canResume && /Partly downloaded: 1 MB of 3 MB\. Press Resume to carry on\./.test(s.message), s.message);
    files.part = hub.bytes;
    s = await downloader.refresh();
    assert.ok(s.status === "partial" && s.canResume && /complete but has not been checked/.test(s.message), "a whole half-finished file waits to be checked");
    files.part = Buffer.concat([hub.bytes, Buffer.from("x")]);
    s = await downloader.refresh();
    assert.ok(s.status === "absent" && files.part === null, "a half-finished file bigger than the model is thrown away");
    files.model = hub.bytes;
    s = await downloader.refresh();
    assert.ok(s.status === "unchecked" && /has not been checked yet/.test(s.message), "a whole file with no record is not trusted yet");
    files.record = JSON.stringify({ file: hub.model.file, bytes: hub.model.bytes, sha256: hub.model.sha256 });
    assert.equal((await downloader.refresh()).status, "ready");
    files.record = JSON.stringify({ file: hub.model.file, bytes: hub.model.bytes, sha256: "0".repeat(64) });
    assert.equal((await downloader.refresh()).status, "unchecked", "a record for some other file counts for nothing");
    files.record = "not json";
    assert.equal((await downloader.refresh()).status, "unchecked");
    files.model = hub.bytes.subarray(0, 100);
    s = await downloader.refresh();
    assert.ok(s.status === "damaged" && /not the right size/.test(s.message));
  } finally {
    await t.close();
  }
});

test("a download from nothing arrives whole, is checked, kept with its note and licence, and the progress only ever goes forward", async () => {
  const t = await setup();
  try {
    await t.downloader.start();
    const s = t.downloader.getState();
    assert.equal(s.status, "ready");
    assert.deepEqual(t.files.model, t.hub.bytes, "the file is exactly the file served");
    assert.equal(t.files.part, null, "and no half-finished file is left");
    assert.equal(JSON.parse(t.files.record!).sha256, t.hub.model.sha256);
    assert.equal(t.files.licence, t.hub.licence.toString("utf8"), "the licence text was kept beside it");
    assert.match(s.message, /^Ready\./);
    const done = t.states.map((x) => x.doneBytes).filter((n, i, a) => i === 0 || a[i - 1] <= n);
    assert.equal(done.length, t.states.length, "the number of bytes never went backwards");
    assert.ok(t.states.some((x) => x.status === "downloading" && /^Downloading: .*\(\d+%\)/.test(x.message)), "it said how far it had got in words");
    assert.ok(t.states.some((x) => x.status === "verifying"), "it said it was checking");
    assert.deepEqual(t.states.at(-1)?.status, "ready");
    assert.equal(modelRequests(t.hub).length, 1, "one request for the file");
    assert.equal(modelRequests(t.hub)[0].range, undefined, "from the start");
    assert.ok(t.files.appends[0] === 0 && t.files.appends.length > 3, "in several pieces, the first at 0");
    assert.equal(modelStateOf(s), "ready");
    // Asking again does nothing.
    const before = t.hub.requests.length;
    await t.downloader.start();
    assert.equal(t.hub.requests.length, before, "a model that is ready is not fetched again");
  } finally {
    await t.close();
  }
});

test("a half-finished download carries on from where it stopped, and ends up the same file", async () => {
  const t = await setup();
  try {
    const cut = 1_000_000;
    t.files.part = Buffer.from(t.hub.bytes.subarray(0, cut));
    await t.downloader.refresh();
    await t.downloader.start();
    assert.equal(t.downloader.getState().status, "ready");
    assert.equal(modelRequests(t.hub)[0].range, `bytes=${cut}-`);
    assert.deepEqual(t.files.model, t.hub.bytes);
    assert.ok(!t.files.appends.includes(0), "nothing was written again from the start");
  } finally {
    await t.close();
  }
});

test("a server that ignores the request for the rest sends the whole file, and it is taken from the start", async () => {
  const t = await setup();
  try {
    t.hub.behave({ ignoreRange: true });
    t.files.part = Buffer.from(t.hub.bytes.subarray(0, 500_000));
    await t.downloader.start();
    assert.equal(t.downloader.getState().status, "ready");
    assert.deepEqual(t.files.model, t.hub.bytes);
    assert.equal(t.files.appends[0], 0, "the first piece started the file again");
  } finally {
    await t.close();
  }
});

test("a dropped connection is tried again after a wait, picking up from what was saved, until the file is whole", async () => {
  const t = await setup({ chunk: 128 * 1024 });
  try {
    t.hub.behave({ cutAfter: 700_000, cuts: 2 });
    await t.downloader.start();
    assert.equal(t.downloader.getState().status, "ready");
    assert.deepEqual(t.files.model, t.hub.bytes);
    const reqs = modelRequests(t.hub);
    assert.equal(reqs.length, 3, "two cuts, then a good one");
    assert.equal(reqs[0].range, undefined);
    assert.ok(/^bytes=\d+-$/.test(reqs[1].range ?? "") && Number(reqs[1].range!.slice(6, -1)) > 0, `the second asked for the rest: ${reqs[1].range}`);
    assert.deepEqual(t.sleeps, [2000, 2000], "it waited before each try, and a try that got somewhere started the count again");
    assert.ok(t.states.some((x) => /connection .* lost.*Trying again in 2 seconds/.test(x.message)), "and said so");
  } finally {
    await t.close();
  }
});

test("when nothing works it stops after the waits and says where it got to, ready for Resume; Resume works once the site is back", async () => {
  const t = await setup({ waits: [10, 20] });
  try {
    t.hub.behave({ status: 503 });
    await t.downloader.start();
    let s = t.downloader.getState();
    assert.equal(s.status, "failed");
    assert.ok(!s.canResume, "nothing was saved, so there is nothing to resume");
    assert.match(s.message, /answered with a problem \(code 503\)/);
    assert.deepEqual(t.sleeps, [10, 20], "it waited the planned times and no more");
    assert.equal(modelStateOf(s), "absent");
    t.hub.behave({});
    t.sleeps.length = 0;
    await t.downloader.start();
    s = t.downloader.getState();
    assert.equal(s.status, "ready");
    assert.deepEqual(t.files.model, t.hub.bytes);
    // Now with something saved before the failure: the first try gets part of the file, then the site stays down.
    let allowed = 1;
    const flaky: typeof fetch = async (input, init) => (String(input).includes("/resolve/") && allowed-- <= 0 ? new Response(null, { status: 503 }) : fetch(input, init));
    const u = await setup({ waits: [1], fetch: flaky });
    try {
      u.hub.behave({ cutAfter: 600_000 });
      await u.downloader.start();
      const f = u.downloader.getState();
      assert.equal(f.status, "failed");
      assert.ok(f.canResume && f.doneBytes > 0 && /Press Resume to carry on/.test(f.message), f.message);
      assert.equal(modelStateOf(f), "partial");
      allowed = 99;
      u.hub.behave({});
      await u.downloader.start();
      assert.equal(u.downloader.getState().status, "ready");
      assert.deepEqual(u.files.model, u.hub.bytes);
    } finally {
      await u.close();
    }
  } finally {
    await t.close();
  }
});

test("a file that is not there, a sign-in request, and a licence that is not the one checked all stop at once with their own words", async () => {
  const t = await setup({ waits: [1] });
  try {
    t.hub.behave({ status: 404 });
    await t.downloader.start();
    assert.ok(t.downloader.getState().status === "failed" && /not found at its address/.test(t.downloader.getState().message));
    assert.equal(modelRequests(t.hub).length, 1, "no second try for something that will not change");
    t.hub.behave({ status: 401 });
    await t.downloader.start();
    assert.match(t.downloader.getState().message, /asked for a sign-in/);
    t.hub.behave({ licence: Buffer.from("something else entirely") });
    t.files.licence = null;
    const before = modelRequests(t.hub).length;
    await t.downloader.start();
    assert.match(t.downloader.getState().message, /licence text .* not the one that was checked, so nothing was downloaded/);
    assert.equal(modelRequests(t.hub).length, before, "the model was not fetched once the licence was wrong");
    t.hub.behave({ licenceStatus: 500 });
    await t.downloader.start();
    assert.equal(t.downloader.getState().status, "failed");
    assert.match(t.downloader.getState().message, /licence text could not be fetched/);
  } finally {
    await t.close();
  }
});

test("a file of the right size with the wrong contents is deleted and reported, never kept", async () => {
  const t = await setup();
  try {
    const wrong = Buffer.from(sampleBytes(t.hub.model.bytes, 99));
    assert.notEqual(sha256(wrong), t.hub.model.sha256);
    t.hub.behave({ body: wrong });
    await t.downloader.start();
    const s = t.downloader.getState();
    assert.equal(s.status, "damaged");
    assert.match(s.message, /did not match the one that was checked, so it was deleted/);
    assert.ok(t.files.model === null && t.files.part === null && t.files.record === null, "nothing of it is left");
    assert.equal(modelStateOf(s), "damaged");
    // And a download afterwards, from the good server, works.
    t.hub.behave({});
    await t.downloader.start();
    assert.equal(t.downloader.getState().status, "ready");
  } finally {
    await t.close();
  }
});

test("pause keeps what arrived and says so; Resume finishes the same file; Cancel throws the partial file away", async () => {
  const t = await setup({ chunk: 64 * 1024 });
  try {
    t.hub.behave({ pieceDelayMs: 5, pieceBytes: 32 * 1024 });
    const running = t.downloader.start();
    while (t.downloader.getState().doneBytes < 300_000) await new Promise((r) => setTimeout(r, 5));
    t.downloader.pause();
    await running;
    let s = t.downloader.getState();
    assert.equal(s.status, "paused");
    assert.ok(s.canResume && s.doneBytes >= 64 * 1024 && s.doneBytes < t.hub.model.bytes);
    assert.equal(s.doneBytes, t.files.part!.length, "what the words say is what is on disk");
    assert.match(s.message, /^Paused at .* of 3 MB\. Press Resume to carry on\.$/);
    assert.deepEqual(t.files.part, t.hub.bytes.subarray(0, t.files.part!.length), "and it is the right start of the file");
    t.hub.behave({});
    await t.downloader.start();
    assert.equal(t.downloader.getState().status, "ready");
    assert.deepEqual(t.files.model, t.hub.bytes);

    // Cancel while it runs.
    await t.downloader.remove();
    assert.equal(t.downloader.getState().status, "absent");
    t.hub.behave({ pieceDelayMs: 5, pieceBytes: 32 * 1024 });
    const second = t.downloader.start();
    while (t.downloader.getState().doneBytes < 200_000) await new Promise((r) => setTimeout(r, 5));
    await t.downloader.cancel();
    await second;
    s = t.downloader.getState();
    assert.equal(s.status, "absent");
    assert.ok(t.files.part === null && !s.canResume, "nothing is left to resume");
    assert.match(s.message, /cancelled and the partial file deleted/);

    // Cancel with nothing running (a half-finished file from an earlier run).
    t.files.part = Buffer.from(t.hub.bytes.subarray(0, 1000));
    await t.downloader.refresh();
    await t.downloader.cancel();
    assert.ok(t.files.part === null && t.downloader.getState().status === "absent");
  } finally {
    await t.close();
  }
});

test("starting twice at once is one download", async () => {
  const t = await setup();
  try {
    const a = t.downloader.start();
    const b = t.downloader.start();
    await Promise.all([a, b]);
    assert.equal(modelRequests(t.hub).length, 1);
    assert.equal(t.downloader.getState().status, "ready");
  } finally {
    await t.close();
  }
});

test("a drive too small stops the download before it begins, with the numbers in words; little memory only warns", async () => {
  const t = await setup({ facts: { freeDiskBytes: 1_000_000, totalMemoryBytes: 3e9 } });
  try {
    await t.downloader.start();
    const s = t.downloader.getState();
    assert.equal(s.status, "failed");
    assert.match(s.message, /only 1 MB free, but the download needs 3 MB\. Free some space first\./);
    assert.equal(t.hub.requests.length, 0, "nothing was asked of the site");
    const machine = await t.downloader.machine();
    assert.equal(machine.enoughDisk, false);
    assert.match(machine.lines[1], /3\.0 GB of memory .* probably fail\. This is a warning; nothing is blocked\./);
    // Half the file already saved needs only the rest.
    t.files.part = Buffer.from(t.hub.bytes.subarray(0, 2_900_000));
    t.files.facts_.freeDiskBytes = 400_000;
    assert.equal((await t.downloader.machine()).enoughDisk, true, "the part already saved counts");
  } finally {
    await t.close();
  }
  const words = (disk: number, memory: number, part = 0) => machineWords({ freeDiskBytes: disk, totalMemoryBytes: memory, folder: "x" }, { bytes: 2_740_937_888 } as never, part);
  assert.deepEqual(words(1e12, 128e9).lines, ["The drive that keeps the model has 1000.0 GB free; the download needs 2.7 GB.", "This PC has 128.0 GB of memory; the model needs about 4 GB to run."]);
  assert.match(words(5e9, 6e9).lines[1], /6\.0 GB of memory .* drafting may be slow/);
});

test("a full disk while saving stops it in words and keeps what is saved; a piece out of step is tried again", async () => {
  const t = await setup({ chunk: 128 * 1024 });
  try {
    let n = 0;
    const append = t.files.append;
    t.files.append = async (offset, bytes) => {
      if (++n === 3) throw "The file could not be written: There is not enough space on the disk. (os error 112)";
      return append(offset, bytes);
    };
    await t.downloader.start();
    let s = t.downloader.getState();
    assert.equal(s.status, "failed");
    assert.match(s.message, /^The disk is full, so the download stopped\. Free some space, then press Resume\.$/);
    assert.ok(s.canResume && t.files.part!.length > 0, "what was saved stays");
    t.files.append = append;
    await t.downloader.start();
    assert.equal(t.downloader.getState().status, "ready");
    assert.deepEqual(t.files.model, t.hub.bytes);
    // Out of step: the shell says the next piece is not where the file ends.
    await t.downloader.remove();
    let once = true;
    t.files.append = async (offset, bytes) => {
      if (once && offset > 0) {
        once = false;
        throw "The download got out of step (the file is 5 bytes and the next piece starts at 9). It will start again from what is saved.";
      }
      return append(offset, bytes);
    };
    await t.downloader.start();
    s = t.downloader.getState();
    assert.equal(s.status, "ready", s.message);
    assert.deepEqual(t.files.model, t.hub.bytes);
  } finally {
    await t.close();
  }
});

test("a file that is not the size that was checked is refused, whichever way the site says it", async () => {
  const t = await setup();
  try {
    t.hub.behave({ lie: t.hub.model.bytes + 10 });
    await t.downloader.start();
    assert.ok(t.downloader.getState().status === "failed" && /not the size that was checked/.test(t.downloader.getState().message));
    assert.equal(t.files.part, null, "nothing was kept");
    t.hub.behave({ body: Buffer.concat([t.hub.bytes, Buffer.from("extra bytes")]), lie: -1 });
    await t.downloader.start();
    assert.ok(t.downloader.getState().status === "failed" && /more than the file should hold/.test(t.downloader.getState().message), t.downloader.getState().message);
    // A longer file served in answer to a Range request does not fit either.
    t.hub.behave({ body: sampleBytes(t.hub.model.bytes + 100) });
    t.files.part = Buffer.from(t.hub.bytes.subarray(0, 1000));
    await t.downloader.start();
    assert.ok(t.downloader.getState().status === "failed" && /not the size that was checked/.test(t.downloader.getState().message));
  } finally {
    await t.close();
  }
});

test("Check the file turns a file that was never checked into a ready one, and deletes one that is wrong; Delete removes everything", async () => {
  const t = await setup();
  try {
    t.files.model = Buffer.from(t.hub.bytes);
    await t.downloader.refresh();
    assert.equal(t.downloader.getState().status, "unchecked");
    await t.downloader.verify();
    assert.equal(t.downloader.getState().status, "ready");
    assert.equal(JSON.parse(t.files.record!).file, t.hub.model.file);
    t.files.model = Buffer.from(sampleBytes(t.hub.model.bytes, 3));
    t.files.record = null;
    await t.downloader.refresh();
    await t.downloader.verify();
    assert.equal(t.downloader.getState().status, "damaged");
    assert.equal(t.files.model, null);
    t.files.model = Buffer.from(t.hub.bytes);
    t.files.licence = "kept";
    await t.downloader.remove();
    assert.deepEqual([t.files.model, t.files.licence, t.files.record, t.downloader.getState().status], [null, null, null, "absent"]);
    // Starting with a whole but unchecked file checks it instead of fetching it again.
    t.files.model = Buffer.from(t.hub.bytes);
    await t.downloader.refresh();
    await t.downloader.start();
    assert.equal(t.downloader.getState().status, "ready");
    assert.equal(t.hub.requests.length, 0, "nothing was downloaded");
    // And a whole half-finished file is checked and put in place the same way.
    t.files.model = null;
    t.files.record = null;
    t.files.part = Buffer.from(t.hub.bytes);
    await t.downloader.refresh();
    await t.downloader.start();
    assert.equal(t.downloader.getState().status, "ready");
    assert.equal(modelRequests(t.hub).length, 0);
    assert.deepEqual(t.files.model, t.hub.bytes);
  } finally {
    await t.close();
  }
});

test("the licence text is shown from the kept copy, or fetched and checked once", async () => {
  const t = await setup();
  try {
    assert.equal(await t.downloader.licenceText(), t.hub.licence.toString("utf8"));
    assert.equal(t.files.licence, t.hub.licence.toString("utf8"), "and kept");
    const before = t.hub.requests.length;
    assert.equal(await t.downloader.licenceText(), t.hub.licence.toString("utf8"));
    assert.equal(t.hub.requests.length, before, "the kept copy is used the second time");
    t.files.licence = null;
    t.hub.behave({ licence: Buffer.from("not the licence") });
    await assert.rejects(() => t.downloader.licenceText(), /not the one that was checked/);
    assert.equal(t.files.licence, null, "a wrong text is not kept");
  } finally {
    await t.close();
  }
});

test("the words for progress, time and model state", () => {
  assert.equal(progressWords(1_200_000_000, 2_740_937_888, 0), "1.2 GB of 2.7 GB (43%).");
  assert.equal(progressWords(0, 0, 0), "0 KB of 1 KB (0%).".replace("0 KB", "1 KB").replace("1 KB of", "1 KB of"), "no total means no percentage trouble");
  assert.match(progressWords(1e9, 2e9, 1e6), /\(50%\)\. About 17 minutes left\.$/);
  assert.equal(timeWords(30), "a minute");
  assert.equal(timeWords(600), "10 minutes");
  assert.equal(timeWords(7200), "2 hours");
  const base: DownloadState = { status: "absent", doneBytes: 0, totalBytes: 10, message: "", canResume: false, speed: 0 };
  assert.equal(modelStateOf({ ...base, status: "downloading", doneBytes: 5 }), "partial");
  assert.equal(modelStateOf({ ...base, status: "failed", doneBytes: 0 }), "absent");
  assert.equal(modelStateOf({ ...base, status: "paused", doneBytes: 5 }), "partial");
  assert.equal(modelStateOf({ ...base, status: "unchecked" }), "unchecked");
});
