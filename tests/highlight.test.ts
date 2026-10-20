import test from "node:test";
import assert from "node:assert/strict";
import {
  circleFor, cleanHighlight, cleanPictureHighlight, cleanTreeHighlights, defaultHighlight, highlightWords, normalizeColor,
} from "../src/project/highlight.ts";
import { addNode, addPicture, createProject, CURRENT_VERSION, setPictureHighlight, type Picture } from "../src/project/model.ts";
import { fromFiles, toFiles } from "../src/project/files.ts";
import { migrate } from "../src/project/migrate.ts";

const clickPicture = (extra: Partial<Picture> = {}): Picture => ({
  id: "p1", file: "images/p1.png", width: 1920, height: 1080, altText: "", source: { kind: "click", capturedAt: "2026-10-19T00:00:00Z" },
  click: { x: 960, y: 540, button: "left" }, ...extra,
});

test("the starting look is yellow, 40 percent see-through, 3 percent of the width, off for the book and on for a quick guide", () => {
  const start = defaultHighlight();
  assert.deepEqual(start.book, { show: false, size: 3, color: "#FFD600", seeThrough: 40 });
  assert.deepEqual(start.guide, { show: true, size: 3, color: "#FFD600", seeThrough: 40 });
  assert.notEqual(defaultHighlight().book, start.book, "each call gives its own copy, so changing one never changes the starting look");
});

test("a new project has the starting look and an older one gets it when it is opened", () => {
  assert.deepEqual(createProject("Book").highlight, defaultHighlight());
  const v3 = { version: 3, name: "Old", template: "empty", variables: {}, tree: [{ id: "a", title: "A", status: "captured", children: [], pictures: [] }] };
  const up = migrate(JSON.parse(JSON.stringify(v3)));
  assert.equal(up.version, CURRENT_VERSION);
  assert.deepEqual(up.highlight, defaultHighlight());
  assert.equal(up.tree[0].title, "A");
});

test("colours are accepted as FFD600, #ffd600 or #fd0 and anything else is refused", () => {
  assert.equal(normalizeColor("FFD600"), "#FFD600");
  assert.equal(normalizeColor(" #ffd600 "), "#FFD600");
  assert.equal(normalizeColor("#fd0"), "#FFDD00");
  for (const bad of ["yellow", "#12345", "#GGGGGG", "", 5, null, undefined]) assert.equal(normalizeColor(bad), null, String(bad));
});

test("settings are cleaned: a missing or wrong part gets the starting look, and numbers stay in their range", () => {
  assert.deepEqual(cleanHighlight(undefined), defaultHighlight());
  assert.deepEqual(cleanHighlight("nonsense"), defaultHighlight());
  const odd = cleanHighlight({
    book: { show: true, size: 500, color: "red", seeThrough: -20 },
    guide: { show: "yes", size: 0, color: "#abc", seeThrough: 150.26, extra: "dropped" },
  });
  assert.deepEqual(odd.book, { show: true, size: 20, color: "#FFD600", seeThrough: 0 });
  assert.deepEqual(odd.guide, { show: true, size: 1, color: "#AABBCC", seeThrough: 100 });
  assert.equal("extra" in odd.guide, false);
  assert.deepEqual(cleanHighlight({ book: { size: 4.44 } }).book, { show: false, size: 4.4, color: "#FFD600", seeThrough: 40 });
});

test("a picture's own choices are cleaned, and none at all means it follows the project", () => {
  assert.equal(cleanPictureHighlight(undefined), null);
  assert.equal(cleanPictureHighlight({}), null);
  assert.equal(cleanPictureHighlight({ show: "yes", x: 5 }), null, "a position needs both numbers");
  assert.deepEqual(cleanPictureHighlight({ show: false }), { show: false });
  assert.deepEqual(cleanPictureHighlight({ show: true, x: 10.4, y: 20.6, extra: 1 }), { show: true, x: 10, y: 21 });
  assert.deepEqual(cleanPictureHighlight({ x: Number.NaN, y: 3 }), null);
});

test("the circle follows the setting for where it is used, and a picture can override it", () => {
  const settings = defaultHighlight();
  assert.equal(circleFor(clickPicture(), settings, "book"), null, "off for the book");
  assert.deepEqual(circleFor(clickPicture(), settings, "guide"), { cx: 960, cy: 540, r: 28.8, color: "#FFD600", opacity: 0.6 });
  assert.notEqual(circleFor(clickPicture({ highlight: { show: true } }), settings, "book"), null, "always shown, even in the book");
  assert.equal(circleFor(clickPicture({ highlight: { show: false } }), settings, "guide"), null, "never shown, even in a quick guide");
});

test("the circle scales with the picture and takes the look from the settings", () => {
  const settings = cleanHighlight({ guide: { show: true, size: 10, color: "#FF0000", seeThrough: 75 } });
  const wide = circleFor(clickPicture({ width: 2000 }), settings, "guide")!;
  const narrow = circleFor(clickPicture({ width: 1000, click: { x: 100, y: 100, button: "left" } }), settings, "guide")!;
  assert.deepEqual([wide.r, narrow.r], [100, 50]);
  assert.deepEqual([wide.color, wide.opacity], ["#FF0000", 0.25]);
});

