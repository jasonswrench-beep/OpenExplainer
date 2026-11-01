import test from "node:test";
import assert from "node:assert/strict";
import { addNode, createProject, ensurePage, findNode } from "../src/project/model.ts";
import { addBlock, makeBlock, type CalloutBlock, type ParagraphBlock, type ProcedureBlock } from "../src/project/page.ts";
import { addComment, setResolved } from "../src/project/comments.ts";
import { parseMarks } from "../src/project/text.ts";
import { unzip, zip } from "../src/project/zip.ts";
import { buildDocxParts, bookmarkName, BLOCK_MARK, REVIEW_AUTHOR, TOPIC_MARK } from "../src/export/docx.ts";
import { makeExport } from "../src/export/make.ts";
import { addReviewComments, readReviewComments } from "../src/import/review.ts";
import { importDocx } from "../src/import/docx.ts";
import { parseXml, descendantsNamed } from "../src/import/xml.ts";

const NOW = "2026-11-01T10:00:00.000Z";
const dec = new TextDecoder();
const enc = new TextEncoder();

function book() {
  const project = createProject("Review round");
  const chapter = addNode(project.tree, null, "Getting started");
  const saving = addNode(project.tree, chapter.id, "Saving");
  const empty = addNode(project.tree, chapter.id, "Empty topic");
  const para = makeBlock("paragraph") as ParagraphBlock;
  para.text = parseMarks("Press **Save** to keep your work.");
  const proc = makeBlock("procedure") as ProcedureBlock;
  proc.steps = [{ id: "s1", text: parseMarks("Open the File menu.") }, { id: "s2", text: parseMarks("Choose Save.") }];
  const box = makeBlock("callout", { kind: "caution" }) as CalloutBlock;
  box.text = parseMarks("Save before you close.");
  [para, proc, box].forEach((b) => addBlock(ensurePage(saving), b));
  const page = saving.page!;
  const first = addComment(page, para.id, "Say where the button is.", "2026-10-30T09:15:42.123Z")!;
  addComment(page, proc.id, "Line one\nLine two & <more>", NOW);
  const resolved = addComment(page, box.id, "Old note", NOW)!;
  setResolved(page, resolved.id, true, NOW);
  return { project, chapter, saving, empty, para, proc, box, first };
}

const flat = new Map();

test("a review copy has the author's open comments as real Word comments, and a bookmark that ties each block and heading to the book", () => {
  const { project, saving, para, proc, box } = book();
  const parts = buildDocxParts(project, flat, { now: NOW, review: true });
  const comments = dec.decode(parts["word/comments.xml"]);
  const root = parseXml(comments);
  const list = root.children.filter((c) => c.name === "w:comment");
  assert.equal(list.length, 2, "only the open comments are sent");
  assert.deepEqual(list.map((c) => [c.attrs["w:id"], c.attrs["w:author"], c.attrs["w:date"]]), [["0", REVIEW_AUTHOR, "2026-10-30T09:15:42Z"], ["1", REVIEW_AUTHOR, "2026-11-01T10:00:00Z"]]);
  assert.equal(descendantsNamed(list[1], "w:p").length, 2, "a comment of two lines is two paragraphs");
  assert.match(comments, /Line two &amp; &lt;more&gt;/);
  const document = dec.decode(parts["word/document.xml"]);
  parseXml(document); // well-formed
  assert.equal((document.match(/<w:commentRangeStart /g) ?? []).length, 2);
  assert.equal((document.match(/<w:commentReference /g) ?? []).length, 2);
  for (const id of [para.id, proc.id, box.id]) assert.ok(document.includes(`w:name="${bookmarkName(BLOCK_MARK, id)}"`), "every block is tied to its place");
  assert.ok(document.includes(`w:name="${bookmarkName(TOPIC_MARK, saving.id)}"`), "and every topic's heading");
  assert.match(document, /Review copy made on 2026-11-01\./);
  assert.match(dec.decode(parts["[Content_Types].xml"]), /\/word\/comments\.xml/);
  assert.match(dec.decode(parts["word/_rels/document.xml.rels"]), /Target="comments\.xml"/);
  assert.match(dec.decode(parts["word/styles.xml"]), /CommentReference/);
  // The ordinary Word export has none of this.
  const plain = buildDocxParts(project, flat, { now: NOW });
  assert.equal("word/comments.xml" in plain, false);
  assert.equal(dec.decode(plain["word/document.xml"]).includes("oe_b_"), false);
  assert.equal(dec.decode(plain["word/document.xml"]).includes("commentRange"), false);
});

test("the review copy is a kind of export and says when there is nothing to review", async () => {
  const { project } = book();
  const made = await makeExport(project, new Map(), "word-review", { flatten: async () => new Uint8Array(), now: NOW });
  assert.equal(made.extension, "docx");
  assert.deepEqual(made.notes, []);
  const files = await unzip(made.bytes);
  assert.ok(files["word/comments.xml"]);
  const bare = createProject("Bare");
  addBlock(ensurePage(addNode(bare.tree, null, "One")), makeBlock("paragraph"));
  const none = await makeExport(bare, new Map(), "word-review", { flatten: async () => new Uint8Array(), now: NOW });
  assert.match(none.notes[0], /no open comments/);
});

