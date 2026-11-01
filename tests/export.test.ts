import test from "node:test";
import assert from "node:assert/strict";
import { flatFiles, flattenPlaced, placedPictures } from "../src/export/pictures.ts";
import { BOOK_FILE, buildJsonExport, EXPORT_FORMAT, EXPORT_VERSION, packJsonExport, readJsonExport, unpackJsonExport } from "../src/export/json.ts";
import { bookMarkdown, buildMarkdown, escapeInline, escapeMarkdown, MARKDOWN_FILE } from "../src/export/markdown.ts";
import { buildHelpSite, buildHelpSiteText, pageFile, slugOf } from "../src/export/help-site.ts";
import { SITE_CSS, SITE_JS } from "../src/export/site-assets.ts";
import { buildDocxParts, packDocx, xml } from "../src/export/docx.ts";
import { unzip } from "../src/project/zip.ts";
import { addNode, addPicture, createProject, CURRENT_VERSION, ensurePage, type Picture, type Project } from "../src/project/model.ts";
import { addBlock, makeBlock } from "../src/project/page.ts";
import { addComment } from "../src/project/comments.ts";
import { newShape, type ArrowShape, type MarkerShape, type TextShape } from "../src/project/shapes.ts";
import type { Assets } from "../src/project/package.ts";
import { checkContrast, GRAPHIC_MIN, TEXT_MIN } from "../src/project/contrast.ts";

const size = { width: 1920, height: 1080 };
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const picture = (id: string, extra: Partial<Picture> = {}): Picture => ({ id, file: `images/${id}.png`, ...size, altText: `Picture ${id}`, source: { kind: "click", capturedAt: "t", originalName: `${id}.png` }, click: { x: 960, y: 540, button: "left" }, ...extra });

function book(): { project: Project; assets: Assets } {
  const project = createProject("My <Book> & more");
  project.variables = { PRODUCT: "Acme Draw", VERSION: "2.0", COMPANY: "" };
  project.styles = [{ id: "s1", name: "Warning", fill: "#C62828", outline: "#000000", textColor: "#FFFFFF" }];
  const chapter = addNode(project.tree, null, "Getting started");
  const saving = addNode(project.tree, chapter.id, "Saving & closing");
  const second = addNode(project.tree, null, "Printing");
  const arrow = { ...(newShape("arrow", size) as ArrowShape), alt: "Points at Save" };
  const text = { ...(newShape("text", size) as TextShape), text: "Press Save", fill: "#C62828", textColor: "#FFFFFF" };
  const marker = { ...(newShape("marker", size) as MarkerShape), label: "2" };
  addPicture(project.tree, saving.id, picture("p1", { callouts: [{ id: "c1", name: "Save", description: "Saves your work.", target: { x: 121, y: 431, width: 150, height: 44 }, marker: { x: 92, y: 402 } }], shapes: [arrow, text, marker] }));
  addPicture(project.tree, saving.id, picture("p2", { view: { kind: "zoom" } }));
  addPicture(project.tree, saving.id, picture("p3"));
  addPicture(project.tree, saving.id, picture("p4"));
  const page = ensurePage(saving);
  const heading = makeBlock("heading"); (heading as { text: string }).text = "Before you begin";
  const para = makeBlock("paragraph"); (para as { text: unknown }).text = [{ text: "Press " }, { text: "Save", mark: "control" }, { text: " in {{PRODUCT}}: *stars*, _under_ and #hash <tag> [link]." }];
  const pic = makeBlock("picture", { pictureId: "p1" });
  const proc = makeBlock("procedure"); (proc as { steps: unknown }).steps = [
    { id: "s1", text: [{ text: "Open the " }, { text: "File", mark: "control" }, { text: " menu." }], result: [{ text: "The menu opens.", mark: "italic" }] },
    { id: "s2", text: [{ text: "Choose Save." }], pictureId: "p2" },
  ];
  const box = makeBlock("callout", { kind: "caution" }); (box as { text: unknown }).text = [{ text: "Save first.", mark: "bold" }];
  const missing = makeBlock("picture", { pictureId: "p4" });
  [heading, para, pic, proc, box, missing].forEach((b) => addBlock(page, b));
  addComment(page, page.blocks[1].id, "SECRET comment words", "2026-10-21T10:00:00.000Z");
  const intro = ensurePage(chapter);
  const introPara = makeBlock("paragraph"); (introPara as { text: unknown }).text = [{ text: "Welcome to the book." }];
  addBlock(intro, introPara);
  const second1 = ensurePage(second);
  const p2 = makeBlock("paragraph"); (p2 as { text: unknown }).text = [{ text: "Print it." }];
  addBlock(second1, p2);
  const assets: Assets = new Map([["images/p1.png", PNG], ["images/p2.png", new Uint8Array([9, 9])], ["images/p3.png", new Uint8Array([8])]]);
  return { project, assets };
}

