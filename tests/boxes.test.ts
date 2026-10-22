import test from "node:test";
import assert from "node:assert/strict";
import { addNode, createProject, ensurePage, type Project } from "../src/project/model.ts";
import { makeBlock, type CalloutBlock, type ParagraphBlock, type ProcedureBlock } from "../src/project/page.ts";
import { BOX_SCHEMA, MOST_BOXES, boxReportWords, boxesPossible, buildBoxMessages, checkBoxes, draftBoxes, topicMaterial, warnsOfLoss } from "../src/ai/boxes.ts";
import { addDraft, draftRows, isBox, type BoxDraft } from "../src/project/drafts.ts";
import { AiError } from "../src/ai/types.ts";
import type { Answer, AskOptions, ChatMessage } from "../src/ai/types.ts";

function para(words: string): ParagraphBlock {
  const b = makeBlock("paragraph") as ParagraphBlock;
  b.text = [{ text: words }];
  return b;
}
function steps(...lines: string[]): ProcedureBlock {
  const b = makeBlock("procedure") as ProcedureBlock;
  b.steps = lines.map((l, i) => ({ id: `s${i}`, text: [{ text: l }] }));
  return b;
}

const SAVE = "Saving over an existing file replaces it, so use Save as to keep both versions.";
const TIME = "Printing a long document can take a few minutes.";
const PICK = "The Print window lets you pick the printer and the number of copies.";

function book(): { project: Project; topic: string; empty: string } {
  const project = createProject("Boxes");
  const chapter = addNode(project.tree, null, "Working with documents");
  const topic = addNode(project.tree, chapter.id, "Saving and printing");
  const empty = addNode(project.tree, chapter.id, "Nothing yet");
  ensurePage(topic).blocks.push(para(`You can save your work at any time. ${SAVE}`), steps("Choose File.", "Choose Print."), para(`${PICK} ${TIME} Wait.`));
  return { project, topic: topic.id, empty: empty.id };
}

const answer = (...boxes: Array<{ evidence: string; text: string; kind?: string }>): string => JSON.stringify({ boxes: boxes.map((b) => ({ kind: "power-tip", ...b })) });

test("a sentence that says work can be lost, replaced or deleted is a warning, and an ordinary one is not", () => {
  for (const s of ["Saving over an existing file replaces it.", "Your changes are lost.", "If you choose Don't save, those changes are lost.", "This cannot be undone.", "The file is permanently deleted.", "It overwrites the old copy.", "You may lose your work."]) assert.equal(warnsOfLoss(s), true, s);
  for (const s of ["Printing can take a few minutes.", "The Print window lets you pick the printer.", "Use the replacement part.", "The lostandfound box is empty.", "Choose File."]) assert.equal(warnsOfLoss(s), false, s);
});

test("the sentences a box can rest on are those of the paragraphs, long enough to say something, and not the steps", () => {
  const { project, topic, empty } = book();
  const m = topicMaterial(project, topic)!;
  assert.equal(m.title, "Saving and printing");
  assert.deepEqual(m.sentences, ["You can save your work at any time.", SAVE, PICK, TIME], "Wait. is too short, the steps are not paragraphs");
  assert.match(m.text, /Steps: 1\. Choose File\. 2\. Choose Print\./, "the model still reads the steps");
  assert.equal(m.shortened, false);
  assert.equal(topicMaterial(project, "nope"), null);
  assert.deepEqual(topicMaterial(project, empty)!.sentences, []);
  ensurePage(project.tree[0].children[1]).blocks.push(para(Array.from({ length: 900 }, (_, i) => `This is sentence ${i} of the topic.`).join(" ")));
  assert.equal(topicMaterial(project, empty)!.shortened, true);
});

test("whether boxes can be suggested is said in words", () => {
  const { project, topic, empty } = book();
  assert.deepEqual(boxesPossible(project, topic), { ok: true });
  assert.match((boxesPossible(project, empty) as { words: string }).words, /no paragraph text to rest a box on yet/);
  assert.equal((boxesPossible(project, "nope") as { words: string }).words, "That topic was not found.");
  addDraft(project, { kind: "box", nodeId: topic, boxKind: "caution", text: "Careful.", evidence: SAVE, clues: [], madeAt: "", model: "m" });
  assert.match((boxesPossible(project, topic) as { words: string }).words, /already waiting for this topic\. Open Drafts/);
});

