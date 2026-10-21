// The one downloader for the built-in model, and what the rest of the app asks of it: is the model there? It lives for as long as the app does, so a download carries on when the AI help
// dialog is closed, and the dialog shows where it has got to when it is opened again.
import { ModelDownloader, modelStateOf, type DownloadState } from "./download.ts";
import { BUILTIN_MODEL, type ModelInfo } from "./model-info.ts";
import type { ModelState } from "./settings.ts";
import { createShellFiles } from "./shell-files.ts";

/** The model to use. Only a test in a development build can swap in a stand-in (and a stand-in server); the real program always uses the pinned model. */
export function modelSource(): ModelInfo {
  const test = import.meta.env?.DEV ? (globalThis as { __OE_TEST_MODEL__?: ModelInfo }).__OE_TEST_MODEL__ : undefined;
  return test ?? BUILTIN_MODEL;
}

let current: ModelDownloader | null = null;
/** Who wants to hear about changes, whichever downloader is current (a test swaps the downloader, the listeners stay). */
const watchers = new Set<(state: DownloadState) => void>();
let unwatch: (() => void) | null = null;

export function getDownloader(): ModelDownloader {
  if (!current) {
    const model = modelSource();
    current = new ModelDownloader(model, {
      fetch: (input, init) => globalThis.fetch(input, init),
      files: createShellFiles(model.file),
      sleep: (ms, signal) =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, ms);
          signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
        }),
      now: () => Date.now(),
      sha256Hex: async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))).map((b) => b.toString(16).padStart(2, "0")).join(""),
    });
    unwatch = current.subscribe((state) => {
      for (const fn of [...watchers]) fn(state);
    });
  }
  return current;
}

/** Tells `fn` every time the model's download changes, for as long as the app runs. */
export function watchModel(fn: (state: DownloadState) => void): void {
  watchers.add(fn);
  getDownloader();
}

/** For a test in a development build: forget the downloader so the next one is made for the model now in `modelSource`. Whoever was watching keeps watching. */
export function forgetDownloader(): void {
  unwatch?.();
  unwatch = null;
  current = null;
  getDownloader();
}

/** Whether the model is usable, by looking at the files. */
export async function modelState(): Promise<ModelState> {
  return modelStateOf(await getDownloader().refresh());
}
