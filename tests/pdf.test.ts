import test from "node:test";
import assert from "node:assert/strict";
import { addNode, addPicture, createProject, ensurePage, type Picture, type Project } from "../src/project/model.ts";
import { addBlock, makeBlock, type Step } from "../src/project/page.ts";
import { addComment } from "../src/project/comments.ts";
import { newGuide, setStepLayout, type Guide } from "../src/project/guides.ts";
import { flattenGuide, flattenPlaced } from "../src/export/pictures.ts";
import { anchorPages, bookPdfHtml, guidePdfHtml, pageNumbersFor, pictureFiles, pictureName, placeholderPages, samePages } from "../src/export/pdf.ts";
import { cssString, pdfCss } from "../src/export/pdf-css.ts";
import { topicAnchor } from "../src/render/print.ts";
import type { Assets } from "../src/project/package.ts";

const size = { width: 1920, height: 1080 };
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const picture = (id: string, extra: Partial<Picture> = {}): Picture => ({ id, file: `images/${id}.png`, ...size, altText: `Picture ${id}`, source: { kind: "click", capturedAt: "t", originalName: `${id}.png` }, click: { x: 960, y: 540, button: "left" }, ...extra });
const step = (id: string, words: string, pictureId?: string): Step => ({ id, text: [{ text: words }], ...(pictureId ? { pictureId } : {}) });

function book(): { project: Project; guide: Guide; assets: Assets; ids: { chapter: string; topic: string; other: string } } {
  const project = createProject('The "Big" <book> \\ & more');
  project.variables = { PRODUCT: "Acme Draw", VERSION: "", COMPANY: "" };
  const chapter = addNode(project.tree, null, "Getting started");
  const topic = addNode(project.tree, chapter.id, "Saving & closing");
  const other = addNode(project.tree, null, "Printing");
  addPicture(project.tree, topic.id, picture("p1"));
  addPicture(project.tree, topic.id, picture("p2"));
  const page = ensurePage(topic);
  const para = makeBlock("paragraph"); (para as { text: unknown }).text = [{ text: "Press " }, { text: "Save", mark: "control" }, { text: " in {{PRODUCT}}." }];
  const proc = makeBlock("procedure"); (proc as { steps: Step[] }).steps = [step("s1", "Open the menu.", "p1"), step("s2", "Choose Save.", "p2")];
  [para, makeBlock("picture", { pictureId: "p1" }), proc].forEach((b) => addBlock(page, b));
  addComment(page, page.blocks[0].id, "SECRET comment words", "2026-10-21T10:00:00.000Z");
  const p3 = makeBlock("paragraph"); (p3 as { text: unknown }).text = [{ text: "Print it." }];
  addBlock(ensurePage(other), p3);
  const guide = newGuide("Saving <guide>", [topic.id]);
  setStepLayout(guide, "s2", "left");
  return { project, guide, assets: new Map([["images/p1.png", PNG], ["images/p2.png", PNG]]), ids: { chapter: chapter.id, topic: topic.id, other: other.id } };
}

const fakeFlatten = (async (bytes: Uint8Array) => new Uint8Array([...bytes, 255])) as never;
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

/** A small PDF, written the way the browser engine writes one (plain objects and a table of where each is), with offsets worked out here. */
function makePdf(objects: Record<number, string>, root: number): Uint8Array {
  let out = "%PDF-1.4\n%âãÏÓ\n";
  const offsets = new Map<number, number>();
  for (const [n, body] of Object.entries(objects)) {
    offsets.set(Number(n), out.length);
    out += `${n} 0 obj\n${body}\nendobj\n`;
  }
  const max = Math.max(...offsets.keys());
  const at = out.length;
  out += `xref\n0 ${max + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= max; i++) out += offsets.has(i) ? `${String(offsets.get(i)).padStart(10, "0")} 00000 n \n` : "0000000000 00000 f \n";
  out += `trailer\n<</Size ${max + 1} /Root ${root} 0 R>>\nstartxref\n${at}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}

