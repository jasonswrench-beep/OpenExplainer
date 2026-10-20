import test from "node:test";
import assert from "node:assert/strict";
import {
  addCallout, addCalloutFromClick, calloutFromClick, checkCalloutInput, cleanCallouts, cleanTreeCallouts, clipToPicture, entries, entryWords, letterFor, markerRadius,
  moveCallout, placeMarker, removeCallout, shapesFor, type Callout, type CalloutInput,
} from "../src/project/callouts.ts";
import { addNode, addPicture, createProject, CURRENT_VERSION, type Picture } from "../src/project/model.ts";
import { fromFiles, toFiles } from "../src/project/files.ts";
import { migrate } from "../src/project/migrate.ts";

const size = { width: 1920, height: 1080 };
const picture = (extra: Partial<Picture> = {}): Picture => ({
  id: "p1", file: "images/p1.png", ...size, altText: "", source: { kind: "click", capturedAt: "t" },
  click: { x: 196, y: 453, button: "left", target: { role: "button", name: "Save", bounds: { x: 121, y: 431, width: 150, height: 44 } } }, ...extra,
});
const callout = (id: string, extra: Partial<Callout> = {}): Callout => ({ id, name: "Save", description: "Saves your work.", target: { x: 100, y: 100, width: 150, height: 40 }, marker: { x: 80, y: 80 }, ...extra });

