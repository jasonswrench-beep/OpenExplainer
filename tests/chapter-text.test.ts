import test from "node:test";
import assert from "node:assert/strict";
import { addNode, createProject, ensurePage, type Project } from "../src/project/model.ts";
import { makeBlock, type CalloutBlock, type HeadingBlock, type ParagraphBlock, type ProcedureBlock } from "../src/project/page.ts";
import { splitSentences, topicText } from "../src/project/page-text.ts";
import { MOST_MATERIAL, buildChapterMessages, chapterMaterial, chapterOf, chapterReportWords, chapterTextPossible, checkProse, draftChapterText } from "../src/ai/chapter-text.ts";
import { addDraft, type ChapterTextDraft } from "../src/project/drafts.ts";
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

function book(): { project: Project; chapter: string; saving: string; printing: string; closing: string; summary: string; second: string } {
  const project = createProject("Chapter text");
  const chapter = addNode(project.tree, null, "Working with documents");
  const saving = addNode(project.tree, chapter.id, "Saving your work");
  const printing = addNode(project.tree, chapter.id, "Printing a page");
  const closing = addNode(project.tree, chapter.id, "Closing the program");
  const summary = addNode(project.tree, chapter.id, "Summary");
  const second = addNode(project.tree, null, "Another chapter");
  ensurePage(saving).blocks.push(para("You can save your work at any time. Saving over an existing file replaces it, so use Save as to keep both versions."), steps("Choose File.", "Choose Save as...", "Click Save."));
  ensurePage(printing).blocks.push(para("Choose Print to send the page to your printer."), steps("Choose File.", "Choose Print."));
  ensurePage(closing).blocks.push(para("Close the program with the X button. If you have unsaved changes, the program asks whether to save them."));
  return { project, chapter: chapter.id, saving: saving.id, printing: printing.id, closing: closing.id, summary: summary.id, second: second.id };
}

test("the words of a topic's page are plain text in order, with the steps numbered, and an empty page has none", () => {
  const { project, saving, summary } = book();
  const node = project.tree[0].children[0];
  const heading = makeBlock("heading") as HeadingBlock;
  heading.text = "Why it matters";
  const box = makeBlock("callout", { kind: "caution" }) as CalloutBlock;
  box.text = [{ text: "Be " }, { text: "careful", mark: "bold" }, { text: "." }];
  const withMarks = steps("Choose ");
  withMarks.steps[0].text = [{ text: "Choose " }, { text: "File", mark: "control" }, { text: "." }];
  withMarks.steps[0].result = [{ text: "The menu opens." }];
  node.page!.blocks.push(heading, box, withMarks, makeBlock("picture"));
  assert.equal(topicText(node), "You can save your work at any time. Saving over an existing file replaces it, so use Save as to keep both versions. Steps: 1. Choose File. 2. Choose Save as... 3. Click Save. Why it matters Be careful. Steps: 1. Choose File. The menu opens.");
  assert.equal(topicText(project.tree[0].children[3]), "", "no page, no words");
  assert.equal(saving.length > 0, true);
  void summary;
  assert.deepEqual(splitSentences("One two. Three four! Is it five? yes. Six\nseven."), ["One two.", "Three four!", "Is it five? yes.", "Six seven."]);
});

test("the chapter that holds an item is found, and the model reads the right topics for each job", () => {
  const { project, chapter, saving, summary, second } = book();
  assert.equal(chapterOf(project, saving)!.id, chapter);
  assert.equal(chapterOf(project, chapter)!.id, chapter);
  assert.equal(chapterOf(project, "nope"), null);
  const opener = chapterMaterial(project, chapter, "opener")!;
  assert.equal(opener.chapter, "Working with documents");
  assert.deepEqual(opener.topics.map((t) => t.title), ["Saving your work", "Printing a page", "Closing the program"], "topics with words, in order; the empty Summary topic and the other chapter are not read");
  assert.equal(opener.shortened, false);
  const forSummary = chapterMaterial(project, summary, "summary")!;
  assert.deepEqual(forSummary.topics.map((t) => t.title), ["Saving your work", "Printing a page", "Closing the program"]);
  // The topic that is to hold the summary is not read, nor is anything under it.
  ensurePage(project.tree[0].children[3]).blocks.push(para("Notes already here."));
  addNode(project.tree[0].children[3].children, null, "Sub");
  assert.deepEqual(chapterMaterial(project, summary, "summary")!.topics.map((t) => t.title).includes("Summary"), false);
  assert.deepEqual(chapterMaterial(project, saving, "summary")!.topics.map((t) => t.title), ["Printing a page", "Closing the program", "Summary"]);
  assert.equal(chapterMaterial(project, second, "opener")!.topics.length, 0);
  assert.equal(chapterMaterial(project, "nope", "opener"), null);
});

