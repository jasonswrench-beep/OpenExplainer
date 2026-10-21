// The Model Context Protocol, the small part OpenExplainer needs: an AI assistant sends JSON messages (one on each line) and this answers them. It is a plain request and answer format
// (JSON-RPC 2.0): `initialize` says what each side can do, `tools/list` says what the assistant may ask for, and `tools/call` asks for one thing. Nothing here knows what the tools do or how
// the lines travel, so all of it is tried without the app. The tools are in `src/mcp/tools.ts`; the lines come and go through the app's shell (`src-tauri/src/mcp.rs`).

/** What a tool gives back: words and pictures the assistant can read. */
export type ToolContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

export interface ToolResult {
  content: ToolContent[];
  /** The tool could not do what was asked. The words say why, so the assistant can put it right and try again. */
  isError?: boolean;
}

/** A thing the assistant may ask for. `inputSchema` is JSON Schema, which tells the assistant what to send. */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler(args: Record<string, unknown>): Promise<ToolResult>;
}

/** An error a tool reports in plain words. The assistant sees the words and can try again. */
export class ToolError extends Error {}

export const text = (words: string): ToolResult => ({ content: [{ type: "text", text: words }] });
export const failed = (words: string): ToolResult => ({ content: [{ type: "text", text: words }], isError: true });

/** The versions of the protocol this understands, newest first. The assistant's own is used when it is one of these. */
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export interface ServerOptions {
  name: string;
  version: string;
  /** Said to the assistant when it connects: how to use the tools. */
  instructions: string;
  tools: ToolDef[];
  /** Asked before the assistant is let in. `null` lets it in; words refuse it and say why (such as MCP being off). */
  gate?: () => Promise<string | null>;
}

type Id = string | number | null;
type Message = { jsonrpc?: unknown; id?: Id; method?: unknown; params?: unknown };

const reply = (id: Id, result: unknown) => ({ jsonrpc: "2.0", id, result });
const problem = (id: Id, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

export interface McpServer {
  /** Answers one line from the assistant. `null` when there is nothing to send back (a notification). */
  handle(line: string): Promise<string | null>;
}

export function createServer(options: ServerOptions): McpServer {
  const tools = new Map(options.tools.map((t) => [t.name, t]));
  // Tools run one at a time, so two calls can never change the same project at once.
  let queue: Promise<unknown> = Promise.resolve();
  const inOrder = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };

  async function one(message: Message): Promise<object | null> {
    const id = message.id === undefined ? null : message.id;
    const notification = message.id === undefined;
    if (typeof message.method !== "string") return notification ? null : problem(id, -32600, "That is not a request: it has no method.");
    const params = (typeof message.params === "object" && message.params !== null ? message.params : {}) as Record<string, unknown>;
    switch (message.method) {
      case "initialize": {
        const refusal = options.gate ? await options.gate() : null;
        if (refusal) return problem(id, -32000, refusal);
        const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
        return reply(id, {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: options.name, version: options.version },
          instructions: options.instructions,
        });
      }
      case "ping": return notification ? null : reply(id, {});
      case "tools/list": return reply(id, { tools: options.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      case "tools/call": {
        const tool = typeof params.name === "string" ? tools.get(params.name) : undefined;
        if (!tool) return problem(id, -32602, `There is no tool called "${String(params.name)}". Ask for the list of tools to see what is there.`);
        const args = (typeof params.arguments === "object" && params.arguments !== null && !Array.isArray(params.arguments) ? params.arguments : {}) as Record<string, unknown>;
        const result = await inOrder(async () => {
          try {
            return await tool.handler(args);
          } catch (error) {
            // A tool that cannot do what was asked says so in words; the assistant reads them and tries again.
            return failed(error instanceof Error ? error.message : String(error));
          }
        });
        return reply(id, result);
      }
      default:
        // Notifications such as "notifications/initialized" need no answer; a request for something unknown does.
        return notification ? null : problem(id, -32601, `The method "${message.method}" is not one this server has.`);
    }
  }

  return {
    async handle(line) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        return JSON.stringify(problem(null, -32700, "That was not valid JSON."));
      }
      if (Array.isArray(parsed)) {
        const answers = (await Promise.all(parsed.map((m) => one((m ?? {}) as Message)))).filter((a): a is object => a !== null);
        return answers.length ? JSON.stringify(answers) : null;
      }
      if (typeof parsed !== "object" || parsed === null) return JSON.stringify(problem(null, -32600, "That is not a request."));
      const answer = await one(parsed as Message);
      return answer ? JSON.stringify(answer) : null;
    },
  };
}
