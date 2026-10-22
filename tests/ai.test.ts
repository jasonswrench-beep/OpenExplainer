import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { AI_CHOICES, DEFAULT_AI_SETTINGS, aiStatusWords, cleanAiSettings } from "../src/ai/settings.ts";
import { BUILTIN_MODEL, licenceUrl, modelPageUrl, modelUrl, sizeInWords } from "../src/ai/model-info.ts";
import { createLocalAnswerer, isThisPc, withoutThinking } from "../src/ai/local.ts";
import { createConnector } from "../src/ai/connector.ts";
import { AiError } from "../src/ai/types.ts";
import { startFakeLlama } from "./fake-llama.ts";

const ask = [{ role: "user" as const, content: "Name the Save button." }];

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof AiError, `an AiError, not ${String(error)}`);
    return error.code;
  }
  return "no error";
}

test("AI help starts at none, and a file with anything odd in it means none", () => {
  assert.deepEqual(DEFAULT_AI_SETTINGS, { choice: "none" });
  assert.deepEqual(cleanAiSettings(undefined), { choice: "none" });
  assert.deepEqual(cleanAiSettings(null), { choice: "none" });
  assert.deepEqual(cleanAiSettings("builtin"), { choice: "none" });
  assert.deepEqual(cleanAiSettings({ choice: 5 }), { choice: "none" });
  assert.deepEqual(cleanAiSettings({ choice: "telepathy" }), { choice: "none" });
  for (const choice of AI_CHOICES) assert.deepEqual(cleanAiSettings({ choice, other: 1 }), { choice });
});

test("the status words say what is true and never lean on colour", () => {
  assert.match(aiStatusWords({ choice: "none" }, "absent"), /^AI help is off\./);
  assert.match(aiStatusWords({ choice: "builtin" }, "absent"), /not on this PC yet, so nothing can be drafted/);
  assert.match(aiStatusWords({ choice: "builtin" }, "partial"), /only partly downloaded/);
  assert.match(aiStatusWords({ choice: "builtin" }, "damaged"), /damaged/);
  assert.equal(aiStatusWords({ choice: "builtin" }, "ready"), "AI help will use the built-in model on this PC.");
  assert.match(aiStatusWords({ choice: "key" }, "ready"), /not built yet/);
});

