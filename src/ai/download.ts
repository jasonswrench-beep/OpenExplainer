// The built-in model's download (part 2 of docs/local-ai-plan.md): asks the web server for the one pinned file in pieces, keeps what has arrived in a half-finished file so a broken
// connection or a closed app carries on where it stopped, can be paused and cancelled, and at the end works out the file's SHA-256 fingerprint. Only a file with the audited fingerprint
// is ever kept as the model; anything else is deleted and the author told.
//
// Nothing here touches Tauri. The files and the machine are reached through `ModelFiles` (src/ai/shell-files.ts is the real one, the tests use a stand-in), the web through `fetch`, so
// every path below can be tried against a fake server.
import { licenceUrl, modelUrl, sizeInWords, type ModelInfo } from "./model-info.ts";
import type { ModelState } from "./settings.ts";

export type DownloadStatus = "absent" | "partial" | "downloading" | "paused" | "verifying" | "unchecked" | "ready" | "damaged" | "failed";

export interface DownloadState {
  status: DownloadStatus;
  doneBytes: number;
  totalBytes: number;
  /** In words, for the dialog. */
  message: string;
  /** Pressing Resume would carry on from what is saved. */
  canResume: boolean;
  /** Bytes a second lately; 0 when not known yet. */
  speed: number;
}

export interface MachineFacts {
  freeDiskBytes: number;
  totalMemoryBytes: number;
  folder: string;
}

export interface ModelSizes {
  model: number | null;
  part: number | null;
  licence: number | null;
  record: string | null;
}

/** What the shell does for the download. */
export interface ModelFiles {
  facts(): Promise<MachineFacts>;
  sizes(): Promise<ModelSizes>;
  /** Adds a piece at `offset` (which must be exactly the saved size, or 0 to start again). Answers with the new size. */
  append(offset: number, bytes: Uint8Array): Promise<number>;
  finish(): Promise<void>;
  remove(what: "part" | "all"): Promise<void>;
  hash(which: "model" | "part", onProgress: (done: number, total: number) => void): Promise<string>;
  saveRecord(text: string): Promise<void>;
  writeLicence(text: string): Promise<void>;
  readLicence(): Promise<string | null>;
}

export interface DownloaderDeps {
  fetch: typeof fetch;
  files: ModelFiles;
  /** Waits; ends early (without an error) if `signal` is aborted. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  now(): number;
  sha256Hex(bytes: Uint8Array): Promise<string>;
  /** How much to gather before writing to disk. */
  chunkBytes?: number;
  /** How long to wait before each retry after a lost connection. */
  retryWaitsMs?: number[];
}

/** A problem a second try could cure (a dropped connection, a busy server). */
class Retryable extends Error {}
/** A problem that trying again will not cure; the message is for the author. */
class Fatal extends Error {}

const MARGIN = 0;
const MEMORY_NEEDED = 4_000_000_000;
const MEMORY_COMFORTABLE = 8_000_000_000;

const asText = (e: unknown): string => (typeof e === "string" ? e : e instanceof Error ? e.message : String(e));

/** "1.2 GB of 2.7 GB (44%)", and how long is left when the speed is known. */
export function progressWords(done: number, total: number, speed: number): string {
  const percent = total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0;
  const left = speed > 0 && total > done ? ` About ${timeWords((total - done) / speed)} left.` : "";
  return `${sizeInWords(done)} of ${sizeInWords(total)} (${percent}%).${left}`;
}

export function timeWords(seconds: number): string {
  if (seconds < 90) return "a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  const hours = Math.round(seconds / 360) / 10;
  return `${hours} hours`;
}

