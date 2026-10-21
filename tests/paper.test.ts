import test from "node:test";
import assert from "node:assert/strict";
import { addNode, addPicture, createProject, CURRENT_VERSION, ensurePage, type Picture, type Project } from "../src/project/model.ts";
import { addBlock, makeBlock } from "../src/project/page.ts";
import { migrate } from "../src/project/migrate.ts";
import { fromFiles, toFiles } from "../src/project/files.ts";
import { checkProject } from "../src/project/checks.ts";
import { cleanPaper, defaultPaper, defaultZoom, forPaper, shownPart, switchedForPaper } from "../src/project/views.ts";
import { flattenPlaced } from "../src/export/pictures.ts";
import { buildDocxParts } from "../src/export/docx.ts";
import { bookPdfHtml } from "../src/export/pdf.ts";
import { renderPrintPreview } from "../src/render/print.ts";
import type { RenderContext } from "../src/render/html.ts";
import type { Assets } from "../src/project/package.ts";

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
/** A wide picture: 2000 pixels across prints at about a third of its size on a 6.5 inch line, and at the book's zoom (half the width) at about two thirds, which is big enough. */
const wide = (id: string, extra: Partial<Picture> = {}): Picture => ({
  id, file: `images/${id}.png`, width: 2000, height: 1125, altText: `Picture ${id}`, source: { kind: "click", capturedAt: "t", originalName: `${id}.png` },
  click: { x: 1000, y: 560, button: "left" },
  callouts: [{ id: "far", name: "Far", description: "In the corner.", target: { x: 100, y: 100, width: 200, height: 80 }, marker: { x: 60, y: 60 } }],
  ...extra,
});
const fine = { zoom: defaultZoom(), paper: { autoZoom: true } };
/** What the book's zoom shows of the wide picture. */
const zoomed = shownPart({ width: 2000, height: 1125, click: { x: 1000, y: 560, button: "left" }, view: { kind: "zoom" } }, defaultZoom(), "book");

function book(autoZoom: boolean): { project: Project; assets: Assets } {
  const project = createProject("Paper test");
  project.paper = { autoZoom };
  const chapter = addNode(project.tree, null, "One");
  const topic = addNode(project.tree, chapter.id, "Topic");
  addPicture(project.tree, topic.id, wide("a"));
  addPicture(project.tree, topic.id, wide("noclick", { click: undefined, callouts: [] }));
  addPicture(project.tree, topic.id, wide("own", { view: { kind: "crop", x: 0, y: 0, width: 1000, height: 562 }, callouts: [] }));
  addPicture(project.tree, topic.id, wide("small", { width: 1000, height: 562, click: { x: 500, y: 280, button: "left" }, callouts: [] }));
  const page = ensurePage(topic);
  for (const id of ["a", "noclick", "own", "small"]) addBlock(page, makeBlock("picture", { pictureId: id }));
  const assets: Assets = new Map(["a", "noclick", "own", "small"].map((id) => [`images/${id}.png`, PNG]));
  return { project, assets };
}

const fake = (async (bytes: Uint8Array) => new Uint8Array([...bytes, 255])) as never;

test("a picture is switched to a zoom on its click for paper only when the setting is on, it would print too small, and it has no view of its own", () => {
  const p = wide("p");
  assert.equal(switchedForPaper(p, defaultZoom(), { autoZoom: false }), false, "off to begin with");
  assert.deepEqual(defaultPaper(), { autoZoom: false });
  assert.equal(switchedForPaper(p, defaultZoom(), fine.paper), true);
  assert.equal(switchedForPaper({ ...p, width: 1000, height: 562 }, defaultZoom(), fine.paper), false, "a picture that prints big enough is left whole");
  assert.equal(zoomed.width, 1000, "(the zoom is half the width)");
  assert.equal(switchedForPaper({ ...p, view: { kind: "crop", x: 0, y: 0, width: 500, height: 300 } }, defaultZoom(), fine.paper), false, "the author's own crop wins");
  assert.equal(switchedForPaper({ ...p, view: { kind: "zoom" } }, defaultZoom(), fine.paper), false, "so does the author's own zoom");
  assert.equal(switchedForPaper({ ...p, click: undefined }, defaultZoom(), fine.paper), false, "no click, nothing to zoom on");
  assert.equal(switchedForPaper(p, { book: { size: 100 }, guide: { size: 40 } }, fine.paper), false, "a zoom as wide as the picture shows no more of it");
  const switched = forPaper(p, defaultZoom(), fine.paper);
  assert.deepEqual(switched.view, { kind: "zoom" });
  assert.equal(p.view, undefined, "the picture itself is not changed");
  assert.equal(forPaper(p, defaultZoom(), { autoZoom: false }), p, "not switched: the same picture");
});

