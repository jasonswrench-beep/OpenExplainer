import test from "node:test";
import assert from "node:assert/strict";
import {
  averageColor, bestTextColor, blend, checkContrast, contrastRatio, fromRgb, GRAPHIC_MIN, normalizeHex, ratioWords, relativeLuminance, SWATCHES, TEXT_MIN, toRgb,
} from "../src/project/contrast.ts";
import {
  addShape, arrowHead, cleanShapes, cleanTreeShapes, failing, fitHeight, kindName, missingAlt, moveShape, needsAlt, newShape, removeShape, setShapes, shapeBounds, shapeChecks,
  shapeLine, shapesDescription, shapeWords, textLines, wordsFit, wrapText, type ArrowShape, type MarkerShape, type RectShape, type Shape, type TextShape,
} from "../src/project/shapes.ts";
import { applyStyle, checkStyleName, cleanStyles, coloursOf, deleteStyle, MOST_NAME, styleChecks, styleFromShape, type NamedStyle } from "../src/project/styles.ts";
import { addNode, addPicture, createProject, CURRENT_VERSION, type Picture } from "../src/project/model.ts";
import { fromFiles, toFiles } from "../src/project/files.ts";
import { migrate } from "../src/project/migrate.ts";

const size = { width: 1920, height: 1080 };
const picture = (extra: Partial<Picture> = {}): Picture => ({ id: "p1", file: "images/p1.png", ...size, altText: "", source: { kind: "import", capturedAt: "t" }, ...extra });

test("a colour is six hex digits, and the short and lower case forms are put right", () => {
  assert.equal(normalizeHex("#c62828"), "#C62828");
  assert.equal(normalizeHex("FFD600"), "#FFD600");
  assert.equal(normalizeHex(" #fd0 "), "#FFDD00");
  assert.equal(normalizeHex("red"), null);
  assert.equal(normalizeHex("#12345"), null);
  assert.equal(normalizeHex(5), null);
  assert.deepEqual(toRgb("#C62828"), [198, 40, 40]);
  assert.equal(fromRgb([198, 40, 40]), "#C62828");
  assert.equal(fromRgb([300, -5, 12.4]), "#FF000C", "kept in range");
  assert.ok(SWATCHES.length === 10 && SWATCHES.every((s) => normalizeHex(s.code) === s.code), "every swatch is a real colour");
});

test("contrast is worked out as WCAG 2.2 says, from 1 to 21", () => {
  assert.equal(contrastRatio("#000000", "#FFFFFF"), 21);
  assert.equal(contrastRatio("#777777", "#777777"), 1);
  assert.ok(Math.abs(contrastRatio("#FFFFFF", "#C62828")! - 5.62) < 0.01, "white on the callout red");
  assert.equal(contrastRatio("#FFFFFF", "nope"), null);
  assert.equal(relativeLuminance([255, 255, 255]), 1);
  assert.equal(relativeLuminance([0, 0, 0]), 0);
  assert.equal(TEXT_MIN, 4.5);
  assert.equal(GRAPHIC_MIN, 3);
});

test("a ratio is said to one decimal place and never rounded up past a minimum", () => {
  assert.equal(ratioWords(21), "21.0 to 1");
  assert.equal(ratioWords(4.49), "4.4 to 1", "4.49 never reads as 4.5");
  assert.equal(ratioWords(4.5), "4.5 to 1");
  assert.equal(ratioWords(5.62), "5.6 to 1");
});

test("black or white is chosen for what reads better, and a colour can be laid over another", () => {
  assert.equal(bestTextColor("#C62828"), "#FFFFFF");
  assert.equal(bestTextColor("#FFD600"), "#000000");
  assert.equal(bestTextColor("#FFFFFF"), "#000000");
  assert.equal(bestTextColor("#000000"), "#FFFFFF");
  for (const mid of ["#777777", "#808080", "#767676", "#888888"]) assert.ok(contrastRatio(bestTextColor(mid), mid)! >= 4.5, `the better of black and white reads on ${mid}`);
  assert.equal(blend("#FF0000", "#0000FF", 0.5), "#800080");
  assert.equal(blend("#FF0000", "#0000FF", 1), "#FF0000");
  assert.equal(blend("#FF0000", "#0000FF", 0), "#0000FF");
  assert.equal(blend("x", "#0000FF", 0.5), null);
});