test("the message to the model has the rules, the topic's own words and, only if there are any, the author's notes", () => {
  const { project, topic } = book();
  const material = topicMaterial(project, topic)!;
  const plain = buildBoxMessages(material, "");
  assert.equal(plain.length, 2);
  assert.match(plain[0].content, /up to three sentences that a reader could easily miss/);
  assert.match(plain[0].content, /copied from a paragraph of the topic exactly, word for word/);
  assert.match(plain[0].content, /Add nothing: no reasons, no results, no advice/);
  assert.ok(!/Notes from the author/.test(plain[0].content));
  assert.match(plain[1].content, /^Topic: Saving and printing\n\nYou can save your work/);
  assert.match(plain[1].content, /Suggest the boxes\.$/);
  assert.match(buildBoxMessages(material, "Keep sentences short.")[0].content, /Notes from the author about the writing style:\nKeep sentences short\./);
  assert.deepEqual(BOX_SCHEMA.properties.boxes.items.required, ["evidence", "text", "kind"], "the sentence is written before the note");
  assert.equal(BOX_SCHEMA.properties.boxes.maxItems, MOST_BOXES);
  assert.deepEqual(BOX_SCHEMA.properties.boxes.items.properties.kind.enum, ["caution", "design-tip", "power-tip", "time-saver", "bright-idea"]);
});

test("a good answer is kept, in the order of the page, and the kind is a Caution by rule when the sentence says work is lost", () => {
  const { project, topic } = book();
  const checked = checkBoxes(answer({ evidence: TIME, text: "Long documents take a few minutes to print.", kind: "time-saver" }, { evidence: SAVE, text: "Save as keeps both versions, so nothing is replaced.", kind: "design-tip" }), project, topic);
  assert.equal(checked.understood, true);
  assert.deepEqual(checked.thrownAway, []);
  assert.deepEqual(checked.kept, [
    { boxKind: "caution", text: "Save as keeps both versions, so nothing is replaced.", evidence: SAVE, kindBy: "rule" },
    { boxKind: "time-saver", text: "Long documents take a few minutes to print.", evidence: TIME, kindBy: "model" },
  ]);
  const odd = checkBoxes(answer({ evidence: PICK, text: "You can choose a printer and the copies.", kind: "new-feature" }), project, topic);
  assert.equal(odd.kept[0].boxKind, "design-tip", "a kind the model may not name becomes a starting choice the author can change");
  const eager = checkBoxes(answer({ evidence: TIME, text: "Long documents take a few minutes to print.", kind: "caution" }), project, topic);
  assert.deepEqual(eager.kept, [{ boxKind: "design-tip", text: "Long documents take a few minutes to print.", evidence: TIME, kindBy: "changed" }], "a Caution the rule does not back starts as a Design Tip");
  assert.equal(checkBoxes(JSON.stringify({ boxes: [] }), project, topic).understood, true);
  assert.deepEqual(checkBoxes(JSON.stringify({ boxes: [] }), project, topic).thrownAway, []);
});

