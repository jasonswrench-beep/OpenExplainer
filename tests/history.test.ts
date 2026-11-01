import test from "node:test";
import assert from "node:assert/strict";
import { addNode, addPicture, createProject, CURRENT_VERSION, ensurePage, findNode, removePicture, setStatus, type Picture, type Project } from "../src/project/model.ts";
import { addBlock, makeBlock, type ParagraphBlock } from "../src/project/page.ts";
import { parseMarks, formatMarks } from "../src/project/text.ts";
import { packProject, unpackProject } from "../src/project/package.ts";
import { migrate } from "../src/project/migrate.ts";
import { fromFiles, toFiles } from "../src/project/files.ts";
import { cleanHistory, MOST_SNAPSHOTS, snapshotPictureFiles, type Snapshot } from "../src/project/history.ts";
import { addSnapshot, compareWithSnapshot, comparisonLines, deleteSnapshot, findSnapshot, renameSnapshot, restoreTopic, restoreWhole, takeSnapshot } from "../src/project/snapshots.ts";

const NOW = "2026-11-01T10:00:00.000Z";
const later = (n: number) => new Date(Date.parse(NOW) + n * 60000).toISOString();

function write(project: Project, topicId: string, words: string): string {
  const block = makeBlock("paragraph") as ParagraphBlock;
  block.text = parseMarks(words);
  addBlock(ensurePage(findNode(project.tree, topicId)!), block);
  return block.id;
}

function book() {
  const project = createProject("Snapshots");
  const chapter = addNode(project.tree, null, "Getting started");
  const saving = addNode(project.tree, chapter.id, "Saving");
  const printing = addNode(project.tree, chapter.id, "Printing");
  const picture: Picture = { id: "pic1", file: "images/pic1.png", width: 10, height: 10, altText: "A dialog", source: { kind: "import", capturedAt: NOW } };
  addPicture(project.tree, saving.id, picture);
  const first = write(project, saving.id, "Press **Save**.");
  write(project, printing.id, "Print it.");
  const assets = new Map([["images/pic1.png", new Uint8Array([1, 2, 3])]]);
  return { project, chapter, saving, printing, first, assets };
}

test("a new project has no snapshots and an older project (format 19) is upgraded to have none", () => {
  assert.equal(CURRENT_VERSION >= 20, true);
  assert.deepEqual(createProject("x").history, []);
  const old = migrate({ ...JSON.parse(JSON.stringify(createProject("Old"))), version: 19, history: undefined, tree: [] });
  assert.deepEqual([old.version, old.history], [CURRENT_VERSION, []]);
});

test("a snapshot keeps the book as it was, taken from the files a saved project is made of, and does not hold the other snapshots", () => {
  const { project } = book();
  const one = takeSnapshot(project, "  First   draft  ", NOW);
  assert.deepEqual([one.name, one.savedAt, one.automatic], ["First draft", NOW, false]);
  assert.deepEqual(Object.keys(one.files).sort(), ["project.json", "structure.json", `topics/${project.tree[0].children[0].id}.json`, `topics/${project.tree[0].children[1].id}.json`].sort());
  addSnapshot(project, one);
  const two = takeSnapshot(project, "", later(5));
  assert.match(two.name, /^Snapshot 20\d\d-\d\d-\d\d \d\d:\d\d$/, "no name makes one from the date");
  assert.equal(two.files["project.json"].includes(one.id), false, "a snapshot never holds the others");
});