test("letters run A to Z and then AA, AB and so on, never numbers", () => {
  assert.deepEqual([0, 1, 2, 25].map(letterFor), ["A", "B", "C", "Z"]);
  assert.deepEqual([26, 27, 51, 52, 701, 702].map(letterFor), ["AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
});

test("a marker is the same size on a picture of any width, and never tiny", () => {
  assert.equal(markerRadius(1920), 23);
  assert.equal(markerRadius(800), 10);
  assert.equal(markerRadius(100), 10);
  assert.ok(markerRadius(3840) > markerRadius(1920));
});

test("a rectangle is cut to the picture, and one that is wholly off it is nothing", () => {
  assert.deepEqual(clipToPicture({ x: -10, y: -10, width: 50, height: 50 }, size), { x: 0, y: 0, width: 40, height: 40 });
  assert.deepEqual(clipToPicture({ x: 1900, y: 1000, width: 100, height: 200 }, size), { x: 1900, y: 1000, width: 20, height: 80 });
  assert.equal(clipToPicture({ x: 3000, y: 0, width: 10, height: 10 }, size), null);
  assert.equal(clipToPicture({ x: 5, y: 5, width: 0, height: 10 }, size), null);
});

test("a marker goes just outside its item, above and to the left when there is room", () => {
  const at = placeMarker({ x: 400, y: 300, width: 150, height: 40 }, size);
  const r = markerRadius(size.width);
  assert.deepEqual(at, { x: 400 - (r + 6), y: 300 - (r + 6) });
});

test("a marker keeps off the picture's edge and off other markers", () => {
  const r = markerRadius(size.width);
  const corner = placeMarker({ x: 0, y: 0, width: 60, height: 30 }, size);
  assert.ok(corner.x - r >= 0 && corner.y - r >= 0, "an item in the corner gets its marker on the picture");
  const first = placeMarker({ x: 400, y: 300, width: 150, height: 40 }, size);
  const second = placeMarker({ x: 400, y: 300, width: 150, height: 40 }, size, [first]);
  assert.notDeepEqual(second, first);
  assert.ok(Math.hypot(second.x - first.x, second.y - first.y) >= 2 * r + 4, "the second one does not sit on the first");
  const far = placeMarker({ x: 1900, y: 1060, width: 20, height: 20 }, size);
  assert.ok(far.x + r <= size.width && far.y + r <= size.height, "an item at the far corner too");
});

test("a click picture gets a callout for the clicked item, with its name and outline and an empty sentence", () => {
  const made = calloutFromClick(picture())!;
  assert.equal(made.name, "Save");
  assert.equal(made.description, "");
  assert.deepEqual(made.target, { x: 121, y: 431, width: 150, height: 44 });
  assert.ok(made.id.length > 3);
  const r = markerRadius(size.width);
  assert.ok(made.marker.x >= r && made.marker.y >= r && made.marker.x <= size.width - r, "the marker is on the picture");
  assert.ok(made.marker.x < 121 && made.marker.y < 431, "above and to the left of the item");
});

test("an item whose name is not kept still gets a callout, with no name yet", () => {
  const p = picture({ click: { x: 5, y: 5, button: "left", target: { role: "list item", bounds: { x: 10, y: 10, width: 100, height: 20 } } } });
  assert.equal(calloutFromClick(p)!.name, "");
});

test("no callout is made for a password box, a click with no outline, or an outline off the picture", () => {
  assert.equal(calloutFromClick(picture({ click: { x: 1, y: 1, button: "left", target: { password: true } } })), null);
  assert.equal(calloutFromClick(picture({ click: { x: 1, y: 1, button: "left", target: { role: "button", name: "x" } } })), null);
  assert.equal(calloutFromClick(picture({ click: { x: 1, y: 1, button: "left" } })), null);
  assert.equal(calloutFromClick(picture({ click: { x: 1, y: 1, button: "left", target: { role: "button", bounds: { x: 5000, y: 5000, width: 10, height: 10 } } } })), null);
  assert.equal(calloutFromClick({ ...size }), null, "a picture with no click at all");
});

test("making a callout from the click twice does not add the same one again", () => {
  const p = picture();
  assert.ok(addCalloutFromClick(p));
  assert.equal(addCalloutFromClick(p), null);
  assert.equal(p.callouts!.length, 1);
  const a = p.callouts![0];
  const other = picture({ click: { x: 1, y: 1, button: "left", target: { role: "button", name: "Open", bounds: { x: 121, y: 431, width: 150, height: 44 } } }, callouts: [a] });
  assert.equal(addCalloutFromClick(other), null, "the same outline is the same item");
});

test("a second callout's marker keeps clear of the first", () => {
  const p = picture();
  addCalloutFromClick(p);
  p.click = { x: 140, y: 440, button: "left", target: { role: "button", name: "Open", bounds: { x: 140, y: 431, width: 100, height: 44 } } };
  const second = addCalloutFromClick(p)!;
  assert.ok(Math.hypot(second.marker.x - p.callouts![0].marker.x, second.marker.y - p.callouts![0].marker.y) >= 2 * markerRadius(size.width));
});

test("callouts are added, removed and moved, and moving one changes the letters of its neighbours", () => {
  const p = picture({ click: undefined });
  addCallout(p, callout("a", { name: "First" }));
  addCallout(p, callout("b", { name: "Second" }));
  addCallout(p, callout("c", { name: "Third" }));
  assert.deepEqual(entries(p).map((e) => `${e.letter}:${e.name}`), ["A:First", "B:Second", "C:Third"]);
  assert.equal(moveCallout(p, "c", -1), true);
  assert.deepEqual(entries(p).map((e) => `${e.letter}:${e.name}`), ["A:First", "B:Third", "C:Second"]);
  assert.equal(moveCallout(p, "a", -1), false);
  assert.equal(moveCallout(p, "b", 1), false, "the last one cannot move down");
  assert.equal(moveCallout(p, "c", 1), true, "c is no longer last");
  assert.equal(moveCallout(p, "c", -1), true);
  assert.equal(moveCallout(p, "nope", 1), false);
  assert.equal(removeCallout(p, "a"), true);
  assert.deepEqual(entries(p).map((e) => `${e.letter}:${e.name}`), ["A:Third", "B:Second"], "deleting re-letters the rest");
  assert.equal(removeCallout(p, "nope"), false);
  removeCallout(p, "b"); removeCallout(p, "c");
  assert.equal("callouts" in p, false, "no callouts left means no list");
});

test("an entry under the picture is its letter, name and sentence, and says what is missing", () => {
  const p = picture({ callouts: [callout("a"), callout("b", { name: "", description: "Does a thing." }), callout("c", { name: "Close", description: "" }), callout("d", { name: " ", description: " " })] });
  assert.deepEqual(entries(p).map(entryWords), [
    "A. Save: Saves your work.",
    "B. needs a name: Does a thing.",
    "C. Close: needs a description.",
    "D. needs a name: needs a description.",
  ]);
  const flags = entries(p).map((e) => [e.needsName, e.needsDescription]);
  assert.deepEqual(flags, [[false, false], [true, false], [false, true], [true, true]]);
});

test("a leader line runs from the edge of the marker to the nearest part of the item", () => {
  const p = picture({ callouts: [callout("a", { target: { x: 400, y: 300, width: 100, height: 40 }, marker: { x: 300, y: 320 } })] });
  const [shape] = shapesFor(p);
  const r = markerRadius(size.width);
  assert.equal(shape.letter, "A");
  assert.deepEqual(shape.marker, { cx: 300, cy: 320, r });
  assert.deepEqual(shape.line, { x1: 300 + r, y1: 320, x2: 400, y2: 320 }, "straight across to the left edge of the item");
  assert.deepEqual(shape.rect, { x: 400, y: 300, width: 100, height: 40 });
  assert.ok(shape.stroke >= 2);
});

test("the line runs to a corner when the marker is diagonal, and there is none when the marker is on the item", () => {
  const diag = shapesFor(picture({ callouts: [callout("a", { target: { x: 400, y: 300, width: 100, height: 40 }, marker: { x: 340, y: 240 } })] }))[0];
  assert.deepEqual([diag.line!.x2, diag.line!.y2], [400, 300]);
  const on = shapesFor(picture({ callouts: [callout("a", { target: { x: 400, y: 300, width: 100, height: 40 }, marker: { x: 420, y: 310 } })] }))[0];
  assert.equal(on.line, null);
  const inside = shapesFor(picture({ callouts: [callout("a", { target: { x: 100, y: 100, width: 400, height: 300 }, marker: { x: 130, y: 250 } })] }))[0];
  assert.equal(inside.line, null, "a marker inside a big item needs no line either");
  assert.deepEqual(shapesFor(picture()), []);
});

test("the callout boxes are checked, and a mistake is explained in plain words and says which box", () => {
  const good: CalloutInput = { name: " Save ", description: " Saves it. ", left: "100", top: "50", width: "150", height: "40", markerX: "80", markerY: "30" };
  const ok = checkCalloutInput(good, size);
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.callout, { name: "Save", description: "Saves it.", target: { x: 100, y: 50, width: 150, height: 40 }, marker: { x: 80, y: 30 } });
  const cases: [Partial<CalloutInput>, string, RegExp][] = [
    [{ left: "abc" }, "left", /Type how far across the item starts as a whole number from 0 to 1919, such as 960\. "abc" is not one\./],
    [{ top: "" }, "top", /^Type how far down the item starts as a whole number from 0 to 1079, such as 540\.$/],
    [{ width: "0" }, "width", /The picture is 1920 by 1080 pixels\. Type the item's width as a number from 1 to 1920\./],
    [{ height: "-4" }, "height", /"-4" is not one/],
    [{ left: "1900", width: "100" }, "width", /reaches past the right edge of the picture, which is 1920 pixels wide\. Make the width 20 or less/],
    [{ top: "1050", height: "100" }, "height", /reaches past the bottom of the picture, which is 1080 pixels high\. Make the height 30 or less/],
    [{ markerX: "2000" }, "markerX", /Type how far across the marker is as a number from 0 to 1920\./],
    [{ markerY: "x" }, "markerY", /"x" is not one/],
    [{ name: "n".repeat(301) }, "name", /A name can be at most 300 letters\. This one has 301\./],
    [{ description: "d".repeat(301) }, "description", /A sentence can be at most 300 letters/],
  ];
  for (const [change, field, pattern] of cases) {
    const checked = checkCalloutInput({ ...good, ...change }, size);
    assert.ok(!checked.ok, JSON.stringify(change).slice(0, 60));
    if (!checked.ok) { assert.equal(checked.field, field); assert.match(checked.message, pattern); }
  }
});

test("callouts read from a file keep only what belongs, cut to the picture", () => {
  const raw = [
    { id: "a", name: "  Save\n now ", description: "x".repeat(400), target: { x: 10.4, y: 20.6, width: 100, height: 50 }, marker: { x: 5, y: 5 } },
    { id: "b", name: "Off", target: { x: 5000, y: 5000, width: 10, height: 10 }, marker: { x: 1, y: 1 } },
    { id: "c", name: "No marker", target: { x: 1, y: 1, width: 10, height: 10 } },
    { id: "a", name: "Same id", target: { x: 30, y: 30, width: 10, height: 10 }, marker: { x: 9000, y: -9 } },
    "junk", null,
  ];
  const clean = cleanCallouts(raw, size);
  assert.equal(clean.length, 2);
  assert.equal(clean[0].name, "Save now");
  assert.equal(clean[0].description.length, 300);
  assert.deepEqual(clean[0].target, { x: 10, y: 21, width: 100, height: 50 });
  assert.notEqual(clean[1].id, "a", "a second callout with the same id gets its own");
  assert.deepEqual(clean[1].marker, { x: 1920, y: 0 }, "a marker is kept on the picture");
  assert.deepEqual(cleanCallouts("nope", size), []);
});

test("callouts are saved with their picture and come back, and a picture with none has no list", () => {
  const p = createProject("Book");
  const topic = addNode(p.tree, null, "Topic");
  addPicture(p.tree, topic.id, picture({ callouts: [callout("a"), callout("b", { name: "Open", marker: { x: 300, y: 90 } })] }));
  addPicture(p.tree, topic.id, picture({ id: "p2", file: "images/p2.png", click: undefined }));
  const back = fromFiles(toFiles(p));
  assert.deepEqual(back.tree[0].pictures[0].callouts, p.tree[0].pictures[0].callouts);
  assert.equal("callouts" in back.tree[0].pictures[1], false);
  assert.equal(back.version, CURRENT_VERSION);
  assert.ok(CURRENT_VERSION >= 6);
});

test("a version 5 project opens with no callouts, and bad callouts in a file are put right on opening", () => {
  const v5 = { version: 5, name: "Old", template: "empty", variables: {}, tree: [{ id: "a", title: "A", status: "captured", children: [], pictures: [{ ...picture(), callouts: undefined }] }] };
  const up = migrate(JSON.parse(JSON.stringify(v5)));
  assert.equal(up.version, CURRENT_VERSION);
  assert.equal("callouts" in up.tree[0].pictures[0], false);
  const dirty = { ...v5, version: CURRENT_VERSION, tree: [{ id: "a", title: "A", status: "captured", children: [], pictures: [{ ...picture(), callouts: [{ id: "x", name: "Ok", description: "", target: { x: 5, y: 5, width: 20, height: 20 }, marker: { x: 2, y: 2 } }, { id: "y", target: "bad" }] }] }] };
  assert.equal(migrate(dirty).tree[0].pictures[0].callouts!.length, 1);
  assert.equal(cleanTreeCallouts([{ pictures: [{ ...picture(), callouts: [] }], children: [] }])[0].pictures![0].callouts, undefined);
});
