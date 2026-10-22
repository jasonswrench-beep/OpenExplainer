import test from "node:test";
import assert from "node:assert/strict";
import { CURRENT_VERSION, addNode, createProject, ensurePage, type Project } from "../src/project/model.ts";
import { DRAFTS_FILE, PROJECT_FILE, STRUCTURE_FILE, fromFiles, toFiles } from "../src/project/files.ts";
import { acceptDraft, addDraft, blockWithEvidence, chapterTextWaiting, cleanDrafts, draftCount, draftRows, rejectDraft, type BoxDraft, type BoxRow, type ChapterTextDraft, type ChapterTextRow } from "../src/project/drafts.ts";
import { MOST_AVOID_WORDS, avoidWordsFromLines, avoidWordsToLines, cleanAvoidWords } from "../src/project/avoid-words.ts";
import { checkProject } from "../src/project/checks.ts";
import { makeBlock, type CalloutBlock, type ParagraphBlock, type ProcedureBlock } from "../src/project/page.ts";
import { buildJsonExport, readJsonExport } from "../src/export/json.ts";
import { migrate } from "../src/project/migrate.ts";

function book(): { project: Project; chapter: string; saving: string; printing: string } {
  const project = createProject("Chapter text");
  const chapter = addNode(project.tree, null, "Working with documents");
  const saving = addNode(project.tree, chapter.id, "Saving your work");
  const printing = addNode(project.tree, chapter.id, "Printing a page");
  const para = makeBlock("paragraph") as ParagraphBlock;
  para.text = [{ text: "Saving over an existing file replaces it, so use Save as to keep both versions." }];
  const proc = makeBlock("procedure") as ProcedureBlock;
  proc.steps = [{ id: "s1", text: [{ text: "Choose " }, { text: "File", mark: "control" }, { text: "." }] }];
  const tail = makeBlock("paragraph") as ParagraphBlock;
  tail.text = [{ text: "Closing the program ends the session." }];
  ensurePage(saving).blocks.push(para, proc, tail);
  return { project, chapter: chapter.id, saving: saving.id, printing: printing.id };
}

const text = (nodeId: string, role: "opener" | "summary", words: string): Omit<ChapterTextDraft, "id"> => ({ kind: "chapter-text", nodeId, role, text: words, clues: ["Chapter: Working with documents"], madeAt: "2026-10-22T09:00:00.000Z", model: "Qwen3.5-4B-Q4_K_M.gguf" });
const box = (nodeId: string, evidence: string, words = "Use Save as to keep both versions.", boxKind: BoxDraft["boxKind"] = "design-tip"): Omit<BoxDraft, "id"> => ({ kind: "box", nodeId, boxKind, text: words, evidence, clues: [], madeAt: "2026-10-22T09:00:00.000Z", model: "Qwen3.5-4B-Q4_K_M.gguf" });

test("an opener or summary draft is kept for a page that is there, one for each role, with words, cut to length", () => {
  const { project, chapter, saving } = book();
  assert.equal(CURRENT_VERSION, 16);
  const a = addDraft(project, text(chapter, "opener", "After this chapter you can save and print."));
  const b = addDraft(project, text(chapter, "opener", "A newer opener."));
  assert.ok(a && b && a.id !== b.id);
  assert.equal(project.drafts.length, 1, "one opener for a chapter");
  assert.ok(addDraft(project, text(saving, "summary", "A summary.")), "a summary is separate from an opener");
  assert.equal(project.drafts.length, 2);
  assert.equal(addDraft(project, text("nope", "opener", "x y z")), null);
  assert.equal(addDraft(project, text(chapter, "opener", "   ")), null);
  assert.equal(addDraft(project, { ...text(chapter, "opener", "x"), role: "poem" as never }), null);
  const long = addDraft(project, text(chapter, "summary", "word ".repeat(600))) as ChapterTextDraft;
  assert.equal(long.text.length, 1200);
  assert.equal(chapterTextWaiting(project, chapter, "opener"), true);
  assert.equal(chapterTextWaiting(project, saving, "opener"), false);
});