/** What this PC has against what the model needs, in words. `enoughDisk` is false only when the file cannot possibly fit, which is the one thing that stops a download. */
export function machineWords(facts: MachineFacts, model: ModelInfo, partBytes: number): { enoughDisk: boolean; lines: string[] } {
  const needed = Math.max(0, model.bytes - partBytes) + MARGIN;
  const enoughDisk = facts.freeDiskBytes >= needed;
  const lines = [
    enoughDisk
      ? `The drive that keeps the model has ${sizeInWords(facts.freeDiskBytes)} free; the download needs ${sizeInWords(needed)}.`
      : `The drive that keeps the model has only ${sizeInWords(facts.freeDiskBytes)} free, but the download needs ${sizeInWords(needed)}. Free some space first.`,
  ];
  if (facts.totalMemoryBytes < MEMORY_NEEDED) {
    lines.push(`This PC has ${sizeInWords(facts.totalMemoryBytes)} of memory and the model needs about 4 GB to run, so drafting will probably fail. This is a warning; nothing is blocked.`);
  } else if (facts.totalMemoryBytes < MEMORY_COMFORTABLE) {
    lines.push(`This PC has ${sizeInWords(facts.totalMemoryBytes)} of memory and the model needs about 4 GB to run, so drafting may be slow. This is a warning; nothing is blocked.`);
  } else {
    lines.push(`This PC has ${sizeInWords(facts.totalMemoryBytes)} of memory; the model needs about 4 GB to run.`);
  }
  return { enoughDisk, lines };
}

/** The model state the rest of the app cares about (is it usable?). */
export function modelStateOf(state: DownloadState): ModelState {
  switch (state.status) {
    case "ready":
      return "ready";
    case "unchecked":
      return "unchecked";
    case "damaged":
      return "damaged";
    case "absent":
      return "absent";
    default:
      return state.doneBytes > 0 ? "partial" : "absent";
  }
}

function concat(pieces: Uint8Array[], length: number): Uint8Array {
  if (pieces.length === 1) return pieces[0];
  const all = new Uint8Array(length);
  let at = 0;
  for (const p of pieces) {
    all.set(p, at);
    at += p.length;
  }
  return all;
}

interface Run {
  controller: AbortController;
  /** Why it is being stopped, if it is. */
  reason: "pause" | "cancel" | null;
  finished: Promise<void>;
}

export class ModelDownloader {
  private readonly model: ModelInfo;
  private readonly deps: DownloaderDeps;
  private state: DownloadState;
  private readonly listeners = new Set<(state: DownloadState) => void>();
  private run: Run | null = null;
  private lastEmit = 0;
  private samples: Array<{ at: number; bytes: number }> = [];
  private madeProgress = false;

  constructor(model: ModelInfo, deps: DownloaderDeps) {
    this.model = model;
    this.deps = deps;
    this.state = { status: "absent", doneBytes: 0, totalBytes: model.bytes, message: "Not downloaded.", canResume: false, speed: 0 };
  }

  getState(): DownloadState {
    return this.state;
  }