test("a moved circle is drawn where the author put it, and the click stays as it was", () => {
  const picture = clickPicture({ highlight: { x: 100, y: 200 } });
  const circle = circleFor(picture, defaultHighlight(), "guide")!;
  assert.deepEqual([circle.cx, circle.cy], [100, 200]);
  assert.deepEqual(picture.click, { x: 960, y: 540, button: "left" });
});

test("a circle that would be off the picture is kept on its edge, and a picture with no position has no circle", () => {
  const edge = circleFor(clickPicture({ highlight: { x: -50, y: 5000 } }), defaultHighlight(), "guide")!;
  assert.deepEqual([edge.cx, edge.cy], [0, 1080]);
  const plain: Picture = { id: "w", file: "images/w.png", width: 800, height: 600, altText: "", source: { kind: "window", capturedAt: "t" } };
  assert.equal(circleFor(plain, defaultHighlight(), "guide"), null, "a window picture has no click");
  assert.deepEqual(circleFor({ ...plain, highlight: { show: true, x: 10, y: 20 } }, defaultHighlight(), "book"), { cx: 10, cy: 20, r: 12, color: "#FFD600", opacity: 0.6 }, "unless the author gave it a spot");
});

test("what a picture's circle is doing is said in plain words", () => {
  const settings = defaultHighlight();
  assert.equal(highlightWords(clickPicture(), settings, "book"), "Click circle: follows the project (not shown in the book).");
  assert.equal(highlightWords(clickPicture(), settings, "guide"), "Click circle: follows the project (shown in the quick guide).");
  assert.equal(highlightWords(clickPicture({ highlight: { show: true } }), settings, "book"), "Click circle: always shown.");
  assert.equal(highlightWords(clickPicture({ highlight: { show: false, x: 5, y: 6 } }), settings, "guide"), "Click circle: never shown, moved to 5 across and 6 down.");
  const plain: Picture = { id: "w", file: "images/w.png", width: 800, height: 600, altText: "", source: { kind: "window", capturedAt: "t" } };
  assert.equal(highlightWords(plain, settings, "book"), null, "nothing to say about a picture with no click");
});

test("the settings and a picture's choices are saved in the project file and come back, and cleaned on the way in and out", () => {
  const p = createProject("Book");
  p.highlight = cleanHighlight({ book: { show: true, size: 5, color: "#00AA00", seeThrough: 20 } });
  const chapter = addNode(p.tree, null, "Chapter");
  addPicture(p.tree, chapter.id, clickPicture({ highlight: { show: false, x: 7, y: 8 } }));
  const files = toFiles(p);
  assert.ok(files["project.json"].includes('"highlight"'));
  const back = fromFiles(files);
  assert.deepEqual(back.highlight, p.highlight);
  assert.deepEqual(back.tree[0].pictures[0].highlight, { show: false, x: 7, y: 8 });
  // a hand-made file with wrong values is put right when it is opened
  const header = JSON.parse(files["project.json"]);
  header.highlight = { book: { size: 9999, color: "pink" }, guide: 5 };
  const structure = JSON.parse(files["structure.json"]);
  structure.tree[0].pictures[0].highlight = { show: "maybe", x: "left", y: 4 };
  const opened = fromFiles({ "project.json": JSON.stringify(header), "structure.json": JSON.stringify(structure) });
  assert.equal(opened.highlight.book.size, 20);
  assert.equal(opened.highlight.book.color, "#FFD600");
  assert.deepEqual(opened.highlight.guide, defaultHighlight().guide);
  assert.equal("highlight" in opened.tree[0].pictures[0], false, "nothing valid left, so the picture follows the project");
});

test("cleaning a tree leaves everything else about its pictures alone and does not change the original", () => {
  const tree = [{ id: "a", title: "A", status: "captured", pictures: [clickPicture({ highlight: { show: true, x: 1.4, y: 2 } })], children: [] }];
  const cleaned = cleanTreeHighlights(tree as never);
  assert.deepEqual((cleaned[0] as typeof tree[0]).pictures[0].highlight, { show: true, x: 1, y: 2 });
  assert.equal((cleaned[0] as typeof tree[0]).pictures[0].click?.x, 960);
  assert.equal(tree[0].pictures[0].highlight?.x, 1.4, "the project in memory is not changed by saving it");
});

test("a picture's circle choices are set, changed and removed through the model, and only valid ones are kept", () => {
  const p = createProject("Book");
  const chapter = addNode(p.tree, null, "Chapter");
  addPicture(p.tree, chapter.id, clickPicture());
  const picture = () => p.tree[0].pictures[0];
  setPictureHighlight(p.tree, chapter.id, "p1", { show: true });
  assert.deepEqual(picture().highlight, { show: true });
  setPictureHighlight(p.tree, chapter.id, "p1", { show: true, x: 10.2, y: 20 });
  assert.deepEqual(picture().highlight, { show: true, x: 10, y: 20 });
  setPictureHighlight(p.tree, chapter.id, "p1", { x: 7 });
  assert.equal("highlight" in picture(), false, "half a position is nothing, so the picture follows the project");
  setPictureHighlight(p.tree, chapter.id, "p1", { show: false });
  setPictureHighlight(p.tree, chapter.id, "p1", null);
  assert.equal("highlight" in picture(), false, "null removes the choices");
  setPictureHighlight(p.tree, chapter.id, "no-such-picture", { show: true });
  assert.equal("highlight" in picture(), false, "a picture that is not there is left alone");
});