test("a long chapter is shared out between its topics and cut at the end of a sentence, and says so", () => {
  const project = createProject("Long");
  const chapter = addNode(project.tree, null, "Big chapter");
  for (let i = 0; i < 12; i++) {
    const t = addNode(project.tree, chapter.id, `Topic ${i + 1}`);
    ensurePage(t).blocks.push(para(Array.from({ length: 120 }, (_, k) => `This is sentence number ${k + 1} of the topic.`).join(" ")));
  }
  const m = chapterMaterial(project, chapter.id, "opener")!;
  assert.equal(m.shortened, true);
  const total = m.topics.reduce((n, t) => n + t.text.length, 0);
  assert.ok(total <= MOST_MATERIAL + 12 * 10, `about the limit, not over it: ${total}`);
  assert.ok(m.topics.every((t) => t.text.endsWith(".")), "each cut ends at the end of a sentence");
  assert.ok(m.topics.every((t) => t.text.length >= 400), "and every topic gets some");
});

test("whether an opener or a summary can be drafted is said in words", () => {
  const { project, chapter, saving, summary, second } = book();
  assert.deepEqual(chapterTextPossible(project, chapter, "opener"), { ok: true });
  assert.deepEqual(chapterTextPossible(project, summary, "summary"), { ok: true });
  assert.match((chapterTextPossible(project, saving, "opener") as { words: string }).words, /An opener goes at the top of a chapter\. Select a chapter/);
  assert.match((chapterTextPossible(project, chapter, "summary") as { words: string }).words, /A summary goes on a topic inside a chapter, such as a last topic called Summary/);
  assert.match((chapterTextPossible(project, second, "opener") as { words: string }).words, /nothing written in this chapter yet to write the opener from/);
  assert.equal((chapterTextPossible(project, "nope", "opener") as { words: string }).words, "That item was not found.");
  addDraft(project, { kind: "chapter-text", nodeId: chapter, role: "opener", text: "Waiting.", clues: [], madeAt: "", model: "m" });
  assert.match((chapterTextPossible(project, chapter, "opener") as { words: string }).words, /A draft of the opener is already waiting for this chapter\. Open Drafts/);
  assert.deepEqual(chapterTextPossible(project, summary, "summary"), { ok: true }, "a waiting opener does not stop a summary");
});

test("the message to the model has the rules, the chapter's own words and, only if there are any, the author's notes; no pictures", () => {
  const { project, chapter } = book();
  const material = chapterMaterial(project, chapter, "opener")!;
  const plain = buildChapterMessages(material, "opener", "  ");
  assert.equal(plain.length, 2);
  assert.match(plain[0].content, /two or three plain sentences saying what the reader will be able to do/);
  assert.match(plain[0].content, /Do not describe the steps/);
  assert.match(plain[0].content, /Do not invent features/);
  assert.ok(!/Notes from the author/.test(plain[0].content));
  assert.match(plain[1].content, /^Chapter: Working with documents\n\nTopic 1: Saving your work\nYou can save your work/);
  assert.match(plain[1].content, /Topic 2: Printing a page/);
  assert.match(plain[1].content, /Write the introduction\.$/);
  const summary = buildChapterMessages(material, "summary", "Say click for buttons.");
  assert.match(summary[0].content, /three to five short sentences, give the facts a reader should remember/);
  assert.match(summary[0].content, /Never say "you will learn"/);
  assert.match(summary[0].content, /Notes from the author about the writing style:\nSay click for buttons\./);
  assert.match(summary[1].content, /Write the summary\.$/);
});

const vocab = "Working with documents Saving your work You can save your work at any time. Saving over an existing file replaces it, so use Save as to keep both versions. Printing a page Choose Print to send the page to your printer. Closing the program Close the program with the X button. Choose File Click Save";

