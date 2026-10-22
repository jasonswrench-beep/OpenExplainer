// The built-in model's answerer: it talks to llama.cpp's `llama-server` (MIT licence), which the shell starts on this PC only (part 3 of docs/local-ai-plan.md). The server speaks the same
// "chat completions" language many AI programs do, one JSON question in and one JSON answer back, so this file needs no library.
//
// The guard "local stays local" is here in code: an answerer will not be made for any address that is not this PC, so the built-in model can never be pointed at the internet by mistake.
import { AiError, type Answer, type Answerer, type AskOptions, type ChatMessage } from "./types.ts";

/** Where the running server is and the password made for this run of it. The password is never shown or put in a message. */
export interface Connection {
  baseUrl: string;
  apiKey: string;
}

export interface LocalDeps {
  fetch?: typeof fetch;
}

/** Qwen 3.5's own recommended settings for plain (not step-by-step "thinking") answers, from its model card. */
const SAMPLING = { top_p: 0.8, top_k: 20, presence_penalty: 1.5 };

/** Long enough for a slow PC to write a ten-step procedure; the author can always cancel sooner. */
export const DEFAULT_TIMEOUT_MS = 300_000;

const THIS_PC = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Is this address on this PC itself (and plain http, since nothing leaves the PC)? */
export function isThisPc(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.protocol === "http:" && THIS_PC.has(url.hostname);
  } catch {
    return false;
  }
}

/** Takes out any "thinking" the model wrote, which is not part of the answer. A thought that never ended means the answer was cut off inside it, so nothing is left. */
export function withoutThinking(text: string): string {
  const closed = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const open = closed.indexOf("<think>");
  return (open >= 0 ? closed.slice(0, open) : closed).trim();
}

function checkMessages(messages: ChatMessage[]): void {
  if (!Array.isArray(messages) || messages.length === 0) throw new AiError("bad-answer", "There was nothing to ask the model.");
  for (const m of messages) {
    if (!m || !["system", "user", "assistant"].includes(m.role) || typeof m.content !== "string") throw new AiError("bad-answer", "A message to the model was not in the right form.");
  }
}

export function createLocalAnswerer(connection: Connection, deps: LocalDeps = {}): Answerer {
  if (!isThisPc(connection.baseUrl)) {
    throw new AiError("not-local", "The built-in model can only be used on this PC, so it was not started. Nothing was sent anywhere.");
  }
  const doFetch = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const url = `${connection.baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
  return {
    name: "built-in",
    async ask(messages: ChatMessage[], options: AskOptions = {}): Promise<Answer> {
      checkMessages(messages);
      const body = JSON.stringify({
        model: "local",
        messages,
        max_tokens: options.maxTokens ?? 512,
        temperature: options.temperature ?? 0.7,
        ...SAMPLING,
        stream: false,
        chat_template_kwargs: { enable_thinking: false },
        ...(options.jsonSchema ? { response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema: options.jsonSchema } } } : {}),
      });
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const stop = () => controller.abort();
      if (options.signal?.aborted) controller.abort();
      else options.signal?.addEventListener("abort", stop, { once: true });
      /** Why a wait ended early, in words. */
      const ended = (): AiError | null => (timedOut ? new AiError("timeout", "The model took too long to answer, so it was stopped. A slower PC may need a shorter request.") : options.signal?.aborted ? new AiError("cancelled", "Cancelled.") : null);
      try {
        let status: number;
        let text: string;
        try {
          const response = await doFetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${connection.apiKey}` }, body, signal: controller.signal });
          status = response.status;
          text = await response.text();
        } catch (error) {
          throw ended() ?? new AiError("unreachable", `The model program did not answer. ${error instanceof Error ? error.message : ""}`.trim());
        }
        if (status === 401 || status === 403) throw new AiError("refused", "The model program refused the request, so it was not used.");
        if (status === 503) throw new AiError("busy", "The model is still loading. Wait a moment and try again.");
        if (status < 200 || status >= 300) throw new AiError("failed", `The model program reported a problem (code ${status}).`);
        let choice: { message?: { content?: unknown }; finish_reason?: unknown } | undefined;
        try {
          choice = (JSON.parse(text) as { choices?: unknown[] }).choices?.[0] as typeof choice;
        } catch {
          throw new AiError("bad-answer", "The model's answer could not be read.");
        }
        const content = choice?.message?.content;
        if (typeof content !== "string") throw new AiError("bad-answer", "The model's answer could not be read.");
        const answer = withoutThinking(content);
        if (!answer) throw new AiError("bad-answer", "The model gave an empty answer.");
        return { text: answer, truncated: choice?.finish_reason === "length" };
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", stop);
      }
    },
  };
}