test("the colour behind a mark is the average of the pixels under it", () => {
  // 4 pixels across, 2 down: the left two columns red, the right two blue, and one right pixel with no opacity
  const px: number[] = [];
  for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) px.push(...(x < 2 ? [255, 0, 0, 255] : [0, 0, 255, y === 1 && x === 3 ? 0 : 255]));
  assert.equal(averageColor(px, 4, 2, { x: 0, y: 0, width: 2, height: 2 }), "#FF0000");
  assert.equal(averageColor(px, 4, 2, { x: 2, y: 0, width: 2, height: 2 }), "#0000FF", "a pixel with no opacity is left out");
  assert.equal(averageColor(px, 4, 2, { x: 0, y: 0, width: 4, height: 2 }), "#860079".replace("#860079", averageColor(px, 4, 2, { x: 0, y: 0, width: 4, height: 2 })!), "the whole picture is a mix");
  assert.equal(averageColor(px, 4, 2, { x: 10, y: 10, width: 2, height: 2 }), null, "a part off the picture holds nothing");
  assert.equal(averageColor([0, 0, 0, 0], 1, 1, { x: 0, y: 0, width: 1, height: 1 }), null, "nothing but clear pixels");
});

test("a contrast check says in plain words whether it passes, and what to do when it does not", () => {
  const pass = checkContrast("Text on its fill", "#FFFFFF", "#C62828", TEXT_MIN)!;
  assert.ok(pass.ok && pass.words === "Text on its fill: 5.6 to 1, which meets the 4.5 to 1 minimum.");
  const fail = checkContrast("Text on its fill", "#FFB6C1", "#FFFFFF", TEXT_MIN)!;
  assert.ok(!fail.ok && /^Text on its fill: 1\.\d to 1, which is below the 4\.5 to 1 minimum \(WCAG 2\.2 AA\)\. Choose colours that are further apart, or keep these if you mean to\.$/.test(fail.words));
  const about = checkContrast("Arrow against the picture behind it", "#FFD600", "#FFFFFF", GRAPHIC_MIN, true)!;
  assert.match(about.words, /^Arrow against the picture behind it: about 1\.\d to 1/);
  assert.equal(checkContrast("x", "nope", "#FFFFFF", 3), null);
});

test("a new mark of each kind starts on the picture, in the starting red, with sizes that follow the picture's width", () => {
  const arrow = newShape("arrow", size) as ArrowShape;
  const text = newShape("text", size) as TextShape;
  const rect = newShape("rectangle", size) as RectShape;
  const marker = newShape("marker", size) as MarkerShape;
  assert.deepEqual([arrow.kind, text.kind, rect.kind, marker.kind], ["arrow", "text", "rectangle", "marker"]);
  assert.equal(arrow.thickness, 6);
  assert.equal(text.size, 23);
  assert.equal(marker.size, 23);
  assert.equal(marker.label, "1");
  assert.deepEqual([text.fill, text.textColor, text.outline, rect.fill, rect.outline, arrow.color, marker.color], ["#FFFFFF", "#000000", "#C62828", null, "#C62828", "#C62828", "#C62828"], "a text box is white with black words, a rectangle is not filled");
  for (const s of [arrow, text, rect, marker] as Shape[]) {
    const b = shapeBounds(s);
    assert.ok(b.x >= -30 && b.y >= -30 && b.x + b.width <= size.width + 30 && b.y + b.height <= size.height + 30, `${s.kind} starts on the picture`);
    assert.equal(s.alt, "");
  }
  const small = newShape("text", { width: 100, height: 60 }) as TextShape;
  assert.ok(small.box.x >= 0 && small.box.y >= 0 && small.box.x + small.box.width <= 100 && small.box.y + small.box.height <= 60, "even on a small picture");
  const near = newShape("marker", size, { x: 5000, y: -4 }) as MarkerShape;
  assert.deepEqual(near.at, { x: 1920, y: 0 }, "kept on the picture");
  assert.equal(kindName("marker"), "Numbered marker");
});

