import test from "node:test";
import assert from "node:assert/strict";
import { baseName, folderOf, isInside, normalizePath, projectFile, resolveInside } from "../src/mcp/paths.ts";
import { createServer, PROTOCOL_VERSIONS, text, type ToolDef } from "../src/mcp/protocol.ts";
import { blocksFromJson, pageFromBlocks, pageToJson, topicToJson } from "../src/mcp/blocks.ts";
import { Session, type McpFiles } from "../src/mcp/session.ts";
import { createTools, INSTRUCTIONS } from "../src/mcp/tools.ts";
import { addNode, addPicture, createProject, ensurePage, type Picture } from "../src/project/model.ts";
import { unpackProject } from "../src/project/package.ts";

const FOLDER = "C:\\Docs\\OpenExplainer";

test("only the folder the author chose is reachable, whatever slashes, capitals or dots are used", () => {
  assert.equal(normalizePath("C:/Docs//Open\\\\Explainer/"), "C:\\Docs\\Open\\Explainer");
  assert.equal(isInside("c:\\docs\\openexplainer\\a.openexplainer", FOLDER), true, "capitals do not matter");
  assert.equal(isInside("C:/Docs/OpenExplainer/sub/a.openexplainer", FOLDER), true, "nor do the slashes");
  assert.equal(isInside(FOLDER, FOLDER), true);
  assert.equal(isInside("C:\\Docs\\OpenExplainer2\\a.openexplainer", FOLDER), false, "a folder that only starts with the same letters is another folder");
  assert.equal(isInside("C:\\Docs\\OpenExplainer\\..\\Secret\\a.openexplainer", FOLDER), false, "..  is never inside, even when it would lead back in");
  assert.equal(isInside("C:\\Docs\\OpenExplainer\\a.openexplainer", ""), false, "no folder chosen means nothing is reachable");
  assert.equal(resolveInside(FOLDER, "Test1"), `${FOLDER}\\Test1`);
  assert.equal(resolveInside(FOLDER, "sub/Test1"), `${FOLDER}\\sub\\Test1`);
  assert.equal(resolveInside(FOLDER, "C:\\Docs\\OpenExplainer\\Test1"), `${FOLDER}\\Test1`, "a full path inside the folder is fine");
  assert.equal(resolveInside(FOLDER, "C:\\Windows\\win.ini"), null);
  assert.equal(resolveInside(FOLDER, "\\\\server\\share\\x"), null, "a network path is outside");
  assert.equal(resolveInside(FOLDER, "..\\x"), null);
  assert.equal(resolveInside(FOLDER, "  "), null);
  assert.equal(resolveInside(FOLDER, "a\0b"), null);
  assert.equal(projectFile(FOLDER, "Test1"), `${FOLDER}\\Test1.openexplainer`, "the project ending is added");
  assert.equal(projectFile(FOLDER, "Test1.OPENEXPLAINER"), `${FOLDER}\\Test1.OPENEXPLAINER`);
  assert.equal(projectFile(FOLDER, "..\\Test1"), null);
  assert.equal(baseName(`${FOLDER}\\sub\\a.docx`), "a.docx");
  assert.equal(folderOf(`${FOLDER}\\sub\\a.docx`), `${FOLDER}\\sub`);
});

const echo: ToolDef = { name: "echo", description: "Says back what it is told.", inputSchema: { type: "object", properties: { words: { type: "string" } } }, handler: async (args) => text(`you said ${String(args.words)}`) };
const breaks: ToolDef = { name: "breaks", description: "Always fails.", inputSchema: { type: "object" }, handler: async () => { throw new Error("The thing was not possible, because of a reason in words."); } };

const ask = async (server: ReturnType<typeof createServer>, message: unknown) => {
  const answer = await server.handle(JSON.stringify(message));
  return answer === null ? null : JSON.parse(answer);
};

