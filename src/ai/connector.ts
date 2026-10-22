// The connector: one place that turns the author's AI help choice into an answerer. The rest of the app asks `createConnector(settings).ask(...)` and does not care who answers.
//
// The built-in model needs the runtime that starts it and the model file (parts 2 and 3 of docs/local-ai-plan.md). Until those exist the connector says so in words instead of failing oddly.
import type { AiSettings } from "./settings.ts";
import { createLocalAnswerer, type Connection, type LocalDeps } from "./local.ts";
import { AiError, type Answer, type Answerer, type AskOptions, type ChatMessage } from "./types.ts";

/** Starts the built-in model's program if it is not running, and says where it is. Throws an `AiError` ("not-ready") if the model is not on this PC. */
export interface LocalServer {
  ensureRunning(signal?: AbortSignal): Promise<Connection>;
  /** Called when the program did not answer, so the next question starts it again instead of trusting where it was. */
  reset?(): void;
}

export interface ConnectorDeps extends LocalDeps {
  local?: LocalServer;
}

function unavailable(name: string, error: AiError): Answerer {
  return {
    name,
    async ask(): Promise<Answer> {
      throw error;
    },
  };
}

export function createConnector(settings: AiSettings, deps: ConnectorDeps = {}): Answerer {
  switch (settings.choice) {
    case "none":
      return unavailable("none", new AiError("off", "AI help is off. Turn it on with the AI help button if you want drafts."));
    case "key":
      return unavailable("key", new AiError("not-ready", "Using your own key for ChatGPT, Claude or Gemini is not built yet."));
    case "builtin": {
      const server = deps.local;
      if (!server) return unavailable("built-in", new AiError("not-ready", "The built-in model is not on this PC yet, so nothing can be drafted."));
      return {
        name: "built-in",
        async ask(messages: ChatMessage[], options?: AskOptions): Promise<Answer> {
          // If the program has gone away since it was last used (stopped from outside, or it crashed), it is started again, once, before giving up.
          for (let attempt = 0; ; attempt++) {
            const connection = await server.ensureRunning(options?.signal);
            try {
              return await createLocalAnswerer(connection, { fetch: deps.fetch }).ask(messages, options);
            } catch (error) {
              if (error instanceof AiError && error.code === "unreachable") {
                server.reset?.();
                if (attempt === 0) continue;
              }
              throw error;
            }
          }
        },
      };
    }
  }
}
