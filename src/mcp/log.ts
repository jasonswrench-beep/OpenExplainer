// The plain log of what an assistant did, kept beside the projects (a text file in the MCP folder), so the author can read afterwards what happened while nobody was watching. One line for each tool
// call: when, which tool, and in words what came of it. What was written on a page or in a picture's description is not in the log, only the tool's own first line of reply.
import type { ToolDef, ToolResult } from "./protocol.ts";

export const LOG_FILE = "OpenExplainer MCP log.txt";

/** The longest a line of the log may be. */
const MOST = 220;

const tidy = (words: string) => words.replace(/\s+/g, " ").trim();

/** One line of the log. */
export function logLine(now: Date, tool: string, result: ToolResult | { error: string }): string {
  const when = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  const refused = "error" in result;
  const failed = !refused && result.isError === true;
  const first = refused ? result.error : (result.content.find((c) => c.type === "text") as { text: string } | undefined)?.text.split("\n")[0] ?? "";
  const words = tidy(first);
  return `${when}  ${tool}  ${refused || failed ? "REFUSED" : "OK"}  ${words.length > MOST ? `${words.slice(0, MOST - 3)}...` : words}`;
}

/** The tools, each writing a line to the log when it is used (the log is told, and a log that cannot be written never stops the tool). */
export function withLog(tools: ToolDef[], write: (line: string) => Promise<void>, now: () => Date = () => new Date()): ToolDef[] {
  return tools.map((tool) => ({
    ...tool,
    handler: async (args) => {
      try {
        const result = await tool.handler(args);
        await write(logLine(now(), tool.name, result)).catch(() => undefined);
        return result;
      } catch (error) {
        await write(logLine(now(), tool.name, { error: error instanceof Error ? error.message : String(error) })).catch(() => undefined);
        throw error;
      }
    },
  }));
}