test("an opener or summary is kept only if it is plain sentences, the right number, with no name that is not in the chapter's own text", () => {
  const ok = (raw: string, role: "opener" | "summary" = "opener") => checkProse(raw, role, vocab);
  assert.deepEqual(ok("After this chapter, you will be able to save your work and print a page. You can also close the program."), { ok: true, text: "After this chapter, you will be able to save your work and print a page. You can also close the program." });
  assert.deepEqual(ok("After this chapter you will save your work and print a page. You can then close the program"), { ok: true, text: "After this chapter you will save your work and print a page. You can then close the program." }, "a missing full stop is added");
  assert.deepEqual(ok("**After** this chapter, you will `save` work and print a page.\nYou can close the program."), { ok: true, text: "After this chapter, you will save work and print a page. You can close the program." }, "formatting is taken off and a line break is a space");
  assert.equal(ok("You can save your work. Use Save as to keep both versions. Print a page when you are ready. Close the program with the X button.", "summary").ok, true);
  const refused: Array<[string, "opener" | "summary", RegExp]> = [
    ["After this chapter, you will be able to save your work and print a page.\n\nYou can also close the program.", "opener", /more than one paragraph/],
    ["- Save your work with the File menu and print a page when you are ready.", "opener", /written as a list/],
    ["1. Save your work with the File menu and print a page when you are ready.", "opener", /written as a list/],
    ['After this chapter you will be able to "save" your work and print a page. You can close it.', "opener", /quotation marks/],
    ["Save your work.", "opener", /too short to say anything/],
    ["You will save your work and print a page this way, simply.", "opener", /too short \(it needs at least 2 sentences\)/],
    ["You will save your work. You will print a page. You will close the program. You will do much more. That is all you need.", "opener", /too long \(more than 3 sentences\)/],
    ["You will save your work and print a page. Then you will close the program.", "summary", /too short \(it needs at least 3 sentences\)/],
    [Array.from({ length: 6 }, () => "You can save your work.").join(" "), "summary", /more than 5 sentences/],
    [`${"You can save your work and print a page and close the program ".repeat(6)}. You can do it. You can do it too.`, "opener", /more than 70 words|more than 3 sentences/],
    ["After this chapter, you will be able to save your work in the Cloud. You can also print a page.", "opener", /mentioned "Cloud", which is not in the chapter's text/],
    ["After this chapter, you will be able to save your work. Then print with the Wizard.", "opener", /mentioned "Wizard"/],
    ["You will learn how to save your work. Saving over an existing file replaces it. Printing sends the page to your printer.", "summary", /said "you will learn", which is an introduction/],
    ["Saving over an existing file replaces it. Printing sends the page to your printer. In conclusion, close the program with the X button.", "summary", /said "in conclusion"/],
  ];
  for (const [raw, role, why] of refused) {
    const r = ok(raw, role);
    assert.equal(r.ok, false, raw);
    assert.match((r as { why: string }).why, why, raw);
  }
});

type Ask = (messages: ChatMessage[], options: AskOptions) => Promise<Answer>;
const GOOD = "After this chapter, you will be able to save your work and print a page. You can also close the program.";

function job(project: Project, nodeId: string, role: "opener" | "summary", ask: Ask, extra: Partial<Parameters<typeof draftChapterText>[0]> = {}) {
  return { project, nodeId, role, ask, model: "Qwen3.5-4B-Q4_K_M.gguf", now: () => "2026-10-22T10:00:00.000Z", ...extra };
}

test("drafting an opener makes one draft with what it read, and changes nothing in the book", async () => {
  const { project, chapter } = book();
  project.writingStyle = "Speak to the reader as you.";
  const before = JSON.stringify(project.tree);
  const asked: Array<{ messages: ChatMessage[]; options: AskOptions }> = [];
  const progress: string[] = [];
  const report = await draftChapterText(job(project, chapter, "opener", async (messages, options) => { asked.push({ messages, options }); return { text: GOOD, truncated: false }; }, { onProgress: (w) => progress.push(w) }));
  assert.equal(report.made, true);
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0].options, { maxTokens: 150, temperature: 0.3, signal: undefined });
  assert.match(asked[0].messages[0].content, /Speak to the reader as you\./);
  assert.equal(JSON.stringify(project.tree), before);
  const d = project.drafts[0] as ChapterTextDraft;
  assert.deepEqual([d.kind, d.nodeId, d.role, d.text, d.model, d.madeAt], ["chapter-text", chapter, "opener", GOOD, "Qwen3.5-4B-Q4_K_M.gguf", "2026-10-22T10:00:00.000Z"]);
  assert.deepEqual(d.clues, ["Chapter: Working with documents", "Read 3 topics: Saving your work, Printing a page, Closing the program", "The writing-style notes were used."]);
  assert.deepEqual(progress, ["Reading 3 topics and writing the opener."]);
  assert.deepEqual(chapterReportWords(report, "opener"), ["The opener was drafted. It waits in Drafts until you accept or reject it."]);
  // A second one for the same chapter replaces the first.
  await draftChapterText(job(project, chapter, "opener", async () => ({ text: "After this chapter you can save, print and close. It takes a few steps.", truncated: false })));
  assert.equal(project.drafts.length, 1);
  assert.match((project.drafts[0] as ChapterTextDraft).text, /^After this chapter you can save/);
});

