import { test } from "node:test";
import assert from "node:assert/strict";
import { addNode, createProject, findNode, indent, moveDown, moveUp, numbering, outdent, outline, removeNode, renameNode, setStatus, visibleNodes } from "../src/project/model.ts";
import { fromFiles, toFiles } from "../src/project/files.ts";
import { migrate } from "../src/project/migrate.ts";

function sample() {
  const p = createProject("Book");
  const a = addNode(p.tree, null, "Alpha");
  const b = addNode(p.tree, null, "Beta");
  const a1 = addNode(p.tree, a.id, "Alpha one");
  const a2 = addNode(p.tree, a.id, "Alpha two");
  return { p, a, b, a1, a2 };
}

test("numbers follow position", () => {
  const { p, a, b, a1, a2 } = sample();
  const n = numbering(p.tree);
  assert.deepEqual([n.get(a.id), n.get(b.id), n.get(a1.id), n.get(a2.id)], ["1", "2", "1.1", "1.2"]);
});

test("moving and indenting renumbers", () => {
  const { p, a, b, a1 } = sample();
  assert.ok(moveUp(p.tree, b.id));
  assert.equal(numbering(p.tree).get(b.id), "1");
  assert.equal(numbering(p.tree).get(a1.id), "2.1");
  assert.ok(indent(p.tree, a.id));
  assert.equal(numbering(p.tree).get(a.id), "1.1");
  assert.ok(outdent(p.tree, a.id));
  assert.equal(numbering(p.tree).get(a.id), "2");
});

test("edges refuse politely", () => {
  const { p, a, b, a1 } = sample();
  assert.equal(moveUp(p.tree, a.id), false);
  assert.equal(moveDown(p.tree, b.id), false);
  assert.equal(indent(p.tree, a.id), false);
  assert.equal(outdent(p.tree, a.id), false);
  assert.equal(outdent(p.tree, a1.id), true);
});

test("rename, status, remove", () => {
  const { p, a, a1 } = sample();
  renameNode(p.tree, a.id, "Renamed");
  setStatus(p.tree, a1.id, "reviewed");
  assert.equal(findNode(p.tree, a.id)?.title, "Renamed");
  assert.equal(findNode(p.tree, a1.id)?.status, "reviewed");
  assert.ok(removeNode(p.tree, a.id));
  assert.equal(findNode(p.tree, a1.id), null);
});

test("collapsed nodes hide their children", () => {
  const { p, a } = sample();
  assert.equal(visibleNodes(p.tree, new Set()).length, 4);
  assert.equal(visibleNodes(p.tree, new Set([a.id])).length, 2);
});

test("save then load gives back the same project", () => {
  const { p } = sample();
  assert.deepEqual(fromFiles(toFiles(p)), p);
  assert.deepEqual(outline(fromFiles(toFiles(p)).tree), outline(p.tree));
});

test("newer and broken projects are refused with a clear message", () => {
  assert.throws(() => migrate({ version: 99 }), /newer OpenExplainer/);
  assert.throws(() => migrate({}), /no version/);
  assert.throws(() => migrate(null), /not an OpenExplainer/);
  const files = toFiles(createProject("X"));
  files["structure.json"] = files["structure.json"].replace('"version": 1', '"version": 2');
  assert.throws(() => fromFiles(files), /do not match/);
});