test("snapshots are saved in the one file, come back with it, and keep the pictures they name after the book stopped using them", async () => {
  const { project, saving, assets } = book();
  addSnapshot(project, takeSnapshot(project, "With the picture", NOW));
  addSnapshot(project, takeSnapshot(project, "Second", later(1), true));
  removePicture(project.tree, saving.id, "pic1");
  const packed = packProject(project, assets);
  const back = await unpackProject(packed);
  assert.deepEqual(back.project.history.map((s) => [s.name, s.automatic, s.savedAt]), [["With the picture", false, NOW], ["Second", true, later(1)]]);
  assert.deepEqual(back.project.history[0].files, project.history[0].files, "the files are the same text");
  assert.ok(back.assets.has("images/pic1.png"), "the picture file stayed because a snapshot names it");
  assert.deepEqual(back.missing, [], "and it is not reported missing");
  assert.deepEqual(snapshotPictureFiles(back.project.history[0]), ["images/pic1.png"]);
  // Saved again with no snapshot naming it, the picture file goes.
  back.project.history.length = 0;
  assert.equal([...(await unpackProject(packProject(back.project, back.assets))).assets.keys()].includes("images/pic1.png"), false);
  // The JSON of a project does not carry the snapshots in project.json.
  assert.equal("history" in JSON.parse(toFiles(project)["project.json"]), false);
});

test("a damaged or hand-made history is refused or tidied, never trusted", () => {
  const { project } = book();
  addSnapshot(project, takeSnapshot(project, "Good", NOW));
  const files = toFiles(project);
  assert.throws(() => fromFiles({ ...files, "history/index.json": "{not json" }), /list of snapshots is damaged/);
  assert.throws(() => fromFiles({ ...files, "history/index.json": JSON.stringify({ version: 3, snapshots: [] }) }), /do not match each other/);
  const good = project.history[0];
  const messy = cleanHistory([good, { ...good }, { ...good, id: "has space" }, { ...good, id: "x2", files: { "project.json": "{}" } }, { ...good, id: "x3", name: 42, files: { ...good.files, "../evil.json": "x", "topics/../a.json": "x" } }, null, 5]);
  assert.deepEqual(messy.map((s) => s.id), [good.id, "x3"], "the repeated, the unsafe-named and the incomplete are dropped");
  assert.deepEqual(Object.keys(messy[1].files).sort(), ["project.json", "structure.json", ...Object.keys(good.files).filter((f) => f.startsWith("topics/"))].sort(), "a file name outside the allowed kinds is not kept");
  assert.equal(messy[1].name, "Snapshot");
  assert.equal(cleanHistory(Array.from({ length: 30 }, (_, i) => ({ ...good, id: `s${i}` }))).length, MOST_SNAPSHOTS);
});

test("at the limit the author is asked to delete one, and a snapshot the program takes replaces its oldest own, never the one being restored", () => {
  const { project } = book();
  for (let i = 0; i < MOST_SNAPSHOTS; i++) addSnapshot(project, takeSnapshot(project, `Hand ${i}`, later(i)));
  assert.throws(() => addSnapshot(project, takeSnapshot(project, "One more", later(99))), /already keeps 20 snapshots/);
  assert.equal(project.history.length, MOST_SNAPSHOTS);
  const removed = addSnapshot(project, takeSnapshot(project, "Auto", later(100), true));
  assert.equal(removed!.name, "Hand 0", "with none of its own, the oldest goes");
  const second = addSnapshot(project, takeSnapshot(project, "Auto 2", later(101), true), project.history[0].id);
  assert.equal(second!.name, "Auto", "one the program took goes before the author's own");
  assert.equal(project.history.length, MOST_SNAPSHOTS);
  // With only the author's own, the oldest goes, unless it is the one being restored.
  const other = book().project;
  for (let i = 0; i < MOST_SNAPSHOTS; i++) addSnapshot(other, takeSnapshot(other, `Hand ${i}`, later(i)));
  const spared = addSnapshot(other, takeSnapshot(other, "Auto", later(100), true), other.history[0].id);
  assert.equal(spared!.name, "Hand 1", "the one being restored is spared");
  assert.equal(other.history[0].name, "Hand 0");
});

