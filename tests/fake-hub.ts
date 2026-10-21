// A stand-in for the Hugging Face download site, for tests: serves one model file and one licence text the way the real site does (a redirect to a second address, "Range" requests
// answered with 206 and a Content-Range), and can misbehave on purpose. Not a test itself (the name does not end in .test.ts).
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { createHash } from "node:crypto";
import type { ModelInfo } from "../src/ai/model-info.ts";

export interface HubRequest {
  url: string;
  range: string | undefined;
}

export interface HubBehaviour {
  /** Answer the model file with this status instead of serving it. */
  status?: number;
  /** Ignore the Range header and send the whole file with 200. */
  ignoreRange?: boolean;
  /** Cut the connection after this many bytes of the body, for the next `cuts` requests (one if not said), then behave. */
  cutAfter?: number;
  cuts?: number;
  /** Wait this long between pieces of the body. */
  pieceDelayMs?: number;
  /** Size of a piece of the body. */
  pieceBytes?: number;
  /** Serve this instead of the model's bytes (to make a damaged file of the right size, or a wrong size). */
  body?: Buffer;
  /** Say this in Content-Length instead of the truth (-1 says nothing, so the body just ends when it ends). */
  lie?: number;
  /** Serve this as the licence text. */
  licence?: Buffer;
  /** Answer the licence with this status. */
  licenceStatus?: number;
}

export interface FakeHub {
  model: ModelInfo;
  bytes: Buffer;
  licence: Buffer;
  requests: HubRequest[];
  behave(next: HubBehaviour): void;
  close(): Promise<void>;
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Bytes that are different everywhere, so a piece in the wrong place is noticed. */
export function sampleBytes(length: number, seed = 7): Buffer {
  const out = Buffer.alloc(length);
  let x = seed;
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out[i] = x >>> 16;
  }
  return out;
}

export async function startFakeHub(length = 3 * 1024 * 1024): Promise<FakeHub> {
  const bytes = sampleBytes(length);
  const licence = Buffer.from("Apache License\nVersion 2.0, January 2004 (a stand-in for the real text)\n");
  let behaviour: HubBehaviour = {};
  let cutsLeft = 0;
  const requests: HubRequest[] = [];
  const base = { repo: "someone/Stand-In-GGUF", commit: "a".repeat(40), file: "Stand-In-Q4_K_M.gguf", licenceRepo: "someone/Stand-In", licenceCommit: "b".repeat(40) };
  const server = http.createServer((req, res) => {
    const url = req.url ?? "";
    requests.push({ url, range: req.headers.range });
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges" };
    if (url === `/${base.repo}/resolve/${base.commit}/${base.file}`) {
      // The real site sends a redirect to a second address first.
      res.writeHead(302, { ...cors, Location: `/cdn/file-${base.file}` }).end();
      return;
    }
    if (url === `/${base.licenceRepo}/raw/${base.licenceCommit}/LICENSE`) {
      if (behaviour.licenceStatus) return void res.writeHead(behaviour.licenceStatus, cors).end();
      res.writeHead(200, { ...cors, "Content-Type": "text/plain" }).end(behaviour.licence ?? licence);
      return;
    }
    if (url !== `/cdn/file-${base.file}`) return void res.writeHead(404, cors).end();
    if (behaviour.status) return void res.writeHead(behaviour.status, cors).end();
    const source = behaviour.body ?? bytes;
    const m = !behaviour.ignoreRange && req.headers.range ? /^bytes=(\d+)-$/.exec(req.headers.range) : null;
    if (!behaviour.ignoreRange && req.headers.range && !m) return void res.writeHead(416, cors).end();
    const start = m ? Number(m[1]) : 0;
    if (start >= source.length) return void res.writeHead(416, { ...cors, "Content-Range": `bytes */${source.length}` }).end();
    const body = source.subarray(start);
    const headers: Record<string, string | number> = { ...cors, "Accept-Ranges": "bytes", "Content-Type": "application/octet-stream", "Content-Length": behaviour.lie ?? body.length };
    if (behaviour.lie === -1) delete headers["Content-Length"];
    if (m) headers["Content-Range"] = `bytes ${start}-${source.length - 1}/${source.length}`;
    res.writeHead(m ? 206 : 200, headers);
    const cutting = behaviour.cutAfter !== undefined && cutsLeft > 0;
    if (cutting) cutsLeft--;
    const limit = cutting ? Math.min(behaviour.cutAfter ?? 0, body.length) : body.length;
    const piece = behaviour.pieceBytes ?? 64 * 1024;
    let at = 0;
    const next = () => {
      if (res.destroyed) return;
      if (at >= limit) {
        if (cutting) return void res.destroy();
        return void res.end();
      }
      const end = Math.min(at + piece, limit);
      res.write(body.subarray(at, end), () => {
        at = end;
        if (behaviour.pieceDelayMs) setTimeout(next, behaviour.pieceDelayMs);
        else next();
      });
    };
    next();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const model: ModelInfo = {
    title: "Stand-in model",
    summary: "a stand-in used by the tests",
    ...base,
    bytes: length,
    sha256: sha256(bytes),
    originalRepo: "someone/Stand-In",
    licenceName: "Apache License 2.0",
    licenceHolder: "Nobody",
    licenceBytes: licence.length,
    licenceSha256: sha256(licence),
    hub: `http://127.0.0.1:${port}`,
  };
  return {
    model,
    bytes,
    licence,
    requests,
    behave(next) {
      behaviour = next;
      cutsLeft = next.cutAfter !== undefined ? (next.cuts ?? 1) : 0;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
