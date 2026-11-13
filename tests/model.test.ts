import { test } from "node:test";
import assert from "node:assert/strict";
import { addNode, createProject, CURRENT_VERSION, findNode, HOW_TO_BOOK_CHAPTERS, indent, moveDown, moveNode, moveUp, numbering, outdent, outline, removeNode, renameNode, setStatus, visibleNodes } from "../src/project/model.ts";
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
  files["structure.json"] = files["structure.json"].replace(`"version": ${CURRENT_VERSION}`, `"version": ${CURRENT_VERSION + 1}`);
  assert.throws(() => fromFiles(files), /do not match/);
});

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileNameFor, packProject, unpackProject } from "../src/project/package.ts";
import { unzip } from "../src/project/zip.ts";

/** Python, which the zip checks below use as "another program": on Windows it is python, elsewhere python3. */
const PYTHON = process.platform === "win32" ? "python" : "python3";

test("a project packs into one file and unpacks to the same project", async () => {
  const { p } = sample();
  assert.deepEqual((await unpackProject(packProject(p))).project, p);
});

test("the packed file is a valid zip that other programs accept", () => {
  const { p } = sample();
  const dir = mkdtempSync(join(tmpdir(), "oe-"));
  const file = join(dir, "t.openexplainer");
  writeFileSync(file, packProject(p));
  const out = execFileSync(PYTHON, ["-c", "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());print(sorted(z.namelist()))", file]).toString();
  assert.match(out, /None/);
  assert.match(out, /project\.json/);
});

test("compressed zips from other programs can be read", async () => {
  const dir = mkdtempSync(join(tmpdir(), "oe-"));
  const file = join(dir, "c.zip");
  execFileSync(PYTHON, ["-c", "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED);z.writestr('a.txt','hello '*500)", file]);
  const { readFileSync } = await import("node:fs");
  const files = await unzip(new Uint8Array(readFileSync(file)));
  assert.equal(new TextDecoder().decode(files["a.txt"]), "hello ".repeat(500));
});

test("damaged files are refused, and file names are made safe", async () => {
  await assert.rejects(() => unpackProject(new Uint8Array([1, 2, 3])), /not an OpenExplainer project/);
  const bad = packProject(sample().p);
  bad[60] ^= 0xff;
  await assert.rejects(() => unpackProject(bad));
  assert.equal(fileNameFor('My: "Book"?'), "My Book.openexplainer");
  assert.equal(fileNameFor("   "), "Untitled project.openexplainer");
});

test("the OpenStage how-to book template has 15 chapters and an appendix", () => {
  const p = createProject("Book", "openstage-how-to-book");
  assert.equal(p.tree.length, 16);
  assert.equal(HOW_TO_BOOK_CHAPTERS.length, 16);
  assert.deepEqual(p.tree.map((n) => n.title), HOW_TO_BOOK_CHAPTERS);
  assert.equal(p.tree[0].title, "Introduction");
  assert.equal(p.tree[15].title, "Appendix");
  assert.equal(new Set(p.tree.map((n) => n.id)).size, 16, "every chapter has its own id");
  assert.equal(createProject("Plain").tree.length, 0, "an empty project stays empty");
});

test("a node moves, with what is under it, to another place in the tree, and cannot go under itself", () => {
  const p = createProject("Moves");
  const a = addNode(p.tree, null, "A"), b = addNode(p.tree, null, "B");
  const a1 = addNode(p.tree, a.id, "A1"), a2 = addNode(p.tree, a.id, "A2"), b1 = addNode(p.tree, b.id, "B1");
  const deep = addNode(p.tree, a1.id, "Deep");
  moveNode(p.tree, a2.id, b.id, 1);
  assert.deepEqual(outline(p.tree), ["1 A", "  1.1 A1", "    1.1.1 Deep", "2 B", "  2.1 A2", "  2.2 B1"]);
  moveNode(p.tree, a1.id, b.id);
  assert.deepEqual(outline(p.tree), ["1 A", "2 B", "  2.1 A2", "  2.2 B1", "  2.3 A1", "    2.3.1 Deep"], "what is under it goes along, and no position means last");
  moveNode(p.tree, b1.id, null, 1);
  assert.deepEqual(p.tree.map((n) => n.title), ["B1", "A", "B"], "no parent makes it a chapter");
  moveNode(p.tree, deep.id, null, 99);
  assert.equal(p.tree[p.tree.length - 1].title, "Deep", "a position past the end means last");
  assert.throws(() => moveNode(p.tree, b.id, b.id), /under itself/);
  assert.throws(() => moveNode(p.tree, b.id, a1.id), /under itself or under one of its own topics/);
  assert.throws(() => moveNode(p.tree, "nope", null), /was not found/);
  assert.throws(() => moveNode(p.tree, a.id, "nope"), /parent topic was not found/);
  assert.ok(findNode(p.tree, a1.id), "a refused move lost nothing");
});