/** A stand-in for the canvas: records what it was asked to draw and gives back bytes that say which picture it was. */
function fakeFlatten() {
  const calls: { file: string; shown: unknown; overlayTags: string[] | null }[] = [];
  const flatten = async (bytes: Uint8Array, file: string, shown: unknown, overlay: { parts: { tag: string }[] } | null) => {
    calls.push({ file, shown, overlayTags: overlay ? overlay.parts.map((p) => p.tag) : null });
    if (file.includes("p3")) throw new Error("cannot draw");
    return new Uint8Array([...bytes, 255]);
  };
  return { flatten: flatten as never, calls };
}

const tagCount = (html: string, tag: string, close: boolean) => (html.match(new RegExp(`<${close ? "/" : ""}${tag}[\\s>]`, "g")) ?? []).length;
function balanced(html: string): string[] {
  return ["div", "section", "nav", "ul", "ol", "li", "article", "main", "aside", "figure", "figcaption", "header", "form", "html", "head", "body", "script"]
    .filter((tag) => tagCount(html, tag, false) !== tagCount(html, tag, true));
}

test("the pictures for an output are the ones on a page, cut to the part shown with their marks drawn in, and the project's files are untouched", async () => {
  const { project, assets } = book();
  assert.deepEqual(placedPictures(project).map((p) => p.id), ["p1", "p2", "p4"], "p3 is in the topic but not on its page");
  const { flatten, calls } = fakeFlatten();
  const before = JSON.stringify([...assets.entries()]);
  const result = await flattenPlaced(project, assets, "book", flatten);
  assert.deepEqual([...result.flat.keys()], ["p1", "p2"]);
  assert.deepEqual(result.missing, ["Picture p4"], "p4 is on a page but its file is not in the project");
  assert.deepEqual(result.failed, []);
  assert.equal(result.flat.get("p1")!.path, "images/p1.png");
  assert.deepEqual([...result.flat.get("p1")!.bytes].slice(-1), [255]);
  assert.deepEqual(calls[0].shown, { x: 0, y: 0, width: 1920, height: 1080 }, "a whole picture is kept whole");
  assert.ok(calls[0].overlayTags!.includes("polygon") && calls[0].overlayTags!.includes("text"), "its marks and callouts are drawn in");
  assert.deepEqual(calls[1].shown, { x: 480, y: 270, width: 960, height: 540 }, "a zoomed picture is cut to the book's zoom");
  assert.equal(calls[1].overlayTags, null, "and nothing is drawn on one with nothing to draw");
  assert.equal(JSON.stringify([...assets.entries()]), before, "the project's own picture files are not changed");
  assert.deepEqual(Object.keys(flatFiles(result.flat)), ["images/p1.png", "images/p2.png"]);
  project.tree[0].children[0].pictures.push(picture("p5"));
  const failed = await flattenPlaced(project, new Map([...assets, ["images/p4.png", PNG]]), "book", async () => { throw new Error("no"); });
  assert.equal(failed.flat.size, 0);
  assert.deepEqual(failed.failed, ["Picture p1", "Picture p2", "Picture p4"], "a picture that cannot be drawn is named, and the rest are still tried");
});

