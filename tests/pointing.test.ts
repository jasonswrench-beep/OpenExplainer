import test from "node:test";
import assert from "node:assert/strict";
import {
  boxFromPoints, boxWords, keyStep, movePoint, moveBox, pointWords, resizeByKey, resizeCorner, toPicturePoint, MIN_BOX,
} from "../src/pointing.ts";

const size = { width: 1920, height: 1080 };

test("a pointer on the screen becomes a whole picture pixel, and is never off the picture", () => {
  const layer = { left: 100, top: 50, width: 960, height: 540 };
  assert.deepEqual(toPicturePoint({ x: 100, y: 50 }, layer, size), { x: 0, y: 0 });
  assert.deepEqual(toPicturePoint({ x: 580, y: 320 }, layer, size), { x: 960, y: 540 });
  assert.deepEqual(toPicturePoint({ x: 1060, y: 590 }, layer, size), { x: 1920, y: 1080 });
  assert.deepEqual(toPicturePoint({ x: 3000, y: -500 }, layer, size), { x: 1920, y: 0 }, "outside is pulled back onto the picture");
  assert.deepEqual(toPicturePoint({ x: 101, y: 51 }, layer, size), { x: 2, y: 2 }, "rounded to a whole pixel");
  assert.deepEqual(toPicturePoint({ x: 5, y: 5 }, { left: 0, top: 0, width: 0, height: 0 }, size), { x: 0, y: 0 }, "a layer with no size cannot divide by zero");
});

test("a box is drawn from two corners whichever way the drag went, and a tiny drag is only a click", () => {
  assert.deepEqual(boxFromPoints({ x: 100, y: 200 }, { x: 300, y: 260 }, size), { x: 100, y: 200, width: 200, height: 60 });
  assert.deepEqual(boxFromPoints({ x: 300, y: 260 }, { x: 100, y: 200 }, size), { x: 100, y: 200, width: 200, height: 60 }, "dragged up and to the left");
  assert.equal(boxFromPoints({ x: 100, y: 100 }, { x: 101, y: 102 }, size), null);
  assert.equal(boxFromPoints({ x: 100, y: 100 }, { x: 300, y: 101 }, size), null, "long but flat is still not a box");
  assert.deepEqual(boxFromPoints({ x: 1900, y: 1000 }, { x: 2500, y: 1500 }, size), { x: 1900, y: 1000, width: 20, height: 80 }, "cut to the picture");
});

test("a box moves by whole pixels, keeps its size and stops at the edges of the picture", () => {
  const box = { x: 100, y: 100, width: 150, height: 40 };
  assert.deepEqual(moveBox(box, 10, -20, size), { x: 110, y: 80, width: 150, height: 40 });
  assert.deepEqual(moveBox(box, -500, -500, size), { x: 0, y: 0, width: 150, height: 40 });
  assert.deepEqual(moveBox(box, 5000, 5000, size), { x: 1770, y: 1040, width: 150, height: 40 });
  assert.deepEqual(moveBox(box, 0.4, 0.6, size), { x: 100, y: 101, width: 150, height: 40 });
});

test("dragging a corner moves that corner and keeps the opposite one still", () => {
  const box = { x: 100, y: 100, width: 200, height: 100 };
  assert.deepEqual(resizeCorner(box, "se", { x: 400, y: 250 }, size), { x: 100, y: 100, width: 300, height: 150 });
  assert.deepEqual(resizeCorner(box, "nw", { x: 50, y: 60 }, size), { x: 50, y: 60, width: 250, height: 140 });
  assert.deepEqual(resizeCorner(box, "ne", { x: 350, y: 80 }, size), { x: 100, y: 80, width: 250, height: 120 });
  assert.deepEqual(resizeCorner(box, "sw", { x: 60, y: 260 }, size), { x: 60, y: 100, width: 240, height: 160 });
});

test("a corner cannot be dragged past the opposite one or off the picture, so a box never gets smaller than the least", () => {
  const box = { x: 100, y: 100, width: 200, height: 100 };
  assert.deepEqual(resizeCorner(box, "se", { x: 50, y: 50 }, size), { x: 100, y: 100, width: MIN_BOX, height: MIN_BOX });
  assert.deepEqual(resizeCorner(box, "nw", { x: 900, y: 900 }, size), { x: 296, y: 196, width: MIN_BOX, height: MIN_BOX });
  assert.deepEqual(resizeCorner(box, "se", { x: 9999, y: 9999 }, size), { x: 100, y: 100, width: 1820, height: 980 });
  assert.deepEqual(resizeCorner(box, "nw", { x: -50, y: -50 }, size), { x: 0, y: 0, width: 300, height: 200 });
});

test("the keyboard resizes from the top left corner, and the box stays on the picture", () => {
  const box = { x: 100, y: 100, width: 200, height: 100 };
  assert.deepEqual(resizeByKey(box, 10, -10, size), { x: 100, y: 100, width: 210, height: 90 });
  assert.deepEqual(resizeByKey(box, -500, -500, size), { x: 100, y: 100, width: MIN_BOX, height: MIN_BOX });
  assert.deepEqual(resizeByKey(box, 5000, 5000, size), { x: 100, y: 100, width: 1820, height: 980 });
  assert.deepEqual(resizeByKey({ x: 1918, y: 0, width: 2, height: 2 }, 5, 5, size), { x: 1918, y: 0, width: 2, height: 7 }, "a box at the very edge cannot grow sideways");
});

test("a point moves by whole pixels and stays on the picture", () => {
  assert.deepEqual(movePoint({ x: 92, y: 402 }, 10, -10, size), { x: 102, y: 392 });
  assert.deepEqual(movePoint({ x: 5, y: 5 }, -50, -50, size), { x: 0, y: 0 });
  assert.deepEqual(movePoint({ x: 1915, y: 1075 }, 50, 50, size), { x: 1920, y: 1080 });
});

test("arrow keys step by 1, Shift makes it 10 and Ctrl means resize; other keys mean nothing", () => {
  assert.deepEqual(keyStep("ArrowRight", { shift: false, ctrl: false }), { dx: 1, dy: 0, resize: false });
  assert.deepEqual(keyStep("ArrowLeft", { shift: true, ctrl: false }), { dx: -10, dy: 0, resize: false });
  assert.deepEqual(keyStep("ArrowUp", { shift: false, ctrl: true }), { dx: 0, dy: -1, resize: true });
  assert.deepEqual(keyStep("ArrowDown", { shift: true, ctrl: true }), { dx: 0, dy: 10, resize: true });
  assert.equal(keyStep("Enter", { shift: false, ctrl: false }), null);
  assert.equal(keyStep("a", { shift: true, ctrl: false }), null);
});

test("a box and a point are said in plain words", () => {
  assert.equal(boxWords("Item of callout A", { x: 125, y: 431, width: 150, height: 44 }), "Item of callout A: starts 125 across and 431 down, 150 wide and 44 high.");
  assert.equal(pointWords("Marker of callout A", { x: 92, y: 402 }), "Marker of callout A: 92 across and 402 down.");
});
