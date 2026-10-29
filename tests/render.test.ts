import test from "node:test";
import assert from "node:assert/strict";
import { overlayFor, overlaySvg, calloutInView } from "../src/render/overlay.ts";
import { altTextFor, blocksHtml, boxHtml, esc, fillVariables, figureHtml, MIN_PRINT_SCALE, printScale, runsHtml, type RenderContext } from "../src/render/html.ts";
import { renderPrintPreview } from "../src/render/print.ts";
import { placedTopics, renderHelpPage } from "../src/render/help.ts";
import { addNode, addPicture, createProject, ensurePage, type Picture, type Project } from "../src/project/model.ts";
import { addBlock, makeBlock, type Block } from "../src/project/page.ts";
import { addComment } from "../src/project/comments.ts";
import type { Callout } from "../src/project/callouts.ts";
import { newShape, type ArrowShape, type MarkerShape, type RectShape, type TextShape } from "../src/project/shapes.ts";

const picture = (extra: Partial<Picture> = {}): Picture => ({
  id: "p1", file: "images/p1.png", width: 1920, height: 1080, altText: "The Save dialog", source: { kind: "click", capturedAt: "t" },
  click: { x: 196, y: 453, button: "left" }, ...extra,
});
const callout = (id: string, extra: Partial<Callout> = {}): Callout => ({ id, name: "Save", description: "Saves your work.", target: { x: 121, y: 431, width: 150, height: 44 }, marker: { x: 92, y: 402 }, ...extra });
const ctxFor = (project: Project, extra: Partial<RenderContext> = {}): RenderContext => ({ project, place: "book", imageSrc: (p) => `blob:${p.id}`, notes: false, ...extra });

function sample() {
  const project = createProject("My <Book>");
  project.variables = { PRODUCT: "Acme Draw", VERSION: "2.0", COMPANY: "" };
  const chapter = addNode(project.tree, null, "Getting started");
  const topic = addNode(project.tree, chapter.id, "Saving & closing");
  const second = addNode(project.tree, null, "Printing");
  addPicture(project.tree, topic.id, picture({ callouts: [callout("c1")] }));
  const page = ensurePage(topic);
  const block = (b: Block) => { addBlock(page, b); return b; };
  const heading = makeBlock("heading"); (heading as { text: string }).text = "Before you begin";
  const para = makeBlock("paragraph"); (para as { text: unknown }).text = [{ text: "Press " }, { text: "Save", mark: "control" }, { text: " in {{PRODUCT}} <now>." }];
  const pic = makeBlock("picture", { pictureId: "p1" });
  const proc = makeBlock("procedure"); (proc as { steps: unknown }).steps = [
    { id: "s1", text: [{ text: "Open the " }, { text: "File", mark: "control" }, { text: " menu." }], result: [{ text: "The menu opens." }] },
    { id: "s2", text: [{ text: "Choose Save." }], pictureId: "p1" },
  ];
  const box = makeBlock("callout", { kind: "caution" }); (box as { text: unknown }).text = [{ text: "Save first.", mark: "bold" }];
  [heading, para, pic, proc, box].forEach(block);
  return { project, chapter, topic, second, page, ids: { heading, para, pic, proc, box } };
}