test("a first answer that is no good is tried again once, with a little more freedom; two bad answers make no draft and say why", async () => {
  const { project, summary } = book();
  const temps: number[] = [];
  let n = 0;
  const report = await draftChapterText(job(project, summary, "summary", async (_m, options) => {
    temps.push(options.temperature ?? -1);
    return { text: ++n === 1 ? "Save." : "You can save your work at any time. Save as keeps both versions. Choose Print to send the page to your printer. Close the program with the X button.", truncated: false };
  }));
  assert.equal(report.made, true);
  assert.deepEqual(temps, [0.3, 0.6]);
  assert.equal((project.drafts[0] as ChapterTextDraft).role, "summary");
  assert.deepEqual(report.thrownAway, ["it was too short to say anything"]);
  const bad = book();
  const none = await draftChapterText(job(bad.project, bad.chapter, "opener", async () => ({ text: "Save it in the Cloud right now, the Wizard will help you do it. It is simple.", truncated: false })));
  assert.equal(none.made, false);
  assert.equal(bad.project.drafts.length, 0);
  assert.match(chapterReportWords(none, "opener")[0], /^No opener was drafted: the model's answers were not fit to keep \(it mentioned "Cloud", which is not in the chapter's text\)\. You can try again\.$/);
  const cut = await draftChapterText(job(bad.project, bad.chapter, "opener", async () => ({ text: "After this chapter you will", truncated: true })));
  assert.deepEqual(cut.thrownAway, ["it ran out of room before the end", "it ran out of room before the end"]);
  const empty = await draftChapterText(job(bad.project, bad.chapter, "opener", async () => { throw new AiError("bad-answer", "The model gave an empty answer."); }));
  assert.deepEqual(empty.thrownAway, ["The model gave an empty answer.", "The model gave an empty answer."]);
});

test("a problem with the model, or Stop, ends the job at once and says why", async () => {
  const { project, chapter, second } = book();
  const down = await draftChapterText(job(project, chapter, "opener", async () => { throw new AiError("unreachable", "The model program did not answer."); }));
  assert.deepEqual(down.stopped, { code: "unreachable", words: "The model program did not answer." });
  assert.deepEqual(chapterReportWords(down, "opener"), ["The model program did not answer."]);
  const stop = new AbortController();
  stop.abort();
  let asked = 0;
  const before = await draftChapterText(job(project, chapter, "opener", async () => { asked++; return { text: GOOD, truncated: false }; }, { signal: stop.signal }));
  assert.deepEqual([asked, before.stopped?.code], [0, "cancelled"]);
  assert.deepEqual(chapterReportWords(before, "opener"), ["The drafting was stopped."]);
  const during = await draftChapterText(job(project, chapter, "opener", async () => { throw new AiError("cancelled", "Cancelled."); }));
  assert.equal(during.stopped?.code, "cancelled");
  const odd = await draftChapterText(job(project, chapter, "opener", async () => { throw new Error("disk exploded"); }));
  assert.match(odd.stopped!.words, /disk exploded/);
  // Nothing written means nothing asked.
  const nothing = await draftChapterText(job(project, second, "opener", async () => { asked++; return { text: GOOD, truncated: false }; }));
  assert.equal(nothing.made, false);
  assert.equal(asked, 0);
  assert.equal(project.drafts.length, 0);
});
