// Starting and stopping the model's program (src-tauri/src/llama.rs) at the right times: it starts the first time something is asked of the built-in model, is shared by everything that asks after
// that, and is stopped when nothing has asked for ten minutes, when the author cancels while it is still loading, or when OpenExplainer ends (the shell sees to that last one).
//
// Nothing here touches Tauri: the shell is reached through `RuntimeShell`, so every path can be tried with a stand-in.
import type { Connection } from "./local.ts";
import type { LocalServer } from "./connector.ts";
import { AiError } from "./types.ts";

export interface RuntimeShell {
  /** Starts the program if it is not running with this model, waits until it answers, and says where it is. */
  start(request: { file: string; apiKey: string; context: number; threads: number }): Promise<{ port: number; apiKey: string }>;
  stop(): Promise<void>;
}

export interface RuntimeDeps {
  shell: RuntimeShell;
  /** The model's file name, as the shell knows it. */
  file: string;
  /** Is the model on this PC and checked? */
  modelReady(): Promise<boolean>;
  /** A fresh password for each run of the program. */
  makeKey(): string;
  threads(): number;
  context?: number;
  idleMs?: number;
  setTimer?(fn: () => void, ms: number): unknown;
  clearTimer?(handle: unknown): void;
}

export interface Runtime extends LocalServer {
  stop(): Promise<void>;
  isRunning(): boolean;
}

/** Half the processor's threads, between 2 and 8: the model's speed stops growing long before that, and the rest is left for the editor. */
export function sensibleThreads(logicalProcessors: number): number {
  return Math.max(2, Math.min(8, Math.floor((logicalProcessors || 4) / 2)));
}

/** 32 random letters and digits, made by the browser engine's own random source. */
export function randomKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const asText = (e: unknown): string => (typeof e === "string" ? e : e instanceof Error ? e.message : String(e));

export function createRuntime(deps: RuntimeDeps): Runtime {
  const idleMs = deps.idleMs ?? 10 * 60 * 1000;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let connection: Connection | null = null;
  let starting: Promise<Connection> | null = null;
  let timer: unknown = null;

  const stop = async (): Promise<void> => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    connection = null;
    await deps.shell.stop();
  };
  const idleSoon = () => {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => void stop().catch(() => undefined), idleMs);
  };

  const start = async (): Promise<Connection> => {
    if (!(await deps.modelReady())) throw new AiError("not-ready", "The built-in model is not on this PC yet (or has not been checked), so nothing can be drafted. Download it in AI help first.");
    try {
      const answer = await deps.shell.start({ file: deps.file, apiKey: deps.makeKey(), context: deps.context ?? 8192, threads: deps.threads() });
      return { baseUrl: `http://127.0.0.1:${answer.port}`, apiKey: answer.apiKey };
    } catch (error) {
      const words = asText(error);
      throw new AiError(/not on this PC yet/.test(words) ? "not-ready" : "failed", words);
    }
  };

  return {
    isRunning: () => connection !== null,
    stop,
    reset() {
      connection = null;
    },
    async ensureRunning(signal?: AbortSignal): Promise<Connection> {
      if (signal?.aborted) throw new AiError("cancelled", "Cancelled.");
      if (connection) {
        idleSoon();
        return connection;
      }
      if (!starting) {
        starting = start().then(
          (c) => {
            connection = c;
            starting = null;
            idleSoon();
            return c;
          },
          (e) => {
            starting = null;
            throw e;
          },
        );
      }
      if (!signal) return starting;
      // Cancelling while the program is still loading ends it, so nothing is left running that nobody wants.
      let onAbort: (() => void) | undefined;
      const cancelled = new Promise<never>((_, reject) => {
        onAbort = () => {
          void stop().catch(() => undefined);
          reject(new AiError("cancelled", "Cancelled."));
        };
        signal.addEventListener("abort", onAbort, { once: true });
      });
      try {
        return await Promise.race([starting, cancelled]);
      } finally {
        if (onAbort) signal.removeEventListener("abort", onAbort);
      }
    },
  };
}
