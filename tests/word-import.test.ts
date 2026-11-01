import test from "node:test";
import assert from "node:assert/strict";
import { addNode, addPicture, createProject, ensurePage, type Picture } from "../src/project/model.ts";
import { addBlock, makeBlock, type CalloutBlock, type ParagraphBlock, type PictureBlock, type ProcedureBlock } from "../src/project/page.ts";
import { formatMarks, parseMarks } from "../src/project/text.ts";
import { zip } from "../src/project/zip.ts";
import { buildDocxParts } from "../src/export/docx.ts";
import { importDocx, tidyRuns } from "../src/import/docx.ts";
import { decodeEntities, parseXml, textOf } from "../src/import/xml.ts";
import type { FlatPicture } from "../src/export/pictures.ts";

const enc = new TextEncoder();
const png = (w: number, h: number): Uint8Array => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return b;
};

test("the XML reader reads elements, attributes, text and entities, and refuses a broken file in words", () => {
  const root = parseXml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><!DOCTYPE x><!-- a comment --><w:p w:a="1 &gt; 0" b='two'><w:r><w:t xml:space="preserve">A &amp; B &#65;&#x42; &lt;c&gt;</w:t></w:r><w:br/><![CDATA[<raw>]]></w:p>`);
  assert.equal(root.name, "w:p");
  assert.deepEqual(root.attrs, { "w:a": "1 > 0", b: "two" });
  assert.equal(textOf(root), "A & B AB <c><raw>");
  assert.equal(root.children[1].name, "w:br");
  assert.equal(decodeEntities("&amp;&bogus;&#0;&#x110000;"), "&&bogus;&#0;&#x110000;");
  for (const [bad, why] of [["<a><b></a>", /does not match/], ["<a>", /<a> is not closed/], ["<a", /a tag is not finished/], ["", /there is no element/], ["<a></b>", /does not match/], ["<!-- x", /comment is not closed/]] as const) {
    assert.throws(() => parseXml(bad), why);
  }
});

test("spaces at the edge of a marked run go outside it, and neighbours with one mark are joined", () => {
  assert.deepEqual(tidyRuns([{ text: "Pre", mark: "bold" }, { text: "ss ", mark: "bold" }, { text: "now" }]), [{ text: "Press", mark: "bold" }, { text: " now" }]);
  assert.deepEqual(tidyRuns([{ text: " a ", mark: "italic" }, { text: "b" }]), [{ text: "a", mark: "italic" }, { text: " b" }], "the space moved out and the line's own edges are trimmed");
  assert.deepEqual(tidyRuns([{ text: "  " , mark: "bold" }]), [], "a marked run of spaces is only spaces");
  assert.equal(formatMarks(tidyRuns([{ text: "x ", mark: "bold" }, { text: "y" }])), "**x** y", "and the text a person edits is the same");
});

/** A small book with everything an export writes. */
function book() {
  const project = createProject("Round trip");
  project.variables = { PRODUCT: "Acme Draw", VERSION: "2.0", COMPANY: "Acme" };
  const one = addNode(project.tree, null, "Getting started");
  const saving = addNode(project.tree, one.id, "Saving");
  const printing = addNode(project.tree, one.id, "Printing");
  const two = addNode(project.tree, null, "Sharing");
  const shared = addNode(project.tree, two.id, "Sharing a file");
  const intro = makeBlock("paragraph") as ParagraphBlock;
  intro.text = parseMarks("Welcome. This chapter has **bold**, *italic* and [[Save]] words.");
  addBlock(ensurePage(one), intro);
  const picture: Picture = { id: "pic1", file: "images/pic1.png", width: 640, height: 360, altText: "The Save dialog", source: { kind: "import", capturedAt: "t" } };
  addPicture(project.tree, saving.id, picture);
  const para = makeBlock("paragraph") as ParagraphBlock;
  para.text = parseMarks("Press [[Save]] to keep your *work*.");
  const pic = makeBlock("picture") as PictureBlock;
  pic.pictureId = "pic1";
  const proc = makeBlock("procedure") as ProcedureBlock;
  proc.steps = [{ id: "s1", text: parseMarks("Open the [[File]] menu."), result: parseMarks("The menu opens.") }, { id: "s2", text: parseMarks("Choose **Save**."), pictureId: "pic1" }, { id: "s3", text: parseMarks("Close it.") }];
  const box = makeBlock("callout", { kind: "caution" }) as CalloutBlock;
  box.text = parseMarks("Save before you close.");
  const sub = makeBlock("heading");
  (sub as { text: string }).text = "Saving a copy";
  [para, pic, proc, box].forEach((b) => addBlock(ensurePage(saving), b));
  const second = makeBlock("procedure") as ProcedureBlock;
  second.steps = [{ id: "t1", text: parseMarks("Click Print.") }];
  addBlock(ensurePage(printing), second);
  const tip = makeBlock("callout", { kind: "power-tip" }) as CalloutBlock;
  tip.text = parseMarks("Use Ctrl+P.");
  addBlock(ensurePage(printing), tip);
  const last = makeBlock("paragraph") as ParagraphBlock;
  last.text = parseMarks("Share it.");
  addBlock(ensurePage(shared), last);
  const flat = new Map<string, FlatPicture>([["pic1", { path: "images/pic1.png", bytes: png(640, 360), width: 640, height: 360 }]]);
  return { project, flat, saving, printing };
}

