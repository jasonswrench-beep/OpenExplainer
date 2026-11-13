// What a project file may say about its pictures and variables (src/project/picture-check.ts), checked when a project is opened. The security review of
// 2026-11-13 asked for this: a project from someone else must not put markup into a dialog or an export, or a path into an exported ZIP.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addNode, addPicture, createProject, ensurePage, type Picture } from "../src/project/model.ts";
import { addBlock, makeBlock } from "../src/project/page.ts";
import { fromFiles, PROJECT_FILE, STRUCTURE_FILE, toFiles } from "../src/project/files.ts";
import { cleanPicture, cleanVariables, exportLabel, MAX_PICTURE_SIDE, pictureSide, picturesLeftOut, windowCaptureName } from "../src/project/picture-check.ts";
import { buildHelpSiteText } from "../src/export/help-site.ts";
import { buildJsonExport, BOOK_FILE } from "../src/export/json.ts";

const good = (id: string, extra: Record<string, unknown> = {}) => ({ id, file: `images/${id}.png`, width: 800, height: 600, altText: `Picture ${id}`, source: { kind: "window", capturedAt: "t" }, ...extra });

test("a picture's side is a whole number of pixels, and anything that is not a number is refused", () => {
  assert.equal(pictureSide(800), 800);
  assert.equal(pictureSide(799.6), 800);
  assert.equal(pictureSide(0.2), 1);
  assert.equal(pictureSide(MAX_PICTURE_SIDE * 10), MAX_PICTURE_SIDE);
  for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, "800", "800px\" onload=\"x", null, undefined, {}, [800]]) assert.equal(pictureSide(bad), null, String(bad));
});

test("a picture is kept only with an id, a file and a size the app itself would make", () => {
  assert.deepEqual(cleanPicture(good("p1")), good("p1"));
  assert.equal(cleanPicture(good("p1", { width: 12.4 }))?.width, 12);
  for (const bad of [
    good("p1", { id: "../../evil" }), good("p1", { id: "a/b" }), good("p1", { id: "" }), good("p1", { id: "x".repeat(65) }), good("p1", { id: 7 }),
    good("p1", { file: "images/../project.json" }), good("p1", { file: "C:\\Windows\\x.png" }), good("p1", { file: "images/p1.svg" }), good("p1", { file: "other/p1.png" }),
    good("p1", { width: "100\" onload=\"alert(1)" }), good("p1", { height: -1 }), null, "picture", [],
  ]) {
    assert.equal(cleanPicture(bad), null, JSON.stringify(bad));
  }
  // An odd source is made plain rather than refused: it says nothing the exports rely on.
  const odd = cleanPicture(good("p1", { source: { kind: "<b>", capturedAt: 5, originalName: 9 } }))!;
  assert.deepEqual(odd.source, { kind: "import", capturedAt: "" });
});

test("variable names are cleaned the way the dialog cleans a new one, and a name or value that cannot be used is left out", () => {
  assert.deepEqual(cleanVariables({ PRODUCT: "Acme", "<img src=x onerror=alert(1)>": "a", "!!!": "b", version: "2", VERSION: "3", COMPANY: 5, " my name ": "c" }), {
    PRODUCT: "Acme", IMG_SRC_X_ONERROR_ALERT_1: "a", VERSION: "2", MY_NAME: "c",
  });
  assert.deepEqual(cleanVariables(null), {});
  assert.deepEqual(cleanVariables(["A"]), {});
  assert.deepEqual(cleanVariables({ __proto__: "x" }), {}, "a prototype key is not a variable");
});

