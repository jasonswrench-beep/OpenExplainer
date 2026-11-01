import test from "node:test";
import assert from "node:assert/strict";
import { addNode, createProject, ensurePage, findNode, type Project } from "../src/project/model.ts";
import { addBlock, makeBlock, type ParagraphBlock } from "../src/project/page.ts";
import { parseMarks } from "../src/project/text.ts";
import { checkProject, kindInfo, splitIssues, ignoreIssue, emptyCheckSettings } from "../src/project/checks.ts";
import { duplicateTexts, duplicateTitles, isVagueLinkText, MIN_COPY_WORDS, pageWords, vagueLinksOf } from "../src/project/book-checks.ts";

function write(project: Project, id: string, words: string | ParagraphBlock["text"]): void {
  const block = makeBlock("paragraph") as ParagraphBlock;
  block.text = typeof words === "string" ? parseMarks(words) : words;
  addBlock(ensurePage(findNode(project.tree, id)!), block);
}

const SAME = "To keep your work, open the File menu and choose Save, then give the file a name you will remember.";

test("link words that say nothing about where they go are found, however they are cased or punctuated", () => {
  for (const vague of ["here", "Here", " click   here ", "Click here.", "this link", "Read more", "read more…", "More", "learn more >", "this page", "details", "see this", "Tap here"]) {
    assert.equal(isVagueLinkText(vague), true, vague);
  }
  for (const fine of ["Printing", "the Print dialog", "Saving a copy", "see Printing", "Learn more about printing", "here are the details", "Heredity", ""]) {
    assert.equal(isVagueLinkText(fine), false, fine);
  }
});

test("topics with the same title are grouped only when they share a parent, and variables and capitals do not hide a match", () => {
  const project = createProject("Dupes");
  project.variables.PRODUCT = "Acme";
  const one = addNode(project.tree, null, "Setup");
  const a1 = addNode(project.tree, one.id, "Overview");
  const a2 = addNode(project.tree, one.id, "  overview ");
  const a3 = addNode(project.tree, one.id, "Install {{PRODUCT}}");
  const a4 = addNode(project.tree, one.id, "Install Acme");
  const two = addNode(project.tree, null, "Using it");
  addNode(project.tree, two.id, "Overview");
  const top = addNode(project.tree, null, "setup");
  addNode(project.tree, null, "");
  addNode(project.tree, null, "   ");
  const groups = duplicateTitles(project.tree, project.variables);
  assert.deepEqual(groups, [[one.id, top.id], [a1.id, a2.id], [a3.id, a4.id]], "an Overview in another chapter is not a copy, empty titles are not matched with each other");
});

test("topics whose pages say the same words are grouped, short ones are not, and variables are filled in", () => {
  const project = createProject("Copies");
  project.variables.PRODUCT = "Acme";
  const a = addNode(project.tree, null, "A");
  const b = addNode(project.tree, a.id, "B");
  const c = addNode(project.tree, null, "C");
  const d = addNode(project.tree, null, "D");
  write(project, a.id, SAME);
  write(project, b.id, `  ${SAME.toUpperCase()}  `);
  write(project, c.id, "Press **Save** now.");
  write(project, d.id, "Press Save now.");
  assert.deepEqual(duplicateTexts(project.tree, project.variables), [[a.id, b.id]], `a page of fewer than ${MIN_COPY_WORDS} words is not a copy`);
  const e = addNode(project.tree, null, "E");
  const f = addNode(project.tree, null, "F");
  write(project, e.id, "{{PRODUCT}} keeps your work safe when you choose Save from the File menu.");
  write(project, f.id, "Acme keeps your work safe when you choose Save from the File menu.");
  assert.deepEqual(duplicateTexts(project.tree, project.variables), [[a.id, b.id], [e.id, f.id]], "a variable and its value are the same words");
  assert.equal(pageWords(findNode(project.tree, e.id)!, project.variables), "acme keeps your work safe when you choose save from the file menu.");
});

test("the book check says, in words, which topics share a title or their words, which links are vague, and which topic has no title, and each can be ignored", () => {
  const project = createProject("Check");
  const chapter = addNode(project.tree, null, "Getting started");
  const first = addNode(project.tree, chapter.id, "Saving");
  const second = addNode(project.tree, chapter.id, "saving");
  const target = addNode(project.tree, chapter.id, "Printing");
  const blank = addNode(project.tree, chapter.id, "");
  write(project, first.id, SAME);
  write(project, second.id, SAME);
  write(project, target.id, [{ text: "To print, " }, { text: "click here", mark: "link", topic: first.id }, { text: " or " }, { text: "Here", mark: "link", topic: first.id }, { text: " or " }, { text: "Saving a copy", mark: "link", topic: first.id }, { text: " for more about saving a document that you made." }]);
  write(project, blank.id, "Something to say.");
  const issues = checkProject(project);
  const of = (kind: string) => issues.filter((i) => i.kind === kind);
  assert.deepEqual(of("duplicate-title").map((i) => [i.where, i.words, i.fix]), [["1.1 Saving", '2 topics in the same place are called "Saving": 1.1 Saving and 1.2 saving. Readers and search results cannot tell them apart.', "Give them different titles, or join them into one topic."]]);
  assert.deepEqual(of("duplicate-text").map((i) => [i.where, i.words]), [["1.1 Saving", "1.1 Saving and 1.2 saving say exactly the same words. If one changes, the other will be out of date."]]);
  assert.deepEqual(of("vague-link").map((i) => [i.where, i.words]), [
    ["1.3 Printing", 'The link "click here" in "1.3 Printing" does not say where it goes. A screen reader user who reads the links on their own hears only "click here".'],
    ["1.3 Printing", 'The link "Here" in "1.3 Printing" does not say where it goes. A screen reader user who reads the links on their own hears only "Here".'],
  ]);
  assert.deepEqual(of("blank-title").map((i) => [i.nodeId, i.words]), [[blank.id, "The topic 1.4 has no title, so the contents, the headings and the links to it have nothing to show."]]);
  assert.deepEqual([kindInfo("blank-title"), kindInfo("duplicate-title"), kindInfo("duplicate-text"), kindInfo("vague-link")].map((k) => [k.group, k.severity]), [["book", "problem"], ["book", "note"], ["book", "note"], ["accessibility", "note"]]);
  // Ignoring one keeps it out of the way, and the key stays the same while the thing stays the same.
  const key = of("duplicate-text")[0].key;
  assert.equal(checkProject(project).find((i) => i.kind === "duplicate-text")!.key, key);
  const split = splitIssues(checkProject(project), ignoreIssue(emptyCheckSettings(), key));
  assert.equal(split.ignored.length, 1);
  assert.equal(split.active.some((i) => i.kind === "duplicate-text"), false);
  // Fixing it clears it.
  findNode(project.tree, second.id)!.title = "Saving a copy";
  assert.equal(checkProject(project).some((i) => i.kind === "duplicate-title"), false);
  assert.deepEqual(vagueLinksOf(findNode(project.tree, target.id)!), ["click here", "Here"]);
});

test("a book with none of these problems has none of these notes", () => {
  const project = createProject("Clean");
  const a = addNode(project.tree, null, "One");
  const b = addNode(project.tree, null, "Two");
  write(project, a.id, "This page has its own words about saving files.");
  write(project, b.id, "This page has other words about printing them.");
  assert.deepEqual(checkProject(project).filter((i) => ["blank-title", "duplicate-title", "duplicate-text", "vague-link"].includes(i.kind)), []);
});
