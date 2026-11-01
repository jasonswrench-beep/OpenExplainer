import test from "node:test";
import assert from "node:assert/strict";
import { addNode, createProject, ensurePage } from "../src/project/model.ts";
import { addBlock, makeBlock, type ParagraphBlock } from "../src/project/page.ts";
import { wordsSayNumber } from "../src/project/links.ts";
import { renderPrintPreview } from "../src/render/print.ts";
import { buildDocxParts } from "../src/export/docx.ts";
import { bookMarkdown } from "../src/export/markdown.ts";

test("linked words that already say the topic's number are not followed by it again, and the number must stand alone", () => {
  for (const [words, number, expected] of [
    ["Chapter 4", "4", true], ["topic 6.1", "6.1", true], ["6.1", "6.1", true], ["see topic 6.1.", "6.1", true], ["(6.1)", "6.1", true], ["Chapter 14", "14", true],
    ["Chapter 14", "4", false], ["topic 16.1", "6.1", false], ["topic 6.12", "6.1", false], ["topic 6.1.2", "6.1", false], ["Saving a copy", "1.2", false], ["Chapter 4", "4.1", false],
  ] as const) assert.equal(wordsSayNumber(words, number), expected, `${words} / ${number}`);
});

function book() {
  const project = createProject("Numbers");
  const one = addNode(project.tree, null, "One");
  const two = addNode(project.tree, null, "Two");
  const saving = addNode(project.tree, two.id, "Saving");
  const block = makeBlock("paragraph") as ParagraphBlock;
  block.text = [{ text: "Read " }, { text: "Chapter 2", mark: "link", topic: two.id }, { text: " or " }, { text: "topic 2.1", mark: "link", topic: saving.id }, { text: " or " }, { text: "Saving a copy", mark: "link", topic: saving.id }, { text: "." }];
  addBlock(ensurePage(one), block);
  return project;
}

test("print, Word and Markdown leave out a number the words already say, and still add one after other words", () => {
  const project = book();
  const html = renderPrintPreview({ project, place: "book", notes: false, imageSrc: () => null }).html;
  assert.match(html, /<a class="topic-link" [^>]*>Chapter 2<\/a> or /, "no number after Chapter 2");
  assert.match(html, /<a class="topic-link" [^>]*>topic 2\.1<\/a> or /);
  assert.match(html, /<a class="topic-link" [^>]*>Saving a copy<\/a><span class="pv-ref"> \(2\.1\)<\/span>\./, "a number is still added after other words");
  // With pages (a PDF laid out once) the page is still said.
  const withPages = renderPrintPreview({ project, place: "book", notes: false, imageSrc: () => null }, { pages: new Map<string, string>([[project.tree[1].id, "7"], [project.tree[1].children[0].id, "8"]]) }).html;
  assert.match(withPages, />Chapter 2<\/a><span class="pv-ref">, page 7<\/span>/);
  assert.match(withPages, />Saving a copy<\/a><span class="pv-ref"> \(2\.1\), page 8<\/span>/);
  const doc = new TextDecoder().decode(buildDocxParts(project, new Map())["word/document.xml"]);
  assert.equal(doc.includes("Chapter 2</w:t></w:r></w:hyperlink><w:r><w:t xml:space=\"preserve\"> (2)"), false, "Word: no (2) after Chapter 2");
  assert.ok(doc.includes("Saving a copy</w:t></w:r></w:hyperlink><w:r><w:t xml:space=\"preserve\"> (2.1)</w:t></w:r>"), "Word: (2.1) after other words");
  const md = bookMarkdown(project, new Map());
  assert.match(md, /Read Chapter 2 or topic 2\.1 or Saving a copy \(2\.1\)\./);
});