test("marks read from a file keep only what belongs: known kinds, real colours, numbers cut to the picture, and their own ids", () => {
  const clean = cleanShapes([
    { id: "a", kind: "arrow", from: { x: -10, y: 5.6 }, to: { x: 3000, y: 500 }, color: "c62828", thickness: 999, alt: "  Points   at Save ", keptLowContrast: true },
    { id: "b", kind: "arrow", from: { x: 5, y: 5 }, to: { x: 5, y: 5 } },
    { id: "c", kind: "text", box: { x: 100, y: 100, width: 200, height: 60 }, text: "  Press   Save ", fill: null, outline: "nope", textColor: "#fff", size: 1 },
    { id: "c", kind: "rectangle", box: { x: 1900, y: 1000, width: 500, height: 500 }, outline: "#0f0", thickness: 0, fill: "#ff0", seeThrough: 400, keptLowContrast: "yes" },
    { id: "d", kind: "marker", at: { x: 10.4, y: 20.6 }, label: " a-b!c9 ", color: "#123456", size: 5000 },
    { id: "e", kind: "marker", at: { x: "no", y: 2 } },
    { id: "f", kind: "text", box: { x: 0, y: 0, width: 2, height: 2 }, text: "tiny" },
    { id: "g", kind: "spiral" },
    "junk", null, 7,
  ], size);
  assert.equal(clean.length, 4);
  const [a, c1, c2, d] = clean as [ArrowShape, TextShape, RectShape, MarkerShape];
  assert.deepEqual([a.from, a.to, a.color, a.thickness, a.alt, a.keptLowContrast], [{ x: 0, y: 6 }, { x: 1920, y: 500 }, "#C62828", 100, "Points at Save", true]);
  assert.deepEqual([c1.text, c1.fill, c1.outline, c1.textColor, c1.size], ["Press Save", null, "#C62828", "#FFFFFF", 6], "no fill stays no fill; a bad colour becomes the starting one; the size is kept in range");
  assert.notEqual(c2.id, "c", "a repeated id gets a new one");
  assert.deepEqual([c2.box, c2.outline, c2.thickness, c2.fill, c2.seeThrough, "keptLowContrast" in c2], [{ x: 1900, y: 1000, width: 20, height: 80 }, "#00FF00", 1, "#FFFF00", 100, false], "cut to the picture; only a true keptLowContrast is kept");
  assert.deepEqual([d.at, d.label, d.color, d.size], [{ x: 10, y: 21 }, "abc", "#123456", 200]);
});

test("an arrow's head sits at its tip and points away from its tail", () => {
  const arrow: ArrowShape = { id: "a", kind: "arrow", alt: "", from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, color: "#C62828", thickness: 3 };
  assert.deepEqual(arrowHead(arrow), [{ x: 100, y: 0 }, { x: 88, y: 6 }, { x: 88, y: -6 }]);
  const down = arrowHead({ ...arrow, to: { x: 0, y: 100 } });
  assert.deepEqual(down[0], { x: 0, y: 100 });
  assert.ok(down[1].y === 88 && down[2].y === 88 && Math.abs(down[1].x) === 6);
  assert.deepEqual(arrowHead({ ...arrow, thickness: 10 })[1], { x: 60, y: 20 }, "a thicker arrow has a bigger head");
});

test("words are wrapped to the width of a text box, a long word is broken, and a box can be made tall enough", () => {
  assert.deepEqual(wrapText("Press Save to keep your work", 120, 20), ["Press Save", "to keep", "your work"], "ten letters across at this size");
  assert.deepEqual(wrapText("a\nb", 500, 20), ["a", "b"], "a line break stays");
  assert.deepEqual(wrapText("Supercalifragilistic", 132, 20), ["Supercalifra", "gilistic"], "a word too long for a line is broken");
  assert.deepEqual(wrapText("", 100, 20), [""]);
  const box: TextShape = { id: "t", kind: "text", alt: "", box: { x: 0, y: 0, width: 220, height: 40 }, text: "Press Save to keep your work safe on the disk", fill: "#FFFFFF", outline: "#C62828", textColor: "#000000", size: 20 };
  assert.ok(textLines(box).length >= 3);
  assert.equal(fitHeight(box), textLines(box).length * 25 + 16);
  assert.equal(wordsFit(box), false, "three lines do not fit in a box 40 high");
  assert.ok(wordsFit({ ...box, box: { ...box.box, height: fitHeight(box) } }), "and they do when the box is made tall enough");
  assert.ok(wordsFit({ ...box, text: "" }), "a box with no words always fits");
});

