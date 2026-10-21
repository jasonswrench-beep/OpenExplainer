import test from "node:test";
import assert from "node:assert/strict";
import { addNode, addPicture, createProject, ensurePage, type Picture, type Project } from "../src/project/model.ts";
import { addBlock, makeBlock, type Step } from "../src/project/page.ts";
import { addComment } from "../src/project/comments.ts";
import { newGuide, setStepLayout, type Guide } from "../src/project/guides.ts";
import { flattenGuide, guideKey } from "../src/export/pictures.ts";
import { buildGuideDocxParts, packGuideDocx } from "../src/export/guide-docx.ts";
import { unzip } from "../src/project/zip.ts";
import type { Assets } from "../src/project/package.ts";

const size = { width: 1920, height: 1080 };
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const picture = (id: string, extra: Partial<Picture> = {}): Picture => ({ id, file: `images/${id}.png`, ...size, altText: "", source: { kind: "click", capturedAt: "t", originalName: `${id}.png` }, click: { x: 960, y: 540, button: "left" }, ...extra });
const step = (id: string, words: string, pictureId?: string, result?: string): Step => ({ id, text: [{ text: words }], ...(pictureId ? { pictureId } : {}), ...(result ? { result: [{ text: result }] } : {}) });

function setup(): { project: Project; guide: Guide; assets: Assets } {
  const project = createProject("Guide <book> & more");
  project.variables = { PRODUCT: "Acme Draw", VERSION: "", COMPANY: "" };
  const chapter = addNode(project.tree, null, "Saving");
  const one = addNode(project.tree, chapter.id, "Save a <file> & close");
  const two = addNode(project.tree, chapter.id, "Print");
  addPicture(project.tree, one.id, picture("a", { altText: "The File menu is open.", callouts: [{ id: "c1", name: "Save", description: "Saves your work.", target: { x: 100, y: 100, width: 200, height: 80 }, marker: { x: 80, y: 80 } }] }));
  addPicture(project.tree, one.id, picture("b"));
  addPicture(project.tree, one.id, picture("c", { click: undefined, altText: "A plain picture" }));
  addPicture(project.tree, one.id, picture("d", { view: { kind: "crop", x: 0, y: 0, width: 800, height: 450 }, click: { x: 1500, y: 900, button: "left" } }));
  addPicture(project.tree, one.id, picture("gone"));
  const page = ensurePage(one);
  const proc = makeBlock("procedure"); (proc as { steps: Step[] }).steps = [
    step("s1", "Open the menu in {{PRODUCT}}.", "a", "The menu opens."),
    step("s2", "Choose <b>Save</b>.", "b"),
    step("s3", "Look at the plain picture.", "c"),
    step("s4", "Look outside the crop.", "d"),
    step("s5", "A picture whose file is missing.", "gone"),
    step("s6", "No picture here."),
  ];
  const note = makeBlock("callout", { kind: "caution" }); (note as { text: unknown }).text = [{ text: "Save often." }];
  const para = makeBlock("paragraph"); (para as { text: unknown }).text = [{ text: "Book words." }];
  [para, proc, note].forEach((b) => addBlock(page, b));
  addComment(page, para.id, "SECRET comment words", "2026-10-21T10:00:00.000Z");
  const p2 = makeBlock("procedure"); (p2 as { steps: Step[] }).steps = [step("t1", "Press Print.")];
  addBlock(ensurePage(two), p2);
  const guide = newGuide("Saving <guide>", [one.id, two.id]);
  const assets: Assets = new Map([["images/a.png", PNG], ["images/b.png", PNG], ["images/c.png", PNG], ["images/d.png", PNG]]);
  return { project, guide, assets };
}

/** A stand-in for the canvas: records what it was asked to draw and gives back bytes. */
function fakeFlatten() {
  const calls: { file: string; shown: { x: number; y: number; width: number; height: number }; parts: { tag: string; text?: string; attrs: Record<string, string | number> }[] | null }[] = [];
  const flatten = async (bytes: Uint8Array, file: string, shown: { x: number; y: number; width: number; height: number }, overlay: { parts: { tag: string; text?: string; attrs: Record<string, string | number> }[] } | null) => {
    calls.push({ file, shown, parts: overlay ? overlay.parts : null });
    return new Uint8Array([...bytes, calls.length]);
  };
  return { flatten: flatten as never, calls };
}

