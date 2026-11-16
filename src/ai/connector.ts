// The connector: one place that turns the author's AI help choice into an answerer. The rest of the app asks `createConnector(settings).ask(...)` and does not care who answers.
//
// The built-in model needs the runtime that starts it and the model file (parts 2 and 3 of docs/local-ai-plan.md). Until those exist the connector says so in words instead of failing oddly.
import type { AiSettings } from "./settings.ts";
import { createLocalAnswerer, type Connection, type LocalDeps } from "./local.ts";
import { AiError, type Answer, type Answerer, type AskOptions, type ChatMessage } from "./types.ts";
import { createCloudAnswerer, type CloudService, type Disclose, type KeyStore } from "./cloud.ts";

/** Starts the built-in model's program if it is not running, and says where it is. Throws an `AiError` ("not-ready") if the model is not on this PC. */
export interface LocalServer {
  ensureRunning(signal?: AbortSignal): Promise<Connection>;
  /** Called when the program did not answer, so the next question starts it again instead of trusting where it was. */
  reset?(): void;
}

/** What the author's own key needs: which service and model, where the key is kept, and how the author is shown what would be sent. Only the app's window can give this, so nothing unattended ever uses a key. */
export interface CloudSetup {
  service: CloudService;
  model?: string;
  keys: KeyStore;
  disclose: Disclose;
  /** The services the author has already agreed to send to since the app opened. */
  agreed?: Set<CloudService>;
}

export interface ConnectorDeps extends LocalDeps {
  local?: LocalServer;
  cloud?: CloudSetup;
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
      if (!deps.cloud) return unavailable("key", new AiError("not-ready", "Your own key is used only in the OpenExplainer window, where you can see what is about to be sent. Nothing was sent."));
      return createCloudAnswerer(deps.cloud.service, { keys: deps.cloud.keys, model: deps.cloud.model, fetch: deps.fetch }, deps.cloud.disclose, deps.cloud.agreed);
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
