// A stand-in for the shell's model files (src-tauri/src/models.rs), for tests: the same rules (a piece must start exactly where the saved file ends; the same words when it does not),
// kept in memory, with the ways it can go wrong switched on by a test. Not a test itself.
import { createHash } from "node:crypto";
import type { MachineFacts, ModelFiles, ModelSizes } from "../src/ai/download.ts";

export interface FakeFiles extends ModelFiles {
  /** What is "on disk". */
  part: Buffer | null;
  model: Buffer | null;
  licence: string | null;
  record: string | null;
  facts_: MachineFacts;
  /** Make the next `append` fail with this message. */
  failAppendWith: string | null;
  appends: number[];
  removed: string[];
}

export function fakeFiles(facts: Partial<MachineFacts> = {}): FakeFiles {
  const f: FakeFiles = {
    part: null,
    model: null,
    licence: null,
    record: null,
    facts_: { freeDiskBytes: 100e9, totalMemoryBytes: 16e9, folder: "C:\\stand-in", ...facts },
    failAppendWith: null,
    appends: [],
    removed: [],
    async facts() {
      return f.facts_;
    },
    async sizes(): Promise<ModelSizes> {
      return { model: f.model?.length ?? null, part: f.part?.length ?? null, licence: f.licence?.length ?? null, record: f.record };
    },
    async append(offset, bytes) {
      if (f.failAppendWith) {
        const words = f.failAppendWith;
        f.failAppendWith = null;
        throw words;
      }
      const now = f.part?.length ?? 0;
      if (offset !== 0 && offset !== now) throw `The download got out of step (the file is ${now} bytes and the next piece starts at ${offset}). It will start again from what is saved.`;
      f.part = offset === 0 ? Buffer.from(bytes) : Buffer.concat([f.part ?? Buffer.alloc(0), bytes]);
      f.appends.push(offset);
      return f.part.length;
    },
    async finish() {
      f.model = f.part;
      f.part = null;
    },
    async remove(what) {
      f.removed.push(what);
      f.part = null;
      if (what === "all") {
        f.model = null;
        f.record = null;
        f.licence = null;
      }
    },
    async hash(which, onProgress) {
      const bytes = which === "model" ? f.model : f.part;
      if (!bytes) throw "The file could not be opened to check it.";
      onProgress(bytes.length, bytes.length);
      return createHash("sha256").update(bytes).digest("hex");
    },
    async saveRecord(text) {
      f.record = text;
    },
    async writeLicence(text) {
      f.licence = text;
    },
    async readLicence() {
      return f.licence;
    },
  };
  return f;
}
