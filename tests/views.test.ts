import test from "node:test";
import assert from "node:assert/strict";
import {
  checkCropInput, checkZoomInput, cleanPictureView, cleanTreeViews, cleanZoom, defaultZoom, isWhole, shownPart, touches, viewWords, ZOOM_LIMITS, type PictureView,
} from "../src/project/views.ts";
import { addNode, addPicture, createProject, CURRENT_VERSION, setPictureView, type Picture } from "../src/project/model.ts";
import { fromFiles, toFiles } from "../src/project/files.ts";
import { migrate } from "../src/project/migrate.ts";

const size = { width: 1920, height: 1080 };
const picture = (extra: Partial<Picture> = {}): Picture => ({
  id: "p1", file: "images/p1.png", ...size, altText: "", source: { kind: "click", capturedAt: "t" },
  click: { x: 960, y: 540, button: "left" }, ...extra,
});

test("the starting zoom is half the width in the book and 40 percent in a quick guide, and a zoom setting is kept in its range", () => {
  assert.deepEqual(defaultZoom(), { book: { size: 50 }, guide: { size: 40 } });
  assert.deepEqual(cleanZoom(undefined), defaultZoom());
  assert.deepEqual(cleanZoom({ book: { size: 5 }, guide: { size: 500 } }), { book: { size: ZOOM_LIMITS.min }, guide: { size: ZOOM_LIMITS.max } });
  assert.deepEqual(cleanZoom({ book: { size: "big" }, guide: { size: 33.33 } }), { book: { size: 50 }, guide: { size: 33.3 } });
});

test("a picture's own view is cleaned: a zoom stays, a crop is cut to the picture, and anything else is nothing", () => {
  assert.deepEqual(cleanPictureView({ kind: "zoom", extra: 1 }, size), { kind: "zoom" });
  assert.deepEqual(cleanPictureView({ kind: "crop", x: 10.4, y: 20.6, width: 100, height: 50 }, size), { kind: "crop", x: 10, y: 21, width: 100, height: 50 });
  assert.deepEqual(cleanPictureView({ kind: "crop", x: 1800, y: 1000, width: 500, height: 500 }, size), { kind: "crop", x: 1800, y: 1000, width: 120, height: 80 });
  assert.equal(cleanPictureView({ kind: "crop", x: 3000, y: 0, width: 10, height: 10 }, size), null, "wholly off the picture");
  assert.equal(cleanPictureView({ kind: "crop", x: 0, y: 0, width: 0, height: 10 }, size), null, "nothing in it");
  assert.equal(cleanPictureView({ kind: "crop", x: "a", y: 0, width: 10, height: 10 }, size), null);
  assert.equal(cleanPictureView({ kind: "spin" }, size), null);
  assert.equal(cleanPictureView("zoom", size), null);
  assert.equal(cleanPictureView(null, size), null);
});

test("with no view the whole picture is shown, and so for a zoom with no click to zoom on", () => {
  const whole = { x: 0, y: 0, width: 1920, height: 1080 };
  assert.deepEqual(shownPart(picture(), defaultZoom(), "book"), whole);
  assert.ok(isWhole(shownPart(picture(), defaultZoom(), "book"), size));
  assert.deepEqual(shownPart(picture({ click: undefined, view: { kind: "zoom" } }), defaultZoom(), "book"), whole);
});

test("a crop shows exactly its region, in the book and in a quick guide", () => {
  const p = picture({ view: { kind: "crop", x: 100, y: 50, width: 800, height: 450 } });
  assert.deepEqual(shownPart(p, defaultZoom(), "book"), { x: 100, y: 50, width: 800, height: 450 });
  assert.deepEqual(shownPart(p, defaultZoom(), "guide"), { x: 100, y: 50, width: 800, height: 450 });
  assert.ok(!isWhole(shownPart(p, defaultZoom(), "book"), size));
});

test("a zoom is centred on the click, as wide as the setting for where it is used says, and keeps the picture's shape", () => {
  const p = picture({ view: { kind: "zoom" } });
  assert.deepEqual(shownPart(p, defaultZoom(), "book"), { x: 480, y: 270, width: 960, height: 540 });
  assert.deepEqual(shownPart(p, defaultZoom(), "guide"), { x: 576, y: 324, width: 768, height: 432 });
  const wide = { book: { size: 25 }, guide: { size: 25 } };
  assert.deepEqual(shownPart(p, wide, "book"), { x: 720, y: 405, width: 480, height: 270 });
});

