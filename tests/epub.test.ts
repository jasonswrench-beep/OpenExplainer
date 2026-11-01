import test from "node:test";
import assert from "node:assert/strict";
import { addNode, addPicture, createProject, ensurePage, findNode, type Picture, type Project } from "../src/project/model.ts";
import { addBlock, makeBlock, type CalloutBlock, type ParagraphBlock, type PictureBlock, type ProcedureBlock } from "../src/project/page.ts";
import { parseMarks } from "../src/project/text.ts";
import { unzip } from "../src/project/zip.ts";
import { buildEpubParts, packEpub } from "../src/export/epub.ts";
import { makeExport, EXPORT_EXTENSION } from "../src/export/make.ts";
import { descendantsNamed, parseXml, type XmlNode } from "../src/import/xml.ts";
import type { FlatPicture } from "../src/export/pictures.ts";

const NOW = "2026-11-01T10:00:00.000Z";
const dec = new TextDecoder();
const ID = "urn:uuid:11111111-2222-3333-4444-555555555555";

const png = (): Uint8Array => { const b = new Uint8Array(33); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]); return b; };

function book(options: { alt?: boolean } = {}) {
  const project = createProject("Acme's <Draw> Guide");
  project.variables = { PRODUCT: "Acme Draw", VERSION: "2.0", COMPANY: "Acme & Sons" };
  const one = addNode(project.tree, null, "Getting started");
  const saving = addNode(project.tree, one.id, "Saving");
  const printing = addNode(project.tree, one.id, "Printing");
  const two = addNode(project.tree, null, "Appendix: Keys");
  const keys = addNode(project.tree, two.id, "Shortcuts");
  const picture: Picture = { id: "pic1", file: "images/pic1.png", width: 640, height: 360, altText: options.alt === false ? "" : "The Save dialog with a Save button", source: { kind: "import", capturedAt: NOW } };
  addPicture(project.tree, saving.id, picture);
  const para = makeBlock("paragraph") as ParagraphBlock;
  para.text = [...parseMarks("Press [[Save]] to keep your *work*, then see "), { text: "Printing", mark: "link", topic: printing.id }, { text: "." }];
  const pic = makeBlock("picture") as PictureBlock;
  pic.pictureId = "pic1";
  const proc = makeBlock("procedure") as ProcedureBlock;
  proc.steps = [{ id: "s1", text: parseMarks("Open the File menu.") }, { id: "s2", text: parseMarks("Choose **Save**."), pictureId: "pic1", result: parseMarks("A file is saved.") }];
  const box = makeBlock("callout", { kind: "caution" }) as CalloutBlock;
  box.text = parseMarks("Save before you close <now> & always.");
  const sub = makeBlock("heading");
  (sub as { text: string }).text = "Saving a copy";
  [para, pic, proc, box, sub].forEach((b) => addBlock(ensurePage(saving), b));
  const last = makeBlock("paragraph") as ParagraphBlock;
  last.text = parseMarks("Ctrl+S saves.");
  addBlock(ensurePage(keys), last);
  const lastPara = makeBlock("paragraph") as ParagraphBlock;
  lastPara.text = parseMarks("Print it.");
  addBlock(ensurePage(printing), lastPara);
  findNode(project.tree, saving.id)!.seeAlso = [printing.id];
  findNode(project.tree, saving.id)!.index = { terms: [{ text: "Saving files", by: "author" }] };
  const flat = new Map<string, FlatPicture>([["pic1", { path: "images/pic1.png", bytes: png(), width: 640, height: 360 }]]);
  return { project, flat, one, saving, printing, two, keys };
}

const read = (parts: Record<string, Uint8Array>, path: string) => dec.decode(parts[path]);
const ids = (node: XmlNode) => new Set(descendantsNamed(node, "section").concat(descendantsNamed(node, "h1"), descendantsNamed(node, "nav")).map((n) => n.attrs["id"]).filter(Boolean));