test("the paper setting is cleaned, saved with the project, and an older project has it off", () => {
  assert.deepEqual(cleanPaper(undefined), { autoZoom: false });
  assert.deepEqual(cleanPaper({ autoZoom: "yes" }), { autoZoom: false }, "only true turns it on");
  assert.deepEqual(cleanPaper({ autoZoom: true, other: 1 }), { autoZoom: true });
  assert.equal(CURRENT_VERSION, 12);
  assert.deepEqual(createProject("x").paper, { autoZoom: false });
  const { project } = book(true);
  assert.deepEqual(fromFiles(toFiles(project)).paper, { autoZoom: true }, "it comes back as it was saved");
  assert.equal(JSON.parse(toFiles(project)["project.json"]).version, 12);
  const old = migrate({ version: 11, name: "Old", template: "empty", variables: {}, guides: [], tree: [] });
  assert.deepEqual([old.version, old.paper], [12, { autoZoom: false }]);
  assert.deepEqual(migrate({ version: 12, name: "Odd", template: "empty", variables: {}, paper: 5, tree: [] }).paper, { autoZoom: false });
});

test("the print preview shows a small picture zoomed on its click and says so, and only when asked to be for paper", () => {
  const { project } = book(true);
  const ctx = (paper: boolean): RenderContext => ({ project, place: "book", paper, notes: true, imageSrc: (p) => `images/${p.id}.png` });
  const html = renderPrintPreview(ctx(true)).html;
  const figures = html.split("<figure").slice(1);
  assert.ok(figures[0].includes(`object-view-box: xywh(${zoomed.x}px ${zoomed.y}px ${zoomed.width}px ${zoomed.height}px)`), "the wide picture with a click is zoomed in on it at the book's zoom size");
  assert.ok(!figures[0].includes("A. Far"), "and a callout outside the part shown is left out");
  assert.ok(!/object-view-box/.test(figures[1]), "a picture with no click stays whole");
  assert.match(figures[2], /object-view-box: xywh\(0px 0px 1000px 562px\)/, "the author's own crop is as it was");
  assert.ok(!/object-view-box/.test(figures[3]), "a picture that prints big enough stays whole");
  const notes = renderPrintPreview(ctx(true)).notes;
  assert.ok(notes.some((n) => /Zoomed in on the click for print/.test(n)), "the writer is told it was switched");
  assert.ok(!renderPrintPreview(ctx(false)).html.split("<figure")[1].includes("object-view-box"), "not for paper (the help site, for one): the picture is whole");
  project.paper = { autoZoom: false };
  assert.ok(!renderPrintPreview(ctx(true)).html.split("<figure")[1].includes("object-view-box"), "with the setting off nothing changes");
});

test("the files for paper (Word and PDF) are made zoomed, and the others are not", async () => {
  const { project, assets } = book(true);
  const paper = await flattenPlaced(project, assets, "book", fake, { paper: true });
  assert.deepEqual([paper.flat.get("a")!.width, paper.flat.get("a")!.height], [zoomed.width, zoomed.height], "the wide picture was cut to the zoom");
  assert.deepEqual([paper.flat.get("noclick")!.width, paper.flat.get("small")!.width], [2000, 1000], "the others are as they were");
  const screen = await flattenPlaced(project, assets, "book", fake);
  assert.equal(screen.flat.get("a")!.width, 2000, "an output that is not for paper keeps the whole picture");
  // Word: the callout outside the zoom has no caption line, and with the setting off it does
  const doc = (p: Project, flat: typeof paper.flat) => new TextDecoder().decode(buildDocxParts(p, flat)["word/document.xml"]);
  assert.ok(!doc(project, paper.flat).includes("A. Far: In the corner."));
  project.paper = { autoZoom: false };
  const whole = await flattenPlaced(project, assets, "book", fake, { paper: true });
  assert.equal(whole.flat.get("a")!.width, 2000, "with the setting off the paper outputs are whole too");
  assert.ok(doc(project, whole.flat).includes("A. Far: In the corner."));
  // PDF: the same picture file name, the page has no note
  project.paper = { autoZoom: true };
  const html = bookPdfHtml(project, paper.flat);
  assert.ok(html.includes('src="a.png"') && html.includes(`width="${zoomed.width}" height="${zoomed.height}"`) && !html.includes("Zoomed in on the click"), "the PDF page uses the zoomed picture and carries no note for the writer");
});

test("the book check does not call a picture small when it will be zoomed for print, and says how to fix one that is", () => {
  const { project } = book(false);
  const small = (p: Project) => checkProject(p).filter((i) => i.kind === "print-small").map((i) => i.key);
  assert.deepEqual(small(project), ["print-small:a", "print-small:noclick"], "off: the two wide pictures with no view of their own are flagged");
  assert.match(checkProject(project).find((i) => i.key === "print-small:a")!.fix, /turn on the automatic zoom for print in Zoom settings/, "a picture with a click is told about the setting");
  assert.ok(!/automatic zoom/.test(checkProject(project).find((i) => i.key === "print-small:noclick")!.fix), "a picture with no click is not, because the setting cannot help it");
  project.paper = { autoZoom: true };
  assert.deepEqual(small(project), ["print-small:noclick"], "on: the one that is zoomed is no longer small; the one with no click still is");
});