test("a suggested box is kept with the sentence it rests on, several for a topic, the newest for one sentence, and only for a real kind of box", () => {
  const { project, saving } = book();
  const evidence = "Saving over an existing file replaces it, so use Save as to keep both versions.";
  const first = addDraft(project, box(saving, evidence, "First.", "design-tip"))!;
  const second = addDraft(project, box(saving, evidence, "Second.", "caution"))!;
  assert.notEqual(first.id, second.id);
  assert.equal(project.drafts.length, 1, "a newer box for the same sentence replaces the older one");
  addDraft(project, box(saving, "Closing the program ends the session.", "Close it when done.", "power-tip"));
  assert.equal(project.drafts.length, 2, "another sentence gets its own box");
  assert.equal(addDraft(project, { ...box(saving, evidence), boxKind: "sparkle" as never }), null);
  assert.equal(addDraft(project, box(saving, "")), null);
  assert.equal(addDraft(project, box(saving, evidence, "")), null);
  assert.equal(addDraft(project, box("nope", evidence)), null);
});

test("opening a project cleans these drafts like the others", () => {
  const { project, chapter, saving } = book();
  const raw = [
    { id: "t1", ...text(chapter, "opener", "Keeps this."), junk: 1 },
    { id: "t1", ...text(chapter, "summary", "Same id, new id.") },
    { id: "b1", ...box(saving, "Closing the program ends the session.") },
    { id: "b2", ...box("no-topic", "x") },
    { id: "t3", kind: "chapter-text", nodeId: chapter, role: "opener" },
    { id: "b4", kind: "box", nodeId: saving, boxKind: "design-tip", text: "x" },
    { kind: "mystery", nodeId: chapter },
    7,
  ];
  const kept = cleanDrafts(raw, project.tree);
  assert.deepEqual(kept.map((d) => d.kind).sort(), ["box", "chapter-text", "chapter-text"]);
  assert.equal(new Set(kept.map((d) => d.id)).size, 3);
});

test("the list shows them in the order of the book, with an opener first and a summary after the boxes", () => {
  const { project, chapter, saving, printing } = book();
  addDraft(project, text(saving, "summary", "A summary."));
  addDraft(project, box(saving, "Closing the program ends the session.", "Close it."));
  addDraft(project, text(chapter, "opener", "An opener."));
  addDraft(project, text(printing, "summary", "Another."));
  const rows = draftRows(project);
  assert.deepEqual(rows.map((r) => `${r.where} | ${r.draft.kind}${"role" in r.draft ? ":" + r.draft.role : ""}`), [
    "1 Working with documents | chapter-text:opener",
    "1.1 Saving your work | box",
    "1.1 Saving your work | chapter-text:summary",
    "1.2 Printing a page | chapter-text:summary",
  ]);
  const boxRow = rows[1] as BoxRow;
  assert.deepEqual([boxRow.evidenceFound, boxRow.blocksNow], [true, 3]);
  assert.equal((rows[0] as ChapterTextRow).blocksNow, 0);
  assert.equal(draftCount(project), 4);
  // A sentence the topic no longer says is noticed.
  project.tree[0].children[0].page!.blocks.pop();
  assert.equal((draftRows(project)[1] as BoxRow).evidenceFound, false);
});