test("the EPUB is a zip that starts with the mimetype, stored and with nothing added, then the container and the package", () => {
  const { project, flat } = book();
  const bytes = packEpub(project, flat, { now: NOW, identifier: ID });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50, "a zip");
  assert.equal(view.getUint16(8, true), 0, "the first entry is stored, not compressed");
  assert.equal(view.getUint16(28, true), 0, "and has no extra field");
  assert.equal(dec.decode(bytes.slice(30, 38)), "mimetype");
  assert.equal(dec.decode(bytes.slice(38, 38 + 20)), "application/epub+zip", "its content is exactly the type, with no newline");
  const parts = buildEpubParts(project, flat, { now: NOW, identifier: ID });
  assert.deepEqual(Object.keys(parts).slice(0, 2), ["mimetype", "META-INF/container.xml"]);
  assert.match(read(parts, "META-INF/container.xml"), /full-path="OEBPS\/content\.opf" media-type="application\/oebps-package\+xml"/);
});

test("every XML file is well-formed, every file the package lists is in it, and every link goes to a place that exists", () => {
  const { project, flat } = book();
  const parts = buildEpubParts(project, flat, { now: NOW, identifier: ID });
  const names = Object.keys(parts);
  const xmlFiles = names.filter((n) => /\.(xhtml|opf|xml)$/.test(n));
  assert.ok(xmlFiles.length >= 7, "title, nav, 2 chapters, index, package and container");
  const documents = new Map(xmlFiles.map((n) => [n, parseXml(read(parts, n))])); // throws if one is not well-formed
  const opf = documents.get("OEBPS/content.opf")!;
  const manifest = descendantsNamed(opf, "item");
  for (const item of manifest) assert.ok(`OEBPS/${item.attrs["href"]}` in parts, `${item.attrs["href"]} is in the file`);
  const manifestIds = new Set(manifest.map((i) => i.attrs["id"]));
  const spine = descendantsNamed(opf, "itemref");
  assert.deepEqual(spine.map((s) => s.attrs["idref"]), ["title", "ch1", "ch2", "index"], "the reading order is the book's order");
  for (const ref of spine) assert.ok(manifestIds.has(ref.attrs["idref"]));
  assert.equal(manifest.filter((i) => i.attrs["properties"] === "nav").length, 1, "exactly one navigation document");
  assert.equal(new Set(manifest.map((i) => i.attrs["id"])).size, manifest.length, "ids are used once");
  for (const [name, doc] of documents) {
    if (!name.endsWith(".xhtml")) continue;
    for (const a of descendantsNamed(doc, "a")) {
      const href = a.attrs["href"];
      if (!href || /^[a-z]+:/.test(href)) continue;
      const [file, anchor] = href.split("#");
      const target = documents.get(`OEBPS/${file || name.replace("OEBPS/", "")}`);
      assert.ok(target, `${name} links to ${href}, a file that is there`);
      if (anchor) assert.ok(ids(target!).has(anchor) || descendantsNamed(target!, "h2").some((h) => h.attrs["id"] === anchor), `${name} links to #${anchor}, which exists in ${file}`);
    }
  }
});

