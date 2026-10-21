import test from "node:test";
import assert from "node:assert/strict";
import {
  addComment, checkCommentText, cleanComments, commentsOn, commentTotals, commentsWords, deleteComment, editComment, MOST_COMMENT, openCount, pruneComments,
  replaceBlockComments, setResolved,
} from "../src/project/comments.ts";
import { blockWords, itemWords, unresolvedCount, unresolvedIn } from "../src/project/comment-list.ts";
import { addBlock, cleanPage, forgetPicture, makeBlock, removeBlock, type Page } from "../src/project/page.ts";
import { addNode, addPicture, createProject, CURRENT_VERSION, ensurePage } from "../src/project/model.ts";
import { fromFiles, toFiles } from "../src/project/files.ts";
import { migrate } from "../src/project/migrate.ts";

const NOW = "2026-10-21T10:00:00.000Z";
const LATER = "2026-10-21T11:30:00.000Z";

function pageWith(...types: ("paragraph" | "heading" | "picture")[]): Page {
  const page: Page = { blocks: [] };
  for (const type of types) addBlock(page, makeBlock(type, type === "picture" ? { pictureId: "p1" } : {}));
  return page;
}

test("a comment is added to a block, with its words tidied, and starts open", () => {
  const page = pageWith("paragraph", "heading");
  const c = addComment(page, page.blocks[0].id, "  Check this step.\r\nIs the name right?  ", NOW)!;
  assert.deepEqual({ ...c, id: "x" }, { id: "x", blockId: page.blocks[0].id, text: "Check this step.\nIs the name right?", resolved: false, createdAt: NOW });
  assert.equal(page.comments!.length, 1);
  assert.equal(openCount(page), 1);
});

test("an empty comment, a comment that is too long, and a comment on a block that is not there are refused", () => {
  const page = pageWith("paragraph");
  assert.equal(addComment(page, page.blocks[0].id, "   \n ", NOW), null);
  assert.equal(addComment(page, page.blocks[0].id, "x".repeat(MOST_COMMENT + 1), NOW), null);
  assert.equal(addComment(page, "no-such-block", "Hello", NOW), null);
  assert.equal(page.comments, undefined, "nothing was added");
  const empty = checkCommentText("  ");
  assert.ok(!empty.ok && /Write something in the comment first/.test(empty.message));
  const long = checkCommentText("x".repeat(MOST_COMMENT + 5));
  assert.ok(!long.ok && new RegExp(`at most ${MOST_COMMENT} letters\\. This one has ${MOST_COMMENT + 5}\\.`).test(long.message));
  assert.ok(checkCommentText("x".repeat(MOST_COMMENT)).ok, "exactly the most is fine");
});

test("a comment is edited, resolved, opened again and deleted", () => {
  const page = pageWith("paragraph");
  const c = addComment(page, page.blocks[0].id, "First words", NOW)!;
  assert.ok(editComment(page, c.id, "Better words"));
  assert.equal(page.comments![0].text, "Better words");
  assert.equal(editComment(page, c.id, "  "), false, "an empty edit is refused");
  assert.equal(page.comments![0].text, "Better words", "and changes nothing");
  assert.equal(editComment(page, "nope", "x"), false);
  assert.ok(setResolved(page, c.id, true, LATER));
  assert.deepEqual([page.comments![0].resolved, page.comments![0].resolvedAt], [true, LATER]);
  assert.equal(openCount(page), 0);
  assert.ok(setResolved(page, c.id, false, LATER));
  assert.deepEqual([page.comments![0].resolved, "resolvedAt" in page.comments![0]], [false, false], "opening it again forgets when it was resolved");
  assert.equal(setResolved(page, "nope", true, LATER), false);
  assert.ok(deleteComment(page, c.id));
  assert.equal(page.comments, undefined, "the list goes when the last comment does");
  assert.equal(deleteComment(page, c.id), false);
});

test("a block's comments come open first, then resolved, each in the order written, and are counted in words", () => {
  const page = pageWith("paragraph", "heading");
  const [a, b] = [page.blocks[0].id, page.blocks[1].id];
  const one = addComment(page, a, "one", NOW)!;
  const two = addComment(page, a, "two", NOW)!;
  const three = addComment(page, b, "elsewhere", NOW)!;
  const four = addComment(page, a, "four", NOW)!;
  setResolved(page, one.id, true, LATER);
  assert.deepEqual(commentsOn(page, a).map((c) => c.text), ["two", "four", "one"]);
  assert.deepEqual(commentsOn(page, b).map((c) => c.text), ["elsewhere"]);
  assert.deepEqual(commentsOn(undefined, a), []);
  assert.deepEqual(commentTotals(page, a), { open: 2, resolved: 1 });
  assert.equal(openCount(page), 3);
  assert.equal(openCount(page, b), 1);
  assert.equal(commentsWords(0), "No comments");
  assert.equal(commentsWords(1), "1 open comment");
  assert.equal(commentsWords(3), "3 open comments");
  assert.equal(commentsWords(0, 2), "2 resolved comments");
  assert.equal(commentsWords(2, 1), "2 open comments and 1 resolved");
  assert.ok(two && three && four);
});