test("text made safe for HTML, and variables filled in from the project", () => {
  assert.equal(esc(`<a href="x">Tom & 'Jo'</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jo&#39;&lt;/a&gt;");
  const vars = { PRODUCT: "Acme", EMPTY: "  " };
  assert.equal(fillVariables("{{PRODUCT}} and {{ PRODUCT }} but {{EMPTY}} and {{NOPE}}", vars), "Acme and Acme but {{EMPTY}} and {{NOPE}}", "one with no value stays as it is, so it can be seen and fixed");
});

test("text with marks becomes HTML: bold, italic and a control name, with everything escaped", () => {
  const { project } = sample();
  const html = runsHtml(ctxFor(project), [{ text: "Use <b> in " }, { text: "Save", mark: "bold" }, { text: " or " }, { text: "slant", mark: "italic" }, { text: "File", mark: "control" }, { text: " {{PRODUCT}}" }]);
  assert.equal(html, "Use &lt;b&gt; in <strong>Save</strong> or <em>slant</em><strong class=\"control-name\">File</strong> Acme Draw");
});

test("the picture size on paper: never bigger than life, and small when a whole screen is squeezed across the page", () => {
  assert.equal(printScale(400), 1);
  assert.equal(printScale(624), 1);
  assert.ok(Math.abs(printScale(1920) - 0.325) < 0.001);
  assert.ok(printScale(1920) < MIN_PRINT_SCALE && printScale(960) > MIN_PRINT_SCALE && printScale(1248) === 0.5);
});

test("a picture's words for a screen reader are what the author wrote, or else its callouts, or else nothing", () => {
  assert.equal(altTextFor(picture()), "The Save dialog");
  assert.equal(altTextFor(picture({ altText: "", callouts: [callout("c1"), callout("c2", { name: "Open", description: "Opens a file." })] })), "Callouts: A. Save: Saves your work. B. Open: Opens a file.");
  assert.equal(altTextFor(picture({ altText: "", callouts: [callout("c1", { name: "", description: "" })] })), "", "callouts with nothing written say nothing");
  assert.equal(altTextFor(picture({ altText: "  " })), "");
});

test("the drawing over a picture is plain data in the picture's pixels, and the same data is written as SVG text", () => {
  assert.equal(overlayFor(picture(), null), null, "nothing to draw");
  const over = overlayFor(picture({ callouts: [callout("c1")] }), { cx: 196, cy: 453, r: 28.8, color: "#FFD600", opacity: 0.6 })!;
  assert.equal(over.viewBox, "0 0 1920 1080");
  assert.deepEqual(over.parts.map((p) => p.tag), ["circle", "rect", "line", "circle", "text"], "the click circle, then the outline, the leader line, the marker and its letter");
  assert.equal(over.parts[4].text, "A");
  const svg = overlaySvg(over, "pv-marks");
  assert.match(svg, /^<svg class="pv-marks" viewBox="0 0 1920 1080" preserveAspectRatio="none" aria-hidden="true" focusable="false">/);
  assert.match(svg, /<text [^>]*>A<\/text>/);
  assert.equal(overlaySvg({ viewBox: "0 0 1 1", parts: [{ tag: "text", attrs: { x: 1, fill: 'a"b' }, text: "<&>" }] }, "x\"y"), `<svg class="x&quot;y" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true" focusable="false"><text x="1" fill="a&quot;b">&lt;&amp;&gt;</text></svg>`);
  const part = { x: 1000, y: 600, width: 500, height: 300 };
  const cropped = overlayFor(picture({ callouts: [callout("c1")] }), null, part);
  assert.equal(cropped, null, "a callout wholly outside the part shown is not drawn");
  assert.ok(!calloutInView(picture({ callouts: [callout("c1")] }), 0, part));
  assert.ok(calloutInView(picture({ callouts: [callout("c1")] }), 0, { x: 0, y: 380, width: 400, height: 200 }));
});

test("a picture as a figure: its image and words, the drawing over it, and the callout entries under it", () => {
  const { project } = sample();
  const html = figureHtml(ctxFor(project), picture({ callouts: [callout("c1")] }));
  assert.match(html, /^<figure class="pv-figure" style="max-width: 624px">/);
  assert.match(html, /<div class="pv-shot" style="aspect-ratio: 1920 \/ 1080"><img src="blob:p1" alt="The Save dialog">/);
  assert.match(html, /<svg class="pv-marks"/);
  assert.match(html, /<ul class="pv-entries" aria-label="Callouts on this picture"><li>A\. Save: Saves your work\.<\/li><\/ul>/);
  assert.ok(!html.includes("pv-note") && !html.includes("object-view-box"), "no notes for the writer and no crop on a whole picture");
  assert.equal(figureHtml(ctxFor(project), picture()).includes("<figcaption>"), false, "no callouts, no list");
  assert.match(figureHtml(ctxFor(project, { imageSrc: () => null }), picture()), /This picture file is missing from the project\./);
});

test("a cropped or zoomed picture is shown through its view, and the drawing looks at the same part", () => {
  const { project } = sample();
  const crop = figureHtml(ctxFor(project), picture({ view: { kind: "crop", x: 100, y: 300, width: 800, height: 300 }, callouts: [callout("c1")] }));
  assert.match(crop, /style="aspect-ratio: 800 \/ 300"><img src="blob:p1" alt="The Save dialog" style="object-view-box: xywh\(100px 300px 800px 300px\)">/);
  assert.match(crop, /viewBox="100 300 800 300"/);
  const zoom = figureHtml(ctxFor(project), picture({ view: { kind: "zoom" } }));
  assert.match(zoom, /aspect-ratio: 960 \/ 540/, "the book's zoom is half the width");
  assert.match(zoom, /xywh\(0px 183px 960px 540px\)/);
});

test("notes for the writer appear only in a preview, say what is wrong in words, and name where", () => {
  const { project } = sample();
  const told: string[] = [];
  const whole = figureHtml(ctxFor(project, { notes: true, onNote: (w) => told.push(w) }), picture({ altText: "", callouts: [callout("c1")], view: undefined }), "1.1 Saving");
  assert.match(whole, /<p class="pv-note" data-preview-only="true"><strong>Note for the writer:<\/strong> Small on paper: the writing in this picture will print at about 33 percent of its size on screen\./);
  assert.equal(told.length, 2);
  assert.match(told[0], /^1\.1 Saving: Small on paper/);
  assert.match(told[1], /^1\.1 Saving: This picture has no description yet/);
  const out = figureHtml(ctxFor(project, { notes: true }), picture({ callouts: [callout("c1")], view: { kind: "crop", x: 1000, y: 600, width: 500, height: 300 } }));
  assert.match(out, /1 callout is outside the part of the picture that is shown, so it is left out of the list and the drawing\./);
  assert.ok(!out.includes("pv-entries"), "and it is left out of the list");
  assert.ok(!figureHtml(ctxFor(project, { notes: false }), picture({ altText: "" })).includes("pv-note"), "an export has no notes");
  const zoomed = figureHtml(ctxFor(project, { notes: true }), picture({ view: { kind: "zoom" } }));
  assert.ok(!zoomed.includes("Small on paper"), "a zoom is big enough on paper");
});

test("a callout box says its kind in words and a symbol, not only by colour", () => {
  const { project } = sample();
  assert.equal(boxHtml(ctxFor(project), "caution", [{ text: "Save <first>." }]), '<aside class="pv-box pv-box-caution" aria-label="Caution"><p class="pv-box-label"><span aria-hidden="true">⚠</span> Caution</p><p>Save &lt;first&gt;.</p></aside>');
});

test("a page's blocks become HTML in order: heading, paragraph, picture, numbered procedure with results, callout box", () => {
  const { project, topic } = sample();
  const html = blocksHtml(ctxFor(project), topic, 2);
  assert.match(html, /^<h3>Before you begin<\/h3>\n<p>Press <strong class="control-name">Save<\/strong> in Acme Draw &lt;now&gt;\.<\/p>\n<figure/, "a heading goes one level below the topic's");
  assert.match(html, /<ol class="pv-steps"><li><p>Open the <strong class="control-name">File<\/strong> menu\.<\/p><p class="pv-result"><strong>Result:<\/strong> The menu opens\.<\/p><\/li><li><p>Choose Save\.<\/p><figure/);
  assert.match(html, /<aside class="pv-box pv-box-caution"/);
  assert.equal(blocksHtml(ctxFor(project), topic, 6).includes("<h7>"), false, "headings stop at level 6");
});

test("the print preview has a title page, a contents list, and chapters that open with what is in them", () => {
  const { project, chapter, topic, second } = sample();
  const { html } = renderPrintPreview(ctxFor(project));
  assert.match(html, /<section class="pv-sheet pv-title-page"><h1 class="pv-book-title">My &lt;Book&gt;<\/h1><p>Acme Draw<\/p><p>2\.0<\/p><\/section>/, "the name is escaped and the product and version are shown");
  assert.match(html, /<section class="pv-sheet pv-toc"><h1>Contents<\/h1><ol class="pv-toc-list"><li><a href="#pv-topic-[^"]+" data-anchor="pv-topic-[^"]+">1 Getting started<\/a><ol class="pv-toc-list"><li><a [^>]*>1\.1 Saving &amp; closing<\/a><\/li><\/ol><\/li><li><a [^>]*>2 Printing<\/a><\/li><\/ol>/);
  assert.ok(!/page \d|\.{3,}\s*\d/.test(html.split("pv-toc")[1].split("</section>")[0]), "the contents has no page numbers: they come with the PDF");
  assert.match(html, new RegExp(`<section class="pv-sheet pv-chapter" id="pv-topic-${chapter.id}"><header class="pv-opener"><p class="pv-chapter-number">Chapter 1</p><h1>Getting started</h1><div class="pv-in-chapter"><h2 class="pv-in-chapter-title">In This Chapter</h2><ul><li><a [^>]*>Saving &amp; closing</a></li></ul></div></header>`));
  assert.match(html, new RegExp(`<article class="pv-topic" id="pv-topic-${topic.id}"><h2><span class="pv-number">1\\.1</span> Saving &amp; closing</h2>`));
  assert.match(html, new RegExp(`id="pv-topic-${second.id}"><header class="pv-opener"><p class="pv-chapter-number">Chapter 2</p><h1>Printing</h1></header>`), "a chapter with no topics has no In This Chapter list");
  assert.ok(!html.includes("<h7"), "heading levels stop at 6");
});

test("the print preview collects the writer's notes with where they are, and never contains a comment", () => {
  const { project, page } = sample();
  addComment(page, page.blocks[1].id, "SECRET comment words", "2026-10-21T10:00:00.000Z");
  const { html, notes } = renderPrintPreview(ctxFor(project, { notes: true }));
  assert.ok(!html.includes("SECRET"), "comments are never part of the book");
  assert.ok(notes.length >= 2 && notes.every((n) => n.startsWith("1.1 Saving & closing: ")), `each note says where it is: ${notes[0]}`);
  assert.ok(notes.some((n) => /Small on paper/.test(n)) && html.includes("data-preview-only"));
  const exported = renderPrintPreview(ctxFor(project, { notes: false }));
  assert.deepEqual(exported.notes, []);
  assert.ok(!exported.html.includes("pv-note"), "an export has no notes");
});

test("a deep topic gets a heading of its level, an empty book still has a title page, and a title cannot add markup", () => {
  const project = createProject("<script>alert(1)</script>");
  assert.ok(!renderPrintPreview(ctxFor(project)).html.includes("<script>"));
  assert.ok(!renderPrintPreview(ctxFor(project)).html.includes("pv-toc"), "no contents when there is nothing in it");
  let parent = addNode(project.tree, null, "Chapter");
  for (let i = 0; i < 7; i++) parent = addNode(project.tree, parent.id, `Level ${i + 2}`);
  const html = renderPrintPreview(ctxFor(project)).html;
  assert.match(html, /<h6><span class="pv-number">1\.1\.1\.1\.1\.1<\/span> Level 6<\/h6>/);
  assert.match(html, /<h6><span class="pv-number">1\.1\.1\.1\.1\.1\.1\.1<\/span> Level 8<\/h6>/, "deeper than six stays at six");
});

test("a help site page has the tree, breadcrumbs, the topic, and previous and next links", () => {
  const { project, chapter, topic, second } = sample();
  assert.deepEqual(placedTopics(project.tree).map((p) => p.node.title), ["Getting started", "Saving & closing", "Printing"]);
  const html = renderHelpPage(ctxFor(project), topic.id);
  assert.match(html, /<nav class="hs-tree" aria-label="Contents of My &lt;Book&gt;"><ul class="hs-tree-list"><li><a href="#" data-topic="[^"]+">1 Getting started<\/a><ul class="hs-tree-list"><li><a href="#" data-topic="[^"]+" aria-current="page">1\.1 Saving &amp; closing<\/a>/);
  assert.match(html, /<nav class="hs-crumbs" aria-label="Breadcrumb"><ol><li><a href="#" data-topic="[^"]+">My &lt;Book&gt;<\/a><\/li><li><a href="#" data-topic="[^"]+">Getting started<\/a><\/li><li aria-current="page">Saving &amp; closing<\/li><\/ol><\/nav>/);
  assert.match(html, /<article><h1>1\.1 Saving &amp; closing<\/h1>\n<h2>Before you begin<\/h2>/, "a heading block is one level below the topic's title");
  assert.match(html, new RegExp(`<a href="#" data-topic="${chapter.id}" class="hs-previous">← Previous: 1 Getting started</a><a href="#" data-topic="${second.id}" class="hs-next">Next: 2 Printing →</a>`));
  assert.ok(html.includes("pv-entries"), "pictures keep their callout entries");
});

test("the first topic has no previous link, the last has no next, a chapter lists its topics, and nothing selected says so", () => {
  const { project, chapter, second } = sample();
  const first = renderHelpPage(ctxFor(project), chapter.id);
  assert.ok(!first.includes("hs-previous") && first.includes("hs-next"));
  assert.match(first, /<section class="hs-inside"><h2>In this section<\/h2><ul><li><a href="#" data-topic="[^"]+">Saving &amp; closing<\/a><\/li><\/ul><\/section>/);
  const last = renderHelpPage(ctxFor(project), second.id);
  assert.ok(last.includes("hs-previous") && !last.includes("hs-next"));
  assert.match(renderHelpPage(ctxFor(project), null), /Select a chapter or topic to see its page\./);
  assert.ok(!renderHelpPage(ctxFor(project), chapter.id).includes("SECRET"));
});

function marked(): { arrow: ArrowShape; text: TextShape; rect: RectShape; marker: MarkerShape } {
  const size = { width: 1920, height: 1080 };
  const arrow = { ...(newShape("arrow", size) as ArrowShape), from: { x: 400, y: 600 }, to: { x: 500, y: 500 }, alt: "Points at the Save button" };
  const text = { ...(newShape("text", size) as TextShape), box: { x: 600, y: 200, width: 400, height: 120 }, text: "Press Save now", fill: "#C62828", textColor: "#FFFFFF" };
  const rect = { ...(newShape("rectangle", size) as RectShape), box: { x: 100, y: 100, width: 300, height: 100 }, fill: "#FFD600", seeThrough: 75, alt: "The toolbar" };
  const marker = { ...(newShape("marker", size) as MarkerShape), at: { x: 800, y: 700 }, label: "2" };
  return { arrow, text, rect, marker };
}

test("marks are drawn over the picture from the bottom one to the top one, under the callouts and over the click circle", () => {
  const { arrow, text, rect, marker } = marked();
  const over = overlayFor(picture({ shapes: [rect, arrow, text, marker], callouts: [callout("c1")] }), { cx: 196, cy: 453, r: 28.8, color: "#FFD600", opacity: 0.6 })!;
  const tags = over.parts.map((p) => p.tag);
  assert.equal(tags[0], "circle", "the click circle is first");
  assert.deepEqual(tags.slice(1, 4), ["rect", "line", "polygon"], "then the rectangle and the arrow in their order");
  assert.equal(over.parts[1].attrs.fill, "#FFD600");
  assert.equal(over.parts[1].attrs["fill-opacity"], 0.25, "75 percent see-through is a quarter solid");
  assert.equal(over.parts[1].attrs["stroke-width"], 6);
  const textParts = over.parts.filter((p) => p.tag === "text").map((p) => p.text);
  assert.ok(textParts.includes("Press Save now") || (textParts.includes("Press Save") && textParts.includes("now")), "the words of the text box are drawn, in lines that fit");
  assert.ok(textParts.includes("2") && textParts[textParts.length - 1] === "A", "the marker, then the callout's letter last, on top");
  const line = over.parts.find((p) => p.tag === "line" && p.attrs.stroke === "#C62828" && p.attrs["stroke-linecap"] === "round")!;
  assert.deepEqual([line.attrs.x1, line.attrs.y1], [400, 600]);
  const head = over.parts.find((p) => p.tag === "polygon")!;
  assert.match(String(head.attrs.points), /^500,500 /, "the head's tip is where the arrow points");
  const markerLetter = over.parts.find((p) => p.tag === "text" && p.text === "2")!;
  assert.equal(markerLetter.attrs.fill, "#FFFFFF", "white letters on the red marker");
  const svg = overlaySvg(over, "pv-marks");
  assert.match(svg, /<polygon points="500,500 /);
  assert.ok(svg.includes("</svg>"));
});

test("a mark wholly outside the part shown is not drawn, and a picture with only marks still has a drawing", () => {
  const { arrow } = marked();
  assert.equal(overlayFor(picture({ shapes: [arrow] }), null, { x: 1000, y: 700, width: 500, height: 300 }), null);
  const only = overlayFor(picture({ shapes: [arrow] }), null)!;
  assert.deepEqual(only.parts.map((p) => p.tag), ["line", "polygon"]);
  assert.equal(overlayFor(picture({ shapes: [arrow] }), null, { x: 300, y: 400, width: 400, height: 300 })!.parts.length, 2, "one that is partly in it is drawn");
});

test("the marks are part of a picture's description for a screen reader", () => {
  const { arrow, text, marker } = marked();
  assert.equal(altTextFor(picture({ shapes: [arrow, text, marker] })), 'The Save dialog Marks: Arrow: Points at the Save button. Text box: "Press Save now". Marker 2.');
  assert.equal(altTextFor(picture({ altText: "", shapes: [text] })), 'Marks: Text box: "Press Save now".');
  assert.equal(altTextFor(picture({ altText: "", callouts: [callout("c1")], shapes: [marker] })), "Callouts: A. Save: Saves your work. Marks: Marker 2.");
  const { project } = sample();
  const html = figureHtml(ctxFor(project), picture({ shapes: [arrow, text] }));
  assert.match(html, /alt="The Save dialog Marks: Arrow: Points at the Save button\. Text box: &quot;Press Save now&quot;\."/, "escaped in the page");
  assert.match(html, /<polygon points=/);
});

test("the preview tells the writer about marks with no alternative text and about colours that are too close, and says when they were kept on purpose", () => {
  const { project } = sample();
  const { arrow, text } = marked();
  const told: string[] = [];
  const ctx = ctxFor(project, { notes: true, onNote: (w) => told.push(w) });
  figureHtml(ctx, picture({ shapes: [{ ...arrow, alt: "" }, { ...text, fill: "#E57373", keptLowContrast: true }] }), "1.1 Saving");
  assert.ok(told.some((n) => /^1\.1 Saving: 1 mark \(an arrow or a rectangle\) has no alternative text yet/.test(n)), told.join(" | "));
  assert.ok(told.some((n) => /^1\.1 Saving: Text box: Text on its fill: \d\.\d to 1, which is below the 4\.5 to 1 minimum \(WCAG 2\.2 AA\)\..*\(The colours were kept on purpose\.\)$/.test(n)), told.join(" | "));
  const quiet: string[] = [];
  figureHtml(ctxFor(project, { notes: true, onNote: (w) => quiet.push(w) }), picture({ view: { kind: "zoom" }, shapes: [arrow, text] }));
  assert.ok(!quiet.some((n) => /alternative text|Text on its fill/.test(n)), "a mark with a description and colours that pass says nothing");
  assert.ok(!figureHtml(ctxFor(project, { notes: false }), picture({ shapes: [{ ...arrow, alt: "" }] })).includes("pv-note"), "an export has no notes");
});

test("a chapter named Appendix opens as an appendix, not as a numbered chapter", () => {
  const { project } = sample();
  const appendix = addNode(project.tree, null, "Appendix");
  addNode(project.tree, appendix.id, "Glossary");
  const { html } = renderPrintPreview(ctxFor(project));
  assert.match(html, new RegExp(`id="pv-topic-${appendix.id}"><header class="pv-opener"><p class="pv-chapter-number">Appendix</p><h1>Appendix</h1><div class="pv-in-chapter"><h2 class="pv-in-chapter-title">In This Appendix</h2>`));
  assert.ok(!html.includes("Chapter 3"), "it is not called chapter 3");
  assert.ok(html.includes('<p class="pv-chapter-number">Chapter 2</p>'), "the chapters before it keep their numbers");
});