test("the book's words, numbers, steps, boxes, links and pictures are in the chapter pages, safely written", () => {
  const { project, flat, saving, printing } = book();
  const parts = buildEpubParts(project, flat, { now: NOW, identifier: ID });
  const ch1 = read(parts, "OEBPS/ch1.xhtml");
  assert.match(ch1, /<h1>1 Getting started<\/h1>/);
  assert.match(ch1, new RegExp(`<h2>1\\.1 Saving</h2>`));
  assert.match(ch1, /<section id="t-[^"]+" epub:type="chapter">/);
  assert.match(ch1, /In This Chapter/);
  assert.match(ch1, /<h3>Saving a copy<\/h3>/, "a heading block is one level below its topic");
  assert.match(ch1, /<ol class="pv-steps"><li><p>Open the File menu\.<\/p><\/li><li><p>Choose <strong>Save<\/strong>\.<\/p><figure/);
  assert.match(ch1, /Result:<\/strong> A file is saved\./);
  assert.match(ch1, /Save before you close &lt;now&gt; &amp; always\./, "typed characters cannot add markup");
  assert.match(ch1, /<strong class="control-name">Save<\/strong>/);
  assert.match(ch1, new RegExp(`<a class="topic-link" href="ch1\\.xhtml#t-${printing.id}">Printing</a><span class="pv-ref"> \\(1\\.2\\)</span>`), "a link in the text goes to the topic, with its number");
  assert.match(ch1, /<section class="pv-see-also"><h3>See also<\/h3>/);
  assert.match(ch1, /<img src="images\/pic1\.png" alt="The Save dialog with a Save button" width="640" height="360"\/>/, "the picture's description is its alternative text and the tag is closed");
  assert.equal(/<img [^>]*[^/]>/.test(ch1), false, "every img is closed");
  assert.match(read(parts, "OEBPS/ch2.xhtml"), /<section id="t-[^"]+" epub:type="appendix">/, "a chapter named Appendix is an appendix");
  assert.match(read(parts, "OEBPS/ch2.xhtml"), /In This Appendix/);
  assert.ok(`OEBPS/images/pic1.png` in parts && parts["OEBPS/images/pic1.png"].length === 33, "the picture file is in");
  assert.match(read(parts, "OEBPS/content.opf"), /<item id="img1" href="images\/pic1\.png" media-type="image\/png"\/>/);
  void saving;
});

test("the navigation document is the contents: every chapter and topic, nested, each a link, with landmarks", () => {
  const { project, flat } = book();
  const parts = buildEpubParts(project, flat, { now: NOW, identifier: ID });
  const nav = parseXml(read(parts, "OEBPS/nav.xhtml"));
  const navs = descendantsNamed(nav, "nav");
  assert.deepEqual(navs.map((n) => n.attrs["epub:type"]), ["toc", "landmarks"]);
  const links = descendantsNamed(navs[0], "a").map((a) => a.children.map((c) => c.text ?? "").join(""));
  assert.deepEqual(links, ["Title page", "1 Getting started", "1.1 Saving", "1.2 Printing", "2 Appendix: Keys", "2.1 Shortcuts", "Index"]);
  assert.equal(descendantsNamed(navs[0], "ol").length, 1 + 2 + 0, "the top list and one for each chapter's topics");
  assert.match(read(parts, "OEBPS/nav.xhtml"), /<a epub:type="bodymatter" href="ch1\.xhtml">/);
  assert.match(read(parts, "OEBPS/nav.xhtml"), /<h1>Contents<\/h1>/);
});