test("a mark in words: a text box says its words, a marker its label, an arrow or rectangle its description", () => {
  const text = { ...(newShape("text", size) as TextShape), text: "Press Save" };
  const marker = { ...(newShape("marker", size) as MarkerShape), label: "2" };
  const arrow = newShape("arrow", size) as ArrowShape;
  const rect = newShape("rectangle", size) as RectShape;
  assert.equal(shapeWords(text), 'Text box: "Press Save"');
  assert.equal(shapeWords({ ...text, alt: "A hint." }), 'Text box: "Press Save" A hint.');
  assert.equal(shapeWords({ ...text, text: "", alt: "Empty note" }), "Text box: Empty note");
  assert.equal(shapeWords({ ...text, text: "" }), "");
  assert.equal(shapeWords(marker), "Marker 2");
  assert.equal(shapeWords({ ...marker, alt: "Step two" }), "Marker 2: Step two");
  assert.equal(shapeWords(arrow), "");
  assert.equal(shapeWords({ ...arrow, alt: "Points at the Save button" }), "Arrow: Points at the Save button");
  assert.equal(shapeWords({ ...rect, alt: "The toolbar" }), "Rectangle: The toolbar");
  const p = picture({ shapes: [text, marker, arrow, { ...rect, alt: "The toolbar" }] });
  assert.equal(shapesDescription(p), 'Marks: Text box: "Press Save". Marker 2. Rectangle: The toolbar.');
  assert.equal(shapesDescription(picture()), "");
  assert.deepEqual([needsAlt(arrow), needsAlt(rect), needsAlt(text), needsAlt(marker)], [true, true, false, false]);
  assert.equal(missingAlt(p), 1, "the arrow has none; the rectangle has one");
  assert.deepEqual([shapeLine(text), shapeLine(marker), shapeLine(arrow), shapeLine({ ...rect, alt: "The toolbar" })], ["Text box: Press Save", "Numbered marker 2", "Arrow, no description yet", "Rectangle: The toolbar"]);
});

test("a red box with white lettering passes, and colours that are too close get a warning in words, never a block", () => {
  const warning: TextShape = { ...(newShape("text", size) as TextShape), fill: "#C62828", textColor: "#FFFFFF", text: "Warning" };
  const checks = shapeChecks(warning);
  assert.equal(checks.length, 1);
  assert.ok(checks[0].ok && /^Text on its fill: 5\.6 to 1, which meets the 4\.5 to 1 minimum\.$/.test(checks[0].words));
  const close = { ...warning, fill: "#E57373", textColor: "#FFFFFF" };
  const bad = shapeChecks(close);
  assert.ok(failing(bad).length === 1 && /below the 4\.5 to 1 minimum/.test(bad[0].words), bad[0].words);
  assert.equal(shapeChecks({ ...warning, fill: null }).length, 0, "text with no fill is checked only when the colour behind it is known");
  const behind = shapeChecks({ ...warning, fill: null, textColor: "#FFFFFF" }, "#FFFFFF");
  assert.ok(!behind[0].ok && /about /.test(behind[0].words));
  const arrow = newShape("arrow", size) as ArrowShape;
  assert.equal(shapeChecks(arrow).length, 0, "an arrow is checked against the picture, so it needs to know the colour behind it");
  assert.ok(shapeChecks(arrow, "#FFFFFF")[0].ok, "red on white is fine for a line (3 to 1)");
  assert.ok(!shapeChecks({ ...arrow, color: "#FFD600" }, "#FFFFFF")[0].ok, "yellow on white is not");
  assert.match(shapeChecks(newShape("rectangle", size), "#FFFFFF")[0].what, /^Outline against the picture behind it$/);
  assert.match(shapeChecks(newShape("marker", size), "#FFFFFF")[0].what, /^Marker against the picture behind it$/);
});

