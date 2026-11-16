// The author's own key for a hosted AI service (OpenAI, Anthropic or Google): the answerer, and the rule that nothing is sent until the author has seen exactly what would be.
// Part 7 of docs/local-ai-plan.md, written up in docs/ai-keys.md. The key is read from Windows' protected store (src-tauri/src/keys.rs) at the moment of a question, is sent only to the
// one address its service has here, and is never put in a message the author reads. Everything works without a key: this is only one of the three choices in AI help.
//
// Meant to be lifted out whole when the core has one AI runtime and settings page (C8: CORE-REQUESTS.md, request 3).
import { AiError, type Answer, type Answerer, type AskOptions, type ChatMessage } from "./types.ts";

export type CloudService = "openai" | "anthropic" | "gemini";

export interface ServiceInfo {
  id: CloudService;
  /** How the service is named in words. */
  name: string;
  /** The one address a question and the key go to. The page's security policy allows these three and nothing else. */
  host: string;
  /** A model used when the author has not chosen one, or `null` when the author must name one (names change, and a wrong guess would fail every question). */
  defaultModel: string | null;
  /** Where the author gets a key, in words. */
  keyHelp: string;
}

export const SERVICES: readonly ServiceInfo[] = [
  { id: "openai", name: "OpenAI (the makers of ChatGPT)", host: "api.openai.com", defaultModel: null, keyHelp: "Make a key on OpenAI's developer pages (platform.openai.com), under API keys. It is not your ChatGPT password." },
  { id: "anthropic", name: "Anthropic (the makers of Claude)", host: "api.anthropic.com", defaultModel: "claude-sonnet-5-5", keyHelp: "Make a key in the Anthropic Console (console.anthropic.com), under API keys. It is not your Claude password." },
  { id: "gemini", name: "Google (Gemini)", host: "generativelanguage.googleapis.com", defaultModel: null, keyHelp: "Make a key in Google AI Studio (aistudio.google.com), under Get API key. It is not your Google password." },
];

export function serviceInfo(id: string): ServiceInfo {
  const found = SERVICES.find((s) => s.id === id);
  if (!found) throw new AiError("not-ready", "That is not one of the AI services OpenExplainer can use with your own key.");
  return found;
}

export const DEFAULT_TIMEOUT_MS = 120_000;

/** Where the key comes from. The real one asks the shell; a test gives a pretend one. */
export interface KeyStore {
  /** The key for a service, or `null` when none is saved. */
  get(service: CloudService): Promise<string | null>;
}

/** What the author is shown before the first question to a service goes. Resolves to whether they agreed. */
export type Disclose = (what: { service: ServiceInfo; model: string; messages: ChatMessage[]; schema?: object }) => Promise<boolean>;

export interface CloudDeps {
  keys: KeyStore;
  /** The model the author chose for this service, if any. */
  model?: string;
  fetch?: typeof fetch;
}

/** The models' names as a service spells them. */
function modelFor(info: ServiceInfo, chosen: string | undefined): string {
  const model = (chosen ?? "").trim() || info.defaultModel;
  if (!model) throw new AiError("not-ready", `Type the name of the ${info.name.split(" (")[0]} model to use in AI help. It is the name the service lists for your key; names change, so none is chosen for you.`);
  return model;
}

const SCHEMA_WORDS = (schema: object) => `Answer only with JSON that follows this JSON schema, with nothing before or after it:\n${JSON.stringify(schema)}`;

/** The system words (joined) and the rest of the messages, for the services that keep them apart. */
function split(messages: ChatMessage[], schema?: object): { system: string; turns: ChatMessage[] } {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content);
  if (schema) system.push(SCHEMA_WORDS(schema));
  return { system: system.join("\n\n"), turns: messages.filter((m) => m.role !== "system") };
}