test("snapshots can be found by id or name, renamed and deleted", () => {
  const { project } = book();
  const a = takeSnapshot(project, "Before the review", NOW);
  const b = takeSnapshot(project, "before the review", later(1));
  addSnapshot(project, a);
  assert.equal(findSnapshot(project, a.id), a);
  assert.equal(findSnapshot(project, "BEFORE THE REVIEW"), a);
  addSnapshot(project, b);
  assert.throws(() => findSnapshot(project, "before the review"), /More than one snapshot is called/);
  assert.throws(() => findSnapshot(project, "nope"), /There is no snapshot "nope"\. The snapshots are: Before the review \(/);
  assert.equal(renameSnapshot(project, b.id, "  After  "), true);
  assert.equal(renameSnapshot(project, b.id, "   "), false);
  assert.equal(renameSnapshot(project, "nope", "x"), false);
  assert.equal(findSnapshot(project, "after"), b);
  assert.equal(deleteSnapshot(project, a.id), a);
  assert.equal(deleteSnapshot(project, a.id), null);
});

test("comparing says what changed in words: topics added, removed and changed, and the book's settings", () => {
  const { project, chapter, saving, printing, first, assets } = book();
  const snap = takeSnapshot(project, "Before", NOW);
  assert.deepEqual(comparisonLines(compareWithSnapshot(project, snap), snap), ['The book is the same as "Before".']);
  // Change things.
  const block = findNode(project.tree, saving.id)!.page!.blocks.find((b) => b.id === first) as ParagraphBlock;
  block.text = parseMarks("Press **Save** now.");
  write(project, saving.id, "A new line.");
  setStatus(project.tree, saving.id, "reviewed");
  removePicture(project.tree, saving.id, "pic1");
  addNode(project.tree, chapter.id, "Sharing");
  findNode(project.tree, printing.id)!.title = "Printing it";
  const gone = addNode(project.tree, null, "Temp");
  void gone;
  project.variables.PRODUCT = "Acme";
  const result = compareWithSnapshot(project, snap);
  const byTitle = Object.fromEntries(result.topics.map((t) => [t.title, t]));
  assert.deepEqual(byTitle["Saving"].what, ["status is Reviewed (it was Not started)", "1 block changed", "1 block added", "1 picture removed"]);
  assert.deepEqual(byTitle["Printing it"].what, ['renamed (it was "Printing")']);
  assert.equal(byTitle["Sharing"].kind, "added");
  assert.equal(byTitle["Temp"].kind, "added");
  assert.deepEqual(result.book, ["The variables changed."]);
  // A topic removed after the snapshot, and one moved.
  const snap2 = takeSnapshot(project, "Later", later(3));
  project.tree[0].children = project.tree[0].children.filter((c) => c.id !== printing.id);
  const second = compareWithSnapshot(project, snap2);
  assert.deepEqual(second.topics.map((t) => [t.title, t.kind, t.number]), [["Printing it", "removed", "1.2"]]);
  const lines = comparisonLines(second, snap2);
  assert.match(lines[0], /^Compared with "Later" \(20\d\d-\d\d-\d\d \d\d:\d\d\):$/);
  assert.equal(lines[1], "Removed: Printing it (it was 1.2).");
  void assets;
});

test("restoring the whole book puts it back, keeps the snapshots, and first takes one of the book as it was, so the restore can be undone", () => {
  const { project, saving, first } = book();
  addSnapshot(project, takeSnapshot(project, "Good", NOW));
  const good = project.history[0];
  const before = JSON.stringify(toFiles({ ...project, history: [] }));
  const block = findNode(project.tree, saving.id)!.page!.blocks[0] as ParagraphBlock;
  block.text = parseMarks("Spoiled.");
  findNode(project.tree, saving.id)!.title = "Ruined";
  project.variables.PRODUCT = "Spoiled";
  const spoiled = JSON.stringify(toFiles({ ...project, history: [] }));
  const result = restoreWhole(project, good, later(10));
  assert.equal(JSON.stringify(toFiles({ ...project, history: [] })), before, "the book is as the snapshot had it");
  assert.equal(formatMarks((findNode(project.tree, saving.id)!.page!.blocks.find((b) => b.id === first) as ParagraphBlock).text), "Press **Save**.");
  assert.deepEqual(project.history.map((s) => [s.name, s.automatic]), [["Good", false], ['Before restoring "Good"', true]]);
  assert.equal(result.removed, null);
  // And back again.
  restoreWhole(project, result.safety, later(11));
  assert.equal(JSON.stringify(toFiles({ ...project, history: [] })), spoiled, "restoring the safety snapshot undoes the restore");
  assert.equal(project.history.length, 3);
});

test("restoring a snapshot taken by an older program reads it with the migrations", () => {
  const { project } = book();
  const snap = takeSnapshot(project, "Old", NOW);
  const header = JSON.parse(snap.files["project.json"]);
  const structure = JSON.parse(snap.files["structure.json"]);
  const topicFiles = Object.fromEntries(Object.entries(snap.files).filter(([n]) => n.startsWith("topics/")).map(([n, t]) => [n, JSON.stringify({ ...JSON.parse(t), version: 17 })]));
  for (const key of ["look", "snippets", "conditions", "targets"]) delete header[key];
  const old: Snapshot = { ...snap, files: { "project.json": JSON.stringify({ ...header, version: 17 }), "structure.json": JSON.stringify({ ...structure, version: 17 }), ...topicFiles } };
  project.tree[0].title = "Changed";
  restoreWhole(project, old, later(1));
  assert.equal(project.version, CURRENT_VERSION);
  assert.equal(project.tree[0].title, "Getting started");
  assert.ok(project.look && Array.isArray(project.snippets), "the settings added since are there");
});

test("restoring one topic puts back its words, title and pictures but leaves the rest alone; a deleted topic is put back where it was", () => {
  const { project, chapter, saving, printing } = book();
  addSnapshot(project, takeSnapshot(project, "Good", NOW));
  const good = project.history[0];
  const savingNode = findNode(project.tree, saving.id)!;
  savingNode.title = "Ruined";
  (savingNode.page!.blocks[0] as ParagraphBlock).text = parseMarks("Spoiled.");
  (findNode(project.tree, printing.id)!.page!.blocks[0] as ParagraphBlock).text = parseMarks("Print it differently.");
  const sub = addNode(project.tree, saving.id, "A new sub-topic");
  const result = restoreTopic(project, good, saving.id, later(5));
  assert.deepEqual([result.title, result.putBack], ["Saving", false]);
  assert.equal(savingNode === findNode(project.tree, saving.id), true, "the same place in the book");
  const back = findNode(project.tree, saving.id)!;
  assert.equal(back.title, "Saving");
  assert.equal(formatMarks((back.page!.blocks[0] as ParagraphBlock).text), "Press **Save**.");
  assert.deepEqual(back.children.map((c) => c.id), [sub.id], "the topics under it are not touched");
  assert.equal(formatMarks((findNode(project.tree, printing.id)!.page!.blocks[0] as ParagraphBlock).text), "Print it differently.", "other topics keep their changes");
  assert.equal(project.history.at(-1)!.automatic, true);
  // Deleted, then put back at its old place.
  project.tree[0].children = project.tree[0].children.filter((c) => c.id !== saving.id);
  const second = restoreTopic(project, good, saving.id, later(6));
  assert.equal(second.putBack, true);
  assert.deepEqual(project.tree[0].children.map((c) => c.title), ["Saving", "Printing"], "at its old position");
  // Its chapter gone: it goes at the end of the book.
  project.tree.length = 0;
  restoreTopic(project, good, saving.id, later(7));
  assert.deepEqual(project.tree.map((n) => n.title), ["Saving"]);
  assert.throws(() => restoreTopic(project, good, "nope", later(8)), /does not have that topic/);
  void chapter;
});