test("the page of each named place is read from a PDF: nested page lists, escaped names, and objects with streams", () => {
  const pdf = makePdf({
    1: "<</Type /Catalog /Pages 2 0 R /Dests 6 0 R /Outlines 9 0 R>>",
    2: "<</Type /Pages /Kids [3 0 R 4 0 R] /Count 3>>",
    3: "<</Type /Pages /Parent 2 0 R /Kids [5 0 R 7 0 R] /Count 2>>",
    4: "<</Type /Page /Parent 2 0 R /Contents 8 0 R>>",
    5: "<</Type /Page /Parent 3 0 R>>",
    6: "<</pv-topic-a [5 0 R /XYZ 1 2 0] /pv-topic-b [4 0 R /XYZ 1 2 0] /odd#20name [7 0 R /XYZ 0 0 0] /nowhere [99 0 R /XYZ 0 0 0]>>",
    7: "<</Type /Page /Parent 3 0 R>>",
    8: "<</Length 30>>\nstream\nbinary \u0000ÿ endobj << >> \u0001\nendstream",
    9: "<</Type /Outlines /Count 0>>",
  }, 1);
  const found = anchorPages(pdf);
  assert.deepEqual([...found.entries()].sort(), [["odd name", 2], ["pv-topic-a", 1], ["pv-topic-b", 3]], "pages count in the order of the page list, not of the objects; a name pointing nowhere is left out");
});

test("a PDF that is not understood gives no page numbers rather than wrong ones", () => {
  assert.equal(anchorPages(new Uint8Array([])).size, 0);
  assert.equal(anchorPages(new TextEncoder().encode("not a pdf at all")).size, 0);
  assert.equal(anchorPages(new TextEncoder().encode("%PDF-1.7\nstartxref\n5\n%%EOF")).size, 0, "a table that cannot be read");
  const noNames = makePdf({ 1: "<</Type /Catalog /Pages 2 0 R>>", 2: "<</Type /Pages /Kids [3 0 R] /Count 1>>", 3: "<</Type /Page /Parent 2 0 R>>" }, 1);
  assert.equal(anchorPages(noNames).size, 0, "no table of names");
  const loop = makePdf({ 1: "<</Type /Catalog /Pages 2 0 R /Dests 4 0 R>>", 2: "<</Type /Pages /Kids [2 0 R 3 0 R] /Count 1>>", 3: "<</Type /Page /Parent 2 0 R>>", 4: "<</x [3 0 R /XYZ 0 0 0]>>" }, 1);
  assert.deepEqual([...anchorPages(loop)], [["x", 1]], "a page list that refers to itself does not loop for ever");
  const xrefStream = new TextEncoder().encode("%PDF-1.5\n1 0 obj\n<</Type /XRef>>\nendobj\nstartxref\n9\n%%EOF");
  assert.equal(anchorPages(xrefStream).size, 0, "a newer kind of table is left alone");
});

test("the numbers for the contents come from where the first printing put each topic, and stand-ins are as wide as real ones", () => {
  const { project, ids } = book();
  const anchors = new Map([[topicAnchor(ids.chapter), 3], [topicAnchor(ids.topic), 3], [topicAnchor(ids.other), 12], ["something-else", 99]]);
  const pages = pageNumbersFor(project, anchors)!;
  assert.deepEqual([...pages.entries()], [[ids.chapter, "3"], [ids.topic, "3"], [ids.other, "12"]]);
  assert.equal(pageNumbersFor(project, new Map()), null, "no page found, no numbers");
  assert.deepEqual([...placeholderPages(project).values()], ["000", "000", "000"]);
  assert.equal(samePages(pages, new Map(pages)), true);
  assert.equal(samePages(pages, new Map([...pages, [ids.other, "13"]])), false);
  assert.equal(samePages(pages, new Map([[ids.chapter, "3"]])), false);
});