test("a hand-edited project with odd variable names, a size that is not a number and ids with a slash opens cleanly, and no export carries what they tried", () => {
  const project = createProject("Crafted");
  const topic = addNode(project.tree, null, "Saving");
  addPicture(project.tree, topic.id, good("p1") as Picture);
  addPicture(project.tree, topic.id, good("p2") as Picture);
  const page = ensurePage(topic);
  addBlock(page, makeBlock("picture", { pictureId: "p1" }));
  addBlock(page, makeBlock("picture", { pictureId: "p2" }));
  const files = toFiles(project);
  // Edit the saved files the way someone with a text editor could.
  const header = JSON.parse(files[PROJECT_FILE]);
  header.variables = { PRODUCT: "Acme", '"><button onclick="steal()">Click me</button>': "x", "": "empty" };
  files[PROJECT_FILE] = JSON.stringify(header);
  const structure = JSON.parse(files[STRUCTURE_FILE]);
  const pictures = structure.tree[0].pictures;
  pictures[1].width = '100" onload="alert(1)';
  pictures.push(good("../../outside"), good("p1", { altText: "A second p1" }), { ...good("p9"), file: "images/../../evil.png" });
  files[STRUCTURE_FILE] = JSON.stringify(structure);

  const opened = fromFiles(files);
  assert.deepEqual(Object.keys(opened.variables), ["PRODUCT", "BUTTON_ONCLICK_STEAL_CLICK_ME_BUTTON"]);
  assert.deepEqual(opened.tree[0].pictures.map((p) => p.id), ["p1"], "only the picture that is still usable is kept");
  assert.equal(picturesLeftOut(opened), 4, "the author is told how many were left out");
  assert.deepEqual(opened.tree[0].page!.blocks.map((b) => (b as { pictureId?: string }).pictureId), ["p1"], "the page no longer points at a picture that was left out");

  const site = Object.values(buildHelpSiteText(opened, new Map())).join("\n");
  for (const bad of ["onload", "alert(1)", "onclick", "outside", "evil"]) assert.ok(!site.includes(bad), `the help site carries ${bad}`);
  const json = new TextDecoder().decode(buildJsonExport(opened, new Map()).files[BOOK_FILE]);
  for (const bad of ["onload", "onclick", "outside", "evil.png"]) assert.ok(!json.includes(bad), `the JSON export carries ${bad}`);
  assert.equal(picturesLeftOut(createProject("Plain")), 0);
});

test("a window capture is saved under a plain name, and an export says nothing of a window's title unless the author asks for capture details", () => {
  const project = createProject("Titles");
  const topic = addNode(project.tree, null, "Saving");
  assert.equal(windowCaptureName(project.tree), "Window capture 1");
  // An older project kept the window's title as the picture's name; it can hold a path with the user's name.
  const title = "C:\Users\Someone\Documents\Salaries 2026.xlsx - Spreadsheet";
  addPicture(project.tree, topic.id, good("p1", { altText: "", source: { kind: "window", capturedAt: "2026-11-13T10:00:00Z", originalName: title } }) as Picture);
  addPicture(project.tree, topic.id, good("p2", { altText: "", source: { kind: "click", capturedAt: "2026-11-13T10:01:00Z", originalName: 'Click on the button "Pay Someone"' }, click: { x: 5, y: 6, button: "left", target: { name: "Pay Someone", role: "button" } } }) as Picture);
  addPicture(project.tree, topic.id, good("p3", { altText: "", source: { kind: "import", capturedAt: "t", originalName: "logo.png" } }) as Picture);
  assert.equal(windowCaptureName(project.tree), "Window capture 2");

  const [p1, p2, p3] = topic.pictures;
  assert.equal(exportLabel(p1), "images/p1.png", "a capture's own name never stands in for a missing picture");
  assert.equal(exportLabel(p2), "images/p2.png");
  assert.equal(exportLabel(p3), "logo.png", "an imported file's name is the author's own");
  assert.equal(exportLabel({ ...p1, altText: " The pay screen " }), "The pay screen");

  const plain = new TextDecoder().decode(buildJsonExport(project, new Map()).files[BOOK_FILE]);
  for (const bad of ["Someone", "Salaries", "Pay Someone", "2026-11-13T10"]) assert.ok(!plain.includes(bad), `the JSON export carries ${bad}`);
  const book = JSON.parse(plain);
  assert.deepEqual(book.tree[0].pictures[1].click, { x: 5, y: 6, button: "left" }, "where the click was stays, for the click circle");
  assert.deepEqual(book.tree[0].pictures[0].source, { kind: "window", capturedAt: "" });

  const full = new TextDecoder().decode(buildJsonExport(project, new Map(), { captureDetails: true }).files[BOOK_FILE]);
  for (const kept of ["Salaries", "Pay Someone", "2026-11-13T10"]) assert.ok(full.includes(kept), `with capture details asked for, ${kept} is there`);
  assert.equal(topic.pictures[1].click?.target?.name, "Pay Someone", "the project itself is not changed by an export");
});