test("a box is thrown away if its sentence is not in the topic's paragraphs, is a step, or is already in a box; or if its note is not fit", () => {
  const { project, topic } = book();
  const node = project.tree[0].children[0];
  const box = makeBlock("callout", { kind: "caution" }) as CalloutBlock;
  box.text = [{ text: "Save as keeps both versions." }];
  node.page!.blocks.push(box);
  const refused: Array<[{ evidence: string; text: string }, RegExp]> = [
    [{ evidence: "Saving replaces everything you have ever made.", text: "Take care when saving." }, /not in the topic's paragraphs \("Saving replaces everything/],
    [{ evidence: "Choose File. Choose Print.", text: "Start from the File menu." }, /not in the topic's paragraphs/],
    [{ evidence: "Wait.", text: "Please wait a moment here." }, /not in the topic's paragraphs/],
    [{ evidence: "Saving over an existing file", text: "Take care when saving." }, /not in the topic's paragraphs/],
    [{ evidence: "", text: "Take care when saving." }, /no sentence to rest on, or no words/],
    [{ evidence: TIME, text: "" }, /no sentence to rest on, or no words/],
    [{ evidence: TIME, text: 'Long documents "take" a few minutes.' }, /quotation marks/],
    [{ evidence: TIME, text: "Wait." }, /too short to say anything/],
    [{ evidence: TIME, text: "It takes a while. It may take longer. It could take even longer still." }, /too long/],
    [{ evidence: TIME, text: Array.from({ length: 50 }, () => "word").join(" ") }, /too long/],
    [{ evidence: TIME, text: "Printing a long document can take a few minutes" }, /only repeated the sentence it rests on/],
    [{ evidence: TIME, text: "Printing a long document can take a few minutes." }, /only repeated the sentence it rests on/],
    [{ evidence: TIME, text: "Use the Wizard to print faster." }, /mentioned "Wizard", which is not in the topic/],
  ];
  for (const [item, why] of refused) {
    const checked = checkBoxes(answer(item), project, topic);
    assert.deepEqual(checked.kept, [], JSON.stringify(item));
    assert.match(checked.thrownAway.join(" | "), why, JSON.stringify(item));
  }
  // The sentence of the topic that a box on the page already says is not offered again.
  node.page!.blocks.push((() => { const b = makeBlock("callout", { kind: "design-tip" }) as CalloutBlock; b.text = [{ text: `Remember: ${TIME}` }]; return b; })());
  const repeated = checkBoxes(answer({ evidence: TIME, text: "A long print job takes a few minutes." }), project, topic);
  assert.deepEqual(repeated.kept, []);
  assert.match(repeated.thrownAway.join(" "), /repeated one already on the page/);
});

test("the answer must be well formed, at most three boxes are kept, and the same sentence is kept once", () => {
  const { project, topic } = book();
  for (const raw of ["not json", "[]", '{"boxes":"none"}', "null", ""]) {
    const c = checkBoxes(raw, project, topic);
    assert.equal(c.understood, false, raw);
    assert.deepEqual(c.kept, []);
    assert.match(c.thrownAway[0], /not in the expected form/);
  }
  const node = project.tree[0].children[0];
  node.page!.blocks.push(para("The Print window shows a preview of each page. A second window shows the printers on the network. You can pick a printer from the list."));
  const many = checkBoxes(
    answer(
      { evidence: "You can save your work at any time.", text: "Save as often as you like." },
      { evidence: "You can save your work at any time.", text: "Saving can be done whenever you like." },
      { evidence: SAVE, text: "Save as keeps both versions." },
      { evidence: PICK, text: "Choose the printer and the copies here." },
      { evidence: "A second window shows the printers on the network.", text: "Network printers have their own window." },
    ),
    project,
    topic,
  );
  assert.equal(many.kept.length, 3);
  assert.deepEqual(many.kept.map((k) => k.evidence), ["You can save your work at any time.", SAVE, PICK], "the first three on the page; the repeated sentence once");
  assert.match(many.thrownAway.join(" "), /only the first 3 boxes on the page were kept/);
});

type Ask = (messages: ChatMessage[], options: AskOptions) => Promise<Answer>;
const reply = (text: string, truncated = false): Answer => ({ text, truncated });
const job = (project: Project, nodeId: string, ask: Ask, extra: Partial<Parameters<typeof draftBoxes>[0]> = {}) => ({ project, nodeId, ask, model: "Qwen3.5-4B-Q4_K_M.gguf", now: () => "2026-10-22T10:00:00.000Z", ...extra });

test("drafting boxes asks for exactly the expected shape, makes a draft for each box with what it rests on, and changes nothing in the book", async () => {
  const { project, topic } = book();
  project.writingStyle = "Keep sentences short.";
  const before = JSON.stringify(project.tree);
  const calls: Array<{ messages: ChatMessage[]; options: AskOptions }> = [];
  const report = await draftBoxes(job(project, topic, async (messages, options) => {
    calls.push({ messages, options });
    return reply(answer({ evidence: SAVE, text: "Save as keeps both versions.", kind: "design-tip" }, { evidence: TIME, text: "Long documents take a few minutes.", kind: "time-saver" }));
  }));
  assert.equal(report.made, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.jsonSchema, BOX_SCHEMA);
  assert.equal(calls[0].options.temperature, 0.3);
  assert.match(calls[0].messages[0].content, /Keep sentences short\./);
  assert.match(calls[0].messages[0].content, /said again as a short note for the reader, in other words\. Add nothing/);
  assert.equal(JSON.stringify(project.tree), before, "the book itself is untouched");
  const drafts = project.drafts.filter(isBox) as BoxDraft[];
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].boxKind, "caution");
  assert.equal(drafts[0].evidence, SAVE);
  assert.equal(drafts[0].model, "Qwen3.5-4B-Q4_K_M.gguf");
  assert.match(drafts[0].clues.join("\n"), /Rests on the sentence: Saving over an existing file replaces it/);
  assert.match(drafts[0].clues.join("\n"), /Kind: Caution, because the sentence says work can be lost or replaced \(a rule, not the model\)\./);
  assert.match(drafts[1].clues.join("\n"), /Kind: Time Saver, the model's suggestion\. Change it if it does not fit\./);
  assert.match(drafts[1].clues.join("\n"), /The writing-style notes were used\./);
  const other = book();
  const changed = await draftBoxes(job(other.project, other.topic, async () => reply(answer({ evidence: TIME, text: "Long documents take a few minutes to print.", kind: "caution" }))));
  assert.equal(changed.made, 1);
  assert.match((other.project.drafts.filter(isBox)[0] as BoxDraft).clues.join("\n"), /Kind: Design Tip\. The model said Caution, but the sentence does not say work can be lost, so it starts as Design Tip\. Change it if it does not fit\./);
  assert.deepEqual(boxReportWords(report), ["2 boxes were suggested. They wait in Drafts until you accept or reject each."]);
  assert.equal(draftRows(project).filter((r) => isBox(r.draft)).length, 2);
});

test("a box answer that is not fit gets one more try, and the report says why when both fail", async () => {
  const { project, topic } = book();
  let n = 0;
  const temperatures: Array<number | undefined> = [];
  const report = await draftBoxes(job(project, topic, async (_m, options) => {
    temperatures.push(options.temperature);
    n++;
    return reply(n === 1 ? "this is not json" : answer({ evidence: TIME, text: "Long documents take a few minutes." }));
  }));
  assert.equal(report.made, 1);
  assert.deepEqual(temperatures, [0.3, 0.6]);

  const second = book();
  const failing = await draftBoxes(job(second.project, second.topic, async () => reply(answer({ evidence: "A sentence nobody wrote in this topic.", text: "Something to remember about it." }))));
  assert.equal(failing.made, 0);
  assert.equal(failing.nothingFound, false);
  assert.match(boxReportWords(failing)[0], /^No box was suggested: the model's answers were not fit to keep \(a box rested on a sentence that is not in the topic's paragraphs/);
  assert.match(boxReportWords(failing)[0], /You can try again\.$/);
  assert.equal(second.project.drafts.length, 0);
});

test("a model that finds nothing worth a box is believed, and a stop or a model problem is reported as such", async () => {
  const { project, topic } = book();
  let calls = 0;
  const none = await draftBoxes(job(project, topic, async () => { calls++; return reply(JSON.stringify({ boxes: [] })); }));
  assert.equal(calls, 1, "no second try for an honest empty list");
  assert.deepEqual(boxReportWords(none), ["The model read the topic and found no sentence worth a box."]);

  const cut = await draftBoxes(job(project, topic, async () => reply(answer({ evidence: TIME, text: "Long documents take a few minutes." }), true)));
  assert.equal(cut.made, 0);
  assert.match(boxReportWords(cut)[0], /ran out of room before the end/);

  const down = await draftBoxes(job(project, topic, async () => { throw new AiError("unreachable", "The model program did not answer."); }));
  assert.deepEqual(boxReportWords(down), ["The model program did not answer."]);

  const stopper = new AbortController();
  const stopped = await draftBoxes(job(project, topic, async () => { stopper.abort(); throw new AiError("cancelled", "Cancelled."); }, { signal: stopper.signal }));
  assert.deepEqual(boxReportWords(stopped), ["The drafting was stopped."]);
  assert.equal(project.drafts.length, 0);

  const noParagraphs = book();
  const text = await draftBoxes(job(noParagraphs.project, noParagraphs.empty, async () => reply("{}")));
  assert.equal(text.made, 0);
});

test("a sentence that already has a suggestion waiting is not suggested twice", async () => {
  const { project, topic } = book();
  addDraft(project, { kind: "box", nodeId: topic, boxKind: "caution", text: "Careful with saving.", evidence: SAVE, clues: [], madeAt: "", model: "m" });
  const report = await draftBoxes(job(project, topic, async () => reply(answer({ evidence: SAVE, text: "Save as keeps both versions." }, { evidence: TIME, text: "Long documents take a few minutes." }))));
  assert.equal(report.made, 1);
  assert.equal(project.drafts.filter(isBox).length, 2);
  assert.equal((project.drafts.filter(isBox)[0] as BoxDraft).text, "Careful with saving.", "the waiting one is left as the author may have meant it");
});