test("replacing a block's comments leaves the other blocks' comments alone", () => {
  const page = pageWith("paragraph", "heading");
  const [a, b] = [page.blocks[0].id, page.blocks[1].id];
  addComment(page, a, "on a", NOW);
  const keep = addComment(page, b, "on b", NOW)!;
  const mine = commentsOn(page, a).map((c) => ({ ...c, text: "changed" }));
  replaceBlockComments(page, a, [...mine, { id: "new", blockId: "ignored", text: "added", resolved: false, createdAt: NOW }]);
  assert.deepEqual(commentsOn(page, a).map((c) => c.text), ["changed", "added"]);
  assert.ok(commentsOn(page, a).every((c) => c.blockId === a), "every one is on that block");
  assert.deepEqual(commentsOn(page, b), [keep]);
  replaceBlockComments(page, a, []);
  replaceBlockComments(page, b, []);
  assert.equal(page.comments, undefined);
});

test("deleting a block takes its comments with it, and so does taking its picture off the page", () => {
  const page = pageWith("paragraph", "picture", "heading");
  addComment(page, page.blocks[0].id, "on the paragraph", NOW);
  addComment(page, page.blocks[1].id, "on the picture", NOW);
  addComment(page, page.blocks[2].id, "on the heading", NOW);
  removeBlock(page, page.blocks[0].id);
  assert.deepEqual(page.comments!.map((c) => c.text), ["on the picture", "on the heading"]);
  forgetPicture(page, "p1");
  assert.deepEqual(page.comments!.map((c) => c.text), ["on the heading"]);
  removeBlock(page, page.blocks[0].id);
  assert.equal(page.comments, undefined);
  addComment(page, "gone", "x", NOW);
  pruneComments(page);
  assert.equal(page.comments, undefined);
});

test("comments read from a file keep only what belongs: on a block that is there, with words, and with their own ids", () => {
  const ids = new Set(["b1", "b2"]);
  const clean = cleanComments([
    { id: "c1", blockId: "b1", text: "  Keep me  ", resolved: true, createdAt: NOW, resolvedAt: LATER },
    { id: "c1", blockId: "b2", text: "Same id", resolved: "yes", createdAt: 5 },
    { id: "c3", blockId: "gone", text: "Block is gone" },
    { id: "c4", blockId: "b1", text: "   " },
    { id: "c5", blockId: "b1", text: "x".repeat(MOST_COMMENT + 50) },
    "junk", null, 7,
  ], ids);
  assert.equal(clean.length, 3);
  assert.deepEqual(clean[0], { id: "c1", blockId: "b1", text: "Keep me", resolved: true, createdAt: NOW, resolvedAt: LATER });
  assert.notEqual(clean[1].id, "c1", "a repeated id gets a new one");
  assert.deepEqual([clean[1].resolved, clean[1].createdAt, "resolvedAt" in clean[1]], [false, "", false], "resolved only when it is true");
  assert.equal(clean[2].text.length, MOST_COMMENT, "cut to the most");
  assert.deepEqual(cleanComments("nope", ids), []);
  assert.deepEqual(cleanComments(undefined, ids), []);
});

test("a page keeps its comments through cleaning, and drops those on blocks that are not on it", () => {
  const raw = {
    blocks: [{ id: "b1", type: "paragraph", text: [{ text: "Hello" }] }, { id: "b2", type: "heading", text: "Title" }],
    comments: [{ id: "c1", blockId: "b2", text: "Fix", resolved: false, createdAt: NOW }, { id: "c2", blockId: "b9", text: "Lost", resolved: false, createdAt: NOW }],
  };
  const page = cleanPage(raw);
  assert.deepEqual(page.comments!.map((c) => c.id), ["c1"]);
  assert.equal("comments" in cleanPage({ blocks: raw.blocks }), false, "no comments, no list");
});

function projectWithComments() {
  const p = createProject("Book");
  const chapter = addNode(p.tree, null, "Getting started");
  const topic = addNode(p.tree, chapter.id, "Saving");
  const other = addNode(p.tree, null, "Printing");
  addPicture(p.tree, topic.id, { id: "p1", file: "images/p1.png", width: 10, height: 10, altText: "", source: { kind: "import", capturedAt: "t" } });
  const page = ensurePage(topic);
  addBlock(page, makeBlock("heading"));
  (page.blocks[0] as { text: string }).text = "Save your work";
  addBlock(page, makeBlock("paragraph"));
  (page.blocks[1] as { text: { text: string }[] }).text = [{ text: "Press " }, { text: "Save", mark: "control" }, { text: " to keep your work safe on the disk and keep going." }] as never;
  const second = ensurePage(other);
  addBlock(second, makeBlock("procedure"));
  return { p, chapter, topic, other, page, second };
}

