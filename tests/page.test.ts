import test from "node:test";
import assert from "node:assert/strict";
import {
  addBlock, blockLabel, calloutLabel, cleanPage, CALLOUT_KINDS, emptyPage, findBlock, forgetPicture, hasContent, makeBlock, makeStep, moveBlock, moveItem, picturesOf,
  removeBlock, type Page, type ProcedureBlock,
} from "../src/project/page.ts";
import { addNode, addPicture, createProject, ensurePage, removePicture, type Picture } from "../src/project/model.ts";

const picture = (id: string): Picture => ({ id, file: `images/${id}.png`, width: 10, height: 10, altText: "", source: { kind: "import", capturedAt: "t" } });

test("a new block of each kind is empty and ready to fill in", () => {
  assert.deepEqual(makeBlock("paragraph").type, "paragraph");
  assert.deepEqual((makeBlock("paragraph") as { text: unknown[] }).text, []);
  assert.equal((makeBlock("heading") as { text: string }).text, "");
  const procedure = makeBlock("procedure") as ProcedureBlock;
  assert.equal(procedure.steps.length, 1, "a procedure starts with one empty step to type in");
  assert.deepEqual(procedure.steps[0].text, []);
  assert.equal((makeBlock("callout") as { kind: string }).kind, "design-tip");
  assert.equal((makeBlock("callout", { kind: "caution" }) as { kind: string }).kind, "caution");
  assert.equal((makeBlock("picture", { pictureId: "p1" }) as { pictureId: string }).pictureId, "p1");
  assert.notEqual(makeBlock("paragraph").id, makeBlock("paragraph").id, "every block has its own id");
});

test("blocks are added after another, at the end, and removed by id", () => {
  const page = emptyPage();
  const [a, b, c] = [makeBlock("paragraph"), makeBlock("heading"), makeBlock("callout")];
  assert.equal(addBlock(page, a), 0);
  assert.equal(addBlock(page, b), 1);
  assert.equal(addBlock(page, c, 0), 1, "after the first block");
  assert.deepEqual(page.blocks.map((x) => x.type), ["paragraph", "callout", "heading"]);
  assert.equal(addBlock(page, makeBlock("paragraph"), -1), 0, "-1 means at the very start");
  assert.equal(removeBlock(page, c.id)?.id, c.id);
  assert.equal(removeBlock(page, "nope"), null);
  assert.equal(findBlock(page, b.id)?.id, b.id);
  assert.equal(findBlock(page, c.id), null);
});

test("a block moves up and down, and stops at the ends", () => {
  const page = emptyPage();
  const [a, b, c] = [makeBlock("paragraph"), makeBlock("heading"), makeBlock("callout")];
  [a, b, c].forEach((block) => addBlock(page, block));
  assert.equal(moveBlock(page, a.id, -1), false);
  assert.equal(moveBlock(page, c.id, 1), false);
  assert.equal(moveBlock(page, a.id, 1), true);
  assert.deepEqual(page.blocks.map((x) => x.id), [b.id, a.id, c.id]);
  assert.equal(moveBlock(page, "nope", 1), false);
  const list = [1, 2, 3];
  assert.equal(moveItem(list, 2, -1), true);
  assert.deepEqual(list, [1, 3, 2]);
  assert.equal(moveItem(list, 5, 1), false);
});

test("the picture list of a block, and what happens to a page when a picture is removed", () => {
  const procedure = makeBlock("procedure") as ProcedureBlock;
  procedure.steps = [{ ...makeStep(), pictureId: "p1" }, makeStep(), { ...makeStep(), pictureId: "p2" }];
  assert.deepEqual(picturesOf(procedure), ["p1", "p2"]);
  assert.deepEqual(picturesOf(makeBlock("picture", { pictureId: "p9" })), ["p9"]);
  assert.deepEqual(picturesOf(makeBlock("picture")), []);
  assert.deepEqual(picturesOf(makeBlock("paragraph")), []);
  const page: Page = { blocks: [makeBlock("picture", { pictureId: "p1" }), procedure, makeBlock("picture", { pictureId: "p3" })] };
  forgetPicture(page, "p1");
  assert.equal(page.blocks.length, 2, "its picture block goes");
  assert.equal(procedure.steps[0].pictureId, undefined, "a step just loses its picture");
  assert.equal(procedure.steps[2].pictureId, "p2", "other pictures stay");
});