interface Built {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** The request for one question, in the service's own words. Exported so it can be tested without a network. */
export function buildRequest(info: ServiceInfo, key: string, model: string, messages: ChatMessage[], options: AskOptions = {}): Built {
  switch (info.id) {
    case "openai": {
      // Some newer models accept only their own temperature, so none is sent.
      const body: Record<string, unknown> = { model, messages: messages.map((m) => ({ role: m.role, content: m.content })) };
      if (options.maxTokens) body.max_completion_tokens = options.maxTokens;
      if (options.jsonSchema) {
        body.response_format = { type: "json_object" };
        body.messages = [...(body.messages as ChatMessage[]), { role: "system", content: SCHEMA_WORDS(options.jsonSchema) }];
      }
      return { url: `https://${info.host}/v1/chat/completions`, headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body) };
    }
    case "anthropic": {
      const { system, turns } = split(messages, options.jsonSchema);
      const body: Record<string, unknown> = { model, max_tokens: options.maxTokens ?? 1024, messages: turns.map((m) => ({ role: m.role, content: m.content })) };
      if (system) body.system = system;
      if (options.temperature !== undefined) body.temperature = Math.min(1, Math.max(0, options.temperature));
      // The page is a browser page, which Anthropic only answers when told that is meant.
      return { url: `https://${info.host}/v1/messages`, headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify(body) };
    }
    case "gemini": {
      const { system, turns } = split(messages, options.jsonSchema);
      const config: Record<string, unknown> = {};
      if (options.maxTokens) config.maxOutputTokens = options.maxTokens;
      if (options.temperature !== undefined) config.temperature = Math.min(2, Math.max(0, options.temperature));
      if (options.jsonSchema) config.responseMimeType = "application/json";
      const body: Record<string, unknown> = { contents: turns.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })), generationConfig: config };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      const name = model.startsWith("models/") ? model : `models/${model}`;
      return { url: `https://${info.host}/v1beta/${name}:generateContent`, headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) };
    }
  }
}

/** The words of the answer, and whether it stopped short, from the service's reply. `null` when the reply is not in the shape the service documents. */
export function readReply(info: ServiceInfo, reply: unknown): Answer | null {
  const r = (reply && typeof reply === "object" ? reply : {}) as Record<string, any>;
  switch (info.id) {
    case "openai": {
      const choice = r.choices?.[0];
      return typeof choice?.message?.content === "string" ? { text: choice.message.content.trim(), truncated: choice.finish_reason === "length" } : null;
    }
    case "anthropic": {
      const parts = Array.isArray(r.content) ? r.content.filter((c: any) => c?.type === "text" && typeof c.text === "string") : [];
      return parts.length > 0 ? { text: parts.map((c: any) => c.text).join("").trim(), truncated: r.stop_reason === "max_tokens" } : null;
    }
    case "gemini": {
      const candidate = r.candidates?.[0];
      const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts.filter((p: any) => typeof p?.text === "string") : [];
      return parts.length > 0 ? { text: parts.map((p: any) => p.text).join("").trim(), truncated: candidate.finishReason === "MAX_TOKENS" } : null;
    }
  }
}

/** What the service said went wrong, in a sentence a person can use. The key is never in it, even if the service quoted part of it back. */
export function describeFailure(info: ServiceInfo, status: number, serviceWords: string, key: string): AiError {
  const name = info.name.split(" (")[0];
  const clean = (serviceWords || "").replace(key, "…").replace(/\s+/g, " ").trim().slice(0, 200);
  const said = clean ? ` It said: "${clean}"` : "";
  if (status === 401 || status === 403) return new AiError("refused", `${name} did not accept your key. Check that it is the whole key, that it has not been turned off, and that it is the key for ${name}.${said}`);
  if (status === 404) return new AiError("failed", `${name} does not know that model, or your key cannot use it. Check the model's name in AI help.${said}`);
  if (status === 429) return new AiError("busy", `${name} says you have asked too much for now (a limit on your key or account). Wait a little, or look at your limits on its website.${said}`);
  if (status === 400) return new AiError("failed", `${name} could not use the question.${said}`);
  if (status >= 500) return new AiError("failed", `${name} had a problem on its side (${status}). Try again in a little while.${said}`);
  return new AiError("failed", `${name} answered with an error (${status}).${said}`);
}