test("a zoom near an edge slides in and keeps its size, so it never shows beyond the picture", () => {
  const corner = picture({ click: { x: 10, y: 5, button: "left" }, view: { kind: "zoom" } });
  assert.deepEqual(shownPart(corner, defaultZoom(), "book"), { x: 0, y: 0, width: 960, height: 540 });
  const far = picture({ click: { x: 1915, y: 1075, button: "left" }, view: { kind: "zoom" } });
  assert.deepEqual(shownPart(far, defaultZoom(), "book"), { x: 960, y: 540, width: 960, height: 540 });
  const everything = shownPart(picture({ view: { kind: "zoom" } }), { book: { size: 100 }, guide: { size: 100 } }, "book");
  assert.ok(isWhole(everything, size), "100 percent is the whole picture");
});

test("a callout or any part is in the shown part only when it touches it", () => {
  const shown = { x: 100, y: 100, width: 200, height: 100 };
  assert.ok(touches({ x: 250, y: 150, width: 100, height: 100 }, shown));
  assert.ok(touches({ x: 0, y: 0, width: 500, height: 500 }, shown));
  assert.ok(!touches({ x: 300, y: 100, width: 50, height: 50 }, shown), "touching only at the edge is outside");
  assert.ok(!touches({ x: 0, y: 0, width: 50, height: 50 }, shown));
});

test("the view in words, for the list and a screen reader", () => {
  const zoom = defaultZoom();
  assert.equal(viewWords(picture(), zoom, "book"), null);
  assert.equal(viewWords(picture({ view: { kind: "crop", x: 100, y: 50, width: 800, height: 450 } }), zoom, "book"), "Picture view: cropped to 800 by 450 pixels, starting 100 across and 50 down.");
  assert.equal(viewWords(picture({ view: { kind: "zoom" } }), zoom, "book"), "Picture view: zoomed in on the click, showing 960 by 540 pixels (50 percent of the width, as set for the book).");
  assert.equal(viewWords(picture({ view: { kind: "zoom" } }), zoom, "guide"), "Picture view: zoomed in on the click, showing 768 by 432 pixels (40 percent of the width, as set for the quick guide).");
  assert.match(viewWords(picture({ click: undefined, view: { kind: "zoom" } }), zoom, "book")!, /has no click, so the whole picture is shown/);
});

