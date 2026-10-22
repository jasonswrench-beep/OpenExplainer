import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime, randomKey, sensibleThreads, type RuntimeDeps, type RuntimeShell } from "../src/ai/runtime.ts";
import { createConnector } from "../src/ai/connector.ts";
import { AiError } from "../src/ai/types.ts";
import { startFakeLlama } from "./fake-llama.ts";

interface Rig {
  deps: RuntimeDeps;
  starts: Array<{ file: string; apiKey: string; context: number; threads: number }>;
  stops: number;
  ready: { value: boolean };
  timers: Array<{ fn: () => void; ms: number; cleared: boolean }>;
  port: { value: number; key: string };
  shellStart: { next: (() => Promise<{ port: number; apiKey: string }>) | null };
}

function rig(): Rig {
  const r: Rig = { deps: null as never, starts: [], stops: 0, ready: { value: true }, timers: [], port: { value: 18123, key: "program-key-from-shell" }, shellStart: { next: null } };
  const shell: RuntimeShell = {
    async start(request) {
      r.starts.push(request);
      return r.shellStart.next ? r.shellStart.next() : { port: r.port.value, apiKey: r.port.key };
    },
    async stop() {
      r.stops++;
    },
  };
  r.deps = {
    shell,
    file: "Model-Q4.gguf",
    modelReady: async () => r.ready.value,
    makeKey: () => "0123456789abcdef0123456789abcdef",
    threads: () => 6,
    idleMs: 600_000,
    setTimer: (fn, ms) => {
      const t = { fn, ms, cleared: false };
      r.timers.push(t);
      return t;
    },
    clearTimer: (h) => {
      (h as { cleared: boolean }).cleared = true;
    },
  };
  return r;
}

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof AiError, `an AiError, not ${String(e)}`);
    return e.code;
  }
  return "no error";
};

test("the thread count is half the processor's, between 2 and 8, and the password is long, plain and different each time", () => {
  assert.deepEqual([32, 16, 8, 6, 4, 2, 1, 64].map(sensibleThreads), [8, 8, 4, 3, 2, 2, 2, 8]);
  assert.equal(sensibleThreads(0), 2, "an unknown count is treated as 4");
  const a = randomKey();
  const b = randomKey();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, b);
});

test("the program is started once, with the model's file and a fresh password, and shared by everything that asks after", async () => {
  const r = rig();
  const runtime = createRuntime(r.deps);
  assert.equal(runtime.isRunning(), false);
  const [one, two] = await Promise.all([runtime.ensureRunning(), runtime.ensureRunning()]);
  assert.deepEqual(one, { baseUrl: "http://127.0.0.1:18123", apiKey: "program-key-from-shell" }, "the place and password the shell reports are used");
  assert.deepEqual(two, one);
  assert.equal(r.starts.length, 1, "two questions at once start it once");
  assert.deepEqual(r.starts[0], { file: "Model-Q4.gguf", apiKey: "0123456789abcdef0123456789abcdef", context: 8192, threads: 6 });
  assert.equal(runtime.isRunning(), true);
  await runtime.ensureRunning();
  assert.equal(r.starts.length, 1, "and not again later");
});

test("it will not start the program for a model that is not there, and says so in words; once the model is there it works", async () => {
  const r = rig();
  r.ready.value = false;
  const runtime = createRuntime(r.deps);
  try {
    await runtime.ensureRunning();
    assert.fail("should have refused");
  } catch (e) {
    assert.ok(e instanceof AiError && e.code === "not-ready");
    assert.match(e.message, /not on this PC yet .* Download it in AI help first/);
  }
  assert.equal(r.starts.length, 0);
  r.ready.value = true;
  await runtime.ensureRunning();
  assert.equal(r.starts.length, 1);
});

