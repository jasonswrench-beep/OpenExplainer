import test from "node:test";
import assert from "node:assert/strict";
import { addNode, addPicture, createProject, ensurePage, type Picture, type Project } from "../src/project/model.ts";
import { addBlock, makeBlock, type Step } from "../src/project/page.ts";
import { addComment } from "../src/project/comments.ts";
import { newGuide, setStepLayout, type Guide } from "../src/project/guides.ts";
import { renderGuide } from "../src/render/guide.ts";
import { altTextFor, type RenderContext } from "../src/render/html.ts";
import { overlayFor, STEP_MARKER_COLOR, stepMarkerAt } from "../src/render/overlay.ts";
import { checkContrast, GRAPHIC_MIN, TEXT_MIN } from "../src/project/contrast.ts";

const size = { width: 1920, height: 1080 };
const picture = (id: string, extra: Partial<Picture> = {}): Picture => ({ id, file: `images/${id}.png`, ...size, altText: "", source: { kind: "click", capturedAt: "t", originalName: `${id}.png` }, click: { x: 960, y: 540, button: "left" }, ...extra });
const step = (id: string, words: string, pictureId?: string, result?: string): Step => ({ id, text: [{ text: words }], ...(pictureId ? { pictureId } : {}), ...(result ? { result: [{ text: result }] } : {}) });

function setup(): { project: Project; guide: Guide; ids: Record<string, string> } {
  const project = createProject("Guide <book>");
  project.variables = { PRODUCT: "Acme Draw", VERSION: "", COMPANY: "" };
  const chapter = addNode(project.tree, null, "Saving");
  const save = addNode(project.tree, chapter.id, "Save a <file>");
  const empty = addNode(project.tree, chapter.id, "Nothing here");
  addPicture(project.tree, save.id, picture("a", { altText: "The File menu is open." }));
  addPicture(project.tree, save.id, picture("b"));
  addPicture(project.tree, save.id, picture("c", { click: undefined, altText: "A plain picture" }));
  addPicture(project.tree, save.id, picture("d", { view: { kind: "crop", x: 0, y: 0, width: 800, height: 450 }, click: { x: 1500, y: 900, button: "left" } }));
  const page = ensurePage(save);
  const para = makeBlock("paragraph"); (para as { text: unknown }).text = [{ text: "Book words that are not in the guide." }];
  const proc = makeBlock("procedure"); (proc as { steps: Step[] }).steps = [
    step("s1", "Open the menu in {{PRODUCT}}.", "a", "The menu opens."),
    step("s2", "Choose <b>Save</b>.", "b"),
    step("s3", "Look at the plain picture.", "c"),
    step("s4", "Look outside the crop.", "d"),
    step("s5", "No picture on this one."),
  ];
  const note = makeBlock("callout", { kind: "caution" }); (note as { text: unknown }).text = [{ text: "Save often." }];
  [para, proc, note].forEach((b) => addBlock(page, b));
  addComment(page, para.id, "SECRET comment words", "2026-10-21T10:00:00.000Z");
  const emptyPage = ensurePage(empty);
  const ep = makeBlock("paragraph"); (ep as { text: unknown }).text = [{ text: "Only words." }];
  addBlock(emptyPage, ep);
  const guide = newGuide("Saving <guide>", [save.id, empty.id]);
  return { project, guide, ids: { save: save.id, empty: empty.id } };
}

const context = (project: Project): RenderContext => ({ project, place: "book", notes: true, imageSrc: (p) => `images/${p.id}.png` });
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

