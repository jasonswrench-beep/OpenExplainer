import test from "node:test";
import assert from "node:assert/strict";
import {
  applyKey, clampRect, contains, cssToSnapshot, describeRect, keyAction, moveRect, panelSide, rectFromCorners,
  resizeFromCorner, resizeRect, snapshotToCss, type Rect,
} from "../src/capture/selection.ts";

const screen = { width: 1920, height: 1080 };
const r = (left: number, top: number, width: number, height: number): Rect => ({ left, top, width, height });
const press = (key: string, mods: { shiftKey?: boolean; ctrlKey?: boolean } = {}) => keyAction({ key, shiftKey: false, ctrlKey: false, ...mods });

test("a drag makes the rectangle between its two corners, whichever way it went", () => {
  assert.deepEqual(rectFromCorners({ x: 100, y: 50 }, { x: 400, y: 350 }, screen), r(100, 50, 300, 300));
  assert.deepEqual(rectFromCorners({ x: 400, y: 350 }, { x: 100, y: 50 }, screen), r(100, 50, 300, 300), "dragged up and to the left");
  assert.deepEqual(rectFromCorners({ x: 400, y: 50 }, { x: 100, y: 350 }, screen), r(100, 50, 300, 300), "dragged down and to the left");
});

test("a click without a drag is one pixel, and a drag that leaves the screen stops at the edge", () => {
  assert.deepEqual(rectFromCorners({ x: 10, y: 10 }, { x: 10, y: 10 }, screen), r(10, 10, 1, 1));
  assert.deepEqual(rectFromCorners({ x: 1800, y: 1000 }, { x: 5000, y: 5000 }, screen), r(1800, 1000, 120, 80));
  assert.deepEqual(rectFromCorners({ x: 100, y: 100 }, { x: -300, y: -300 }, screen), r(0, 0, 100, 100));
});

test("a rectangle is always kept inside the screen and at least one pixel big", () => {
  assert.deepEqual(clampRect(r(-5, -5, 100, 100), screen), r(0, 0, 100, 100));
  assert.deepEqual(clampRect(r(1900, 1070, 100, 100), screen), r(1820, 980, 100, 100), "pushed back from the far edges");
  assert.deepEqual(clampRect(r(0, 0, 0, 0), screen), r(0, 0, 1, 1));
  assert.deepEqual(clampRect(r(0, 0, 5000, 5000), screen), r(0, 0, 1920, 1080));
});

test("moving keeps the size and stops at every edge", () => {
  assert.deepEqual(moveRect(r(100, 100, 50, 40), 10, -20, screen), r(110, 80, 50, 40));
  assert.deepEqual(moveRect(r(5, 5, 50, 40), -10, -10, screen), r(0, 0, 50, 40));
  assert.deepEqual(moveRect(r(1860, 1030, 50, 40), 100, 100, screen), r(1870, 1040, 50, 40));
});

test("resizing keeps the top left corner and cannot go past the edge or below one pixel", () => {
  assert.deepEqual(resizeRect(r(100, 100, 50, 40), 10, 5, screen), r(100, 100, 60, 45));
  assert.deepEqual(resizeRect(r(100, 100, 50, 40), -100, -100, screen), r(100, 100, 1, 1));
  assert.deepEqual(resizeRect(r(1900, 1070, 10, 5), 100, 100, screen), r(1900, 1070, 20, 10));
});

test("dragging a corner moves that corner and leaves the opposite one fixed", () => {
  const start = r(100, 100, 200, 100); // corners (100,100) to (300,200)
  assert.deepEqual(resizeFromCorner(start, "bottom-right", { x: 400, y: 300 }, screen), r(100, 100, 300, 200));
  assert.deepEqual(resizeFromCorner(start, "top-left", { x: 50, y: 60 }, screen), r(50, 60, 250, 140));
  assert.deepEqual(resizeFromCorner(start, "top-right", { x: 350, y: 150 }, screen), r(100, 150, 250, 50));
  assert.deepEqual(resizeFromCorner(start, "bottom-left", { x: 120, y: 250 }, screen), r(120, 100, 180, 150));
  assert.deepEqual(resizeFromCorner(start, "bottom-right", { x: 50, y: 50 }, screen), r(50, 50, 50, 50), "dragged past the opposite corner it flips");
});