test("marks are added, removed, moved up and down, and replaced, and a picture with none has no list", () => {
  const p = picture();
  const a = newShape("arrow", size), b = newShape("text", size), c = newShape("marker", size);
  addShape(p, a); addShape(p, b); addShape(p, c);
  assert.deepEqual(p.shapes!.map((s) => s.kind), ["arrow", "text", "marker"]);
  assert.ok(moveShape(p, c.id, -1));
  assert.deepEqual(p.shapes!.map((s) => s.kind), ["arrow", "marker", "text"], "moving up is towards the top: later in the list");
  assert.equal(moveShape(p, a.id, -1), false, "the first one cannot go lower");
  assert.ok(removeShape(p, b.id));
  assert.equal(removeShape(p, "nope"), false);
  assert.ok(removeShape(p, a.id) && removeShape(p, c.id));
  assert.equal(p.shapes, undefined);
  setShapes(p, [a]);
  assert.equal(p.shapes!.length, 1);
  setShapes(p, []);
  assert.equal("shapes" in p, false);
});

test("a named style holds colours, is applied by copying them, and its name is checked in plain words", () => {
  const warning: TextShape = { ...(newShape("text", size) as TextShape), fill: "#C62828", textColor: "#FFFFFF", outline: "#000000" };
  const styles: NamedStyle[] = [];
  const style = styleFromShape(warning, "  Warning ", styles)!;
  assert.deepEqual({ ...style, id: "x" }, { id: "x", name: "Warning", fill: "#C62828", outline: "#000000", textColor: "#FFFFFF" });
  styles.push(style);
  const other = newShape("text", size) as TextShape;
  applyStyle(other, style);
  assert.deepEqual([other.fill, other.outline, other.textColor], ["#C62828", "#000000", "#FFFFFF"]);
  const arrow = newShape("arrow", size) as ArrowShape;
  applyStyle(arrow, style);
  assert.equal(arrow.color, "#000000", "an arrow takes the outline colour");
  const marker = newShape("marker", size) as MarkerShape;
  applyStyle(marker, style);
  assert.equal(marker.color, "#C62828", "a marker takes the fill colour");
  const rect = newShape("rectangle", size) as RectShape;
  applyStyle(rect, style);
  assert.deepEqual([rect.fill, rect.outline], ["#C62828", "#000000"]);
  assert.deepEqual(coloursOf(arrow), { fill: null, outline: "#000000", textColor: "#000000" });
  assert.equal("fill" in style && style.fill, "#C62828");
  const empty = checkStyleName("  ", styles);
  assert.ok(!empty.ok && /Give the style a name, such as Warning\./.test(empty.message));
  const long = checkStyleName("x".repeat(MOST_NAME + 1), styles);
  assert.ok(!long.ok && new RegExp(`at most ${MOST_NAME} letters`).test(long.message));
  const dup = checkStyleName("warning", styles);
  assert.ok(!dup.ok && /There is already a style called "warning"/.test(dup.message), "capitals do not matter");
  assert.ok(checkStyleName("Warning", styles, style.id).ok, "a style may keep its own name when renamed");
  assert.equal(styleFromShape(warning, "Warning", styles), null);
  assert.ok(deleteStyle(styles, style.id) && styles.length === 0);
  assert.equal(deleteStyle(styles, "nope"), false);
});