test("accepting an opener puts it first on the chapter's page, and a summary last on its topic's page, as paragraphs", () => {
  const { project, chapter, saving } = book();
  const chapterPage = ensurePage(project.tree[0]);
  chapterPage.blocks.push(makeBlock("paragraph"));
  const opener = addDraft(project, text(chapter, "opener", "After this chapter you can **save** work."))!;
  const done = acceptDraft(project, opener.id, ["  After this chapter, you can   save work and print.  "]);
  assert.deepEqual(done, { ok: true, where: "1 Working with documents", words: "Added the opener to the top of the page of 1 Working with documents." });
  assert.equal(chapterPage.blocks.length, 2);
  const first = chapterPage.blocks[0] as ParagraphBlock;
  assert.equal(first.type, "paragraph");
  assert.deepEqual(first.text, [{ text: "After this chapter, you can save work and print." }]);
  const summary = addDraft(project, text(saving, "summary", "You can save, print and close."))!;
  const before = project.tree[0].children[0].page!.blocks.length;
  assert.equal(acceptDraft(project, summary.id).ok, true);
  const blocks = project.tree[0].children[0].page!.blocks;
  assert.equal(blocks.length, before + 1);
  assert.equal(blocks[blocks.length - 1].type, "paragraph");
  assert.equal(project.drafts.length, 0);
  const empty = addDraft(project, text(chapter, "opener", "Something."))!;
  assert.match((acceptDraft(project, empty.id, ["   "]) as { words: string }).words, /opener needs some words/);
  assert.equal(project.drafts.length, 1);
});

test("accepting a box adds it right after the block that holds the sentence it rests on, as the kind the author chose, or at the end if the sentence has gone", () => {
  const { project, saving } = book();
  const topic = project.tree[0].children[0];
  const d = addDraft(project, box(saving, "Choose File.", "Starts at the File menu.", "design-tip"))!;
  assert.equal(blockWithEvidence(topic.page!.blocks, "Choose File."), 1, "found inside a step of the numbered procedure");
  const done = acceptDraft(project, d.id, ["Opens the menu."], { boxKind: "caution" });
  assert.deepEqual(done, { ok: true, where: "1.1 Saving your work", words: "Added a Caution box to the page of 1.1 Saving your work, right after the text it rests on." });
  const blocks = topic.page!.blocks;
  assert.deepEqual(blocks.map((b) => b.type), ["paragraph", "procedure", "callout", "paragraph"]);
  const added = blocks[2] as CalloutBlock;
  assert.deepEqual([added.kind, added.text], ["caution", [{ text: "Opens the menu." }]]);
  // Without a choice the model's guess is used; a sentence that has gone puts the box at the end.
  const lost = addDraft(project, box(saving, "A sentence that is no longer here.", "Something.", "time-saver"))!;
  assert.equal((acceptDraft(project, lost.id) as { words: string }).words, "Added a Time Saver box to the page of 1.1 Saving your work.");
  assert.equal(topic.page!.blocks.at(-1)!.type, "callout");
  assert.equal(((topic.page!.blocks.at(-1)) as CalloutBlock).kind, "time-saver");
  // Whitespace in the page does not hide the sentence.
  assert.equal(blockWithEvidence([{ id: "x", type: "paragraph", text: [{ text: "One   two\nthree." }] }], "One two three."), 0);
  assert.equal(blockWithEvidence([], "x"), -1);
  assert.equal(blockWithEvidence([], "  "), -1);
});

test("rejecting leaves the page alone, and a topic that has gone drops the draft", () => {
  const { project, chapter, saving } = book();
  const before = JSON.stringify(project.tree);
  const a = addDraft(project, text(chapter, "opener", "An opener."))!;
  assert.equal(rejectDraft(project, a.id), true);
  assert.equal(JSON.stringify(project.tree), before);
  const b = addDraft(project, box(saving, "Closing the program ends the session."))!;
  project.tree = [];
  assert.deepEqual(acceptDraft(project, b.id), { ok: false, words: "The topic this draft was for is gone, so the draft was dropped." });
  assert.equal(project.drafts.length, 0);
});