test("the zoom size boxes are checked, and a mistake is explained in plain words and says which box", () => {
  assert.deepEqual(checkZoomInput({ book: "50", guide: "37.5" }), { ok: true, zoom: { book: { size: 50 }, guide: { size: 37.5 } } });
  const word = checkZoomInput({ book: "big", guide: "40" });
  assert.ok(!word.ok && word.field === "book" && /Type the zoom size for the book as a number from 10 to 100, such as 50\. "big" is not one\./.test(word.message));
  const small = checkZoomInput({ book: "50", guide: "3" });
  assert.ok(!small.ok && small.field === "guide" && /quick guide must be from 10 to 100 percent of the picture's width/.test(small.message));
  const blank = checkZoomInput({ book: "", guide: "40" });
  assert.ok(!blank.ok && blank.field === "book" && !/is not one/.test(blank.message), "an empty box is not quoted back");
});

test("the crop boxes are checked, and a mistake is explained in plain words and says which box", () => {
  assert.deepEqual(checkCropInput({ left: "100", top: "50", width: "800", height: "450" }, size), { ok: true, view: { kind: "crop", x: 100, y: 50, width: 800, height: 450 } });
  const word = checkCropInput({ left: "a", top: "0", width: "10", height: "10" }, size);
  assert.ok(!word.ok && word.field === "left" && /how far across the region starts as a whole number from 0 to 1919/.test(word.message));
  const zero = checkCropInput({ left: "0", top: "0", width: "0", height: "10" }, size);
  assert.ok(!zero.ok && zero.field === "width");
  const past = checkCropInput({ left: "1500", top: "0", width: "800", height: "10" }, size);
  assert.ok(!past.ok && past.field === "width" && /Make the width 420 or less/.test(past.message));
  const low = checkCropInput({ left: "0", top: "900", width: "10", height: "300" }, size);
  assert.ok(!low.ok && low.field === "height" && /Make the height 180 or less/.test(low.message));
  const big = checkCropInput({ left: "0", top: "0", width: "99999", height: "10" }, size);
  assert.ok(!big.ok && /The picture is 1920 by 1080 pixels/.test(big.message));
});

test("setPictureView sets, replaces and takes off a view", () => {
  const p = createProject("Book");
  const topic = addNode(p.tree, null, "Topic");
  addPicture(p.tree, topic.id, picture());
  setPictureView(p.tree, topic.id, "p1", { kind: "zoom" });
  assert.deepEqual(p.tree[0].pictures[0].view, { kind: "zoom" });
  setPictureView(p.tree, topic.id, "p1", { kind: "crop", x: 5, y: 5, width: 100, height: 100 });
  assert.deepEqual(p.tree[0].pictures[0].view, { kind: "crop", x: 5, y: 5, width: 100, height: 100 });
  setPictureView(p.tree, topic.id, "p1", null);
  assert.equal("view" in p.tree[0].pictures[0], false);
  setPictureView(p.tree, topic.id, "nope", { kind: "zoom" });
});

test("views and the zoom sizes are saved and come back, and a picture with no view has none in its file", () => {
  const p = createProject("Book");
  p.zoom = { book: { size: 60 }, guide: { size: 25 } };
  const topic = addNode(p.tree, null, "Topic");
  addPicture(p.tree, topic.id, picture({ view: { kind: "crop", x: 100, y: 50, width: 800, height: 450 } }));
  addPicture(p.tree, topic.id, picture({ id: "p2", file: "images/p2.png", view: { kind: "zoom" } }));
  addPicture(p.tree, topic.id, picture({ id: "p3", file: "images/p3.png" }));
  const files = toFiles(p);
  assert.deepEqual(JSON.parse(files["project.json"]).zoom, { book: { size: 60 }, guide: { size: 25 } });
  const back = fromFiles(files);
  assert.deepEqual(back.zoom, p.zoom);
  assert.deepEqual(back.tree[0].pictures.map((x) => x.view), [{ kind: "crop", x: 100, y: 50, width: 800, height: 450 }, { kind: "zoom" }, undefined]);
  assert.equal("view" in back.tree[0].pictures[2], false);
  assert.equal(back.version, CURRENT_VERSION);
  assert.ok(CURRENT_VERSION >= 7);
});

test("a version 6 project opens with the starting zoom sizes and no views, and a bad view or zoom in a file is put right on opening", () => {
  const v6 = { version: 6, name: "Old", template: "empty", variables: {}, highlight: undefined, tree: [{ id: "a", title: "A", status: "captured", children: [], pictures: [{ ...picture() }] }] };
  const opened = migrate(v6);
  assert.equal(opened.version, CURRENT_VERSION);
  assert.deepEqual(opened.zoom, defaultZoom());
  assert.equal("view" in opened.tree[0].pictures[0], false);
  const bad = migrate({
    version: 7, name: "Bad", template: "empty", variables: {}, zoom: { book: { size: 9000 }, guide: "x" },
    tree: [{ id: "a", title: "A", status: "captured", children: [], pictures: [
      { ...picture(), view: { kind: "crop", x: 1800, y: 1000, width: 500, height: 500 } },
      { ...picture({ id: "p2" }), view: { kind: "crop", x: 5000, y: 0, width: 10, height: 10 } },
      { ...picture({ id: "p3" }), view: "zoom" },
    ] }],
  });
  assert.deepEqual(bad.zoom, { book: { size: 100 }, guide: { size: 40 } });
  assert.deepEqual(bad.tree[0].pictures.map((x) => x.view), [{ kind: "crop", x: 1800, y: 1000, width: 120, height: 80 }, undefined, undefined]);
});

test("cleaning a tree reaches pictures in nested topics and leaves the rest alone", () => {
  const view: PictureView = { kind: "crop", x: 10, y: 10, width: 50, height: 50 };
  const tree = [{ id: "a", title: "A", status: "captured" as const, pictures: [], children: [{ id: "b", title: "B", status: "captured" as const, children: [], pictures: [picture({ view })] }] }];
  const clean = cleanTreeViews(tree);
  assert.deepEqual(clean[0].children[0].pictures[0].view, view);
  assert.equal(clean[0].title, "A");
});