test("a JSON export holds the structure, the text of every page, the callouts and marks, the variables and the picture files, and leaves the working comments out", () => {
  const { project, assets } = book();
  const { files, missing } = buildJsonExport(project, assets, { now: "2026-10-21T10:00:00.000Z" });
  assert.deepEqual(Object.keys(files).sort(), ["book.json", "images/p1.png", "images/p2.png", "images/p3.png"]);
  assert.deepEqual(missing, ["images/p4.png"]);
  const json = JSON.parse(new TextDecoder().decode(files[BOOK_FILE]));
  assert.deepEqual([json.format, json.exportVersion, json.projectVersion, json.exportedAt, json.name], [EXPORT_FORMAT, EXPORT_VERSION, CURRENT_VERSION, "2026-10-21T10:00:00.000Z", "My <Book> & more"]);
  assert.deepEqual(json.variables, project.variables);
  assert.deepEqual(json.styles, project.styles);
  assert.deepEqual(json.tree.map((n: { number: string; title: string }) => `${n.number} ${n.title}`), ["1 Getting started", "2 Printing"]);
  assert.equal(json.tree[0].children[0].number, "1.1");
  const topic = json.tree[0].children[0];
  assert.equal(topic.page.blocks.length, 6);
  assert.equal(topic.page.comments, undefined, "comments are not in the export unless asked for");
  assert.equal(topic.pictures[0].callouts[0].name, "Save");
  assert.equal(topic.pictures[0].shapes.length, 3);
  assert.ok(!new TextDecoder().decode(files[BOOK_FILE]).includes("SECRET"));
  const withComments = JSON.parse(new TextDecoder().decode(buildJsonExport(project, assets, { comments: true }).files[BOOK_FILE]));
  assert.equal(withComments.tree[0].children[0].page.comments.length, 1);
  assert.equal(withComments.exportedAt, undefined, "no time unless one is given");
  assert.equal(json.tree[1].page.blocks[0].type, "paragraph");
  assert.equal(json.tree[0].children[0].children.length, 0);
});

test("an export is read back into the same project, and the picture files come with it", async () => {
  const { project, assets } = book();
  const { bytes, missing } = packJsonExport(project, assets, { comments: true });
  assert.deepEqual(missing, ["images/p4.png"]);
  const back = await unpackJsonExport(bytes);
  assert.deepEqual(back.project, project, "the same book, comments included when they were exported");
  assert.deepEqual([...back.assets.keys()].sort(), ["images/p1.png", "images/p2.png", "images/p3.png"]);
  assert.deepEqual(back.missing, ["images/p4.png"], "a picture whose file was not in the export is reported");
  const without = (await unpackJsonExport(packJsonExport(project, assets).bytes)).project;
  assert.equal(without.tree[0].children[0].page!.comments, undefined);
  assert.deepEqual({ ...without, tree: [] }, { ...project, tree: [] });
});

test("an export that is not one, is damaged, or is from a newer program is refused in plain words, and odd data in a hand-made one is put right", () => {
  const enc = (o: unknown) => new TextEncoder().encode(typeof o === "string" ? o : JSON.stringify(o));
  assert.throws(() => readJsonExport({}), /has no book\.json/);
  assert.throws(() => readJsonExport({ [BOOK_FILE]: enc("{not json") }), /book\.json in this export is damaged/);
  assert.throws(() => readJsonExport({ [BOOK_FILE]: enc({ format: "something-else" }) }), /not an OpenExplainer export/);
  assert.throws(() => readJsonExport({ [BOOK_FILE]: enc({ format: EXPORT_FORMAT, exportVersion: 99, projectVersion: 1 }) }), /newer OpenExplainer \(export format 99\)/);
  assert.throws(() => readJsonExport({ [BOOK_FILE]: enc({ format: EXPORT_FORMAT, exportVersion: 1 }) }), /does not say which project format/);
  const odd = readJsonExport({
    [BOOK_FILE]: enc({
      format: EXPORT_FORMAT, exportVersion: 1, projectVersion: CURRENT_VERSION, name: "Odd", template: "empty", variables: { A: "1" }, styles: [{ name: "X", fill: "zzz" }],
      tree: [{ id: "n1", title: "T", status: "captured", number: "99", pictures: [{ ...picture("px"), shapes: [{ kind: "marker", at: { x: -5, y: 9999 }, label: "!!" }, { kind: "spiral" }] }], page: { blocks: [{ id: "b1", type: "paragraph", text: [{ text: "Hi" }] }, { id: "b2", type: "nonsense" }] }, children: [] }],
    }),
  });
  assert.equal(odd.project.tree[0].page!.blocks.length, 1, "a block of an unknown kind is dropped");
  assert.deepEqual(odd.project.tree[0].pictures[0].shapes!.map((s) => s.kind), ["marker"]);
  assert.deepEqual(odd.project.styles.map((s) => [s.name, s.fill]), [["X", null]]);
  assert.equal(odd.project.tree[0].title, "T");
  assert.deepEqual(odd.missing, ["images/px.png"]);
});

