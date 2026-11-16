// The AI parts as the app uses them: the one runtime that starts the model's program, and a connector for whatever the author chose in AI help.
import { invoke } from "@tauri-apps/api/core";
import { createConnector } from "./connector.ts";
import { getDownloader, modelSource } from "./model-state.ts";
import { createRuntime, randomKey, sensibleThreads, type Runtime, type RuntimeShell } from "./runtime.ts";
import { cleanAiSettings, type AiSettings } from "./settings.ts";
import type { Answerer } from "./types.ts";
import type { CloudService } from "./cloud.ts";

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

/** The services the author has agreed to send to since the app opened, so the exact words are shown once for each and not for every question. */
const agreed = new Set<CloudService>();

/** Where the author's own keys are kept: Windows' protected store, asked only at the moment of a question (src-tauri/src/keys.rs). */
export const keyStore = { get: (service: CloudService) => invoke<string | null>("ai_key_get", { service }) };

/** What the shell says about a key: whether one is saved, its last four characters, and a problem in words if Windows cannot unlock it. Never the key. */
export interface KeyState {
  saved: boolean;
  last4: string | null;
  problem: string | null;
}

export const keyStatusFor = (service: CloudService) => invoke<KeyState>("ai_key_status", { service });

/** Which hosted service and which of its models the author chose for their own key. */
export async function cloudChoice(): Promise<{ service: CloudService; model: string | undefined }> {
  const saved = (await invoke<{ service?: string; models?: Record<string, string> }>("ai_cloud_get")) ?? {};
  const service = (["openai", "anthropic", "gemini"].includes(String(saved.service)) ? saved.service : "openai") as CloudService;
  return { service, model: saved.models?.[service] };
}

/**
 * The answerer for what the author chose in AI help right now, and the name to record on a draft ("model name" for the built-in model, "service:model" for a key).
 * With their own key, the first question to a service is held until the author has seen exactly what would be sent.
 */
export async function chosenAnswerer(): Promise<{ answerer: Answerer; model: string; settings: AiSettings }> {
  const settings = cleanAiSettings(await invoke("ai_settings_get"));
  if (settings.choice === "key") {
    const { service, model } = await cloudChoice();
    const answerer = createConnector(settings, { fetch: (input, init) => globalThis.fetch(input, init), cloud: { service, model, keys: keyStore, disclose: async (what) => (await import("../ai-send-dialog.ts")).discloseDialog(what), agreed } });
    return { answerer, model: `${service}:${model ?? "default"}`, settings };
  }
  return { answerer: appConnector(settings), model: modelSource().file, settings };
}

/** The answerer for the author's choice. Everything that wants a draft asks this. */
export function appConnector(settings: AiSettings): Answerer {
  return createConnector(settings, { local: getRuntime(), fetch: (input, init) => globalThis.fetch(input, init) });
}