test("a program that fails to start is reported in the shell's own words, and the next try starts it afresh", async () => {
  const r = rig();
  const runtime = createRuntime(r.deps);
  r.shellStart.next = async () => {
    throw "The model's program could not be started: Access is denied.";
  };
  try {
    await runtime.ensureRunning();
    assert.fail("should have failed");
  } catch (e) {
    assert.ok(e instanceof AiError && e.code === "failed" && /could not be started: Access is denied/.test(e.message));
  }
  assert.equal(runtime.isRunning(), false);
  r.shellStart.next = async () => {
    throw "The model is not on this PC yet. Download it from the AI help dialog first.";
  };
  assert.equal(await codeOf(runtime.ensureRunning()), "not-ready", "the shell's own 'not there' is not-ready");
  r.shellStart.next = null;
  await runtime.ensureRunning();
  assert.equal(runtime.isRunning(), true);
  assert.equal(r.starts.length, 3);
});

test("when nothing has asked for ten minutes the program is stopped, and every question puts the clock back", async () => {
  const r = rig();
  const runtime = createRuntime(r.deps);
  await runtime.ensureRunning();
  assert.equal(r.timers.length, 1);
  assert.equal(r.timers[0].ms, 600_000);
  await runtime.ensureRunning();
  assert.ok(r.timers[0].cleared && Number(r.timers.length) === 2 && !r.timers[1].cleared, "the old clock was stopped and a new one set");
  r.timers[1].fn();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(r.stops, 1);
  assert.equal(runtime.isRunning(), false);
  await runtime.ensureRunning();
  assert.equal(r.starts.length, 2, "the next question starts it again");
});

test("cancelling while the program loads stops it and says cancelled; a question already cancelled starts nothing", async () => {
  const r = rig();
  const runtime = createRuntime(r.deps);
  let release!: (v: { port: number; apiKey: string }) => void;
  r.shellStart.next = () => new Promise((resolve) => { release = resolve; });
  const controller = new AbortController();
  const pending = codeOf(runtime.ensureRunning(controller.signal));
  await new Promise((resolve) => setTimeout(resolve, 5));
  controller.abort();
  assert.equal(await pending, "cancelled");
  assert.equal(r.stops, 1, "the program was told to stop");
  release({ port: 1, apiKey: "x" });
  const already = new AbortController();
  already.abort();
  const before = r.starts.length;
  assert.equal(await codeOf(runtime.ensureRunning(already.signal)), "cancelled");
  assert.equal(r.starts.length, before, "nothing was started for it");
});

test("a program that stopped answering is forgotten so the next question starts it again", async () => {
  const r = rig();
  const runtime = createRuntime(r.deps);
  await runtime.ensureRunning();
  runtime.reset?.();
  assert.equal(runtime.isRunning(), false);
  await runtime.ensureRunning();
  assert.equal(r.starts.length, 2);
});

test("the connector asks the program the runtime started, and starts it afresh once if the program has gone away, then gives up", async () => {
  const first = await startFakeLlama("key-one");
  const second = await startFakeLlama("key-two");
  try {
    const r = rig();
    r.port.value = Number(new URL(first.baseUrl).port);
    r.port.key = first.apiKey;
    const runtime = createRuntime(r.deps);
    const connector = createConnector({ choice: "builtin" }, { local: runtime });
    first.behave({ reply: "First answer." });
    const messages = [{ role: "user" as const, content: "Say something." }];
    assert.equal((await connector.ask(messages)).text, "First answer.");
    assert.equal(r.starts.length, 1);
    // The program goes away (stopped from outside), and a new one answers somewhere else.
    await first.close();
    r.port.value = Number(new URL(second.baseUrl).port);
    r.port.key = second.apiKey;
    second.behave({ reply: "Second answer." });
    assert.equal((await connector.ask(messages)).text, "Second answer.", "this question finds the program gone, starts it again and gets its answer");
    assert.equal(r.starts.length, 2);
    assert.equal(second.requests[0].authorization, "Bearer key-two", "with the new password");
    // If it never comes back, one fresh start is tried and then the problem is reported.
    await second.close();
    assert.equal(await codeOf(connector.ask(messages)), "unreachable");
    assert.equal(r.starts.length, 3, "one more start, not a loop");
    assert.equal(runtime.isRunning(), false, "and the runtime forgets what it cannot reach");
  } finally {
    await first.close().catch(() => undefined);
    await second.close();
  }
});