test("the protocol: it introduces itself, lists its tools, runs one, and tells a tool's failure in words rather than as a protocol error", async () => {
  const server = createServer({ name: "OpenExplainer", version: "1.2.3", instructions: "How to use it.", tools: [echo, breaks] });
  const hello = await ask(server, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test" } } });
  assert.deepEqual([hello.id, hello.result.protocolVersion, hello.result.serverInfo, hello.result.instructions, hello.result.capabilities], [1, "2025-03-26", { name: "OpenExplainer", version: "1.2.3" }, "How to use it.", { tools: { listChanged: false } }]);
  assert.equal((await ask(server, { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } })).result.protocolVersion, PROTOCOL_VERSIONS[0], "an unknown version gets the newest this knows");
  assert.equal(await ask(server, { jsonrpc: "2.0", method: "notifications/initialized" }), null, "a notification gets no answer");
  assert.deepEqual((await ask(server, { jsonrpc: "2.0", id: 3, method: "ping" })).result, {});
  const listed = await ask(server, { jsonrpc: "2.0", id: 4, method: "tools/list" });
  assert.deepEqual(listed.result.tools.map((t: { name: string }) => t.name), ["echo", "breaks"]);
  assert.ok(!("handler" in listed.result.tools[0]), "what a tool does is not sent, only how to ask for it");
  const done = await ask(server, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "echo", arguments: { words: "hi" } } });
  assert.deepEqual(done.result, { content: [{ type: "text", text: "you said hi" }] });
  const bad = await ask(server, { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "breaks" } });
  assert.equal(bad.error, undefined, "not a protocol error");
  assert.deepEqual(bad.result, { content: [{ type: "text", text: "The thing was not possible, because of a reason in words." }], isError: true });
  const unknown = await ask(server, { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "nothing" } });
  assert.equal(unknown.error.code, -32602);
  assert.match(unknown.error.message, /There is no tool called "nothing"/);
  assert.equal((await ask(server, { jsonrpc: "2.0", id: 8, method: "something/else" })).error.code, -32601);
  assert.equal(await ask(server, { jsonrpc: "2.0", method: "something/else" }), null, "an unknown notification is ignored");
  assert.equal(JSON.parse((await server.handle("not json"))!).error.code, -32700);
  assert.equal(JSON.parse((await server.handle("42"))!).error.code, -32600);
  assert.equal((await ask(server, { jsonrpc: "2.0", id: 9 })).error.code, -32600, "a request with no method");
  const batch = JSON.parse((await server.handle(JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", id: 2, method: "ping" }])))!);
  assert.deepEqual(batch.map((a: { id: number }) => a.id), [1, 2], "a batch answers each request and skips the notification");
});

test("the gate can keep an assistant out, with its reason, and tool calls run one at a time in the order they came", async () => {
  const shut = createServer({ name: "x", version: "1", instructions: "", tools: [echo], gate: async () => "MCP is off. Turn it on in OpenExplainer." });
  const refused = await ask(shut, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.deepEqual(refused.error, { code: -32000, message: "MCP is off. Turn it on in OpenExplainer." });
  const log: string[] = [];
  const slow: ToolDef = { name: "slow", description: "", inputSchema: {}, handler: async (a) => { log.push(`start ${a.n}`); await new Promise((r) => setTimeout(r, a.n === 1 ? 30 : 1)); log.push(`end ${a.n}`); return text(String(a.n)); } };
  const open = createServer({ name: "x", version: "1", instructions: "", tools: [slow] });
  await Promise.all([1, 2, 3].map((n) => open.handle(JSON.stringify({ jsonrpc: "2.0", id: n, method: "tools/call", params: { name: "slow", arguments: { n } } }))));
  assert.deepEqual(log, ["start 1", "end 1", "start 2", "end 2", "start 3", "end 3"], "the second does not start until the first has finished");
});

test("a page is read and written as blocks with the editor's own marks, and a mistake is said with where it is", () => {
  const project = createProject("P");
  const topic = addNode(project.tree, null, "Saving");
  const picture: Picture = { id: "p1", file: "images/p1.png", width: 100, height: 100, altText: "", source: { kind: "click", capturedAt: "t" }, click: { x: 10, y: 10, button: "left", target: { name: "Save", role: "button", acceleratorKey: "Ctrl+S" } } };
  addPicture(project.tree, topic.id, picture);
  const ids = new Set(["p1"]);
  const blocks = blocksFromJson([
    { type: "heading", text: "Before you begin" },
    { type: "paragraph", text: "Press [[Save]] to keep your **work** and *always* check." },
    { type: "picture", picture_id: "p1" },
    { type: "procedure", steps: [{ text: "Click [[Save]].", picture_id: "p1", result: "The file is saved." }, { text: "Close it." }] },
    { type: "callout", kind: "caution", text: "Save first." },
  ], ids);
  ensurePage(topic).blocks = pageFromBlocks(blocks, ids).blocks;
  const back = pageToJson(topic.page);
  assert.deepEqual(back.map((b) => b.type), ["heading", "paragraph", "picture", "procedure", "callout"]);
  assert.equal(back[1].text, "Press [[Save]] to keep your **work** and *always* check.", "the marks come back as they were written");
  assert.deepEqual((back[3].steps as { text: string; picture_id?: string; result?: string }[]).map((s) => [s.text, s.picture_id, s.result]), [["Click [[Save]].", "p1", "The file is saved."], ["Close it.", undefined, undefined]]);
  const read = topicToJson(topic, "1");
  assert.equal(read.number, "1");
  assert.deepEqual((read.pictures as { click: { words: string; clicked_item: unknown } }[])[0].click.words, "Click on the button \"Save\" (shortcut Ctrl+S).");
  assert.deepEqual((read.pictures as { click: { clicked_item: unknown } }[])[0].click.clicked_item, { name: "Save", kind: "button", shortcut: "Ctrl+S" });
  assert.throws(() => blocksFromJson("no", ids), /blocks must be a list/);
  assert.throws(() => blocksFromJson([{ type: "paragraph" }], ids), /Block 1 \(paragraph\) needs its text as a string/);
  assert.throws(() => blocksFromJson([{ type: "heading", text: "x" }, { type: "dance" }], ids), /Block 2 has the type "dance"/);
  assert.throws(() => blocksFromJson([{ type: "picture", picture_id: "other" }], ids), /Block 1 \(picture\) names a picture that is not one of this topic's pictures. The topic's pictures are: p1/);
  assert.throws(() => blocksFromJson([{ type: "callout", kind: "shout", text: "x" }], ids), /needs a kind, one of: design-tip/);
  assert.throws(() => blocksFromJson([{ type: "procedure", steps: [] }], ids), /needs a list of steps/);
  assert.throws(() => blocksFromJson([{ type: "procedure", steps: [{ text: "ok" }, { picture_id: "p1" }] }], ids), /step 2 needs its text/);
  assert.throws(() => blocksFromJson([null], ids), /Block 1 must be an object/);
});

/** Files held in memory, by lower-case path. */
function memory(): McpFiles & { has(path: string): boolean; size(path: string): number; map: Map<string, Uint8Array> } {
  const map = new Map<string, Uint8Array>();
  const original = new Map<string, string>();
  const key = (p: string) => normalizePath(p).toLowerCase();
  return {
    map,
    has: (p) => map.has(key(p)),
    size: (p) => map.get(key(p))?.length ?? 0,
    read: async (p) => { const b = map.get(key(p)); if (!b) throw new Error("no such file"); return b; },
    write: async (p, b) => { map.set(key(p), b); original.set(key(p), normalizePath(p)); },
    exists: async (p) => map.has(key(p)),
    list: async (folder) => {
      const f = key(folder) + "\\";
      const names = new Map<string, boolean>();
      for (const k of map.keys()) if (k.startsWith(f)) { const rest = (original.get(k) ?? k).slice(f.length); const i = rest.indexOf("\\"); names.set(i < 0 ? rest : rest.slice(0, i), i >= 0); }
      return [...names].map(([name, isDirectory]) => ({ name, isDirectory }));
    },
    makeFolder: async () => {},
    append: async (p, words) => { const old = map.get(key(p)); map.set(key(p), new TextEncoder().encode((old ? new TextDecoder().decode(old) : "") + words)); original.set(key(p), normalizePath(p)); },
  };
}

function setup() {
  const files = memory();
  const session = new Session({ enabled: true, folder: FOLDER, allowFullScreen: false }, files);
  const made: { kind: string; options: unknown }[] = [];
  const tools = createTools({
    session,
    exporter: async (kind, options) => { made.push({ kind, options }); return { bytes: new Uint8Array([1, 2, 3, 4]), extension: kind === "pdf" ? "pdf" : kind === "word" ? "docx" : "zip", notes: ["A note about a picture."] }; },
  });
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await tools.find((t) => t.name === name)!.handler(args).catch((e: Error) => ({ content: [{ type: "text" as const, text: e.message }], isError: true }));
    return { text: result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n"), isError: result.isError === true };
  };
  const data = async (name: string, args: Record<string, unknown> = {}) => { const r = await call(name, args); assert.equal(r.isError, false, `${name}: ${r.text}`); return JSON.parse(r.text); };
  return { files, session, tools, call, data, made };
}

test("tools: nothing works before a project is open, and the instructions say how to begin", async () => {
  const { call, tools } = setup();
  assert.match(INSTRUCTIONS, /create_project/);
  for (const name of ["get_outline", "add_topic", "set_page", "check_book", "save_project", "export_book", "update_index"]) {
    const r = await call(name, { title: "x", topic_id: "x", blocks: [], kind: "json", file: "x" });
    assert.ok(r.isError && /No project is open/.test(r.text), name);
  }
  assert.ok(tools.every((t) => t.description.length > 20 && (t.inputSchema as { type: string }).type === "object"), "every tool says what it does and how to ask");
});

test("tools: a project is made, filled, saved at every step, reopened, checked, indexed, put in a guide and exported, all inside the chosen folder", async () => {
  const { call, data, files, session, made } = setup();
  assert.deepEqual((await data("list_projects")).projects, []);
  const created = await call("create_project", { name: "Acme: Draw?" });
  assert.match(created.text, /Created and opened the project "Acme: Draw\?" at C:\\Docs\\OpenExplainer\\Acme Draw\.openexplainer/, "the file name is made safe");
  assert.ok(files.has(`${FOLDER}\\Acme Draw.openexplainer`), "and the file exists at once");
  assert.match((await call("create_project", { name: "Acme: Draw?" })).text, /There is already a project at/);
  assert.match((await call("create_project", { name: "X", file: "..\\Outside" })).text, /not inside the folder/);
  assert.match((await call("create_project", { name: "X", file: "C:\\Windows\\x" })).text, /not inside the folder/);

  await call("set_variables", { values: { product: "Acme Draw", "bad name!": "x" } });
  const chapter = /id is (\w+)/.exec((await call("add_topic", { title: "Getting started" })).text)![1];
  const saving = /id is (\w+)/.exec((await call("add_topic", { title: "Saving your work", parent_id: chapter, status: "drafted" })).text)![1];
  assert.match((await call("add_topic", { title: "x", parent_id: "nope" })).text, /There is no topic with the id "nope"/);
  assert.match((await call("add_topic", { title: "x", status: "weird" })).text, /status must be one of/);

  // a picture arrives (as a capture would bring it) and the assistant writes the page about it
  const node = session.project!.tree[0].children[0];
  node.pictures.push({ id: "pic1", file: "images/pic1.png", width: 800, height: 450, altText: "", source: { kind: "click", capturedAt: "t" }, click: { x: 100, y: 100, button: "left", target: { name: "Save", role: "button", bounds: { x: 80, y: 90, width: 60, height: 20 } } } });
  session.assets.set("images/pic1.png", new Uint8Array([137, 80, 78, 71]));
  assert.match((await call("make_callout_from_click", { topic_id: saving, picture_id: "pic1" })).text, /Added callout/);
  const topic = await data("get_topic", { topic_id: saving });
  assert.equal(topic.pictures[0].callouts.length, 1);
  assert.equal(topic.pictures[0].click.clicked_item.name, "Save");
  const calloutId = topic.pictures[0].callouts[0].id;
  const described = await call("describe_picture", { topic_id: saving, picture_id: "pic1", alt_text: "The Save button in the File menu.", callouts: [{ id: calloutId, name: "Save", description: "Saves your work." }] });
  assert.match(described.text, /Updated the picture description and 1 callout/);
  assert.match((await call("describe_picture", { topic_id: saving, picture_id: "pic1", callouts: [{ id: "nope", name: "x" }] })).text, /has no callout with the id "nope"/);
  assert.match((await call("describe_picture", { topic_id: saving, picture_id: "nope" })).text, /has no picture with the id "nope". Its pictures are: pic1/);
  const set = await call("set_page", { topic_id: saving, blocks: [
    { type: "paragraph", text: "Press [[Save]] in {{PRODUCT}} to keep your work." },
    { type: "procedure", steps: [{ text: "Click [[Save]].", picture_id: "pic1", result: "The file is saved." }] },
    { type: "callout", kind: "caution", text: "Save before you close." },
  ] });
  assert.match(set.text, /now has 3 block\(s\)\.\nSaved to /);
  assert.match((await call("set_page", { topic_id: saving, blocks: [{ type: "picture", picture_id: "other" }] })).text, /names a picture that is not one of this topic's pictures/);
  assert.equal((await data("get_topic", { topic_id: saving })).page.length, 3, "a refused page changes nothing");
  assert.match((await call("append_blocks", { topic_id: saving, blocks: [{ type: "paragraph", text: "More." }] })).text, /now has 4/);

  const outline = await data("get_outline");
  assert.equal(outline.project, "Acme: Draw?");
  assert.deepEqual(outline.variables.PRODUCT, "Acme Draw");
  assert.deepEqual(outline.topics[0].children.map((c: { number: string; status: string; blocks: number }) => [c.number, c.status, c.blocks]), [["1.1", "drafted", 4]]);

  await call("set_index_terms", { topic_id: saving, terms: ["Saving", "Backups", "x"] });
  assert.equal((await data("get_topic", { topic_id: saving })).index_terms.join(), "Saving,Backups");
  assert.match((await call("update_index")).text, /Updated: \d+ term\(s\) added/);
  const guide = await call("create_guide", { name: "Saving guide", chapter_id: chapter, layout: "left" });
  assert.match(guide.text, /Made the guide "Saving guide" \(1 task, 1 step\)/);
  const guideId = (await data("list_guides"))[0].id;
  assert.match((await call("create_guide", { name: "Bad", topic_ids: ["nope"] })).text, /is not a topic of the book/);
  const check = await data("check_book");
  assert.ok(typeof check.summary === "string" && Array.isArray(check.things));

  // every change was saved: the file on disk opens as the same project
  const reopened = await unpackProject(files.map.get(`${FOLDER}\\Acme Draw.openexplainer`.toLowerCase())!);
  assert.equal(reopened.project.tree[0].children[0].page!.blocks.length, 4);
  assert.equal(reopened.project.guides.length, 1);
  assert.ok(reopened.assets.has("images/pic1.png"));
  assert.deepEqual(await data("list_projects"), { folder: FOLDER, projects: ["Acme Draw.openexplainer"] });

  // export
  const word = await call("export_book", { kind: "word", file: "Out\\Acme" });
  assert.match(word.text, /Made the word export: C:\\Docs\\OpenExplainer\\Out\\Acme\.docx \(4 bytes, Acme\.docx\)\.\nNot everything could be included:\nA note about a picture\./);
  assert.ok(files.has(`${FOLDER}\\Out\\Acme.docx`));
  assert.deepEqual(made[0], { kind: "word", options: { guideId: undefined, comments: false } });
  await call("export_book", { kind: "guide-pdf", file: "G.pdf", guide_id: guideId });
  assert.deepEqual(made[1], { kind: "guide-pdf", options: { guideId, comments: false } });
  assert.ok(files.has(`${FOLDER}\\G.pdf`));
  assert.match((await call("export_book", { kind: "tar", file: "x" })).text, /kind must be one of/);
  assert.match((await call("export_book", { kind: "json", file: "C:\\Windows\\x" })).text, /not inside the folder/);

  // reopen in a fresh session
  const second = setup();
  second.files.map.set(`${FOLDER}\\Acme Draw.openexplainer`.toLowerCase(), files.map.get(`${FOLDER}\\Acme Draw.openexplainer`.toLowerCase())!);
  assert.match((await second.call("open_project", { file: "Acme Draw" })).text, /Opened "Acme: Draw\?" \(2 topics\)/);
  assert.match((await second.call("open_project", { file: "Missing" })).text, /There is no project file at/);

  // deleting needs a yes
  assert.match((await call("delete_topic", { topic_id: saving })).text, /Nothing was deleted/);
  assert.match((await call("delete_topic", { topic_id: saving, confirm: true })).text, /Deleted "Saving your work"/);
  assert.equal(session.project!.guides[0].tasks.length, 0, "a guide loses the task of a deleted topic");
});

test("tools: move_topic carries a topic, with its pictures and page, to another chapter or to the top, and refuses to move it under itself", async () => {
  const { call, data, session } = setup();
  await call("create_project", { name: "Moves" });
  const id = async (title: string, parent?: string) => /id is (\w+)/.exec((await call("add_topic", { title, ...(parent ? { parent_id: parent } : {}) })).text)![1];
  const a = await id("Alpha"), b = await id("Beta");
  const a1 = await id("One", a), a2 = await id("Two", a), b1 = await id("Three", b);
  session.project!.tree[0].children[1].pictures.push({ id: "p", file: "images/p.png", width: 10, height: 10, altText: "", source: { kind: "import", capturedAt: "t" } });
  const numbers = async () => (await data("get_outline")).topics.map((c: { title: string; children?: { title: string }[] }) => `${c.title}: ${(c.children ?? []).map((k) => k.title).join(",")}`);
  assert.deepEqual(await numbers(), ["Alpha: One,Two", "Beta: Three"]);

  assert.match((await call("move_topic", { topic_id: a2, parent_id: b, position: 1 })).text, /Moved "Two"\. It is now 2\.1\./);
  assert.deepEqual(await numbers(), ["Alpha: One", "Beta: Two,Three"]);
  assert.equal(session.project!.tree[1].children[0].pictures.length, 1, "its pictures went with it");
  assert.match((await call("move_topic", { topic_id: b1 })).text, /Moved "Three"\. It is now 3\./, "no parent makes it a chapter, put last");
  assert.deepEqual(await numbers(), ["Alpha: One", "Beta: Two", "Three: "]);
  assert.match((await call("move_topic", { topic_id: a, parent_id: a1 })).text, /cannot be moved under itself or under one of its own topics/);
  assert.match((await call("move_topic", { topic_id: a, parent_id: a })).text, /cannot be moved under itself/);
  assert.match((await call("move_topic", { topic_id: "nope" })).text, /There is no topic with the id "nope"/);
  assert.match((await call("move_topic", { topic_id: a1, parent_id: "nope" })).text, /There is no topic with the id "nope"/);
  assert.match((await call("move_topic", { topic_id: a1, position: 0 })).text, /position must be a number from 1/);
  assert.deepEqual(await numbers(), ["Alpha: One", "Beta: Two", "Three: "], "a refused move changes nothing");
  assert.match((await call("move_topic", { topic_id: "Three" })).text, /There is no topic/, "a title is not an id");
});

/** The few bytes of a PNG that say how big it is (the tools read nothing else). */
function tinyPng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

test("tools: import_picture brings a picture file in from the folder, and add_callout puts callouts on a picture that has no click", async () => {
  const { call, data, files, session } = setup();
  await call("create_project", { name: "Pictures" });
  const topicId = /id is (\w+)/.exec((await call("add_topic", { title: "Logo" })).text)![1];
  files.map.set(`${FOLDER}\\art\\logo.png`.toLowerCase(), tinyPng(300, 200));
  files.map.set(`${FOLDER}\\notes.txt`.toLowerCase(), new TextEncoder().encode("not a picture"));

  const brought = await call("import_picture", { topic_id: topicId, file: "art\\logo.png", alt_text: "The logo." });
  assert.match(brought.text, /Brought logo\.png into "Logo" as picture \w+ \(300 by 200\)\.\nSaved to /);
  const pic = (await data("get_topic", { topic_id: topicId })).pictures[0];
  assert.deepEqual([pic.width, pic.height, pic.alt_text, pic.source], [300, 200, "The logo.", "import"]);
  assert.ok(session.assets.has(`images/${pic.id}.png`), "the file is in the project");
  assert.equal(session.project!.tree[0].pictures[0].source.originalName, "logo.png");
  assert.match((await call("import_picture", { topic_id: topicId, file: "notes.txt" })).text, /not a PNG or JPEG picture/);
  assert.match((await call("import_picture", { topic_id: topicId, file: "missing.png" })).text, /There is no file at/);
  assert.match((await call("import_picture", { topic_id: topicId, file: "C:\\Windows\\Fonts\\x.png" })).text, /not inside the folder/);
  assert.match((await call("import_picture", { topic_id: topicId, file: "..\\x.png" })).text, /not inside the folder/);
  assert.match((await call("import_picture", { topic_id: "nope", file: "art\\logo.png" })).text, /There is no topic with the id "nope"/);
  assert.equal(session.project!.tree[0].pictures.length, 1, "a refused import keeps nothing");

  const first = await call("add_callout", { topic_id: topicId, picture_id: pic.id, left: 40, top: 30, width: 100, height: 60, name: "Stage", description: "The open stage arch." });
  assert.match(first.text, /Added callout A \(id \w+\) round the part from 40, 30, 100 wide and 60 high\./);
  const second = await call("add_callout", { topic_id: topicId, picture_id: pic.id, left: 250, top: 150, width: 500, height: 500 });
  assert.match(second.text, /Added callout B .* from 250, 150, 50 wide and 50 high\./, "the part is cut to the picture");
  const callouts = (await data("get_topic", { topic_id: topicId })).pictures[0].callouts;
  assert.deepEqual(callouts.map((c: { letter: string; name: string; description: string }) => [c.letter, c.name, c.description]), [["A", "Stage", "The open stage arch."], ["B", "", ""]]);
  assert.match((await call("add_callout", { topic_id: topicId, picture_id: pic.id, left: 300, top: 0, width: 5, height: 5 })).text, /left must be a number from 0 to 299/);
  assert.match((await call("add_callout", { topic_id: topicId, picture_id: pic.id, left: 0, top: 0, width: 0, height: 5 })).text, /width must be a number from 1 to 100000/);
  assert.match((await call("add_callout", { topic_id: topicId, picture_id: "nope", left: 0, top: 0, width: 5, height: 5 })).text, /has no picture with the id "nope"/);
  const named = await call("describe_picture", { topic_id: topicId, picture_id: pic.id, callouts: [{ id: callouts[1].id, name: "Curtains", description: "The drawn curtains." }] });
  assert.match(named.text, /Updated the picture and 1 callout/);
  assert.equal(session.project!.tree[0].pictures[0].callouts!.length, 2, "refused callouts were not added");
  assert.match((await call("delete_callout", { topic_id: topicId, picture_id: pic.id, callout_id: "nope" })).text, /has no callout with the id "nope"\. Its callouts are: \w+, \w+/);
  assert.match((await call("delete_callout", { topic_id: topicId, picture_id: pic.id, callout_id: callouts[0].id })).text, /Deleted the callout\. The picture has 1 callout\(s\) now\./);
  assert.deepEqual((await data("get_topic", { topic_id: topicId })).pictures[0].callouts.map((c: { letter: string; name: string }) => [c.letter, c.name]), [["A", "Curtains"]], "the one that is left is lettered A");
});

test("tools: create_project can start from the OpenStage how-to book template, and refuses a template that is not one", async () => {
  const { call, data, session } = setup();
  assert.match((await call("create_project", { name: "Book", template: "novel" })).text, /template must be one of: empty, openstage-how-to-book, software-user-guide\./);
  assert.equal(session.project, null, "a refused template made nothing");
  assert.match((await call("create_project", { name: "Book", template: "openstage-how-to-book" })).text, /Created and opened the project "Book"/);
  const topics = (await data("get_outline")).topics as { number: string; title: string }[];
  assert.equal(topics.length, 16);
  assert.deepEqual([topics[0].title, topics[14].title, topics[15].title, topics[15].number], ["Introduction", "Keyboard and Screen Reader", "Appendix", "16"]);
  assert.equal(session.project!.template, "openstage-how-to-book");
});