/** Whether an XML part is well formed: every tag closed in order, attributes quoted, only the five escapes. Returns what is wrong, or null. */
function xmlProblem(text: string): string | null {
  const body = text.replace(/^<\?xml[^>]*\?>\s*/, "");
  const stack: string[] = [];
  const tag = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g;
  let at = 0;
  for (let m = tag.exec(body); m; m = tag.exec(body)) {
    const between = body.slice(at, m.index);
    if (/[<>]/.test(between)) return `stray angle bracket near "${between.slice(0, 40)}"`;
    if (/&(?!(amp|lt|gt|quot|apos);)/.test(between)) return `unescaped ampersand near "${between.slice(0, 40)}"`;
    at = tag.lastIndex;
    if (m[1]) { if (stack.pop() !== m[2]) return `closing ${m[2]} does not match`; }
    else if (!m[4]) stack.push(m[2]);
    if (!m[1] && /&(?!(amp|lt|gt|quot|apos);)/.test(m[3])) return `unescaped ampersand in ${m[2]}`;
  }
  if (/[<>]/.test(body.slice(at))) return "stray angle bracket at the end";
  return stack.length ? `${stack.pop()} is never closed` : body.trim() ? null : "empty";
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;
const text = (parts: Record<string, Uint8Array>, name: string) => new TextDecoder().decode(parts[name]);

test("a guide's pictures are made for each step, with the step's number on the clicked spot, a close-up where one belongs, and the quick-guide settings", async () => {
  const { project, guide, assets } = setup();
  const { flatten, calls } = fakeFlatten();
  const result = await flattenGuide(project, guide, assets, flatten);
  assert.deepEqual([...result.flat.keys()], ["s1", "s1:close-up", "s2", "s2:close-up", "s3", "s4"], "a close-up only for a whole picture with a click; none for a missing file");
  assert.equal(guideKey("s1", true), "s1:close-up");
  assert.deepEqual(result.flat.get("s1")!.path, "images/step-1.png");
  assert.equal(result.flat.get("s1:close-up")!.path, "images/step-1-close-up.png");
  assert.equal(result.flat.get("s4")!.path, "images/step-4.png");
  assert.deepEqual(result.missing, ["gone.png"], "a missing picture file is named for the writer");
  assert.deepEqual(result.failed, []);
  assert.deepEqual(calls[0].shown, { x: 0, y: 0, width: 1920, height: 1080 }, "the whole picture");
  assert.deepEqual(calls[1].shown, { x: 576, y: 324, width: 768, height: 432 }, "the close-up is cut at the quick-guide zoom size (40 percent of the width)");
  const marker = (i: number) => calls[i].parts!.filter((p) => p.tag === "text" && /^\d+$/.test(p.text ?? "")).map((p) => p.text);
  assert.deepEqual([marker(0), marker(1), marker(2)], [["1"], ["1"], ["2"]], "each step's number is drawn on its picture and its close-up");
  assert.ok(calls[0].parts!.some((p) => p.tag === "circle" && p.attrs.fill === "#FFD600"), "the click circle follows the quick-guide setting, which is on");
  const noClick = calls.find((c) => c.file === "images/c.png")!;
  assert.equal(noClick.parts, null, "a picture with no click and nothing else to draw is left plain");
  const cropped = calls.find((c) => c.file === "images/d.png")!;
  assert.deepEqual(marker(calls.indexOf(cropped)), [], "no number where the click is outside the crop");
  assert.equal(JSON.stringify([...assets.keys()]), JSON.stringify(["images/a.png", "images/b.png", "images/c.png", "images/d.png"]), "the project's files are not touched");
  guide.zoomFocus = false;
  const noClose = await flattenGuide(project, guide, assets, fakeFlatten().flatten);
  assert.ok(![...noClose.flat.keys()].some((k) => k.endsWith(":close-up")), "no close-ups when the guide does not ask for them");
  const failed = await flattenGuide(project, guide, assets, (async () => { throw new Error("no"); }) as never);
  assert.equal(failed.flat.size, 0);
  assert.equal(failed.failed.length, 4, "a picture that cannot be drawn is named and the rest are still tried");
});

test("the Word file of a guide has its name, each task, each step with its pictures in the layout chosen, and no cover, contents or comments", async () => {
  const { project, guide, assets } = setup();
  setStepLayout(guide, "s2", "left");
  const { flat } = await flattenGuide(project, guide, assets, fakeFlatten().flatten);
  const parts = buildGuideDocxParts(project, guide, flat, { now: "2026-10-21T10:00:00.000Z" });
  for (const name of Object.keys(parts).filter((n) => /\.(xml|rels)$/.test(n))) assert.equal(xmlProblem(text(parts, name)), null, `${name} is well formed`);
  assert.deepEqual(Object.keys(parts).filter((n) => n.startsWith("word/media/")).sort(), [
    "word/media/step-1-close-up.png", "word/media/step-1.png", "word/media/step-2-close-up.png", "word/media/step-2.png", "word/media/step-3.png", "word/media/step-4.png",
  ]);
  const doc = text(parts, "word/document.xml");
  assert.match(doc, /^.*<w:body><w:p><w:pPr><w:pStyle w:val="Title"\/><\/w:pPr><w:r><w:t xml:space="preserve">Saving &lt;guide&gt;<\/w:t>/s, "the guide's name is the title, first");
  assert.ok(!doc.includes("TOC \\o") && !doc.includes('w:val="Contents'), "no contents list");
  assert.ok(!doc.includes("SECRET") && !doc.includes("Book words"), "no comments, and the book's own paragraphs are not in the guide");
  assert.match(doc, /<w:pStyle w:val="Heading1"\/><\/w:pPr><w:r><w:t xml:space="preserve">Save a &lt;file&gt; &amp; close<\/w:t>/, "a task is a Heading 1 with no number");
  assert.match(doc, /<w:pStyle w:val="Heading1"\/><w:pageBreakBefore\/><\/w:pPr><w:r><w:t xml:space="preserve">Print/, "the second task starts a new page");
  const steps = [...doc.matchAll(/<w:pStyle w:val="Heading2"\/><\/w:pPr><w:r><w:t xml:space="preserve">(Step \d)</g)].map((m) => m[1]);
  assert.deepEqual(steps, ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5", "Step 6", "Step 1"], "steps numbered again for the second task");
  assert.match(doc, /Open the menu in Acme Draw\./, "variables are filled in");
  assert.match(doc, /Choose &lt;b&gt;Save&lt;\/b&gt;\./, "what was typed cannot add markup");
  assert.match(doc, /Result: <\/w:t><\/w:r><w:r><w:t xml:space="preserve">The menu opens\./);
  // pictures: top layout is the width of the text; the close-up under it is narrower and centred; the left layout is a table with narrow pictures
  const extents = [...doc.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => Math.round(Number(m[1]) / 9525));
  assert.deepEqual(extents, [624, 343, 240, 240, 624, 624], "step 1 whole and close-up on top; step 2 whole and close-up in the left column; steps 3 and 4 whole");
  assert.match(doc, /<w:pStyle w:val="Normal"\/><w:keepNext\/><w:jc w:val="center"\/>/, "the close-up is centred");
  assert.equal(count(doc, "<w:tbl>"), 1, "one table, for the one step in the left layout");
  assert.match(doc, /<w:tblCaption w:val="Step 2"\/><w:tblDescription w:val="Layout only: the pictures of the step are on the left and its words are on the right\."\/>/, "the table has a name and says it is only layout");
  assert.match(doc, /<w:gridCol w:w="3900"\/><w:gridCol w:w="5460"\/>/);
  assert.match(doc, /<w:cantSplit\/>/, "a step's table is kept in one piece");
  // descriptions
  const alts = [...doc.matchAll(/<wp:docPr id="\d+" name="Picture \d+" descr="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(alts, [
    "The File menu is open.", "Close-up of the clicked spot. The File menu is open.", "Choose &lt;b&gt;Save&lt;/b&gt;.", "Close-up of the clicked spot. Choose &lt;b&gt;Save&lt;/b&gt;.", "A plain picture", "Look outside the crop.",
  ], "the picture's own description, else the words of its step; a close-up says it is one");
  assert.match(doc, /<w:pStyle w:val="Caption"\/><\/w:pPr><w:r><w:t xml:space="preserve">A\. Save: Saves your work\./, "a callout's entry is a caption under its picture");
  assert.match(doc, /\(The picture &quot;gone\.png&quot; could not be included\.\)/, "a picture that could not be made is said");
  assert.match(doc, /<w:pStyle w:val="Callout2"\/><\/w:pPr><w:r><w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">Caution\. /, "the boxed note keeps its kind in words");
  assert.match(text(parts, "word/styles.xml"), /<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"\/><w:basedOn w:val="Normal"\/><w:next w:val="Normal"\/><w:uiPriority w:val="10"\/><w:qFormat\/><w:pPr><w:spacing w:before="0" w:after="200"\/><\/w:pPr>/, "the title is at the top of the page, not a cover");
  assert.match(text(parts, "word/header1.xml"), /Saving &lt;guide&gt;/);
  assert.match(text(parts, "docProps/core.xml"), /<dc:title>Saving &lt;guide&gt;<\/dc:title>/);
  const bytes = await unzip(packGuideDocx(project, guide, flat));
  assert.ok(bytes["word/document.xml"] && bytes["word/media/step-1.png"] && bytes["[Content_Types].xml"], "it is a zip that reads back");
});

test("the left layout for every step, an empty guide, a table at the end, and odd text all still make a good file", async () => {
  const { project, guide, assets } = setup();
  setGuideLayoutLeft(guide);
  const { flat } = await flattenGuide(project, guide, assets, fakeFlatten().flatten);
  const doc = text(buildGuideDocxParts(project, guide, flat), "word/document.xml");
  assert.equal(count(doc, "<w:tbl>"), 4, "a table for each step that has a picture; none for the step without one or the missing one");
  assert.ok(!/<w:tbl>(?:(?!<\/w:tbl>).)*Step 6/s.test(doc), "the step with no picture has no table");
  // a guide that ends on a step in the left layout still ends on a paragraph, which Word needs after a table
  const last = newGuide("Last", [project.tree[0].children[0].id]);
  last.layout = "left";
  const lastDoc = text(buildGuideDocxParts(project, last, flat), "word/document.xml");
  assert.ok(lastDoc.includes("No picture here.") && !/<\/w:tbl><w:sectPr>/.test(lastDoc));
  const onlyTable = newGuide("Table last", [project.tree[0].children[0].id]);
  onlyTable.layout = "left";
  project.tree[0].children[0].page!.blocks = project.tree[0].children[0].page!.blocks.filter((b) => b.type !== "callout");
  (project.tree[0].children[0].page!.blocks.find((b) => b.type === "procedure") as unknown as { steps: Step[] }).steps = [step("s1", "Open the menu in {{PRODUCT}}.", "a")];
  const tableDoc = text(buildGuideDocxParts(project, onlyTable, flat), "word/document.xml");
  assert.match(tableDoc, /<\/w:tbl><w:p\/><w:sectPr>/, "a paragraph after the last table");
  assert.equal(xmlProblem(tableDoc), null);
  // an empty guide, and a topic that lost its steps
  const empty = buildGuideDocxParts(project, newGuide("Empty"), new Map());
  assert.match(text(empty, "word/document.xml"), /This guide has no tasks yet\./);
  assert.equal(xmlProblem(text(empty, "word/document.xml")), null);
  const nothing = newGuide("Nothing", [project.tree[0].id]);
  assert.match(text(buildGuideDocxParts(project, nothing, new Map()), "word/document.xml"), /has no numbered steps, so nothing of it is in the guide/);
  // text that could break XML
  const odd = createProject('A "quote" & <b>bold</b> \u0001 title');
  const topic = addNode(odd.tree, null, "Q&A <x> \u000B end");
  const p = makeBlock("procedure"); (p as { steps: Step[] }).steps = [step("o1", "]]> & <![CDATA[ \u0000 ok")];
  addBlock(ensurePage(topic), p);
  const g = newGuide('G "q" & <g>', [topic.id]);
  const parts = buildGuideDocxParts(odd, g, new Map());
  for (const name of Object.keys(parts).filter((n) => /\.(xml|rels)$/.test(n))) assert.equal(xmlProblem(text(parts, name)), null, name);
});

function setGuideLayoutLeft(guide: Guide) {
  guide.layout = "left";
}