test("a Word file OpenExplainer made comes back as the same chapters, topics, words, steps, boxes and picture", async () => {
  const { project, flat } = book();
  const bytes = zip(buildDocxParts(project, flat));
  const got = await importDocx(bytes, { now: "2026-11-01T00:00:00Z" });
  assert.deepEqual(got.chapters.map((c) => c.title), ["Getting started", "Sharing"], "the Heading 1 paragraphs are chapters");
  assert.deepEqual(got.chapters[0].children.map((t) => t.title), ["Saving", "Printing"], "and the Heading 2 ones are topics");
  assert.deepEqual(got.chapters[1].children.map((t) => t.title), ["Sharing a file"]);
  assert.equal(formatMarks((got.chapters[0].page!.blocks[0] as ParagraphBlock).text), "Welcome. This chapter has **bold**, *italic* and [[Save]] words.", "marks are kept");
  const saving = got.chapters[0].children[0];
  assert.deepEqual(saving.page!.blocks.map((b) => b.type), ["paragraph", "picture", "procedure", "callout"]);
  assert.equal(formatMarks((saving.page!.blocks[0] as ParagraphBlock).text), "Press [[Save]] to keep your *work*.");
  const proc = saving.page!.blocks[2] as ProcedureBlock;
  assert.deepEqual(proc.steps.map((s) => formatMarks(s.text)), ["Open the [[File]] menu.", "Choose **Save**.", "Close it."], "numbered steps are a procedure");
  assert.equal(formatMarks(proc.steps[0].result!), "The menu opens.", "a Result line is the step's result");
  assert.equal(saving.pictures.length, 1);
  assert.deepEqual([saving.pictures[0].width, saving.pictures[0].height, saving.pictures[0].altText], [640, 360, "The Save dialog"]);
  assert.equal(saving.pictures[0].source.kind, "import");
  assert.ok(got.assets.has(saving.pictures[0].file) && got.assets.get(saving.pictures[0].file)!.length === 33, "its file came with it");
  const placed = saving.page!.blocks[1] as PictureBlock;
  assert.equal(placed.pictureId, saving.pictures[0].id, "the picture block is on the page");
  const box = saving.page!.blocks[3] as CalloutBlock;
  assert.deepEqual([box.kind, formatMarks(box.text)], ["caution", "Save before you close."], "the label is not part of the words");
  const printing = got.chapters[0].children[1];
  assert.deepEqual(printing.page!.blocks.map((b) => b.type === "callout" ? b.kind : b.type), ["procedure", "power-tip"]);
  assert.ok(got.chapters.every((c) => c.status === "drafted"));
  assert.equal(got.title, "Round trip");
  assert.ok(!got.chapters.some((c) => c.title === "Index" || c.title === "Contents"), "the contents list is not a chapter");
  assert.match(got.report[0], /^Brought in 2 chapters and 3 topics, with 1 picture\.$/);
  assert.ok(got.report.some((l) => /of a title page, contents list, index or picture notes (was|were) left out/.test(l)));
  assert.ok(got.report.at(-1)!.startsWith("Every topic is marked Drafted."));
});

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const p = (style: string | null, inner: string, extra = "") => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${extra}</w:pPr>${inner}</w:p>`;
const r = (text: string, props = "") => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t>${text}</w:t></w:r>`;
const docx = (body: string, extra: Record<string, string | Uint8Array> = {}) => zip(Object.fromEntries(Object.entries<string | Uint8Array>({
  "word/document.xml": `<?xml version="1.0"?><w:document ${NS}><w:body>${body}</w:body></w:document>`,
  "word/styles.xml": `<?xml version="1.0"?><w:styles ${NS}>
    <w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:styleId="Heading2"><w:name w:val="heading 2"/></w:style><w:style w:styleId="Heading3"><w:name w:val="heading 3"/></w:style>
    <w:style w:styleId="MyTitle"><w:name w:val="Chapter title"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
    <w:style w:styleId="NoteBox"><w:name w:val="Note"/></w:style><w:style w:styleId="Warn"><w:name w:val="Warning box"/></w:style>
    <w:style w:styleId="Steps"><w:name w:val="Steps style"/><w:pPr><w:numPr><w:numId w:val="2"/></w:numPr></w:pPr></w:style>
    <w:style w:styleId="Child"><w:name w:val="Child"/><w:basedOn w:val="Heading2"/></w:style></w:styles>`,
  "word/numbering.xml": `<?xml version="1.0"?><w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`,
  ...extra,
}).map(([k, v]) => [k, typeof v === "string" ? enc.encode(v) : v])));

