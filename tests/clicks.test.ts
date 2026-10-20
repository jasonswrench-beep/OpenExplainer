import { test } from "node:test";
import assert from "node:assert/strict";
import { addNode, addPicture, createProject, CURRENT_VERSION, type ClickInfo, type Picture } from "../src/project/model.ts";
import { packProject, unpackProject } from "../src/project/package.ts";
import { fromFiles, toFiles } from "../src/project/files.ts";
import { migrate } from "../src/project/migrate.ts";
import { cleanClick, describeClick, MOST_TEXT } from "../src/project/clicks.ts";

const picture = (click?: unknown): Picture => ({
  id: "c1",
  file: "images/c1.png",
  width: 800,
  height: 600,
  altText: "The Save button",
  source: { kind: "click", capturedAt: "2026-10-19T10:00:00Z" },
  ...(click === undefined ? {} : { click: click as ClickInfo }),
});

const save: ClickInfo = {
  x: 120,
  y: 45,
  button: "left",
  target: { name: "Save", role: "button", acceleratorKey: "Ctrl+S", accessKey: "Alt+S", description: "Saves the file", bounds: { x: 100, y: 30, width: 60, height: 30 } },
};

test("a new project is the current format version", () => {
  assert.ok(CURRENT_VERSION >= 5);
  assert.equal(createProject("Book").version, CURRENT_VERSION);
});

test("a version 2 project opens as the current version with its pictures and descriptions untouched", () => {
  const v2 = {
    version: 2,
    name: "Old",
    template: "empty",
    variables: {},
    tree: [{ id: "a", title: "A", status: "captured", children: [], pictures: [{ id: "p", file: "images/p.png", width: 5, height: 6, altText: "A window", source: { kind: "window", capturedAt: "2026-01-01T00:00:00Z", originalName: "Notepad" } }] }],
  };
  const up = migrate(JSON.parse(JSON.stringify(v2)));
  assert.equal(up.version, CURRENT_VERSION);
  assert.deepEqual(up.tree[0].pictures, v2.tree[0].pictures);
});

test("a click note is saved inside the project file and comes back exactly", async () => {
  const p = createProject("Book");
  const chapter = addNode(p.tree, null, "Chapter");
  addPicture(p.tree, chapter.id, picture({ ...save, double: true }));
  const back = await unpackProject(packProject(p, new Map([["images/c1.png", new Uint8Array([1])]])));
  assert.deepEqual(back.project, p);
  assert.deepEqual(back.project.tree[0].pictures[0].click, { ...save, double: true });
});

test("a project with no click notes is saved with none", () => {
  const p = createProject("Book");
  const chapter = addNode(p.tree, null, "Chapter");
  addPicture(p.tree, chapter.id, picture());
  assert.ok(!toFiles(p)["structure.json"].includes('"click":'));
});

test("a password box keeps only the fact that it was clicked, when saving", () => {
  const p = createProject("Book");
  const chapter = addNode(p.tree, null, "Chapter");
  addPicture(p.tree, chapter.id, picture({
    x: 10, y: 10, button: "left",
    target: { password: true, name: "Password", role: "edit", description: "hunter2", bounds: { x: 1, y: 1, width: 9, height: 9 }, value: "hunter2" },
  }));
  const files = toFiles(p);
  const text = files["structure.json"];
  assert.ok(!text.includes("hunter2") && !text.includes("Password") && !text.includes("edit") && !text.includes("bounds"));
  assert.deepEqual(fromFiles(files).tree[0].pictures[0].click, { x: 10, y: 10, button: "left", target: { password: true } });
  // the project in memory was not changed by saving it
  assert.equal(p.tree[0].pictures[0].click?.target?.name, "Password");
});

test("a password box in a file that is opened is reduced the same way", () => {
  const files = toFiles(createProject("Book"));
  const structure = JSON.parse(files["structure.json"]);
  structure.tree = [{ id: "a", title: "A", status: "captured", children: [], pictures: [picture({ x: 1, y: 2, button: "right", target: { password: true, name: "Secret", description: "typed text" } })] }];
  files["structure.json"] = JSON.stringify(structure);
  const opened = fromFiles(files);
  assert.deepEqual(opened.tree[0].pictures[0].click, { x: 1, y: 2, button: "right", target: { password: true } });
});

test("anything outside the agreed list is dropped, including what was typed in a box", () => {
  const clean = cleanClick({ x: 3, y: 4, button: "middle", typed: "my secret", target: { name: "Name", role: "edit", value: "Jason", text: "Jason", password: false } });
  assert.deepEqual(clean, { x: 3, y: 4, button: "middle", target: { name: "Name", role: "edit" } });
});

test("a click note that is not valid is dropped and the picture is kept", () => {
  for (const bad of [{ x: "1", y: 2, button: "left" }, { x: 1, y: NaN, button: "left" }, { x: 1, y: 2, button: "thumb" }, "left click", 5, [], { x: 1, y: 2 }]) {
    assert.equal(cleanClick(bad), null);
  }
  const files = toFiles(createProject("Book"));
  const structure = JSON.parse(files["structure.json"]);
  structure.tree = [{ id: "a", title: "A", status: "captured", children: [], pictures: [picture({ x: 1, y: 2, button: "thumb" })] }];
  files["structure.json"] = JSON.stringify(structure);
  const opened = fromFiles(files);
  assert.equal(opened.tree[0].pictures.length, 1);
  assert.equal(opened.tree[0].pictures[0].altText, "The Save button");
  assert.equal("click" in opened.tree[0].pictures[0], false);
});

test("long names are cut, blanks are dropped, and an empty outline is ignored", () => {
  const clean = cleanClick({ x: 0.4, y: 9.6, button: "left", target: { name: "a".repeat(1000), role: "   ", description: "two\n lines", bounds: { x: 1, y: 1, width: 0, height: 10 } } });
  assert.equal(clean?.x, 0);
  assert.equal(clean?.y, 10);
  assert.equal(clean?.target?.name?.length, MOST_TEXT);
  assert.equal(clean?.target?.role, undefined);
  assert.equal(clean?.target?.description, "two lines");
  assert.equal(clean?.target?.bounds, undefined);
});

test("a click is said in plain words", () => {
  assert.equal(describeClick(save), 'Click on the button "Save" (shortcut Ctrl+S, access key Alt+S).');
  assert.equal(describeClick({ x: 1, y: 2, button: "right", target: { role: "menu item", name: "Copy" } }), 'Right-click on the menu item "Copy".');
  assert.equal(describeClick({ x: 1, y: 2, button: "left", double: true, target: { role: "list item" } }), "Double-click on the list item.");
  assert.equal(describeClick({ x: 40, y: 50, button: "middle" }), "Middle-click at 40 across and 50 down.");
  assert.equal(describeClick({ x: 1, y: 2, button: "left", target: { password: true } }), "Click on a password box.");
});

test("a project saved by a newer version is still refused", () => {
  assert.throws(() => migrate({ version: CURRENT_VERSION + 1, name: "x", template: "empty", variables: {}, tree: [] }), /newer OpenExplainer/);
});