test("a guide as HTML has its title, a sheet for each task, and each step with a heading, its picture and its words", () => {
  const { project, guide } = setup();
  const { html } = renderGuide(context(project), guide);
  assert.match(html, /<h1 class="gd-title">Saving &lt;guide&gt;<\/h1><h2 class="gd-task-title">Save a &lt;file&gt;<\/h2>/, "the title is on the first sheet, escaped");
  assert.equal(count(html, 'class="pv-sheet gd-sheet gd-task"'), 2, "a sheet for each task");
  assert.equal(count(html, "<h1"), 1, "the guide's title only once");
  for (const n of [1, 2, 3, 4, 5]) assert.ok(html.includes(`<h3 class="gd-step-heading">Step ${n}</h3>`), `Step ${n}`);
  assert.match(html, /<p class="gd-step-text">Open the menu in Acme Draw\.<\/p>/, "the variable is filled in");
  assert.match(html, /<p class="gd-step-text">Choose &lt;b&gt;Save&lt;\/b&gt;\.<\/p>/, "what was typed cannot add markup");
  assert.match(html, /<strong>Result:<\/strong> The menu opens\./);
  assert.match(html, /<aside class="pv-box pv-box-caution"[^>]*>.*Caution.*Save often\./, "the boxed note is in the guide");
  assert.ok(!html.includes("Book words that are not in the guide"), "the book's paragraphs are not");
  assert.ok(!html.includes("SECRET"), "no comments");
  assert.match(html, /<section class="gd-step gd-step-top gd-step-nopicture/, "a step with no picture has none");
  assert.ok(!html.includes("Only words"), "a task's loose paragraphs are not in it");
});

test("each step uses its own layout or the guide's, and the close-up goes with a whole picture that has a click", () => {
  const { project, guide } = setup();
  setStepLayout(guide, "s2", "left");
  let { html } = renderGuide(context(project), guide);
  assert.deepEqual([...html.matchAll(/<section class="gd-step gd-step-(top|left)/g)].map((m) => m[1]), ["top", "left", "top", "top", "top"]);
  assert.equal(count(html, 'class="gd-closeup"'), 1 + 1, "a close-up for the two whole pictures that have a click (a and b); not for c (no click) or d (the author's crop)");
  assert.match(html, /alt="Close-up of the clicked spot\. The File menu is open\."/, "the close-up says what it is");
  assert.match(html, /alt="Close-up of the clicked spot\. Choose &lt;b&gt;Save&lt;\/b&gt;\."/, "a picture with no description takes the words of its step");
  assert.match(html, /alt="A plain picture"/);
  assert.ok(!html.includes("This picture has no description yet"), "the step's words stand in as the description, so there is no note about it");
  guide.zoomFocus = false;
  html = renderGuide(context(project), guide).html;
  assert.equal(count(html, 'class="gd-closeup"'), 0, "no close-ups when the guide does not ask for them");
  guide.layout = "left";
  html = renderGuide(context(project), guide).html;
  assert.equal(count(html, "gd-step-left"), 5 - 0, "every step now follows the guide's layout");
});

test("the number of the step is drawn on the clicked spot, only where the click is shown, and it is never stored on the picture", () => {
  const { project, guide } = setup();
  const pictures = project.tree[0].children[0].pictures;
  const before = JSON.stringify(pictures);
  const { html } = renderGuide(context(project), guide);
  assert.equal(JSON.stringify(pictures), before, "the pictures are unchanged");
  const marks = [...html.matchAll(/<text [^>]*fill="#FFFFFF"[^>]*>(\d)<\/text>/g)].map((m) => m[1]);
  assert.ok(marks.includes("1") && marks.includes("2"), "steps 1 and 2 have their numbers on their pictures");
  assert.ok(!marks.includes("3"), "step 3's picture has no click");
  assert.ok(!marks.includes("4"), "step 4's click is outside its crop");
  assert.ok(html.includes(`fill="${STEP_MARKER_COLOR}"`));
  assert.ok(html.includes('fill="#FFD600"'), "a guide follows the quick-guide settings, so the click circle shows");
  assert.ok(!renderGuide({ ...context(project), notes: true }, newGuide("Empty")).html.includes("gd-step"), "an empty guide has no steps");
  const overlay = overlayFor(picture("x"), null, undefined, 3)!;
  assert.equal(overlay.parts.length, 2, "the marker is a circle and a number");
  // the click is at the middle (960, 540); the marker is 48 pixels in radius here, and sits 72 pixels up and to the left of the spot, clear of it
  assert.deepEqual([overlay.parts[0].attrs.cx, overlay.parts[0].attrs.cy, overlay.parts[1].text], [888, 468, "3"]);
  const gap = Math.hypot(960 - 888, 540 - 468);
  assert.ok(gap > 48, "the clicked spot is outside the marker, so it can be seen");
  assert.equal(overlayFor(picture("x"), null, undefined), null, "without a step number there is nothing to draw");
  assert.equal(overlayFor(picture("x", { click: undefined }), null, undefined, 3), null);
  assert.ok(checkContrast("step marker", "#FFFFFF", STEP_MARKER_COLOR, TEXT_MIN)!.ok && checkContrast("edge", STEP_MARKER_COLOR, "#FFFFFF", GRAPHIC_MIN)!.ok, "white number on the marker colour is readable");
});

test("a guide says in words what is missing, and a description falls back to the step's words only when the picture has none", () => {
  const { project, guide } = setup();
  const { notes } = renderGuide(context(project), guide);
  assert.ok(notes.some((n) => /Nothing here" has no numbered steps/.test(n)), notes.join(" | "));
  const none = renderGuide(context(project), newGuide("Empty"));
  assert.match(none.html, /This guide has no tasks yet/);
  assert.deepEqual(none.notes.length, 1);
  assert.ok(!renderGuide({ ...context(project), notes: false }, guide).html.includes("pv-note"), "notes are only for the preview");
  const p = picture("z", { altText: "Written" });
  assert.equal(altTextFor(p, "Step words"), "Written");
  assert.equal(altTextFor(picture("z"), "Step words"), "Step words");
  assert.equal(altTextFor(picture("z"), "  "), "");
});

test("a step's number goes above and to the left of the clicked spot, and below or to the right when there is no room that way", () => {
  const part = { x: 0, y: 0, width: 1000, height: 800 };
  assert.deepEqual(stepMarkerAt({ x: 500, y: 400 }, part, 20), { x: 470, y: 370 }, "up and to the left, a radius and a half away");
  assert.deepEqual(stepMarkerAt({ x: 30, y: 400 }, part, 20), { x: 60, y: 370 }, "near the left edge: to the right");
  assert.deepEqual(stepMarkerAt({ x: 500, y: 25 }, part, 20), { x: 470, y: 55 }, "near the top: below");
  assert.deepEqual(stepMarkerAt({ x: 10, y: 10 }, part, 20), { x: 40, y: 40 }, "in the corner: below and to the right");
  assert.deepEqual(stepMarkerAt({ x: 300, y: 300 }, { x: 200, y: 200, width: 400, height: 300 }, 12), { x: 282, y: 282 }, "a cropped part counts from its own corner");
});