test("the Markdown has a title, a contents list, numbered headings, text with its marks, and everything from the project read as text, not as Markdown", async () => {
  const { project, assets } = book();
  const { flatten } = fakeFlatten();
  const { flat } = await flattenPlaced(project, assets, "book", flatten);
  const md = bookMarkdown(project, flat);
  assert.match(md, /^# My &lt;Book> & more\n\n## Contents\n\n- 1 Getting started\n  - 1\.1 Saving & closing\n- 2 Printing\n\n## 1 Getting started\n\nWelcome to the book\.\n\n### 1\.1 Saving & closing\n/);
  assert.match(md, /\n#### Before you begin\n/, "a heading block is one level below its topic's heading");
  assert.match(md, /Press \*\*Save\*\* in Acme Draw: \\\*stars\\\*, \\_under\\_ and #hash &lt;tag> \\\[link\\\]\./, "bold for a control name; special characters kept as plain text; the variable filled in");
  assert.match(md, /!\[Picture p1 Marks: Arrow: Points at Save\. Text box: "Press Save"\. Marker 2\.\]\(images\/p1\.png\)\n\n- A\. Save: Saves your work\./, "the picture, its description with the marks, and the callout entries under it");
  assert.match(md, /1\. Open the \*\*File\*\* menu\.\n\n   \*Result:\* \*The menu opens\.\*\n\n2\. Choose Save\.\n\n   !\[Picture p2\]\(images\/p2\.png\)/, "numbered steps with a result and a picture indented under their step");
  assert.match(md, /> \*\*Caution\.\*\* \*\*Save first\.\*\*/, "a callout box as a quotation with its kind in words");
  assert.match(md, /\*\(The picture "Picture p4" could not be included\.\)\*/, "a picture that could not be made is said, not left as a broken link");
  assert.ok(!md.includes("SECRET") && !md.includes("data-"), "no comments");
  assert.equal(escapeMarkdown("# a\n- b\n1. c\n> d"), "\\# a\n\\- b\n1\\. c\n\\> d", "a line that would start a heading, list or quotation is kept as text");
  assert.equal(escapeMarkdown("a\\b"), "a\\\\b");
  assert.equal(escapeInline("1. # - not at a line start"), "1. # - not at a line start", "only the start of a line needs the extra care");
  const files = buildMarkdown(project, flat);
  assert.deepEqual(Object.keys(files).sort(), [MARKDOWN_FILE, "images/p1.png", "images/p2.png"].sort());
  assert.equal(new TextDecoder().decode(files[MARKDOWN_FILE]), md);
});

test("file names for the help site are a number and a plain title, and two topics never share one", () => {
  assert.equal(slugOf("Saving & closing"), "saving-closing");
  assert.equal(slugOf("  Über   Größe!! "), "uber-grosse");
  assert.equal(slugOf("???"), "topic");
  assert.equal(slugOf("a".repeat(80)).length, 50);
  assert.equal(pageFile("2.1", "Saving & closing"), "2-1-saving-closing.html");
  const project = createProject("Same");
  const a = addNode(project.tree, null, "Same title");
  const b = addNode(project.tree, null, "Same title");
  b.id = a.id + "x";
  const text = buildHelpSiteText(project, new Map());
  assert.ok("1-same-title.html" in text && "2-same-title.html" in text, "different numbers make different files");
});

test("the help site has a page for each topic with the contents tree, breadcrumbs, previous and next links as links between files, and a first page", async () => {
  const { project, assets } = book();
  const { flat } = await flattenPlaced(project, assets, "book", fakeFlatten().flatten);
  const files = buildHelpSiteText(project, flat);
  assert.deepEqual(Object.keys(files).sort(), ["1-1-saving-closing.html", "1-1-saving-closing.md", "1-getting-started.html", "1-getting-started.md", "2-printing.html", "2-printing.md", "assets/search-index.js", "assets/site.css", "assets/site.js", "index.html", "llms-full.txt", "llms.txt"].sort());
  const saving = files["1-1-saving-closing.html"];
  assert.equal(files["index.html"], files["1-getting-started.html"], "index.html is the first topic");
  assert.match(saving, /^<!DOCTYPE html>\n<html lang="en">/);
  assert.match(saving, /<title>1\.1 Saving &amp; closing - My &lt;Book&gt; &amp; more<\/title>/);
  assert.match(saving, /<a class="skip-link" href="#topic-main">Skip to the topic<\/a>/);
  assert.match(saving, /<main class="hs-page" id="topic-main" tabindex="-1">/);
  assert.match(saving, /<form id="site-search" role="search" class="site-search"><label for="site-search-input">Search this help<\/label>/);
  assert.match(saving, /<nav class="hs-tree" aria-label="Contents of My &lt;Book&gt; &amp; more">/);
  assert.match(saving, /<a href="1-1-saving-closing\.html" aria-current="page">1\.1 Saving &amp; closing<\/a>/, "the current topic is marked in the tree");
  assert.match(saving, /<a href="1-getting-started\.html" class="hs-previous">← Previous: 1 Getting started<\/a><a href="2-printing\.html" class="hs-next">Next: 2 Printing →<\/a>/);
  assert.match(saving, /<li><a href="1-getting-started\.html">Getting started<\/a><\/li><li aria-current="page">Saving &amp; closing<\/li>/, "breadcrumbs");
  assert.ok(!/href="#"|data-topic/.test(saving), "links are files, not script");
  assert.match(saving, /<img src="images\/p1\.png" alt="Picture p1 Marks: Arrow: Points at Save\. Text box: &quot;Press Save&quot;\. Marker 2\." width="1920" height="1080">/, "the flat picture, with its description");
  assert.ok(!saving.includes("object-view-box") && !saving.includes("<svg") && !saving.includes("pv-note"), "nothing drawn over a flat picture, and no notes for the writer");
  assert.match(saving, /<ul class="pv-entries" aria-label="Callouts on this picture"><li>A\. Save: Saves your work\.<\/li><\/ul>/);
  assert.ok(!saving.includes("SECRET"), "no comments");
  assert.match(saving, /<p class="pv-missing">This picture file is missing from the project\.<\/p>/, "a picture that could not be made is said");
  assert.match(saving, /<script src="assets\/search-index\.js"><\/script>\n<script src="assets\/site\.js"><\/script>/);
  for (const [name, html] of Object.entries(files)) if (name.endsWith(".html")) assert.deepEqual(balanced(html), [], `${name} has balanced tags`);
  assert.match(files["2-printing.html"], /<a href="1-1-saving-closing\.html" class="hs-previous">/);
  assert.ok(!files["2-printing.html"].includes("hs-next"));
});

test("the search index is a script with a title, a number, a link and the words of each topic, and it cannot break out of its script", () => {
  const { project } = book();
  project.tree[1].title = "Print </script><b>it";
  const text = buildHelpSiteText(project, new Map());
  const body = text["assets/search-index.js"];
  assert.match(body, /^window\.SEARCH_INDEX = \[/);
  assert.ok(!body.includes("</script>") && body.includes("\\u003c/script>"));
  const index = JSON.parse(body.slice("window.SEARCH_INDEX = ".length, -2));
  assert.equal(index.length, 3);
  assert.deepEqual(index.map((e: { number: string; url: string }) => [e.number, e.url]), [["1", "1-getting-started.html"], ["1.1", "1-1-saving-closing.html"], ["2", "2-print-script-b-it.html"]]);
  assert.match(index[1].text, /Before you begin Press Save in Acme Draw: \*stars\*/);
  assert.match(index[1].text, /A\. Save: Saves your work\./, "the callout entries are searchable");
  assert.ok(!index[1].text.includes("SECRET"));
  assert.ok(!index.some((e: { text: string }) => /\{\{/.test(e.text)));
});

test("the site's script parses, and its colours meet the same minimums as the program's own", () => {
  assert.doesNotThrow(() => new Function(SITE_JS));
  const colour = (selector: string, prop: string) => {
    const rule = SITE_CSS.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
    assert.ok(rule, selector);
    return rule![1].match(new RegExp(`${prop}\\s*:\\s*([^;]+)`))![1].trim();
  };
  const root = SITE_CSS.match(/:root\s*\{([^}]*)\}/)![1];
  const v = (name: string) => root.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))![1];
  for (const [name, bg] of [["text", "#ffffff"], ["muted", "#f4f6f9"], ["link", "#ffffff"], ["link", "#f4f6f9"]] as const) {
    const check = checkContrast(`${name} on ${bg}`, v(name), bg, TEXT_MIN);
    assert.ok(check && check.ok, check?.words);
  }
  assert.ok(checkContrast("header", "#ffffff", v("accent"), TEXT_MIN)!.ok, "white on the header colour");
  assert.ok(checkContrast("focus", v("focus"), "#ffffff", GRAPHIC_MIN)!.ok, "the focus outline stands out from the page");
  for (const kind of ["design-tip", "caution", "bright-idea", "power-tip", "time-saver", "new-feature"]) assert.ok(checkContrast(kind, colour(`.pv-box-${kind}`, "border-left-color"), "#f4f6f9", GRAPHIC_MIN)!.ok, kind);
});

test("an empty book makes a page that says so, and a title cannot add markup to any page", () => {
  const empty = buildHelpSiteText(createProject("Empty"), new Map());
  assert.match(empty["index.html"], /This book has no topics yet\./);
  assert.deepEqual(balanced(empty["index.html"]), []);
  const project = createProject("<script>alert(1)</script>");
  addNode(project.tree, null, "<img src=x onerror=alert(1)>");
  const site = buildHelpSiteText(project, new Map());
  for (const html of Object.values(site)) assert.ok(!/<script>alert|<img src=x/.test(html));
  assert.ok(!bookMarkdown(project, new Map()).includes("<script>"));
  const bytes = buildHelpSite(project, new Map());
  assert.ok(bytes["index.html"] instanceof Uint8Array);
});

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

test("the Word export is a zip of well formed parts with real styles, numbered steps that restart for each procedure, pictures with their descriptions, and no comments", async () => {
  const { project, assets } = book();
  const steps2 = makeBlock("procedure"); (steps2 as { steps: unknown }).steps = [{ id: "t1", text: [{ text: "First of the second list." }] }];
  addBlock(project.tree[0].children[0].page!, steps2);
  const { flatten } = fakeFlatten();
  const { flat } = await flattenPlaced(project, assets, "book", flatten);
  const parts = buildDocxParts(project, flat, { now: "2026-10-21T10:00:00.000Z" });
  assert.deepEqual(Object.keys(parts).sort(), [
    "[Content_Types].xml", "_rels/.rels", "docProps/core.xml", "word/_rels/document.xml.rels", "word/document.xml", "word/footer1.xml", "word/header1.xml",
    "word/media/p1.png", "word/media/p2.png", "word/numbering.xml", "word/styles.xml",
  ]);
  const text = (name: string) => new TextDecoder().decode(parts[name]);
  for (const name of Object.keys(parts).filter((n) => /\.(xml|rels)$/.test(n))) assert.equal(xmlProblem(text(name)), null, `${name} is well formed`);
  const doc = text("word/document.xml");
  assert.match(doc, /<w:pStyle w:val="Title"\/>.*My &lt;Book&gt; &amp; more/, "the title is escaped");
  assert.match(doc, /Acme Draw/, "the product is on the title page");
  assert.match(doc, /<w:pStyle w:val="Heading1"\/><w:pageBreakBefore\/>.*1 Getting started/, "a chapter is a Heading 1 and starts a page");
  assert.match(doc, /<w:pStyle w:val="Heading2"\/>.*1\.1 Saving &amp; closing/, "a topic is a Heading 2");
  assert.match(doc, /<w:pStyle w:val="Heading3"\/><\/w:pPr><w:r><w:t xml:space="preserve">Before you begin/, "a heading block is one level below its topic");
  assert.match(doc, /<w:rStyle w:val="ControlName"\/><\/w:rPr><w:t xml:space="preserve">Save/, "a control name uses its character style");
  assert.match(doc, /Press .*in Acme Draw: \*stars\*, _under_ and #hash &lt;tag&gt; \[link\]\./, "text is kept as text and the variable is filled in");
  assert.ok(!doc.includes("SECRET"), "no comments");
  // Numbered steps: each procedure has its own list so it starts at 1.
  const ids = [...doc.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(ids)].sort(), ["1", "2", "3"], "the bullets are list 1, and two procedures have a list each");
  const numbering = text("word/numbering.xml");
  assert.equal([...numbering.matchAll(/<w:num w:numId="(\d+)"><w:abstractNumId w:val="1"\/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"\/>/g)].length, 2, "each list starts again at 1");
  // Pictures, with their descriptions and sizes.
  const rels = text("word/_rels/document.xml.rels");
  assert.match(rels, /Id="rIdImg1" Type="[^"]*\/image" Target="media\/p1\.png"/);
  assert.match(rels, /Id="rIdImg2" Type="[^"]*\/image" Target="media\/p2\.png"/);
  assert.deepEqual([...parts["word/media/p1.png"]].slice(-1), [255], "the flat picture's bytes are what is in the file");
  const descrs = [...doc.matchAll(/<wp:docPr id="\d+" name="Picture \d+" descr="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(descrs, ["Picture p1 Marks: Arrow: Points at Save. Text box: &quot;Press Save&quot;. Marker 2.", "Picture p2"], "the description (with the marks) is the alternative text");
  const widths = [...doc.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(widths[0], [624 * 9525, Math.round(624 * 1080 * 9525 / 1920)], "a wide picture is cut down to the text width, keeping its shape");
  assert.deepEqual(widths[1], [576 * 9525, Math.round(576 * 540 * 9525 / 960)], "a picture under a step is narrower so it stays inside the margins");
  assert.match(doc, /<w:pStyle w:val="Caption"\/><\/w:pPr><w:r><w:t xml:space="preserve">A\. Save: Saves your work\./, "a callout's entry is a caption under its picture");
  assert.match(doc, /\(The picture &quot;Picture p4&quot; could not be included\.\)/, "a picture that could not be made is said");
  assert.match(doc, /<w:pStyle w:val="Callout2"\/><\/w:pPr><w:r><w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">Caution\. /, "a callout box says its kind in words");
  assert.match(doc, /Result: <\/w:t>/, "a step's result");
  // Contents: each entry links to a bookmark on its heading.
  const anchors = [...doc.matchAll(/<w:hyperlink w:anchor="(_Toc\d+)"/g)].map((m) => m[1]);
  assert.equal(anchors.length, 3, "a contents entry for each of the three topics");
  for (const anchor of anchors) assert.ok(doc.includes(`w:name="${anchor}"`), `${anchor} is a bookmark`);
  assert.equal(doc.split(' TOC \\o "1-3" \\h \\z \\u ').length - 1, 1, "the contents is Word's own table of contents field, so Word can add the page numbers");
  const fields = (type: string) => doc.split(`<w:fldChar w:fldCharType="${type}"/>`).length - 1;
  assert.deepEqual([fields("begin"), fields("separate"), fields("end")], [1, 1, 1], "and the field is opened, filled and closed once");
  assert.equal(doc.split('<w:pStyle w:val="Step"/><w:keepNext/>').length - 1, 1, "a step with a picture stays on the page with it");
  const bookmarkIds = [...doc.matchAll(/<w:bookmarkStart w:id="(\d+)"/g)].map((m) => m[1]);
  assert.equal(new Set(bookmarkIds).size, bookmarkIds.length, "bookmark numbers are all different");
  // The fixed parts.
  assert.match(text("word/footer1.xml"), /<w:instrText xml:space="preserve"> PAGE <\/w:instrText>/, "page numbers");
  assert.match(text("word/header1.xml"), /My &lt;Book&gt; &amp; more/, "the running header");
  assert.match(text("[Content_Types].xml"), /Extension="png" ContentType="image\/png"/);
  assert.match(text("docProps/core.xml"), /<dc:title>My &lt;Book&gt; &amp; more<\/dc:title>/);
  const styles = text("word/styles.xml");
  for (const id of ["Title", "Heading1", "Heading2", "Heading3", "Heading4", "Heading5", "Heading6", "Step", "StepContinued", "Caption", "ControlName", "Callout1", "Callout6", "Contents1", "Header", "Footer"]) assert.ok(styles.includes(`w:styleId="${id}"`), `${id} style`);
  assert.match(styles, /<w:name w:val="Callout box, Caution"\/>/, "a box style is named for its kind");
  // The box's edge must stand out from its fill (3:1 for graphics).
  const borders = [...styles.matchAll(/<w:left w:val="single" w:sz="48" w:space="6" w:color="([0-9A-F]{6})"\/>/g)].map((m) => `#${m[1]}`);
  assert.equal(borders.length, 6);
  for (const colour of borders) assert.ok(checkContrast(colour, colour, "#F4F6F9", GRAPHIC_MIN)!.ok, `${colour} on the box fill`);
});

test("the Word file is a zip that reads back, an empty book still makes one, and nothing in the project can break the XML", async () => {
  const { project, assets } = book();
  const { flatten } = fakeFlatten();
  const { flat } = await flattenPlaced(project, assets, "book", flatten);
  const files = await unzip(packDocx(project, flat, { now: "2026-10-21T10:00:00.000Z" }));
  assert.ok(files["word/document.xml"] && files["word/media/p1.png"] && files["[Content_Types].xml"]);
  assert.equal(xmlProblem(new TextDecoder().decode(files["word/document.xml"])), null);
  const empty = buildDocxParts(createProject("Empty"), new Map());
  assert.equal(xmlProblem(new TextDecoder().decode(empty["word/document.xml"])), null, "a book with no topics is still a valid document");
  assert.ok(Object.keys(empty).every((n) => !n.startsWith("word/media/")));
  const odd = createProject('A "quote" & <b>bold</b> \u0001 title');
  const t = addNode(odd.tree, null, "Q&A <x> \u000B end");
  const page = ensurePage(t);
  const para = makeBlock("paragraph"); (para as { text: unknown }).text = [{ text: "]]> & <![CDATA[ \u0000 ok" }];
  addBlock(page, para);
  const parts = buildDocxParts(odd, new Map());
  for (const name of Object.keys(parts).filter((n) => /\.(xml|rels)$/.test(n))) assert.equal(xmlProblem(new TextDecoder().decode(parts[name])), null, name);
  assert.equal(xml('a<b>&"c"\u0001'), "a&lt;b&gt;&amp;&quot;c&quot;");
  assert.equal(xmlProblem("<a><b></a>"), "closing a does not match", "the checker itself notices a broken part");
});