test("headings, lists, tables, links and boxes in an ordinary Word file become chapters, topics, steps and paragraphs, and what could not be used is said", async () => {
  const num = (id: number) => `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${id}"/></w:numPr>`;
  const body = [
    p("Title", r("My Manual")),
    p(null, r("Text before any heading.")),
    p("Heading1", r("Chapter one")),
    p(null, r("Chapter words with ") + r("bold", "<w:b/>") + r(" and ") + r("slanted", "<w:i/>") + r(".")),
    p("Heading2", r("First topic")),
    p(null, `<w:hyperlink><w:r><w:t>a link</w:t></w:r></w:hyperlink>` + r(" then ") + `<w:ins><w:r><w:t>inserted</w:t></w:r></w:ins><w:del><w:r><w:t>deleted</w:t></w:r></w:del>`),
    p(null, r("Bullet A"), num(1)),
    p(null, r("Bullet B"), num(1)),
    p(null, r("Step one"), num(2)),
    p(null, r("Step two"), num(2)),
    p("Steps", r("Step three, by its style")),
    p(null, r("A plain line after.")),
    p("Heading3", r("A sub-heading")),
    p("NoteBox", r("Note. Remember this.")),
    p("Warn", r("Careful.")),
    p("Heading2", r("Second topic")),
    `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Role</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Ann</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Lead</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`,
    `<w:sdt><w:sdtContent>${p(null, r("Inside a content control."))}</w:sdtContent></w:sdt>`,
    p("MyTitle", r("Chapter two by outline")),
    p("Child", r("Topic by inheritance")),
    p(null, r("Last words.")),
    p("Heading1", r("")),
  ].join("");
  const got = await importDocx(docx(body, { "word/comments.xml": `<w:comments ${NS}><w:comment w:id="0"><w:p><w:r><w:t>First note</w:t></w:r></w:p></w:comment><w:comment w:id="1"><w:p><w:r><w:t>Second</w:t></w:r></w:p></w:comment></w:comments>` }));
  assert.equal(got.title, "My Manual");
  assert.deepEqual(got.chapters.map((c) => c.title), ["My Manual", "Chapter one", "Chapter two by outline"], "text before the first heading goes in a chapter named after the title; an outline level counts as a heading");
  assert.equal(formatMarks((got.chapters[0].page!.blocks[0] as ParagraphBlock).text), "Text before any heading.");
  const [first, second] = got.chapters[1].children;
  assert.equal(formatMarks((got.chapters[1].page!.blocks[0] as ParagraphBlock).text), "Chapter words with **bold** and *slanted*.");
  assert.equal(formatMarks((first.page!.blocks[0] as ParagraphBlock).text), "a link then inserted", "a link keeps its words, an insertion its words, a deletion none");
  assert.deepEqual(first.page!.blocks.slice(1, 3).map((b) => (b as ParagraphBlock).text[0].text), ["• Bullet A", "• Bullet B"], "bullets become paragraphs that start with a bullet");
  const proc = first.page!.blocks[3] as ProcedureBlock;
  assert.deepEqual(proc.steps.map((s) => s.text[0].text), ["Step one", "Step two", "Step three, by its style"], "numbering, and numbering given by a style, make one procedure");
  assert.deepEqual(first.page!.blocks.slice(4).map((b) => b.type === "callout" ? b.kind : b.type), ["paragraph", "heading", "design-tip", "caution"]);
  assert.equal(first.page!.blocks[5].type === "heading" && first.page!.blocks[5].text, "A sub-heading");
  assert.deepEqual([first.page!.blocks[6], first.page!.blocks[7]].map((b) => b.type === "callout" && [b.kind, b.text[0].text]), [["design-tip", "Remember this."], ["caution", "Careful."]], "boxes by style name, with a label word removed");
  assert.deepEqual(second.page!.blocks.map((b) => (b as ParagraphBlock).text.map((t) => t.text).join("")), ["Name | Role", "Ann | Lead", "Inside a content control."], "a table is one line for each row");
  assert.deepEqual(got.chapters[2].children.map((t) => t.title), ["Topic by inheritance"], "a style based on Heading 2 is a topic");
  assert.deepEqual(got.report, [
    "Brought in 3 chapters and 3 topics, with 0 pictures.",
    "Headings deeper than the second level became sub-headings inside their topic.",
    "2 bulleted lines became paragraphs that start with a bullet.",
    "1 table became one line for each of 2 rows, with the cells divided by |.",
    "1 line of a title page, contents list, index or picture notes was left out.",
    "2 comments in the file were not brought in.",
    "Every topic is marked Drafted. Read each one: the words came from a file that was made for another tool.",
  ]);
});