test("removing a picture from a topic takes it off the topic's page", () => {
  const p = createProject("Book");
  const topic = addNode(p.tree, null, "Topic");
  addPicture(p.tree, topic.id, picture("p1"));
  addPicture(p.tree, topic.id, picture("p2"));
  const page = ensurePage(topic);
  addBlock(page, makeBlock("picture", { pictureId: "p1" }));
  addBlock(page, makeBlock("picture", { pictureId: "p2" }));
  assert.ok(removePicture(p.tree, topic.id, "p1"));
  assert.deepEqual(topic.page!.blocks.map((b) => (b as { pictureId: string }).pictureId), ["p2"]);
  assert.equal(ensurePage(topic), topic.page, "ensurePage gives back the page that is there");
});

test("an empty page, or none, holds nothing and is not saved", () => {
  assert.equal(hasContent(undefined), false);
  assert.equal(hasContent(emptyPage()), false);
  assert.equal(hasContent({ blocks: [makeBlock("paragraph")] }), true);
});

test("block and callout names are plain words", () => {
  assert.equal(blockLabel("procedure"), "Numbered procedure");
  assert.equal(blockLabel("callout"), "Callout box");
  assert.deepEqual(CALLOUT_KINDS.map((k) => k.label), ["Design Tip", "Caution", "Bright Idea", "Power Tip", "Time Saver", "New in this version"]);
  assert.equal(calloutLabel("power-tip"), "Power Tip");
});

test("a page read from a file keeps what belongs and drops what does not", () => {
  const raw = {
    blocks: [
      { id: "a", type: "heading", text: "Getting started" },
      { id: "b", type: "paragraph", text: [{ text: "Hello " }, { text: "world", mark: "bold" }] },
      { id: "c", type: "picture", pictureId: "p1" },
      { id: "d", type: "picture", pictureId: "gone" },
      { id: "e", type: "procedure", steps: [{ id: "s1", text: [{ text: "Open it" }], pictureId: "p1", result: [{ text: "It opens." }] }, { id: "s2", text: [], pictureId: "gone" }, "junk"] },
      { id: "f", type: "callout", kind: "caution", text: [{ text: "Careful" }] },
      { id: "g", type: "callout", kind: "no-such-kind", text: [] },
      { id: "h", type: "video", url: "x" },
      "not a block",
      null,
    ],
  };
  const page = cleanPage(raw, new Set(["p1"]));
  assert.deepEqual(page.blocks.map((b) => b.id), ["a", "b", "c", "e", "f", "g"], "the picture that is gone, the unknown kind and the junk are dropped");
  const procedure = page.blocks[3] as ProcedureBlock;
  assert.equal(procedure.steps.length, 2);
  assert.equal(procedure.steps[0].pictureId, "p1");
  assert.equal(procedure.steps[1].pictureId, undefined, "a step's missing picture is just cleared");
  assert.deepEqual(procedure.steps[0].result, [{ text: "It opens." }]);
  assert.equal((page.blocks[5] as { kind: string }).kind, "design-tip", "an unknown callout kind becomes the first one");
  assert.deepEqual(cleanPage(null), emptyPage());
  assert.deepEqual(cleanPage({ blocks: "x" }), emptyPage());
});

test("a picture block with no picture chosen yet is kept, and the picture check can be skipped", () => {
  assert.equal(cleanPage({ blocks: [{ id: "a", type: "picture", pictureId: "" }] }, new Set()).blocks.length, 1);
  assert.equal(cleanPage({ blocks: [{ id: "a", type: "picture", pictureId: "anything" }] }, null).blocks.length, 1);
});

test("two blocks with one id, or none, get their own ids", () => {
  const page = cleanPage({ blocks: [{ id: "x", type: "paragraph", text: [] }, { id: "x", type: "heading", text: "t" }, { type: "paragraph", text: [] }] });
  const ids = page.blocks.map((b) => b.id);
  assert.equal(new Set(ids).size, 3);
  assert.equal(ids[0], "x");
});
