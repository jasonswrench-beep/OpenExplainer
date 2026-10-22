// The AI parts as the app uses them: the one runtime that starts the model's program, and a connector for whatever the author chose in AI help.
import { invoke } from "@tauri-apps/api/core";
import { createConnector } from "./connector.ts";
import { getDownloader, modelSource } from "./model-state.ts";
import { createRuntime, randomKey, sensibleThreads, type Runtime, type RuntimeShell } from "./runtime.ts";
import type { AiSettings } from "./settings.ts";
import type { Answerer } from "./types.ts";

const shell: RuntimeShell = {
  start: ({ file, apiKey, context, threads }) => invoke<{ port: number; apiKey: string }>("ai_runtime_start", { file, apiKey, context, threads }),
  stop: () => invoke<void>("ai_runtime_stop"),
};

let current: Runtime | null = null;

export function getRuntime(): Runtime {
  if (!current) {
    current = createRuntime({
      shell,
      file: modelSource().file,
      modelReady: async () => (await getDownloader().refresh()).status === "ready",
      makeKey: randomKey,
      threads: () => sensibleThreads(navigator.hardwareConcurrency),
    });
  }
  return current;
}

/** For a test in a development build: forget the runtime so the next one is made for the model now in `modelSource`. */
export function forgetRuntime(): void {
  current = null;
}

/** The answerer for the author's choice. Everything that wants a draft asks this. */
export function appConnector(settings: AiSettings): Answerer {
  return createConnector(settings, { local: getRuntime(), fetch: (input, init) => globalThis.fetch(input, init) });
}