test("the unresolved list covers the whole book in reading order and leaves out the resolved ones", () => {
  const { p, topic, other, page, second } = projectWithComments();
  const late = addComment(second, second.blocks[0].id, "Steps are out of order", NOW)!;
  const a = addComment(page, page.blocks[1].id, "Is the name right?", NOW)!;
  const b = addComment(page, page.blocks[0].id, "Shorter?", NOW)!;
  const gone = addComment(page, page.blocks[0].id, "Done already", NOW)!;
  setResolved(page, gone.id, true, LATER);
  const list = unresolvedIn(p.tree);
  assert.deepEqual(list.map((i) => i.comment.text), ["Shorter?", "Is the name right?", "Steps are out of order"], "by topic number, then block position, then when written");
  assert.deepEqual(list.map((i) => [i.number, i.nodeTitle, i.blockPosition]), [["1.1", "Saving", 1], ["1.1", "Saving", 2], ["2", "Printing", 1]]);
  assert.equal(unresolvedCount(p.tree), 3);
  assert.equal(list[0].nodeId, topic.id);
  assert.equal(list[2].nodeId, other.id);
  assert.ok(a && b && late);
  setResolved(page, a.id, true, LATER);
  assert.equal(unresolvedCount(p.tree), 2);
});

test("a block is described in a few words, with a shortened excerpt of what it says", () => {
  const { page, second } = projectWithComments();
  assert.equal(blockWords(page.blocks[0]), "Heading: Save your work");
  assert.equal(blockWords(page.blocks[1]), "Paragraph: Press Save to keep your work safe on the disk and keep...");
  assert.equal(blockWords(second.blocks[0]), "Numbered procedure of 1 step");
  assert.equal(blockWords(makeBlock("picture")), "Picture");
  assert.equal(blockWords(makeBlock("callout", { kind: "caution" })), "Callout box (Caution)");
  const { p } = projectWithComments();
  const item = (() => { const t = p.tree[0].children[0]; const pg = t.page!; addComment(pg, pg.blocks[0].id, "Shorter?", NOW); return unresolvedIn(p.tree)[0]; })();
  assert.equal(itemWords(item), "1.1 Saving, block 1 (Heading: Save your work): Shorter?");
});

test("comments are saved with their topic's page and come back, and a page with no comments has none in its file", () => {
  const { p, topic, other, page } = projectWithComments();
  const c = addComment(page, page.blocks[1].id, "Is the name right?", NOW)!;
  setResolved(page, addComment(page, page.blocks[0].id, "Old", NOW)!.id, true, LATER);
  const files = toFiles(p);
  const saved = JSON.parse(files[`topics/${topic.id}.json`]);
  assert.equal(saved.version, CURRENT_VERSION);
  assert.equal(saved.comments.length, 2);
  assert.equal(JSON.parse(files[`topics/${other.id}.json`]).comments, undefined);
  assert.ok(!files["structure.json"].includes("Is the name right?"), "comments are not in structure.json");
  const back = fromFiles(files);
  assert.deepEqual(back.tree[0].children[0].page!.comments, page.comments);
  assert.equal(back.tree[1].page!.comments, undefined);
  assert.equal(CURRENT_VERSION, 8);
  assert.ok(c);
});

test("a version 7 project opens with no comments, and a bad comment in a file is put right on opening", () => {
  const files = toFiles(projectWithComments().p);
  const topicFile = Object.keys(files).find((f) => f.startsWith("topics/"))!;
  const v7 = JSON.parse(files["project.json"]);
  v7.version = 8;
  const opened = migrate({ ...v7, version: 7, tree: JSON.parse(files["structure.json"]).tree });
  assert.equal(opened.version, 8);
  const page = JSON.parse(files[topicFile]);
  page.comments = [{ id: "c1", blockId: page.blocks[0].id, text: "  ok  ", resolved: false, createdAt: NOW }, { id: "c2", blockId: "gone", text: "lost", resolved: false, createdAt: NOW }, { text: "no block" }];
  const files2 = { ...files, [topicFile]: JSON.stringify(page) };
  const back = fromFiles(files2);
  const kept = back.tree.flatMap((n) => [n, ...n.children]).find((n) => n.page?.comments)!;
  assert.deepEqual(kept.page!.comments!.map((c) => c.text), ["ok"]);
});