test("the arrow keys move by one pixel, Control makes the step ten", () => {
  assert.deepEqual(press("ArrowRight"), { kind: "move", dx: 1, dy: 0 });
  assert.deepEqual(press("ArrowLeft"), { kind: "move", dx: -1, dy: 0 });
  assert.deepEqual(press("ArrowUp"), { kind: "move", dx: 0, dy: -1 });
  assert.deepEqual(press("ArrowDown", { ctrlKey: true }), { kind: "move", dx: 0, dy: 10 });
});

test("Shift with the arrow keys changes the size instead: Right and Down grow, Left and Up shrink", () => {
  assert.deepEqual(press("ArrowRight", { shiftKey: true }), { kind: "resize", dw: 1, dh: 0 });
  assert.deepEqual(press("ArrowLeft", { shiftKey: true }), { kind: "resize", dw: -1, dh: 0 });
  assert.deepEqual(press("ArrowDown", { shiftKey: true, ctrlKey: true }), { kind: "resize", dw: 0, dh: 10 });
  assert.deepEqual(press("ArrowUp", { shiftKey: true }), { kind: "resize", dw: 0, dh: -1 });
});

test("other keys are not rectangle keys", () => {
  for (const key of ["a", "Enter", "Escape", "Tab", " ", "Home"]) assert.equal(press(key), null, key);
});

test("a key action is applied with the same limits as a drag", () => {
  const edge = r(0, 0, 100, 100);
  assert.deepEqual(applyKey(edge, press("ArrowLeft")!, screen), edge, "already at the left edge");
  assert.deepEqual(applyKey(edge, press("ArrowRight", { ctrlKey: true })!, screen), r(10, 0, 100, 100));
  assert.deepEqual(applyKey(edge, press("ArrowRight", { shiftKey: true, ctrlKey: true })!, screen), r(0, 0, 110, 100));
  assert.deepEqual(applyKey(r(0, 0, 1, 1), press("ArrowLeft", { shiftKey: true })!, screen), r(0, 0, 1, 1), "never below one pixel");
});

test("the rectangle is described in words a screen reader can say", () => {
  assert.equal(describeRect(r(100, 50, 800, 600)), "800 by 600 pixels, 100 from the left and 50 from the top");
});

test("a point is inside a rectangle on its left and top edge but not on its right and bottom edge", () => {
  const box = r(10, 10, 5, 5);
  assert.equal(contains(box, { x: 10, y: 10 }), true);
  assert.equal(contains(box, { x: 14, y: 14 }), true);
  assert.equal(contains(box, { x: 15, y: 14 }), false);
  assert.equal(contains(box, { x: 9, y: 10 }), false);
});

test("the panel of controls moves to the other side when the rectangle would be under it", () => {
  assert.equal(panelSide({ top: 400, height: 200 }, 120, 1080), "top", "rectangle in the middle");
  assert.equal(panelSide({ top: 20, height: 200 }, 120, 1080), "bottom", "rectangle at the top");
  assert.equal(panelSide({ top: 900, height: 150 }, 120, 1080), "top", "rectangle at the bottom");
  assert.equal(panelSide({ top: 10, height: 1060 }, 120, 1080), "top", "rectangle over both: the top is as good as any");
});

test("page pixels and snapshot pixels convert both ways, so a scaled display still lines up", () => {
  assert.equal(cssToSnapshot(100, 1), 100);
  assert.equal(cssToSnapshot(100, 1.5), 150);
  assert.equal(cssToSnapshot(33.3, 1.25), 42);
  assert.equal(snapshotToCss(150, 1.5), 100);
  assert.equal(snapshotToCss(1920, 1.5), 1280, "a 1920 pixel snapshot fills a 1280 pixel wide page at 150 percent");
});