test("the page to print has its language, its title, nothing that runs, the book's own look, and a contents with page numbers only when it has them", async () => {
  const { project, assets, ids } = book();
  const { flat } = await flattenPlaced(project, assets, "book", fakeFlatten);
  const plain = bookPdfHtml(project, flat);
  assert.match(plain, /^<!doctype html>\n<html lang="en">/);
  assert.match(plain, /<title>The &quot;Big&quot; &lt;book&gt; \\ &amp; more<\/title>/, "the title is escaped as text");
  assert.match(plain, /Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"/, "no script and nothing from the network");
  assert.ok(!/<script/i.test(plain), "no script");
  assert.match(plain, /@top-left \{ content: "The \\"Big\\" \\3C book> \\\\ & more"/, "the running header is the book's name, safe as a CSS string");
  assert.match(plain, /@page :first \{ @top-left \{ content: none; \} @bottom-center \{ content: none; \} \}/, "the title page has no header or number");
  assert.ok(!plain.includes(`class="pv-toc-page"`), "no page numbers in the contents without them");
  assert.match(plain, /<img src="p1\.png" alt="Picture p1" width="1920" height="1080">/, "pictures are the files beside the page, with their descriptions");
  assert.ok(!plain.includes("SECRET") && !plain.includes("data-preview-only"), "no comments and no notes for the writer");
  assert.match(plain, /Press <strong class="control-name">Save<\/strong> in Acme Draw\./, "variables are filled in");
  const numbered = bookPdfHtml(project, flat, new Map([[ids.chapter, "3"], [ids.topic, "3"], [ids.other, "12"]]));
  assert.equal(count(numbered, 'class="pv-toc-page"'), 3, "a number for each contents entry");
  assert.match(numbered, /<a href="#pv-topic-[^"]+" data-anchor="[^"]+"><span class="pv-toc-title">2 Printing<\/span><span class="pv-toc-leader" aria-hidden="true"><\/span><span class="pv-toc-page">12<\/span><\/a>/, "the entry is its words, a dotted leader hidden from a screen reader, and the number");
  const stand = bookPdfHtml(project, flat, placeholderPages(project));
  assert.equal(count(stand, ">000<"), 3);
  const names = Object.keys(pictureFiles(flat)).sort();
  assert.deepEqual(names, ["p1.png", "p2.png"], "the picture files go beside the page by name");
  assert.equal(pictureName("images/abc.png"), "abc.png");
});

test("a guide's page to print finds each step's own pictures, with no header on the first page rule, and cannot be broken by a name", async () => {
  const { project, guide, assets } = book();
  const { flat } = await flattenGuide(project, guide, assets, fakeFlatten);
  const html = guidePdfHtml(project, guide, flat);
  assert.match(html, /<h1 class="gd-title">Saving &lt;guide&gt;<\/h1>/);
  assert.ok(html.includes('src="step-1.png"') && html.includes('src="step-1-close-up.png"') && html.includes('src="step-2.png"') && html.includes('src="step-2-close-up.png"'), "a picture and a close-up for each step");
  assert.deepEqual(Object.keys(pictureFiles(flat)).sort(), ["step-1-close-up.png", "step-1.png", "step-2-close-up.png", "step-2.png"]);
  assert.ok(!html.includes("@page :first"), "a guide's first page has its number");
  assert.match(html, /<section class="gd-step gd-step-left"/);
  assert.ok(!/<script/i.test(html) && !html.includes("SECRET"));
  const missing = guidePdfHtml(project, guide, new Map());
  assert.ok(missing.includes("This picture file is missing from the project."), "a picture that could not be made is said, not left as a broken picture");
});

test("text put into the stylesheet cannot end the string or the style", () => {
  assert.equal(cssString('a "b" \\ c\nd'), 'a \\"b\\" \\\\ c d');
  assert.equal(cssString("</style><script>"), "\\3C /style>\\3C script>");
  const css = pdfCss({ header: 'x"; } body { display: none } /*', bareFirstPage: false });
  assert.ok(css.includes('content: "x\\"; } body { display: none } /*"'), "the quote is escaped, so the rest stays inside the string");
  assert.ok(css.includes("size: Letter") && css.includes("counter(page)"), "a letter page with a page number");
  assert.ok(!pdfCss({ header: "x", bareFirstPage: false }).includes("@page :first"));
});