/** What a reviewer does in Word: adds comments next to some text, and a comment that sits before any of the book's text. */
function reviewed(parts: Record<string, Uint8Array>, targets: { mark: string; author: string; words: string }[], extra: { author: string; words: string; before?: boolean }[] = []): Uint8Array {
  let document = dec.decode(parts["word/document.xml"]);
  let comments = dec.decode(parts["word/comments.xml"]);
  let id = 50;
  const add = (author: string, words: string, id: number) => {
    comments = comments.replace("</w:comments>", `<w:comment w:id="${id}" w:author="${author}" w:date="2026-11-02T08:30:00Z"><w:p><w:r><w:t>${words}</w:t></w:r></w:p></w:comment></w:comments>`);
  };
  for (const t of targets) {
    const at = document.indexOf(`w:name="${t.mark}"`);
    assert.ok(at > 0, `the review copy has ${t.mark}`);
    const end = document.indexOf("/>", at) + 2;
    document = document.slice(0, end) + `<w:commentRangeStart w:id="${id}"/><w:commentRangeEnd w:id="${id}"/><w:r><w:commentReference w:id="${id}"/></w:r>` + document.slice(end);
    add(t.author, t.words, id++);
  }
  for (const e of extra) {
    if (e.before) document = document.replace("<w:body>", `<w:body><w:p><w:commentRangeStart w:id="${id}"/><w:r><w:t>Stray</w:t></w:r><w:commentRangeEnd w:id="${id}"/></w:p>`);
    add(e.author, e.words, id++);
  }
  return zip({ ...parts, "word/document.xml": enc.encode(document), "word/comments.xml": enc.encode(comments) });
}

test("comments made in Word come back to the block they were made on, with the reviewer's name, and nothing is added twice", async () => {
  const { project, saving, empty, para, proc } = book();
  const parts = buildDocxParts(project, flat, { now: NOW, review: true });
  const returned = reviewed(parts, [
    { mark: bookmarkName(BLOCK_MARK, para.id), author: "Pat Reviewer", words: "Which Save? There are two." },
    { mark: bookmarkName(BLOCK_MARK, proc.id), author: "Sam", words: "Add the shortcut." },
    { mark: bookmarkName(TOPIC_MARK, saving.id), author: "Pat Reviewer", words: "Good chapter overall." },
    { mark: bookmarkName(TOPIC_MARK, empty.id), author: "Sam", words: "This topic has nothing yet." },
    { mark: bookmarkName(BLOCK_MARK, para.id), author: REVIEW_AUTHOR, words: "My own comment, sent back." },
  ], [{ author: "Lee", words: "Floating note", before: true }, { author: "Kim", words: "   " }]);
  const read = await readReviewComments(returned, project);
  assert.deepEqual(read.comments.map((c) => [c.author, c.blockId === para.id ? "para" : c.blockId === proc.id ? "proc" : "?", c.text]), [
    ["Pat Reviewer", "para", "Which Save? There are two."],
    ["Sam", "proc", "Add the shortcut."],
    ["Pat Reviewer", "para", "Good chapter overall."],
  ]);
  assert.equal(read.comments[2].blockId, saving.page!.blocks[0].id, "a comment on a heading goes to the topic's first block");
  assert.deepEqual(read.report, [
    "The file has 9 comments: 3 from reviewers can be brought in.",
    "3 were written by the author in the review copy and are already in the book.",
    "1 had no words and was left out.",
    "2 could not be placed, because the text they were made on is not in this book (the file may be a copy of another book, or the text has been taken out). They were not brought in.",
  ], "the author's own, the empty one, and two that have no place (a topic with no page, and one before any of the book's text) are all counted");
  const before = JSON.stringify(project.tree[0].children.map((c) => c.page?.blocks));
  const done = addReviewComments(project, read.comments, NOW);
  assert.deepEqual(done, { added: 3, already: 0 });
  const page = findNode(project.tree, saving.id)!.page!;
  const onPara = page.comments!.filter((c) => c.blockId === para.id).map((c) => [c.text, c.resolved, c.createdAt]);
  assert.deepEqual(onPara, [["Say where the button is.", false, "2026-10-30T09:15:42.123Z"], ["Pat Reviewer: Which Save? There are two.", false, "2026-11-02T08:30:00.000Z"], ["Pat Reviewer: Good chapter overall.", false, "2026-11-02T08:30:00.000Z"]]);
  assert.equal(JSON.stringify(project.tree[0].children.map((c) => c.page?.blocks)), before, "no words of the book changed");
  assert.deepEqual(addReviewComments(project, read.comments, NOW), { added: 0, already: 3 }, "bringing the same file in again adds nothing");
});

test("a file with no comments, a file that is not a Word file, and a very long comment", async () => {
  const { project, para } = book();
  const parts = buildDocxParts(project, flat, { now: NOW });
  assert.deepEqual((await readReviewComments(zip(parts), project)).report, ["The file has no comments, so there was nothing to bring in."]);
  await assert.rejects(readReviewComments(enc.encode("nope"), project), /This is not a Word file/);
  await assert.rejects(readReviewComments(zip({ "a.txt": enc.encode("x") }), project), /it has no word\/document\.xml/);
  const review = buildDocxParts(project, flat, { now: NOW, review: true });
  const long = "x".repeat(1500);
  const returned = reviewed(review, [{ mark: bookmarkName(BLOCK_MARK, para.id), author: "Pat", words: long }]);
  const read = await readReviewComments(returned, project);
  addReviewComments(project, read.comments, NOW);
  const added = project.tree[0].children[0].page!.comments!.at(-1)!;
  assert.equal(added.text.length, 1000);
  assert.ok(added.text.endsWith("…") && added.text.startsWith("Pat: xxx"));
});

test("a review copy read as an ordinary Word file still comes in as chapters and topics, comments left out", async () => {
  const { project } = book();
  const imported = await importDocx(zip(buildDocxParts(project, flat, { now: NOW, review: true })));
  assert.deepEqual(imported.chapters.map((c) => [c.title, c.children.map((t) => t.title)]), [["Getting started", ["Saving"]]]);
  assert.ok(imported.report.some((l) => /2 comments in the file were not brought in\./.test(l)));
});