test("the pinned model is exactly the file that was audited, by commit and fingerprint, and its address cannot drift", () => {
  const m = BUILTIN_MODEL;
  assert.match(m.sha256, /^[0-9a-f]{64}$/);
  assert.match(m.licenceSha256, /^[0-9a-f]{64}$/);
  assert.match(m.commit, /^[0-9a-f]{40}$/);
  assert.match(m.licenceCommit, /^[0-9a-f]{40}$/);
  assert.equal(modelUrl(), `https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/${m.commit}/Qwen3.5-4B-Q4_K_M.gguf`);
  assert.ok(!/\/main\//.test(modelUrl()) && !/\/main\//.test(licenceUrl()), "a commit, never a branch");
  assert.equal(licenceUrl(), `https://huggingface.co/Qwen/Qwen3.5-4B/raw/${m.licenceCommit}/LICENSE`);
  assert.ok(modelPageUrl().includes(m.commit));
  assert.equal(m.licenceName, "Apache License 2.0");
  // The plan says in words which file was audited. If the table and the plan ever disagree, one of them is wrong.
  const plan = fs.readFileSync(new URL("../docs/local-ai-plan.md", import.meta.url), "utf8");
  for (const fact of [m.sha256, m.licenceSha256, m.commit, m.licenceCommit, m.bytes.toLocaleString("en-US"), m.licenceBytes.toLocaleString("en-US"), m.file, m.repo]) {
    assert.ok(plan.includes(fact), `docs/local-ai-plan.md names ${fact}`);
  }
});

test("sizes are said in words", () => {
  assert.equal(sizeInWords(BUILTIN_MODEL.bytes), "2.7 GB");
  assert.equal(sizeInWords(672_423_616), "672 MB");
  assert.equal(sizeInWords(11_544), "12 KB");
  assert.equal(sizeInWords(10), "1 KB");
});

test("only this PC counts as this PC", () => {
  for (const ok of ["http://127.0.0.1:8080", "http://localhost:9", "http://[::1]:5000/"]) assert.ok(isThisPc(ok), ok);
  for (const no of ["https://127.0.0.1:8080", "http://192.168.1.5:8080", "http://example.com", "http://127.0.0.1.evil.com", "http://localhost.evil.com:80", "ftp://127.0.0.1", "not a url", ""]) assert.ok(!isThisPc(no), no);
});

test("thinking the model wrote is not part of the answer", () => {
  assert.equal(withoutThinking("Saves your work."), "Saves your work.");
  assert.equal(withoutThinking("<think>\n\n</think>\n\nSaves your work."), "Saves your work.");
  assert.equal(withoutThinking("<think>hmm</think>A<think>again</think>B"), "AB");
  assert.equal(withoutThinking("Start <think>never ended"), "Start", "an unfinished thought is cut off");
  assert.equal(withoutThinking("<think>only a thought"), "");
});

test("a question reaches the model with the password, the right settings and no thinking, and the answer comes back whole", async () => {
  const fake = await startFakeLlama("secret-for-this-run");
  try {
    const answerer = createLocalAnswerer({ baseUrl: fake.baseUrl, apiKey: fake.apiKey });
    fake.behave({ reply: "Saves the project to a file." });
    const answer = await answerer.ask([{ role: "system", content: "Write one sentence." }, ...ask], { maxTokens: 64, temperature: 0.2 });
    assert.deepEqual(answer, { text: "Saves the project to a file.", truncated: false });
    assert.equal(fake.requests.length, 1);
    const r = fake.requests[0];
    assert.equal(r.url, "/v1/chat/completions");
    assert.equal(r.authorization, "Bearer secret-for-this-run");
    assert.equal(r.body.max_tokens, 64);
    assert.equal(r.body.temperature, 0.2);
    assert.equal(r.body.stream, false);
    assert.deepEqual(r.body.chat_template_kwargs, { enable_thinking: false });
    assert.equal(r.body.top_k, 20);
    assert.equal((r.body.messages as unknown[]).length, 2);
    const again = await answerer.ask(ask);
    assert.equal(fake.requests[1].body.max_tokens, 512, "a short default");
    assert.equal(fake.requests[1].body.temperature, 0.7);
    assert.equal(again.text, "Saves the project to a file.");
    assert.equal("response_format" in fake.requests[1].body, false, "an answer is shaped only when asked");
    const schema = { type: "object", properties: { boxes: { type: "array" } }, required: ["boxes"] };
    await answerer.ask(ask, { jsonSchema: schema });
    assert.deepEqual(fake.requests[2].body.response_format, { type: "json_schema", json_schema: { name: "answer", strict: true, schema } }, "the model program is told the shape the answer must have");
  } finally {
    await fake.close();
  }
});

test("an answer that was cut short says so, and thinking is taken out", async () => {
  const fake = await startFakeLlama();
  try {
    const answerer = createLocalAnswerer({ baseUrl: fake.baseUrl, apiKey: fake.apiKey });
    fake.behave({ reply: "Click **File**, then", finishReason: "length" });
    assert.deepEqual(await answerer.ask(ask), { text: "Click **File**, then", truncated: true });
    fake.behave({ reply: "<think>\nplan\n</think>\nSaves.", finishReason: "stop" });
    assert.deepEqual(await answerer.ask(ask), { text: "Saves.", truncated: false });
  } finally {
    await fake.close();
  }
});

test("every way the program can go wrong is said in words with its own code, and the password is never in the words", async () => {
  const fake = await startFakeLlama("do-not-print-me");
  try {
    const good = { baseUrl: fake.baseUrl, apiKey: fake.apiKey };
    fake.behave({ status: 503 });
    assert.equal(await codeOf(createLocalAnswerer(good).ask(ask)), "busy");
    fake.behave({ status: 500 });
    assert.equal(await codeOf(createLocalAnswerer(good).ask(ask)), "failed");
    fake.behave({ status: 200, rawBody: "not json at all" });
    assert.equal(await codeOf(createLocalAnswerer(good).ask(ask)), "bad-answer");
    fake.behave({ rawBody: JSON.stringify({ choices: [] }) });
    assert.equal(await codeOf(createLocalAnswerer(good).ask(ask)), "bad-answer");
    fake.behave({ rawBody: JSON.stringify({ choices: [{ message: { content: 7 } }] }) });
    assert.equal(await codeOf(createLocalAnswerer(good).ask(ask)), "bad-answer");
    fake.behave({ rawBody: JSON.stringify({ choices: [{ message: { content: "   " } }] }) });
    assert.equal(await codeOf(createLocalAnswerer(good).ask(ask)), "bad-answer");
    fake.behave({ rawBody: undefined, status: 200 });
    // The wrong password.
    const wrong = createLocalAnswerer({ baseUrl: fake.baseUrl, apiKey: "not-the-password" });
    assert.equal(await codeOf(wrong.ask(ask)), "refused");
    try {
      await wrong.ask(ask);
    } catch (error) {
      assert.ok(!(error as Error).message.includes("not-the-password") && !(error as Error).message.includes("do-not-print-me"));
    }
    // Nothing to ask, or a message in the wrong form.
    assert.equal(await codeOf(createLocalAnswerer(good).ask([])), "bad-answer");
    assert.equal(await codeOf(createLocalAnswerer(good).ask([{ role: "robot", content: "x" } as never])), "bad-answer");
    assert.equal(await codeOf(createLocalAnswerer(good).ask([{ role: "user", content: 5 } as never])), "bad-answer");
  } finally {
    await fake.close();
  }
  // Nobody is there at all.
  const gone = createLocalAnswerer({ baseUrl: fake.baseUrl, apiKey: "x" });
  assert.equal(await codeOf(gone.ask(ask)), "unreachable");
});

test("a slow model is stopped at the time limit, and the author can cancel at once, before or during the wait", async () => {
  const fake = await startFakeLlama();
  try {
    const answerer = createLocalAnswerer({ baseUrl: fake.baseUrl, apiKey: fake.apiKey });
    fake.behave({ delayMs: 2000 });
    const started = Date.now();
    assert.equal(await codeOf(answerer.ask(ask, { timeoutMs: 100 })), "timeout");
    assert.ok(Date.now() - started < 1500, "it did not wait for the slow answer");
    const controller = new AbortController();
    const pending = codeOf(answerer.ask(ask, { signal: controller.signal }));
    setTimeout(() => controller.abort(), 50);
    assert.equal(await pending, "cancelled");
    const already = new AbortController();
    already.abort();
    assert.equal(await codeOf(answerer.ask(ask, { signal: already.signal })), "cancelled");
    fake.behave({ delayMs: 0 });
    assert.equal((await answerer.ask(ask)).text, "Saves your work.", "it still works afterwards");
  } finally {
    await fake.close();
  }
});

test("the built-in model refuses to be pointed anywhere but this PC", () => {
  for (const baseUrl of ["https://api.example.com", "http://192.168.0.9:8080", "http://127.0.0.1.example.com"]) {
    assert.throws(() => createLocalAnswerer({ baseUrl, apiKey: "x" }), (e: unknown) => e instanceof AiError && e.code === "not-local" && /Nothing was sent anywhere/.test(e.message));
  }
});

test("the connector gives the answerer the author chose, and says in words when there is none", async () => {
  assert.equal(await codeOf(createConnector({ choice: "none" }).ask(ask)), "off");
  assert.equal(createConnector({ choice: "none" }).name, "none");
  assert.equal(await codeOf(createConnector({ choice: "key" }).ask(ask)), "not-ready");
  assert.equal(await codeOf(createConnector({ choice: "builtin" }).ask(ask)), "not-ready", "no model program yet");
  try {
    await createConnector({ choice: "none" }).ask(ask);
  } catch (error) {
    assert.match((error as Error).message, /AI help button/);
  }
  const fake = await startFakeLlama();
  try {
    let starts = 0;
    const seen: Array<AbortSignal | undefined> = [];
    const connector = createConnector({ choice: "builtin" }, { local: { ensureRunning: async (signal) => { starts++; seen.push(signal); return { baseUrl: fake.baseUrl, apiKey: fake.apiKey }; } } });
    assert.equal(connector.name, "built-in");
    fake.behave({ reply: "Opens a project." });
    const controller = new AbortController();
    assert.equal((await connector.ask(ask, { signal: controller.signal })).text, "Opens a project.");
    assert.equal(starts, 1);
    assert.equal(seen[0], controller.signal, "the cancel reaches the part that starts the program");
    // A model that is not on the PC stops the question with its own words.
    const notThere = createConnector({ choice: "builtin" }, { local: { ensureRunning: async () => { throw new AiError("not-ready", "The model is not on this PC."); } } });
    assert.equal(await codeOf(notThere.ask(ask)), "not-ready");
    // A program somewhere else is refused even if something hands it over.
    const stray = createConnector({ choice: "builtin" }, { local: { ensureRunning: async () => ({ baseUrl: "https://api.example.com", apiKey: "x" }) } });
    assert.equal(await codeOf(stray.ask(ask)), "not-local");
    assert.equal(fake.requests.length, 1, "nothing was sent to the stray address, and nothing extra to the real one");
  } finally {
    await fake.close();
  }
});
