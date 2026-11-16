import test from "node:test";
import assert from "node:assert/strict";
import { SERVICES, buildRequest, createCloudAnswerer, describeFailure, disclosureWords, readReply, serviceInfo, type CloudService, type KeyStore } from "../src/ai/cloud.ts";
import { createConnector } from "../src/ai/connector.ts";
import { AiError, type ChatMessage } from "../src/ai/types.ts";

const KEY = "sk-secret-0123456789abcdef";
const messages: ChatMessage[] = [
  { role: "system", content: "You write short sentences for software documentation." },
  { role: "user", content: "Name the Save button." },
];
const keys = (map: Partial<Record<CloudService, string>> = { openai: KEY, anthropic: KEY, gemini: KEY }): KeyStore => ({ get: async (s) => map[s] ?? null });

/** A pretend network: remembers each request, answers with what it is told. */
function network(reply: unknown, status = 200) {
  const seen: { url: string; headers: Record<string, string>; body: any }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    seen.push({ url: String(url), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(reply), { status, headers: { "content-type": "application/json" } });
  };
  return { seen, fetcher };
}
const yes = async () => true;

test("each service is asked in its own words, at its own address, with the key where that service wants it", () => {
  const openai = buildRequest(serviceInfo("openai"), KEY, "gpt-x", messages, { maxTokens: 50, temperature: 0.2 });
  assert.equal(openai.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(openai.headers.authorization, `Bearer ${KEY}`);
  const o = JSON.parse(openai.body);
  assert.deepEqual([o.model, o.max_completion_tokens, o.temperature], ["gpt-x", 50, undefined], "no temperature: some newer models accept only their own");
  assert.deepEqual(o.messages, messages);

  const anthropic = buildRequest(serviceInfo("anthropic"), KEY, "claude-x", messages, { temperature: 3 });
  assert.equal(anthropic.url, "https://api.anthropic.com/v1/messages");
  assert.equal(anthropic.headers["x-api-key"], KEY);
  assert.equal(anthropic.headers["anthropic-version"], "2023-06-01");
  assert.equal(anthropic.headers["anthropic-dangerous-direct-browser-access"], "true");
  const a = JSON.parse(anthropic.body);
  assert.deepEqual([a.model, a.max_tokens, a.system, a.temperature], ["claude-x", 1024, messages[0].content, 1], "the system words travel apart, a temperature is kept in range");
  assert.deepEqual(a.messages, [{ role: "user", content: "Name the Save button." }]);

  const gemini = buildRequest(serviceInfo("gemini"), KEY, "gemini-x", [...messages, { role: "assistant", content: "Save" }, { role: "user", content: "Again." }], { maxTokens: 30 });
  assert.equal(gemini.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent");
  assert.equal(gemini.headers["x-goog-api-key"], KEY);
  const g = JSON.parse(gemini.body);
  assert.deepEqual(g.systemInstruction, { parts: [{ text: messages[0].content }] });
  assert.deepEqual(g.contents.map((c: { role: string }) => c.role), ["user", "model", "user"]);
  assert.equal(g.generationConfig.maxOutputTokens, 30);
  assert.equal(buildRequest(serviceInfo("gemini"), KEY, "models/gemini-x", messages).url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent");
  // the key is never in the address or the body
  for (const r of [openai, anthropic, gemini]) assert.ok(!r.url.includes(KEY) && !r.body.includes(KEY));
});

test("a JSON schema is asked for in words in each service, and the caller still checks the answer", () => {
  const schema = { type: "object", properties: { name: { type: "string" } } };
  const openai = JSON.parse(buildRequest(serviceInfo("openai"), KEY, "m", messages, { jsonSchema: schema }).body);
  assert.deepEqual(openai.response_format, { type: "json_object" });
  assert.match(openai.messages.at(-1).content, /Answer only with JSON that follows this JSON schema/);
  assert.match(JSON.parse(buildRequest(serviceInfo("anthropic"), KEY, "m", messages, { jsonSchema: schema }).body).system, /"name":\{"type":"string"\}/);
  const gemini = JSON.parse(buildRequest(serviceInfo("gemini"), KEY, "m", messages, { jsonSchema: schema }).body);
  assert.equal(gemini.generationConfig.responseMimeType, "application/json");
  assert.match(gemini.systemInstruction.parts[0].text, /JSON schema/);
});

test("each service's reply is read, with 'cut short' noticed", () => {
  assert.deepEqual(readReply(serviceInfo("openai"), { choices: [{ message: { content: " Save it. " }, finish_reason: "stop" }] }), { text: "Save it.", truncated: false });
  assert.equal(readReply(serviceInfo("openai"), { choices: [{ message: { content: "Sav" }, finish_reason: "length" }] })!.truncated, true);
  assert.deepEqual(readReply(serviceInfo("anthropic"), { content: [{ type: "text", text: "Save" }, { type: "text", text: " it." }], stop_reason: "end_turn" }), { text: "Save it.", truncated: false });
  assert.equal(readReply(serviceInfo("anthropic"), { content: [{ type: "text", text: "S" }], stop_reason: "max_tokens" })!.truncated, true);
  assert.deepEqual(readReply(serviceInfo("gemini"), { candidates: [{ content: { parts: [{ text: "Save" }] }, finishReason: "STOP" }] }), { text: "Save", truncated: false });
  assert.equal(readReply(serviceInfo("gemini"), { candidates: [{ content: { parts: [{ text: "S" }] }, finishReason: "MAX_TOKENS" }] })!.truncated, true);
  for (const s of SERVICES) assert.equal(readReply(s, { something: "else" }), null);
  assert.equal(readReply(serviceInfo("openai"), null), null);
});

test("nothing is sent until the author has seen exactly what would be, and 'do not send' sends nothing", async () => {
  const net = network({ choices: [{ message: { content: "Save." }, finish_reason: "stop" }] });
  let shown: { service: string; model: string; messages: ChatMessage[] } | null = null;
  const refuse = createCloudAnswerer("openai", { keys: keys(), model: "gpt-x", fetch: net.fetcher }, async (what) => { shown = { service: what.service.id, model: what.model, messages: what.messages }; return false; });
  await assert.rejects(() => refuse.ask(messages), (e: AiError) => e.code === "cancelled" && /Nothing was sent/.test(e.message));
  assert.equal(net.seen.length, 0, "no request was made");
  assert.deepEqual(shown, { service: "openai", model: "gpt-x", messages }, "the author was shown the very messages");
  // agreeing once covers the session for that service, and the question goes out
  const agreed = new Set<CloudService>();
  let asked = 0;
  const answerer = createCloudAnswerer("openai", { keys: keys(), model: "gpt-x", fetch: net.fetcher }, async () => { asked++; return true; }, agreed);
  assert.equal((await answerer.ask(messages)).text, "Save.");
  await answerer.ask(messages);
  assert.equal(asked, 1, "shown once for the session");
  assert.equal(net.seen.length, 2);
  assert.ok(agreed.has("openai") && !agreed.has("gemini"), "another service is shown separately");
});

test("a question that goes out carries the key only to its own service", async () => {
  for (const [service, reply] of [
    ["openai", { choices: [{ message: { content: "A" }, finish_reason: "stop" }] }],
    ["anthropic", { content: [{ type: "text", text: "A" }], stop_reason: "end_turn" }],
    ["gemini", { candidates: [{ content: { parts: [{ text: "A" }] }, finishReason: "STOP" }] }],
  ] as const) {
    const net = network(reply);
    const answer = await createCloudAnswerer(service, { keys: keys(), model: "m", fetch: net.fetcher }, yes).ask(messages);
    assert.equal(answer.text, "A");
    assert.equal(new URL(net.seen[0].url).hostname, serviceInfo(service).host);
  }
});

test("what is missing is said in words before anything is sent: no key, no model", async () => {
  const net = network({});
  const noKey = createCloudAnswerer("anthropic", { keys: keys({}), fetch: net.fetcher }, yes);
  await assert.rejects(() => noKey.ask(messages), (e: AiError) => e.code === "not-ready" && /no key saved for Anthropic/.test(e.message));
  const noModel = createCloudAnswerer("openai", { keys: keys(), fetch: net.fetcher }, yes);
  await assert.rejects(() => noModel.ask(messages), (e: AiError) => e.code === "not-ready" && /name of the OpenAI model/.test(e.message));
  // a service with a default model needs none typed
  const withDefault = network({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" });
  await createCloudAnswerer("anthropic", { keys: keys(), fetch: withDefault.fetcher }, yes).ask(messages);
  assert.equal(withDefault.seen[0].body.model, "claude-sonnet-5-5");
  assert.equal(net.seen.length, 0);
  await assert.rejects(() => createCloudAnswerer("openai", { keys: keys(), model: "m", fetch: net.fetcher }, yes).ask([]), (e: AiError) => e.code === "bad-answer");
});

test("a service's errors are said plainly, and the key is never in the words, even when the service quotes it", async () => {
  const cases: [number, string, RegExp][] = [
    [401, "refused", /did not accept your key/],
    [404, "failed", /does not know that model/],
    [429, "busy", /asked too much for now/],
    [400, "failed", /could not use the question/],
    [503, "failed", /problem on its side \(503\)/],
  ];
  for (const [status, code, words] of cases) {
    const net = network({ error: { message: `Incorrect API key provided: ${KEY}. See the docs.` } }, status);
    await assert.rejects(
      () => createCloudAnswerer("openai", { keys: keys(), model: "m", fetch: net.fetcher }, yes).ask(messages),
      (e: AiError) => {
        assert.equal(e.code, code);
        assert.match(e.message, words);
        assert.ok(!e.message.includes(KEY), "the key is not in the message");
        return true;
      },
    );
  }
  assert.match(describeFailure(serviceInfo("gemini"), 403, "", KEY).message, /Google did not accept your key/);
});

test("an answer in the wrong form, no network, a stop and a slow service are each said in words", async () => {
  const odd = network({ unexpected: true });
  await assert.rejects(() => createCloudAnswerer("openai", { keys: keys(), model: "m", fetch: odd.fetcher }, yes).ask(messages), (e: AiError) => e.code === "bad-answer");
  const down: typeof fetch = async () => { throw new TypeError("fetch failed"); };
  await assert.rejects(() => createCloudAnswerer("gemini", { keys: keys(), model: "m", fetch: down }, yes).ask(messages), (e: AiError) => e.code === "unreachable" && /could not reach generativelanguage\.googleapis\.com/.test(e.message));
  const controller = new AbortController();
  const stuck: typeof fetch = (_url, init) => new Promise((_resolve, reject) => {
    const stop = () => reject(new DOMException("aborted", "AbortError"));
    if (init?.signal?.aborted) stop();
    else init?.signal?.addEventListener("abort", stop);
  });
  const pending = createCloudAnswerer("openai", { keys: keys(), model: "m", fetch: stuck }, yes).ask(messages, { signal: controller.signal });
  controller.abort();
  await assert.rejects(() => pending, (e: AiError) => e.code === "cancelled");
  await assert.rejects(() => createCloudAnswerer("openai", { keys: keys(), model: "m", fetch: stuck }, yes).ask(messages, { timeoutMs: 20 }), (e: AiError) => e.code === "timeout");
});

test("the disclosure shows where the words go, with which model, and every message as it is sent", () => {
  const words = disclosureWords({ service: serviceInfo("anthropic"), model: "claude-sonnet-5-5", messages, schema: { type: "object" } });
  assert.equal(words.heading, "Send this to Anthropic?");
  assert.match(words.intro, /api\.anthropic\.com/);
  assert.match(words.intro, /"claude-sonnet-5-5"/);
  assert.match(words.intro, /no picture is sent/);
  assert.ok(words.body.includes("Instructions:\nYou write short sentences") && words.body.includes("Your text:\nName the Save button.") && words.body.includes('{"type":"object"}'));
});

test("the connector gives an answerer for a key only where the app can show what is sent, and says so elsewhere", async () => {
  const settings = { choice: "key" as const };
  await assert.rejects(() => createConnector(settings).ask(messages), (e: AiError) => e.code === "not-ready" && /only in the OpenExplainer window/.test(e.message));
  const net = network({ content: [{ type: "text", text: "Done." }], stop_reason: "end_turn" });
  const answerer = createConnector(settings, { fetch: net.fetcher, cloud: { service: "anthropic", keys: keys(), disclose: yes } });
  assert.equal(answerer.name, "key:anthropic");
  assert.equal((await answerer.ask(messages)).text, "Done.");
});
