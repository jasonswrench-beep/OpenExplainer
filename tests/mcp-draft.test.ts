import test from "node:test";
import assert from "node:assert/strict";
import { createDraftTools, type Drafter } from "../src/mcp/draft-tool.ts";
import { Session, type McpFiles } from "../src/mcp/session.ts";
import { addCalloutFromClick } from "../src/project/callouts.ts";
import { addNode, addPicture, createProject, ensurePage } from "../src/project/model.ts";
import { addBlock, makeBlock } from "../src/project/page.ts";
import type { ChatMessage } from "../src/ai/types.ts";

const FOLDER = "C:\\Docs\\OE";

function setup(drafter: Partial<Drafter> & { reply?: string } = {}) {
  const store = new Map<string, Uint8Array>();
  const files: McpFiles = { read: async (p) => store.get(p.toLowerCase())!, write: async (p, b) => { store.set(p.toLowerCase(), b); }, exists: async (p) => store.has(p.toLowerCase()), list: async () => [], makeFolder: async () => {}, append: async () => {} };
  const session = new Session({ enabled: true, folder: FOLDER, allowWindows: false, allowFullScreen: false }, files);
  const project = createProject("Draft test");
  const chapter = addNode(project.tree, null, "Saving");
  const topic = addNode(project.tree, chapter.id, "Save a file");
  const picture = { id: "p1", file: "images/p1.png", width: 1000, height: 500, altText: "The Save button", source: { kind: "click" as const, capturedAt: "t", originalName: "p1" }, click: { x: 100, y: 50, button: "left" as const, target: { role: "button", name: "Save", bounds: { x: 80, y: 40, width: 60, height: 30 } } } };
  addPicture(project.tree, topic.id, picture);
  addCalloutFromClick(topic.pictures[0]);
  const para = makeBlock("paragraph");
  (para as { text: unknown }).text = [{ text: "Save your work often. Close the file when you have finished." }];
  addBlock(ensurePage(topic), para);
  session.project = project;
  session.filePath = `${FOLDER}\\draft.openexplainer`;
  const asked: ChatMessage[][] = [];
  const real: Drafter = {
    model: "test-model.gguf",
    status: async () => ({ ready: true, why: "" }),
    ask: async (messages) => { asked.push(messages); return { text: drafter.reply ?? "Saves the file.", truncated: false }; },
    ...drafter,
  };
  const tools = createDraftTools(session, real);
  const call = async (args: Record<string, unknown>) => {
    const r = await tools[0].handler(args).catch((e: Error) => ({ content: [{ type: "text" as const, text: e.message }], isError: true }));
    return { text: r.content.map((c) => (c as { text: string }).text).join("\n"), isError: (r as { isError?: boolean }).isError === true };
  };
  return { call, project, topic, chapter, asked, session };
}

test("with the built-in model ready, drafts go in the Drafts list, are saved, and are marked as drafts the assistant cannot accept", async () => {
  const { call, project, topic, asked } = setup();
  const done = await call({ topic_id: topic.id, kind: "callouts" });
  assert.equal(done.isError, false, done.text);
  assert.match(done.text, /you cannot accept them/);
  assert.match(done.text, /Saved to /);
  assert.equal(asked.length, 1, "the model was asked once, for the one callout");
  assert.equal(project.drafts.length, 1);
  assert.deepEqual([project.drafts[0].kind, (project.drafts[0] as { model?: string }).model], ["callout-sentence", "test-model.gguf"]);
  assert.equal(topic.pictures[0].callouts![0].description, "", "nothing was written into the book itself");
  assert.match(done.text, /"text": "Saves the file\."/);
});

test("with no model ready nothing is drafted and the facts come back to write from", async () => {
  const { call, project, topic } = setup({ status: async () => ({ ready: false, why: "AI help is off in OpenExplainer." }) });
  const done = await call({ topic_id: topic.id, kind: "callouts" });
  assert.equal(done.isError, false);
  assert.match(done.text, /^Nothing was drafted\. AI help is off in OpenExplainer\./);
  const facts = JSON.parse(done.text.slice(done.text.indexOf("{")));
  assert.equal(facts.topic.endsWith("Save a file"), true);
  assert.equal(facts.callouts_without_a_sentence.length, 1);
  assert.equal(facts.callouts_without_a_sentence[0].picture_id, "p1");
  assert.ok(facts.callouts_without_a_sentence[0].clues.some((line: string) => /Save/.test(line)), "the clicked item's name is among the facts");
  assert.equal(project.drafts.length, 0);
});

test("a key for a hosted service is never used here, and the words say why", async () => {
  const why = "AI help is set to your own key for a hosted service. A key is never used when nobody is at the keyboard, because nobody can see what would be sent.";
  const { call, topic, asked } = setup({ status: async () => ({ ready: false, why }) });
  const done = await call({ topic_id: topic.id, kind: "boxes" });
  assert.match(done.text, /never used when nobody is at the keyboard/);
  assert.match(done.text, /Here are the facts/);
  assert.equal(asked.length, 0);
});

test("a chapter opener and boxes are drafted the same way, and the facts for them come back when no model is ready", async () => {
  const opener = setup({ reply: "This chapter explains how to save your work. It also shows how to close the file when you have finished." });
  const o = await opener.call({ topic_id: opener.chapter.id, kind: "opener" });
  assert.equal(o.isError, false, o.text);
  assert.ok(opener.project.drafts.some((d) => d.kind === "chapter-text"), o.text);
  const none = setup({ status: async () => ({ ready: false, why: "The built-in model is not on this PC yet." }) });
  const material = await none.call({ topic_id: none.chapter.id, kind: "opener" });
  assert.match(material.text, /Saving/);
  const boxFacts = await none.call({ topic_id: none.topic.id, kind: "boxes" });
  assert.match(boxFacts.text, /Save your work often/);
});

test("a topic that is not there, a kind that is not one, and a missing id are said in words", async () => {
  const { call, topic } = setup();
  assert.match((await call({ topic_id: "nope", kind: "callouts" })).text, /There is no topic with the id "nope"/);
  assert.match((await call({ topic_id: topic.id, kind: "poem" })).text, /kind must be one of: callouts, opener, summary, boxes/);
  assert.match((await call({ kind: "callouts" })).text, /topic_id is needed/);
});