  /** Tells `fn` every time the state changes. Returns a way to stop. */
  subscribe(fn: (state: DownloadState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<DownloadState>): void {
    this.state = { ...this.state, ...patch };
    this.lastEmit = this.deps.now();
    for (const fn of [...this.listeners]) fn(this.state);
  }

  /** Looks at the files and says where things stand. While a download or a check is going it changes nothing. */
  async refresh(): Promise<DownloadState> {
    if (this.run || this.state.status === "verifying") return this.state;
    const total = this.model.bytes;
    const sizes = await this.deps.files.sizes();
    if (sizes.model !== null) {
      if (sizes.model !== total) {
        this.set({ status: "damaged", doneBytes: sizes.model, canResume: false, speed: 0, message: "The model file on this PC is not the right size, so it cannot be used. Download it again." });
      } else if (this.recordMatches(sizes.record)) {
        this.set({ status: "ready", doneBytes: total, canResume: false, speed: 0, message: "Ready." });
      } else {
        this.set({ status: "unchecked", doneBytes: total, canResume: false, speed: 0, message: "The file is on this PC but has not been checked yet. Press Check the file." });
      }
    } else if (sizes.part !== null && sizes.part > 0 && sizes.part < total) {
      this.set({ status: "partial", doneBytes: sizes.part, canResume: true, speed: 0, message: `Partly downloaded: ${sizeInWords(sizes.part)} of ${sizeInWords(total)}. Press Resume to carry on.` });
    } else if (sizes.part === total) {
      // Every byte arrived but the check never happened (the app was closed in between): Resume does the check.
      this.set({ status: "partial", doneBytes: total, canResume: true, speed: 0, message: "The download is complete but has not been checked. Press Resume to check it." });
    } else {
      if (sizes.part !== null) await this.deps.files.remove("part");
      this.set({ status: "absent", doneBytes: 0, canResume: false, speed: 0, message: "Not downloaded." });
    }
    return this.state;
  }

  private recordMatches(text: string | null): boolean {
    if (!text) return false;
    try {
      const r = JSON.parse(text) as { file?: unknown; bytes?: unknown; sha256?: unknown };
      return r.file === this.model.file && r.bytes === this.model.bytes && r.sha256 === this.model.sha256;
    } catch {
      return false;
    }
  }

  /** Begins the download, or carries on from what is saved. Ends when it has finished, been paused or cancelled, or has failed; the state says which. */
  start(): Promise<void> {
    if (this.run) return this.run.finished;
    if (this.state.status === "verifying") return Promise.resolve();
    const controller = new AbortController();
    const run: Run = { controller, reason: null, finished: Promise.resolve() };
    this.run = run;
    run.finished = this.go(run).finally(() => {
      this.run = null;
    });
    return run.finished;
  }

  /** Stops, keeping what has arrived. */
  pause(): void {
    if (!this.run || this.run.reason) return;
    this.run.reason = "pause";
    this.run.controller.abort();
  }

  /** Stops and deletes the half-finished file. */
  async cancel(): Promise<void> {
    if (this.run) {
      this.run.reason = "cancel";
      this.run.controller.abort();
      await this.run.finished;
      return;
    }
    if (this.state.status === "verifying") return;
    await this.deps.files.remove("part");
    this.set({ status: "absent", doneBytes: 0, canResume: false, speed: 0, message: "The partial download was deleted." });
  }

  /** Deletes the model and everything kept for it. */
  async remove(): Promise<void> {
    if (this.run || this.state.status === "verifying") return;
    await this.deps.files.remove("all");
    this.set({ status: "absent", doneBytes: 0, canResume: false, speed: 0, message: "The model was deleted." });
  }

  /** Works out the fingerprint of the finished file again. */
  async verify(): Promise<void> {
    if (this.run || this.state.status === "verifying") return;
    await this.refresh();
    if (this.state.status !== "unchecked" && this.state.status !== "ready") return;
    await this.check("model");
  }

  /** Disk and memory against what the model needs, in words. */
  async machine(): Promise<{ enoughDisk: boolean; lines: string[] }> {
    const [facts, sizes] = await Promise.all([this.deps.files.facts(), this.deps.files.sizes()]);
    return machineWords(facts, this.model, sizes.part ?? 0);
  }

  /** The licence text: the copy kept beside the model, or else fetched (and checked) from its pinned address. */
  async licenceText(): Promise<string> {
    const kept = await this.deps.files.readLicence();
    if (kept) return kept;
    const text = await this.fetchLicence();
    await this.deps.files.writeLicence(text);
    return text;
  }

  // ---- inside -------------------------------------------------------------------------------------------------

  private async fetchLicence(signal?: AbortSignal): Promise<string> {
    let bytes: Uint8Array;
    try {
      const response = await this.deps.fetch(licenceUrl(this.model), { signal });
      if (!response.ok) throw new Retryable(`The licence text could not be fetched (code ${response.status}).`);
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (error instanceof Retryable) throw error;
      if (signal?.aborted) throw error;
      throw new Retryable("The licence text could not be fetched. Check the internet connection.");
    }
    if (bytes.length !== this.model.licenceBytes || (await this.deps.sha256Hex(bytes)) !== this.model.licenceSha256) {
      throw new Fatal("The licence text at its address was not the one that was checked, so nothing was downloaded.");
    }
    return new TextDecoder().decode(bytes);
  }

  /** Stops with a problem, keeping whatever is saved so Resume can carry on from it. */
  private async fail(message: string): Promise<void> {
    const saved = (await this.deps.files.sizes().catch(() => null))?.part ?? 0;
    this.set({ status: "failed", speed: 0, message, doneBytes: saved, canResume: saved > 0 });
  }

  /** The state after a pause or a cancel. */
  private async stopped(reason: "pause" | "cancel"): Promise<void> {
    if (reason === "cancel") {
      await this.deps.files.remove("part");
      this.set({ status: "absent", doneBytes: 0, canResume: false, speed: 0, message: "The download was cancelled and the partial file deleted." });
      return;
    }
    const sizes = await this.deps.files.sizes();
    const saved = sizes.part ?? 0;
    this.set({ status: "paused", doneBytes: saved, canResume: saved > 0, speed: 0, message: `Paused at ${sizeInWords(saved)} of ${sizeInWords(this.model.bytes)}. Press Resume to carry on.` });
  }

  private async go(run: Run): Promise<void> {
    const { files } = this.deps;
    const signal = run.controller.signal;
    try {
      let sizes = await files.sizes();
      if (sizes.model !== null) {
        // A whole file is there. Only a file that was checked is kept; this one is checked now (or, if its size is wrong, replaced).
        if (sizes.model === this.model.bytes) return void (await this.check("model"));
        await files.remove("all");
        sizes = await files.sizes();
      }
      const have = sizes.part ?? 0;
      const facts = await files.facts().catch(() => null);
      if (facts) {
        const { enoughDisk, lines } = machineWords(facts, this.model, have);
        if (!enoughDisk) return void this.set({ status: "failed", speed: 0, canResume: have > 0, message: lines[0] });
      }
      this.set({ status: "downloading", doneBytes: have, canResume: have > 0, speed: 0, message: have > 0 ? `Carrying on from ${sizeInWords(have)}.` : "Starting the download." });
      this.samples = [];
      if (sizes.licence === null) await files.writeLicence(await this.fetchLicence(signal));

      const waits = this.deps.retryWaitsMs ?? [2000, 5000, 15000];
      let failuresInARow = 0;
      for (;;) {
        this.madeProgress = false;
        try {
          if (await this.transfer(signal)) break;
        } catch (error) {
          if (error instanceof Fatal) return void (await this.fail(error.message));
          if (!(error instanceof Retryable) && !signal.aborted) throw error;
          if (!signal.aborted) {
            const problem = error instanceof Retryable ? error.message : "The connection to the download site was lost.";
            failuresInARow = this.madeProgress ? 0 : failuresInARow + 1;
            if (failuresInARow > waits.length) {
              const saved = (await files.sizes()).part ?? 0;
              return void this.set({ status: "failed", doneBytes: saved, canResume: saved > 0, speed: 0, message: `${problem} The download stopped at ${sizeInWords(saved)} of ${sizeInWords(this.model.bytes)}. Press Resume to carry on.` });
            }
            const wait = waits[Math.max(0, failuresInARow - 1)];
            this.set({ message: `${problem} Trying again in ${Math.max(1, Math.round(wait / 1000))} seconds.`, speed: 0 });
            await this.deps.sleep(wait, signal);
          }
        }
        if (signal.aborted) return void (await this.stopped(run.reason ?? "pause"));
      }
      if (signal.aborted) return void (await this.stopped(run.reason ?? "pause"));
      await this.check("part");
    } catch (error) {
      if (signal.aborted) return void (await this.stopped(run.reason ?? "pause"));
      await this.fail(error instanceof Retryable || error instanceof Fatal ? error.message : `The download stopped because of a problem: ${asText(error)}`);
    }
  }

  /** Fetches what is still missing and saves it. True when the whole file is saved. Throws `Retryable` or `Fatal`, or the abort. */
  private async transfer(signal: AbortSignal): Promise<boolean> {
    const { files } = this.deps;
    const total = this.model.bytes;
    let offset = (await files.sizes()).part ?? 0;
    if (offset > total) {
      await files.remove("part");
      offset = 0;
    }
    if (offset === total) return true;
    let response: Response;
    try {
      response = await this.deps.fetch(modelUrl(this.model), { headers: offset > 0 ? { Range: `bytes=${offset}-` } : {}, signal });
    } catch {
      if (signal.aborted) throw new Retryable("Stopped.");
      throw new Retryable("The connection to the download site was lost.");
    }
    if (response.status === 404 || response.status === 410) throw new Fatal("The model file was not found at its address, so nothing was downloaded.");
    if (response.status === 401) throw new Fatal("The download site asked for a sign-in, which this program does not do, so nothing was downloaded.");
    if (response.status === 416) {
      await files.remove("part");
      throw new Retryable("What was saved did not fit the file, so it will start again.");
    }
    if (response.status !== 200 && response.status !== 206) throw new Retryable(`The download site answered with a problem (code ${response.status}).`);
    if (response.status === 200) {
      // The server sent the whole file whatever was asked for: it is taken from the start.
      const length = response.headers.get("Content-Length");
      if (length !== null && Number(length) !== total) throw new Fatal("The file at the address is not the size that was checked, so nothing was kept.");
      offset = 0;
    } else {
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("Content-Range") ?? "");
      if (range && (Number(range[1]) !== offset || Number(range[3]) !== total)) throw new Fatal("The file at the address is not the size that was checked, so nothing was kept.");
      const length = response.headers.get("Content-Length");
      if (length !== null && Number(length) !== total - offset) throw new Fatal("The file at the address is not the size that was checked, so nothing was kept.");
    }
    if (!response.body) throw new Retryable("The download site sent nothing.");
    const reader = response.body.getReader();
    const chunk = this.deps.chunkBytes ?? 4 * 1024 * 1024;
    let pieces: Uint8Array[] = [];
    let waiting = 0;
    const flush = async () => {
      if (waiting === 0) return;
      const bytes = concat(pieces, waiting);
      pieces = [];
      waiting = 0;
      try {
        offset = await files.append(offset, bytes);
      } catch (error) {
        const words = asText(error);
        if (/out of step/.test(words)) throw new Retryable("The saved file was not where the download expected, so it is starting again from what is saved.");
        if (/space|os error 112/i.test(words)) throw new Fatal("The disk is full, so the download stopped. Free some space, then press Resume.");
        throw new Fatal(`The file could not be saved. ${words}`);
      }
      this.madeProgress = true;
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        pieces.push(value);
        waiting += value.length;
        if (offset + waiting > total) throw new Fatal("The download site sent more than the file should hold, so the download was stopped.");
        this.noteProgress(offset + waiting);
        if (waiting >= chunk) await flush();
      }
    } catch (error) {
      // What had arrived is kept, then the problem is passed on.
      try {
        await flush();
      } catch {
        /* the first problem is the one to report */
      }
      if (error instanceof Fatal || error instanceof Retryable) throw error;
      if (signal.aborted) throw new Retryable("Stopped.");
      throw new Retryable("The connection to the download site was lost.");
    }
    await flush();
    if (offset !== total) throw new Retryable("The connection ended before the whole file had arrived.");
    return true;
  }

  /** Updates the progress at most four times a second, with the speed over the last few seconds. */
  private noteProgress(bytes: number): void {
    const at = this.deps.now();
    this.samples.push({ at, bytes });
    while (this.samples.length > 1 && at - this.samples[0].at > 10_000) this.samples.shift();
    if (at - this.lastEmit < 250 && this.state.status === "downloading" && bytes < this.model.bytes) return;
    const first = this.samples[0];
    const span = at - first.at;
    const speed = span >= 2000 ? ((bytes - first.bytes) / span) * 1000 : 0;
    this.set({ status: "downloading", doneBytes: bytes, canResume: true, speed, message: `Downloading: ${progressWords(bytes, this.model.bytes, speed)}` });
  }

  /** Works out the fingerprint of the half-finished file (`part`, to be put in place if it is right) or the finished one (`model`). */
  private async check(which: "part" | "model"): Promise<void> {
    const { files } = this.deps;
    this.set({ status: "verifying", doneBytes: this.model.bytes, canResume: false, speed: 0, message: "Checking that the file is the right one. This takes a little while." });
    let hash: string;
    try {
      hash = await files.hash(which, (done, total) => {
        if (this.deps.now() - this.lastEmit >= 250) this.set({ message: `Checking that the file is the right one: ${total > 0 ? Math.floor((done / total) * 100) : 0}%.` });
      });
    } catch (error) {
      this.set({ status: which === "model" ? "unchecked" : "failed", canResume: false, message: `The file could not be checked. ${asText(error)}` });
      return;
    }
    if (hash !== this.model.sha256) {
      await files.remove("all");
      this.set({ status: "damaged", doneBytes: 0, canResume: false, message: "The file did not match the one that was checked, so it was deleted. Download it again." });
      return;
    }
    if (which === "part") await files.finish();
    await files.saveRecord(JSON.stringify({ file: this.model.file, bytes: this.model.bytes, sha256: this.model.sha256, verifiedAt: new Date(this.deps.now()).toISOString() }));
    this.set({ status: "ready", doneBytes: this.model.bytes, canResume: false, speed: 0, message: "Ready. The model was downloaded and checked." });
  }
}