test("the package says who and what it is, and states the accessibility features it really has", () => {
  const { project, flat } = book();
  const opf = read(buildEpubParts(project, flat, { now: NOW, identifier: ID }), "OEBPS/content.opf");
  assert.match(opf, /<dc:identifier id="book-id">urn:uuid:11111111-2222-3333-4444-555555555555<\/dc:identifier>/);
  assert.match(opf, /<dc:title>Acme&#39;s &lt;Draw&gt; Guide<\/dc:title>/);
  assert.match(opf, /<dc:language>en<\/dc:language>/);
  assert.match(opf, /<dc:publisher>Acme &amp; Sons<\/dc:publisher>/);
  assert.match(opf, /<meta property="dcterms:modified">2026-11-01T10:00:00Z<\/meta>/);
  assert.deepEqual([...opf.matchAll(/schema:accessibilityFeature">([^<]+)</g)].map((m) => m[1]), ["tableOfContents", "structuralNavigation", "readingOrder", "index", "alternativeText"]);
  assert.deepEqual([...opf.matchAll(/schema:accessMode">([^<]+)</g)].map((m) => m[1]), ["textual", "visual"]);
  assert.deepEqual([...opf.matchAll(/schema:accessModeSufficient">([^<]+)</g)].map((m) => m[1]), ["textual", "textual,visual"]);
  assert.match(opf, /accessibilityHazard">none</);
  assert.match(opf, /All 1 picture has a description/);
  assert.match(opf, /It has not been checked against an accessibility standard\./, "no conformance is claimed");
  assert.equal(opf.includes("conformsTo"), false);
  // With a picture that has no description, it does not claim alternative text and says how many are missing.
  const { project: bare, flat: bareFlat } = book({ alt: false });
  const bareOpf = read(buildEpubParts(bare, bareFlat, { now: NOW, identifier: ID }), "OEBPS/content.opf");
  assert.equal(bareOpf.includes("alternativeText"), false);
  assert.deepEqual([...bareOpf.matchAll(/schema:accessModeSufficient">([^<]+)</g)].map((m) => m[1]), ["textual,visual"]);
  assert.match(bareOpf, /1 of its 1 pictures have no description yet/);
});

test("the index is a page with links to topics, the title page follows the look, and the style sheet uses the look", () => {
  const { project, flat, saving } = book();
  const parts = buildEpubParts(project, flat, { now: NOW, identifier: ID });
  const index = read(parts, "OEBPS/book-index.xhtml");
  assert.match(index, /<h1>Index<\/h1>/);
  assert.match(index, new RegExp(`Saving files.*<a href="ch1\\.xhtml#t-${saving.id}">1\\.1</a>`));
  const title = read(parts, "OEBPS/title.xhtml");
  assert.match(title, /epub:type="titlepage"/);
  assert.match(title, /<p>Acme Draw<\/p><p>2\.0<\/p><p>Acme &amp; Sons<\/p>/);
  project.look.cover = false;
  project.look.bodyFont = "verdana";
  project.look.headingFont = "times";
  project.look.accent = "#1F4E8C";
  const plain = buildEpubParts(project, flat, { now: NOW, identifier: ID });
  assert.equal("OEBPS/title.xhtml" in plain, false, "no title page when the look says none");
  assert.deepEqual(descendantsNamed(parseXml(read(plain, "OEBPS/content.opf")), "itemref").map((i) => i.attrs["idref"]), ["ch1", "ch2", "index"]);
  const css = read(plain, "OEBPS/styles.css");
  assert.match(css, /font-family: Verdana, "Segoe UI", Arial, sans-serif/);
  assert.match(css, /h1, h2, h3, h4, h5, h6 \{ font-family: "Times New Roman", Times, serif; color: #1F4E8C;/);
  assert.match(css, /\.pv-box-caution \{ border-left-color: #A31515; \}/);
});

test("the logo goes on the title page with its description; an empty book still has a page to read; the book is exported as a kind", async () => {
  const { project, flat } = book();
  project.look.logo = { file: "images/logo-file.png", width: 100, height: 50, alt: "Acme logo" };
  flat.set("@logo", { path: "images/logo.png", bytes: png(), width: 100, height: 50 });
  const parts = buildEpubParts(project, flat, { now: NOW, identifier: ID });
  assert.match(read(parts, "OEBPS/title.xhtml"), /<img src="images\/logo\.png" alt="Acme logo" width="100" height="50"\/>/);
  const empty = buildEpubParts(createProject("Nothing"), new Map(), { now: NOW, identifier: ID });
  const spine = descendantsNamed(parseXml(read(empty, "OEBPS/content.opf")), "itemref").map((i) => i.attrs["idref"]);
  assert.equal(spine.length >= 1, true);
  parseXml(read(empty, "OEBPS/nav.xhtml"));
  const made = await makeExport(project, new Map([["images/pic1.png", png()], ["images/logo-file.png", png()]]) as never, "epub", { flatten: async () => png(), now: NOW });
  assert.equal(made.extension, "epub");
  assert.equal(EXPORT_EXTENSION.epub, "epub");
  const files = await unzip(made.bytes);
  assert.ok(files["OEBPS/content.opf"] && files["mimetype"]);
  const text = (p: Project) => p.name;
  void text;
});