/** What the service's error body said, if it is the usual `{error: {message}}` shape. */
function serviceWordsOf(body: unknown): string {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, any>;
  const message = b.error?.message ?? b.error;
  return typeof message === "string" ? message : "";
}

/**
 * The answerer for one service. Before the first question of this session it asks `disclose` to show the author exactly what would be sent, and sends nothing if they say no.
 * `agreed` is the services the author already agreed to this session, so they are shown the words once for each service and not for every question.
 */
export function createCloudAnswerer(service: CloudService, deps: CloudDeps, disclose: Disclose, agreed: Set<CloudService> = new Set()): Answerer {
  const info = serviceInfo(service);
  const doFetch = deps.fetch ?? globalThis.fetch.bind(globalThis);
  return {
    name: `key:${service}`,
    async ask(messages: ChatMessage[], options: AskOptions = {}): Promise<Answer> {
      if (!Array.isArray(messages) || messages.length === 0 || messages.some((m) => !m || !["system", "user", "assistant"].includes(m.role) || typeof m.content !== "string")) {
        throw new AiError("bad-answer", "There was nothing to ask, or a message was not in the right form.");
      }
      const model = modelFor(info, deps.model);
      const key = await deps.keys.get(service);
      if (!key) throw new AiError("not-ready", `There is no key saved for ${info.name.split(" (")[0]}. Paste one in AI help, under My own key.`);
      if (!agreed.has(service)) {
        const yes = await disclose({ service: info, model, messages, ...(options.jsonSchema ? { schema: options.jsonSchema } : {}) });
        if (!yes) throw new AiError("cancelled", "Nothing was sent. You chose not to send it.");
        agreed.add(service);
      }
      // Stopped while the author was reading what would be sent: nothing goes out.
      if (options.signal?.aborted) throw new AiError("cancelled", "The question was cancelled. Nothing was sent.");
      const request = buildRequest(info, key, model, messages, options);
      const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
      let response: Response;
      try {
        response = await doFetch(request.url, { method: "POST", headers: request.headers, body: request.body, signal });
      } catch (error) {
        if (options.signal?.aborted) throw new AiError("cancelled", "The question was cancelled.");
        if (timeout.aborted) throw new AiError("timeout", `${info.name.split(" (")[0]} did not answer in time. Nothing was changed.`);
        throw new AiError("unreachable", `OpenExplainer could not reach ${info.host}. Check the internet connection. Nothing was changed.`);
      }
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // an answer that is not JSON is handled below
      }
      if (!response.ok) throw describeFailure(info, response.status, serviceWordsOf(body), key);
      const answer = readReply(info, body);
      if (!answer) throw new AiError("bad-answer", `${info.name.split(" (")[0]} answered, but not in a form OpenExplainer can read.`);
      return answer;
    },
  };
}

/** The exact words the author is shown before a first question: where it goes, which model, and every message as it will be sent. */
export function disclosureWords(what: { service: ServiceInfo; model: string; messages: ChatMessage[]; schema?: object }): { heading: string; intro: string; body: string } {
  const label: Record<ChatMessage["role"], string> = { system: "Instructions", user: "Your text", assistant: "Earlier answer" };
  const parts = what.messages.map((m) => `${label[m.role]}:\n${m.content}`);
  if (what.schema) parts.push(`The answer must follow this shape:\n${JSON.stringify(what.schema)}`);
  return {
    heading: `Send this to ${what.service.name.split(" (")[0]}?`,
    intro: `This is exactly what OpenExplainer will send to ${what.service.host}, with your key, using the model "${what.model}". It leaves this PC and goes to that service. Nothing else is sent, no picture is sent, and you will not be asked again for this service until the app is closed.`,
    body: parts.join("\n\n"),
  };
}
