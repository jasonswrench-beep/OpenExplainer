import test from "node:test";
import assert from "node:assert/strict";
import { logLine, withLog } from "../src/mcp/log.ts";
import { connectionLines } from "../src/mcp/connect.ts";
import { failed, text, type ToolDef } from "../src/mcp/protocol.ts";

const when = new Date(2026, 9, 21, 7, 5, 9);

test("a log line says when, which tool, whether it was done and what came of it in words, and never more than a line", () => {
  assert.equal(logLine(when, "add_topic", text("Added \"Saving\" as 1.1. Its id is x.\nSaved to C:\\Docs\\a.openexplainer.")), "2026-10-21 07:05:09  add_topic  OK  Added \"Saving\" as 1.1. Its id is x.");
  assert.equal(logLine(when, "set_page", failed("Block 2 has the type \"dance\".")), "2026-10-21 07:05:09  set_page  REFUSED  Block 2 has the type \"dance\".");
  assert.equal(logLine(when, "export_book", { error: "That file is not inside the folder." }), "2026-10-21 07:05:09  export_book  REFUSED  That file is not inside the folder.");
  const long = logLine(when, "check_book", text(`${"word ".repeat(100)}`));
  assert.ok(long.length < 260 && long.endsWith("..."), "a long reply is cut");
  assert.ok(!logLine(when, "x", text("a\nb\nc")).includes("\n"));
});

test("every use of a tool is logged, what a page says is not, a log that cannot be written never stops a tool, and a tool's own failure still reaches the assistant", async () => {
  const lines: string[] = [];
  const ok: ToolDef = { name: "set_page", description: "", inputSchema: {}, handler: async (a) => text(`The page now has ${String((a.blocks as unknown[]).length)} block(s).`) };
  const bad: ToolDef = { name: "open_project", description: "", inputSchema: {}, handler: async () => { throw new Error("There is no project file at C:\\x."); } };
  const [okTool, badTool] = withLog([ok, bad], async (line) => { lines.push(line); }, () => when);
  const result = await okTool.handler({ blocks: [{ type: "paragraph", text: "A secret the log must not hold." }] });
  assert.equal((result.content[0] as { text: string }).text, "The page now has 1 block(s).");
  await assert.rejects(() => badTool.handler({}), /There is no project file/);
  assert.deepEqual(lines, ["2026-10-21 07:05:09  set_page  OK  The page now has 1 block(s).", "2026-10-21 07:05:09  open_project  REFUSED  There is no project file at C:\\x."]);
  assert.ok(!lines.join("\n").includes("secret"), "what was written is not in the log");
  const [deaf] = withLog([ok], async () => { throw new Error("disk full"); }, () => when);
  assert.equal((await deaf.handler({ blocks: [] })).isError, undefined, "the tool still worked");
  assert.equal(okTool.name, "set_page");
});

test("the lines to give an assistant are valid, and a path with spaces and backslashes is written safely", () => {
  const exe = "C:\\Program Files\\OpenExplainer\\openexplainer.exe";
  const lines = connectionLines(exe);
  assert.deepEqual(JSON.parse(lines.desktop), { mcpServers: { openexplainer: { command: exe, args: ["--mcp"] } } });
  assert.equal(lines.code, '"C:\\\\Program Files\\\\OpenExplainer\\\\openexplainer.exe" --mcp', "the command line itself, for any assistant that asks for one");
});