test("a file with one level of heading makes each heading a topic; a file with none makes one topic; pictures other than PNG and JPEG are counted", async () => {
  const one = await importDocx(docx([p("Heading1", r("Alpha")), p(null, r("a words")), p("Heading1", r("Beta")), p(null, r("b words"))].join("")), { name: "Named file" });
  assert.deepEqual(one.chapters.map((c) => [c.title, c.children.map((t) => t.title)]), [["Named file", ["Alpha", "Beta"]]]);
  assert.ok(one.report.includes("The file uses one level of heading, so each heading became a topic in one chapter."));
  const none = await importDocx(docx(p(null, r("Just words."))));
  assert.deepEqual(none.chapters.map((c) => [c.title, c.page!.blocks.length]), [["Imported from Word", 1]]);
  assert.ok(none.report.includes("The file has no headings, so everything is in one topic. Split it by hand."));
  const drawing = (rid: string) => `<w:r><w:drawing><wp:inline><wp:docPr id="1" name="P" descr="A gif"/><a:graphic><a:graphicData><a:blip r:embed="${rid}"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  const pics = await importDocx(docx([p("Heading1", r("Pics")), p(null, drawing("rId1")), p(null, drawing("rId2")), p(null, drawing("rId9"))].join(""), {
    "word/_rels/document.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="media/a.png"/><Relationship Id="rId2" Target="media/b.gif"/></Relationships>`,
    "word/media/a.png": png(10, 20),
    "word/media/b.gif": enc.encode("GIF89a"),
  }));
  assert.deepEqual(pics.chapters[0].children[0].pictures.map((x) => [x.width, x.height, x.altText]), [[10, 20, "A gif"]]);
  assert.ok(pics.report.some((l) => l === "2 pictures could not be brought in: only PNG and JPEG are used, and the file may hold others (such as GIF, EMF or a drawing)."));
});

test("a file that is not a Word file, or is damaged, is refused in plain words and nothing is brought in", async () => {
  await assert.rejects(importDocx(enc.encode("not a zip")), /This is not a Word file \(\.docx\): it could not be opened as one\. Nothing was imported\./);
  await assert.rejects(importDocx(zip({ "a.txt": enc.encode("x") })), /it has no word\/document\.xml\. A Word file in the older \.doc form must be saved as \.docx first/);
  await assert.rejects(importDocx(zip({ "word/document.xml": enc.encode("<w:document><w:body><w:p></w:document>") })), /The XML is damaged/);
  await assert.rejects(importDocx(zip({ "word/document.xml": enc.encode("<w:document/>") })), /has no body/);
});