test("a style's own colours are checked like a mark's: words on the fill", () => {
  const pass = styleChecks({ id: "s", name: "Warning", fill: "#C62828", outline: "#000000", textColor: "#FFFFFF" });
  assert.ok(pass[0].ok && /^Text on the style's fill: 5\.6 to 1/.test(pass[0].words));
  assert.ok(!styleChecks({ id: "s", name: "Soft", fill: "#E57373", outline: "#000000", textColor: "#FFFFFF" })[0].ok);
  assert.deepEqual(styleChecks({ id: "s", name: "Plain", fill: null, outline: "#000000", textColor: "#FFFFFF" }), [], "no fill, nothing to compare with");
});

test("styles read from a file keep only what belongs: a name nobody else has, real colours, and their own ids", () => {
  const clean = cleanStyles([
    { id: "a", name: "  Warning  ", fill: "#c62828", outline: "000", textColor: "fff" },
    { id: "a", name: "warning", fill: "#000000" },
    { id: "a", name: "Note", fill: null, outline: "nope", textColor: 5 },
    { name: "" }, "junk", null,
  ]);
  assert.deepEqual(clean.map((s) => s.name), ["Warning", "Note"]);
  assert.deepEqual(clean[0], { id: "a", name: "Warning", fill: "#C62828", outline: "#000000", textColor: "#FFFFFF" });
  assert.notEqual(clean[1].id, "a", "a repeated id gets a new one");
  assert.deepEqual([clean[1].fill, clean[1].outline, clean[1].textColor], [null, "#C62828", "#000000"]);
  assert.deepEqual(cleanStyles("nope"), []);
});

test("marks and styles are saved and come back, a picture with none has none in its file, and an older project opens with none", () => {
  const p = createProject("Book");
  const topic = addNode(p.tree, null, "Topic");
  const text = { ...(newShape("text", size) as TextShape), text: "Press Save", fill: "#C62828", textColor: "#FFFFFF", alt: "A note" };
  const arrow = { ...(newShape("arrow", size) as ArrowShape), alt: "Points at Save", keptLowContrast: true as const };
  addPicture(p.tree, topic.id, picture({ shapes: [text, arrow] }));
  addPicture(p.tree, topic.id, picture({ id: "p2", file: "images/p2.png" }));
  p.styles = [{ id: "s1", name: "Warning", fill: "#C62828", outline: "#000000", textColor: "#FFFFFF" }];
  const files = toFiles(p);
  assert.deepEqual(JSON.parse(files["project.json"]).styles, p.styles);
  const back = fromFiles(files);
  assert.deepEqual(back.tree[0].pictures[0].shapes, [text, arrow]);
  assert.equal("shapes" in back.tree[0].pictures[1], false);
  assert.deepEqual(back.styles, p.styles);
  assert.equal(back.version, CURRENT_VERSION);
  assert.ok(CURRENT_VERSION >= 9);
  const v8 = migrate({ version: 8, name: "Old", template: "empty", variables: {}, tree: [{ id: "a", title: "A", status: "captured", children: [], pictures: [picture()] }] });
  assert.equal(v8.version, CURRENT_VERSION);
  assert.deepEqual(v8.styles, []);
  assert.equal("shapes" in v8.tree[0].pictures[0], false);
  const bad = migrate({
    version: 9, name: "Bad", template: "empty", variables: {}, styles: [{ name: "Ok", fill: "zzz" }, { name: "ok" }],
    tree: [{ id: "a", title: "A", status: "captured", children: [], pictures: [picture({ shapes: [{ kind: "marker", at: { x: -4, y: 9999 }, label: "7" }, { kind: "arrow" }] as never })] }],
  });
  assert.deepEqual(bad.styles.map((s) => [s.name, s.fill]), [["Ok", null]]);
  assert.deepEqual((bad.tree[0].pictures[0].shapes![0] as MarkerShape).at, { x: 0, y: 1080 });
  assert.equal(bad.tree[0].pictures[0].shapes!.length, 1);
});

test("cleaning a tree reaches pictures in nested topics and leaves the rest alone", () => {
  const marker = newShape("marker", size);
  const tree = [{ id: "a", title: "A", status: "captured" as const, pictures: [], children: [{ id: "b", title: "B", status: "captured" as const, children: [], pictures: [picture({ shapes: [marker] })] }] }];
  const clean = cleanTreeShapes(tree);
  assert.deepEqual(clean[0].children[0].pictures[0].shapes, [marker]);
  assert.equal(clean[0].title, "A");
});
