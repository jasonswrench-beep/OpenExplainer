// A stand-in for llama.cpp's `llama-server`, for tests: the same "chat completions" language on 127.0.0.1, with a password, and ways to misbehave on purpose. Not a test itself (the name does
// not end in .test.ts), so `npm test` only loads it from the tests that use it.
import * as http from "node:http";
import type { AddressInfo } from "node:net";

export interface Recorded {
  url: string;
  authorization: string | undefined;
  body: Record<string, unknown>;
}

export interface FakeBehaviour {
  /** What the model says. */
  reply: string;
  /** Answer with this status instead of 200 (503 is what the real server says while it loads the model). */
  status?: number;
  /** The reason it stops: "stop" for a whole answer, "length" if it ran out of room. */
  finishReason?: string;
  /** Wait this long before answering. */
  delayMs?: number;
  /** Send this text as the whole body instead of a proper answer. */
  rawBody?: string;
}

export interface FakeLlama {
  baseUrl: string;
  apiKey: string;
  requests: Recorded[];
  behave(next: Partial<FakeBehaviour>): void;
  close(): Promise<void>;
}

export async function startFakeLlama(apiKey = "test-password"): Promise<FakeLlama> {
  let behaviour: FakeBehaviour = { reply: "Saves your work.", finishReason: "stop" };
  const requests: Recorded[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } catch {
        // The test sent something that is not JSON; it is recorded as empty.
      }
      requests.push({ url: req.url ?? "", authorization: req.headers.authorization, body });
      const send = () => {
        if (req.headers.authorization !== `Bearer ${apiKey}`) {
          res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { message: "Invalid API Key" } }));
          return;
        }
        if (behaviour.rawBody !== undefined) {
          res.writeHead(behaviour.status ?? 200, { "Content-Type": "application/json" }).end(behaviour.rawBody);
          return;
        }
        if (behaviour.status && behaviour.status !== 200) {
          res.writeHead(behaviour.status, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { code: behaviour.status, message: "Loading model" } }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ choices: [{ index: 0, message: { role: "assistant", content: behaviour.reply }, finish_reason: behaviour.finishReason ?? "stop" }] }));
      };
      if (behaviour.delayMs) setTimeout(send, behaviour.delayMs);
      else send();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    apiKey,
    requests,
    behave(next) {
      behaviour = { ...behaviour, ...next };
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