test("the list of words to avoid is tidied, limited and written as lines the author can edit", () => {
  const raw = [{ avoid: "  file ", use: "document" }, { avoid: "FILE", use: "again" }, { avoid: "", use: "x" }, { avoid: "click on", use: "" }, { avoid: "[[x]]", use: "y" }, 7, null, { avoid: "x".repeat(200), use: "y".repeat(200) }];
  const clean = cleanAvoidWords(raw);
  assert.deepEqual(clean.map((w) => w.avoid), ["file", "click on", "x".repeat(60)]);
  assert.equal(clean[2].use.length, 60);
  assert.equal(cleanAvoidWords(Array.from({ length: 150 }, (_, i) => ({ avoid: `word${i}`, use: "" }))).length, MOST_AVOID_WORDS);
  assert.deepEqual(cleanAvoidWords("nope"), []);
  assert.equal(avoidWordsToLines([{ avoid: "file", use: "document" }, { avoid: "click on", use: "" }]), "file => document\nclick on");
  assert.deepEqual(avoidWordsFromLines("file => document\n\n click on \n => nothing\nFile => again"), [{ avoid: "file", use: "document" }, { avoid: "click on", use: "" }]);
});

test("format 16: the new drafts and the word list are saved and come back, and a project saved as 15 opens", () => {
  const { project, chapter, saving } = book();
  addDraft(project, text(chapter, "opener", "An opener."));
  addDraft(project, box(saving, "Closing the program ends the session."));
  project.avoidWords = [{ avoid: "file", use: "document" }];
  let files = toFiles(project);
  assert.equal(JSON.parse(files[DRAFTS_FILE]).version, 16);
  assert.deepEqual(JSON.parse(files[PROJECT_FILE]).avoidWords, [{ avoid: "file", use: "document" }]);
  assert.ok(!files[STRUCTURE_FILE].includes("An opener."));
  const back = fromFiles(files);
  assert.deepEqual(back.drafts, project.drafts);
  assert.deepEqual(back.avoidWords, project.avoidWords);
  assert.equal(Object.keys(back).join(), Object.keys(project).join(), "the same parts in the same order");
  // Nothing set: nothing written.
  project.avoidWords = [];
  project.drafts = [];
  files = toFiles(project);
  assert.ok(!("avoidWords" in JSON.parse(files[PROJECT_FILE])) && !(DRAFTS_FILE in files));
  // Saved by the program before this one.
  const as15: Record<string, string> = {};
  for (const [name, t] of Object.entries(files)) as15[name] = JSON.stringify({ ...JSON.parse(t), version: 15 });
  const opened = fromFiles(as15);
  assert.equal(opened.version, 16);
  assert.deepEqual(opened.avoidWords, []);
  assert.equal(opened.tree[0].children[0].page!.blocks.length, 3, "its pages come with it");
  assert.deepEqual(migrate({ version: 15, name: "M", template: "empty", variables: {}, avoidWords: 5, tree: [] }).avoidWords, []);
});

test("these drafts are in no export, the word list is, and the book check notes each waiting draft", () => {
  const { project, chapter, saving } = book();
  addDraft(project, text(chapter, "opener", "A private opener."));
  addDraft(project, box(saving, "Closing the program ends the session.", "A private box."));
  project.avoidWords = [{ avoid: "file", use: "document" }];
  const { files } = buildJsonExport(project, new Map());
  const out = new TextDecoder().decode(files["book.json"]);
  assert.ok(!out.includes("A private opener.") && !out.includes("A private box.") && !/"drafts"/.test(out));
  assert.ok(out.includes('"avoidWords"'));
  assert.deepEqual(readJsonExport(files).project.avoidWords, [{ avoid: "file", use: "document" }]);
  const notes = checkProject(project).filter((i) => i.kind === "ai-draft").map((i) => i.words);
  assert.equal(notes.length, 2);
  assert.ok(notes.some((w) => /A draft of an opener is waiting for "1 Working with documents"/.test(w)));
  assert.ok(notes.some((w) => /A suggested box is waiting for "1\.1 Saving your work"/.test(w)));
});
