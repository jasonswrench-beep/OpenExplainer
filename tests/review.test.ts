import test from "node:test";
import assert from "node:assert/strict";
import { addedWords, discardQuestion, picturesFromReview } from "../src/capture/review.ts";
import type { ClickShot } from "../src/capture/clicks.ts";

const shot = (n: number, click: ClickShot["click"], extension: "png" | "jpg" = "png"): ClickShot => ({
  n, click, bytes: new Uint8Array([n, n, n]), width: 1920, height: 1080, extension,
});

const shots = [
  shot(1, { x: 10, y: 20, button: "left", target: { role: "button", name: "Save", accessKey: "Alt+S" } }),
  shot(2, { x: 30, y: 40, button: "right", target: { role: "menu item", name: "Copy" } }),
  shot(3, { x: 50, y: 60, button: "left", double: true }),
  shot(4, { x: 70, y: 80, button: "left", target: { password: true } }),
];
let counter = 0;
const ids = () => `id${++counter}`;

test("only the clicks the author kept become pictures, in the order the clicks were made", () => {
  counter = 0;
  const kept = picturesFromReview(
    shots,
    [{ keep: true, description: "The Save button" }, { keep: false, description: "ignored" }, { keep: true, description: "" }, { keep: true, description: "A password box" }],
    ids, "2026-10-19T12:00:00Z",
  );
  assert.deepEqual(kept.pictures.map((p) => p.id), ["id1", "id2", "id3"]);
  assert.deepEqual(kept.pictures.map((p) => p.click?.x), [10, 50, 70]);
  assert.deepEqual([...kept.files.keys()], ["images/id1.png", "images/id2.png", "images/id3.png"]);
  assert.deepEqual([...kept.files.get("images/id1.png")!], [1, 1, 1], "each file is its own click's picture");
  assert.deepEqual([...kept.files.get("images/id3.png")!], [4, 4, 4]);
});

test("a picture's description is only what the author wrote, trimmed, and empty when they wrote nothing", () => {
  counter = 0;
  const kept = picturesFromReview(shots.slice(0, 2), [{ keep: true, description: "  The Save button  " }, { keep: true, description: "   " }], ids, "t");
  assert.deepEqual(kept.pictures.map((p) => p.altText), ["The Save button", ""]);
});

test("each picture is a click picture with its click note beside it, its size, and the click in words as its name", () => {
  counter = 0;
  const kept = picturesFromReview(shots, shots.map(() => ({ keep: true, description: "x" })), ids, "2026-10-19T12:00:00Z");
  const [save, copy, double, password] = kept.pictures;
  assert.equal(save.source.kind, "click");
  assert.equal(save.source.capturedAt, "2026-10-19T12:00:00Z");
  assert.equal(save.source.originalName, 'Click on the button "Save" (access key Alt+S)');
  assert.equal(copy.source.originalName, 'Right-click on the menu item "Copy"');
  assert.equal(double.source.originalName, "Double-click at 50 across and 60 down");
  assert.equal(password.source.originalName, "Click on a password box");
  assert.deepEqual([save.width, save.height], [1920, 1080]);
  assert.deepEqual(save.click, shots[0].click);
  assert.deepEqual(password.click?.target, { password: true });
});

test("a click with no answer is not kept, and nothing kept gives nothing", () => {
  counter = 0;
  assert.equal(picturesFromReview(shots, [{ keep: true, description: "a" }], ids, "t").pictures.length, 1);
  const none = picturesFromReview(shots, shots.map(() => ({ keep: false, description: "a" })), ids, "t");
  assert.deepEqual([none.pictures.length, none.files.size], [0, 0]);
});

test("a picture that is a JPEG keeps that extension", () => {
  counter = 0;
  const kept = picturesFromReview([shot(1, { x: 1, y: 1, button: "left" }, "jpg")], [{ keep: true, description: "" }], ids, "t");
  assert.equal(kept.pictures[0].file, "images/id1.jpg");
});

test("what is said after OK, and the question before throwing clicks away", () => {
  assert.equal(addedWords(3, 3), "Added 3 click pictures.");
  assert.equal(addedWords(1, 1), "Added 1 click picture.");
  assert.equal(addedWords(2, 5), "Added 2 of 5 click pictures. The others were left out.");
  assert.equal(addedWords(0, 4), "No click pictures were added. Your project was not changed.");
  assert.equal(discardQuestion(1), "Throw away the click you captured? Nothing will be added to your project.");
  assert.equal(discardQuestion(7), "Throw away the 7 clicks you captured? Nothing will be added to your project.");
});
