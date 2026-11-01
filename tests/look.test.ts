import test from "node:test";
import assert from "node:assert/strict";
import { addNode, createProject, CURRENT_VERSION, ensurePage } from "../src/project/model.ts";
import { addBlock, makeBlock, type ParagraphBlock } from "../src/project/page.ts";
import { parseMarks } from "../src/project/text.ts";
import { accentCheck, automaticFonts, cleanLook, defaultLook, fontById, isDefaultLook, lookCssVariables, lookFiles, lookWords, MOST_LOOK_TEXT, wordFont } from "../src/project/look.ts";
import { fromFiles, toFiles } from "../src/project/files.ts";
import { migrate } from "../src/project/migrate.ts";
import { assetFiles, packProject, unpackProject } from "../src/project/package.ts";
import { checkProject } from "../src/project/checks.ts";
import { renderPrintPreview } from "../src/render/print.ts";
import { pdfCss } from "../src/export/pdf-css.ts";
import { bookPdfHtml, placeholderPages } from "../src/export/pdf.ts";
import { buildDocxParts } from "../src/export/docx.ts";
import { buildHelpSiteText } from "../src/export/help-site.ts";
import { siteCss } from "../src/export/site-assets.ts";
import { buildJsonExport, readJsonExport } from "../src/export/json.ts";
import { LOGO_KEY, makeExport } from "../src/export/make.ts";
import type { FlatPicture } from "../src/export/pictures.ts";
import type { RenderContext } from "../src/render/html.ts";

const png = (w: number, h: number): Uint8Array => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return b;
};

function sample() {
  const project = createProject("Look <book>");
  project.variables = { PRODUCT: "Acme Draw", VERSION: "2.0", COMPANY: "Acme" };
  const chapter = addNode(project.tree, null, "Saving");
  const topic = addNode(project.tree, chapter.id, "Save a file");
  const block = makeBlock("paragraph") as ParagraphBlock;
  block.text = parseMarks("Press Save.");
  addBlock(ensurePage(topic), block);
  return project;
}

const ctxFor = (project: ReturnType<typeof sample>, withLogo = true): RenderContext => ({ project, place: "book", notes: false, imageSrc: (p) => (p.id === "@logo" && !withLogo ? null : `blob:${p.id}`) });
const logoFlat = (): FlatPicture => ({ path: "images/logo.png", bytes: png(300, 100), width: 300, height: 100 });

test("a new project has the look the outputs always had, and it is format 18", () => {
  assert.equal(CURRENT_VERSION, 18);
  const p = createProject("Book");
  assert.deepEqual(p.look, defaultLook());
  assert.ok(isDefaultLook(p.look));
  assert.deepEqual(p.look, { bodyFont: "georgia", headingFont: "segoe", accent: "", cover: true, header: "", footer: "", pageSize: "letter" });
  assert.ok(automaticFonts(p.look));
  assert.equal(wordFont(p.look, "body"), "Calibri", "Word has always used Calibri, so the starting pair is automatic there");
  assert.equal(wordFont({ ...p.look, bodyFont: "cambria" }, "body"), "Cambria");
  assert.equal(wordFont({ ...p.look, bodyFont: "cambria" }, "heading"), "Segoe UI");
});

test("a look read from a file keeps only what is allowed: known fonts and paper, a real colour, a project picture as the logo, short single-line words", () => {
  const clean = cleanLook({ bodyFont: "comic", headingFont: "arial", accent: "1f4e8c", cover: false, header: "  A\nB\t C  ", footer: "x".repeat(500), pageSize: "a4", logo: { file: "images/ab_1.png", width: 300, height: 100, alt: "  The logo  " } });
  assert.deepEqual(clean, { bodyFont: "georgia", headingFont: "arial", accent: "#1F4E8C", cover: false, header: "A B C", footer: "x".repeat(MOST_LOOK_TEXT), pageSize: "a4", logo: { file: "images/ab_1.png", width: 300, height: 100, alt: "The logo" } });
  assert.equal(cleanLook({ accent: "nope" }).accent, "", "a word that is not a colour is no colour");
  assert.equal(cleanLook({ accent: "#abc" }).accent, "#AABBCC");
  assert.equal(cleanLook({ pageSize: "legal" }).pageSize, "letter");
  for (const bad of [{ file: "../x.png", width: 1, height: 1 }, { file: "images/a.gif", width: 1, height: 1 }, { file: "images/a.png", width: 0, height: 1 }, { file: "images/a.png", width: 1.5, height: 1 }, { file: "images/a.png", width: 30000, height: 1 }, "x"]) {
    assert.equal(cleanLook({ logo: bad }).logo, undefined, JSON.stringify(bad));
  }
  assert.deepEqual(cleanLook(null), defaultLook());
  assert.deepEqual(cleanLook("x"), defaultLook());
  assert.deepEqual(lookFiles(clean), ["images/ab_1.png"]);
  assert.deepEqual(lookFiles(defaultLook()), []);
});

test("the accent colour is checked against white as text, in words, and is never refused", () => {
  assert.equal(accentCheck(""), null);
  const dark = accentCheck("#1F4E8C")!;
  assert.ok(dark.ok && dark.ratio > 7);
  assert.match(dark.words, /^The accent colour #1F4E8C on white is .*That is enough for text\.$/);
  const light = accentCheck("#FFD600")!;
  assert.ok(!light.ok);
  assert.match(light.words, /Text needs at least 4\.5 to 1, so headings and links in this colour may be hard to read\.$/);
  const project = sample();
  project.look.accent = "#FFD600";
  assert.deepEqual(checkProject(project).filter((i) => i.kind === "look-contrast").map((i) => i.key), ["look-contrast"], "the book check says so");
  project.look.accent = "#1F4E8C";
  assert.equal(checkProject(project).filter((i) => i.kind === "look-contrast").length, 0);
  project.look.logo = { file: "images/a.png", width: 10, height: 10, alt: " " };
  assert.deepEqual(checkProject(project).filter((i) => i.kind === "logo-alt").map((i) => i.where), ["Look of the book"]);
  project.look.logo.alt = "The Acme logo";
  assert.equal(checkProject(project).filter((i) => i.kind === "logo-alt").length, 0);
});

test("the look is saved with the project and opened again, an older project gets the starting look, and the logo file travels with it", async () => {
  const project = sample();
  project.look = { bodyFont: "cambria", headingFont: "calibri", accent: "#1F4E8C", cover: false, header: "{{PRODUCT}} guide", footer: "© {{COMPANY}}", pageSize: "a4", logo: { file: "images/logo1.png", width: 300, height: 100, alt: "The Acme logo" } };
  assert.deepEqual(fromFiles(toFiles(project)).look, project.look);
  assert.deepEqual(JSON.parse(toFiles(project)["project.json"]).look, project.look);
  const old = migrate({ version: 17, name: "Old", template: "empty", variables: {}, highlight: {}, tree: [] });
  assert.equal(old.version, 18);
  assert.deepEqual(old.look, defaultLook());
  const logoBytes = png(300, 100);
  const packed = packProject(project, new Map([["images/logo1.png", logoBytes], ["images/unused.png", png(5, 5)]]));
  const back = await unpackProject(packed);
  assert.deepEqual(back.project.look, project.look);
  assert.ok(back.assets.has("images/logo1.png"), "the logo file is in the package");
  assert.ok(!back.assets.has("images/unused.png"), "and a picture nothing uses is not");
  assert.deepEqual(back.missing, []);
  assert.deepEqual([...assetFiles(project)], ["images/logo1.png"]);
  const lost = await unpackProject(packProject(project, new Map()));
  assert.deepEqual(lost.missing, ["images/logo1.png"], "a missing logo file is said");
});

test("the print preview follows the look: no title page, a logo on it, the fonts and accent as variables", () => {
  const project = sample();
  const plain = renderPrintPreview(ctxFor(project)).html;
  assert.match(plain, /<div class="pv-book" style="--look-body: Georgia, &quot;Times New Roman&quot;, serif; --look-heading: &quot;Segoe UI&quot;, Calibri, Arial, sans-serif;">/);
  assert.match(plain, /pv-title-page/);
  assert.ok(!plain.includes("pv-logo"));
  project.look = { ...defaultLook(), cover: true, accent: "#1F4E8C", logo: { file: "images/l.png", width: 300, height: 100, alt: "Acme <logo>" } };
  const branded = renderPrintPreview(ctxFor(project)).html;
  assert.match(branded, /--look-accent: #1F4E8C;/);
  assert.match(branded, /<section class="pv-sheet pv-title-page"><img class="pv-logo" src="blob:@logo" alt="Acme &lt;logo&gt;" width="300" height="100"><h1 class="pv-book-title">/);
  assert.ok(!renderPrintPreview(ctxFor(project, false)).html.includes("pv-logo"), "a logo whose file is missing is left off");
  project.look.cover = false;
  assert.ok(!renderPrintPreview(ctxFor(project)).html.includes("pv-title-page"), "no cover, no title page");
  assert.match(renderPrintPreview(ctxFor(project)).html, /pv-toc/, "the contents is first");
  assert.equal(lookCssVariables(defaultLook()), `--look-body: ${fontById("georgia").css}; --look-heading: ${fontById("segoe").css};`);
});

test("the PDF follows the look: paper, fonts, accent, header, footer, and no bare first page when there is no cover", () => {
  const starting = pdfCss({ header: "H", bareFirstPage: true });
  assert.match(starting, /size: Letter;/);
  assert.match(starting, /font: 9pt "Segoe UI", Calibri, Arial, sans-serif/);
  assert.ok(!starting.includes("@bottom-left { content: \""), "no footer words");
  const look = { ...defaultLook(), bodyFont: "times" as const, headingFont: "arial" as const, accent: "#1F4E8C", footer: "© Acme \"quoted\"", pageSize: "a4" as const };
  const css = pdfCss({ header: "H", bareFirstPage: true, look });
  assert.match(css, /size: A4;/);
  assert.match(css, /html \{ font-family: "Times New Roman", Times, serif;/);
  assert.match(css, /h1, h2, h3, h4, h5, h6 \{ break-after: avoid; font-family: Arial, Helvetica, sans-serif;/);
  assert.match(css, /@bottom-left \{ content: "© Acme \\"quoted\\""; font: 9pt Arial, Helvetica, sans-serif;/);
  assert.match(css, /h1, h2, h3, h4, h5, h6, \.pv-chapter-number, \.pv-number \{ color: #1F4E8C; \}/);
  assert.ok(!css.includes("Georgia"), "every font of the sheet follows the look");
  const project = sample();
  project.look = { ...look, header: "{{PRODUCT}} book", cover: false };
  const html = bookPdfHtml(project, new Map([[LOGO_KEY, logoFlat()]]), placeholderPages(project));
  assert.match(html, /@top-left \{ content: "Acme Draw book";/, "the header's words, with variables filled in");
  assert.ok(!html.includes("@page :first"), "no title page, so the first page has a header like the rest");
  project.look = { ...defaultLook(), logo: { file: "images/l.png", width: 300, height: 100, alt: "Acme logo" } };
  const covered = bookPdfHtml(project, new Map([[LOGO_KEY, logoFlat()]]));
  assert.match(covered, /<img class="pv-logo" src="logo\.png" alt="Acme logo"/);
  assert.match(covered, /@top-left \{ content: "Look &lt;book&gt;"|@top-left \{ content: "Look \\3C book>"/, "the title is the header when the look has no words");
});

test("Word follows the look: fonts, accent, paper, header, footer, the title page and its logo", () => {
  const project = sample();
  const text = (parts: Record<string, Uint8Array>, name: string) => new TextDecoder().decode(parts[name]);
  const plain = buildDocxParts(project, new Map());
  assert.match(text(plain, "word/styles.xml"), /<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"\/><w:sz w:val="22"\/>/, "the starting look is Calibri, as Word always had");
  assert.match(text(plain, "word/document.xml"), /<w:pgSz w:w="12240" w:h="15840"\/>/);
  assert.ok(!text(plain, "word/footer1.xml").includes("Acme"));
  project.look = { bodyFont: "cambria", headingFont: "arial", accent: "#1F4E8C", cover: true, header: "{{PRODUCT}} book", footer: "© {{COMPANY}}", pageSize: "a4", logo: { file: "images/l.png", width: 300, height: 100, alt: "Acme logo" } };
  const branded = buildDocxParts(project, new Map([[LOGO_KEY, logoFlat()]]));
  const styles = text(branded, "word/styles.xml");
  assert.match(styles, /<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Cambria"/);
  assert.match(styles, /w:styleId="Heading1">.*<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"\/><w:b\/><w:color w:val="1F4E8C"\/><w:sz w:val="40"\/>/);
  assert.match(styles, /w:styleId="Hyperlink">.*<w:color w:val="1F4E8C"\/>/, "links take the accent too");
  assert.match(text(branded, "word/document.xml"), /<w:pgSz w:w="11906" w:h="16838"\/>/);
  assert.match(text(branded, "word/header1.xml"), /<w:t xml:space="preserve">Acme Draw book<\/w:t>/);
  assert.match(text(branded, "word/footer1.xml"), /<w:t xml:space="preserve">© Acme<\/w:t>/);
  assert.match(text(branded, "word/document.xml"), /<wp:docPr id="1" name="Picture 1" descr="Acme logo"\/>/, "the logo is on the title page with its description");
  assert.ok(branded["word/media/logo.png"], "and its file is in the package");
  project.look.cover = false;
  assert.ok(!text(buildDocxParts(project, new Map([[LOGO_KEY, logoFlat()]])), "word/document.xml").includes('w:val="Title"'), "no cover, no title paragraph");
});

test("the help site follows the look: accent for the header and links, the fonts when chosen, the logo in the header, the footer words", () => {
  const project = sample();
  const base = buildHelpSiteText(project, new Map());
  assert.ok(!base["assets/site.css"].includes("font-family: Georgia"), "the starting fonts change nothing on the help site");
  assert.ok(!base["index.html"].includes("site-logo") && !base["index.html"].includes("site-footer-text"));
  project.look = { ...defaultLook(), bodyFont: "verdana", headingFont: "calibri", accent: "#1B6B2F", footer: "© {{COMPANY}} 2026", logo: { file: "images/l.png", width: 300, height: 100, alt: "Acme logo" } };
  const site = buildHelpSiteText(project, new Map([[LOGO_KEY, logoFlat()]]));
  assert.match(site["assets/site.css"], /:root \{ --accent: #1B6B2F; --link: #1B6B2F; \}/);
  assert.match(site["assets/site.css"], /body \{ font-family: Verdana, "Segoe UI", Arial, sans-serif; \}/);
  assert.match(site["assets/site.css"], /h1, h2, h3, h4, h5, h6, \.site-title,.* \{ font-family: Calibri,/);
  assert.match(site["index.html"], /<p class="site-title"><a href="index\.html"><img class="site-logo" src="images\/logo\.png" alt="">Look &lt;book&gt;<\/a><\/p>/, "the logo beside the title is decoration: the title says it");
  assert.match(site["index.html"], /<p class="site-footer"><span class="site-footer-text">© Acme 2026<\/span><button/);
  assert.equal(siteCss(defaultLook()).includes("--accent: #"), true, "the sheet's own accent is still there");
});

test("a JSON export keeps the look and the logo file and reads back the same, and an export made before the look has the starting look", async () => {
  const project = sample();
  project.look = { ...defaultLook(), accent: "#1F4E8C", logo: { file: "images/l.png", width: 300, height: 100, alt: "Acme logo" } };
  const { files, missing } = buildJsonExport(project, new Map([["images/l.png", png(300, 100)]]));
  assert.deepEqual(missing, []);
  assert.ok(files["images/l.png"], "the logo file is in the export");
  assert.deepEqual(JSON.parse(new TextDecoder().decode(files["book.json"])).look, project.look);
  assert.deepEqual(readJsonExport(files).project.look, project.look);
  assert.deepEqual(buildJsonExport(project, new Map()).missing, ["images/l.png"]);
  const book = JSON.parse(new TextDecoder().decode(files["book.json"]));
  delete book.look;
  book.projectVersion = 17;
  assert.deepEqual(readJsonExport({ "book.json": new TextEncoder().encode(JSON.stringify(book)) }).project.look, defaultLook());
});

test("an export carries the logo as a file, and says so when its file is missing", async () => {
  const project = sample();
  project.look = { ...defaultLook(), logo: { file: "images/l.png", width: 300, height: 100, alt: "Acme logo" } };
  const flatten = async (bytes: Uint8Array) => bytes;
  const made = await makeExport(project, new Map([["images/l.png", png(300, 100)]]), "word", { flatten });
  assert.deepEqual(made.notes, []);
  const missing = await makeExport(project, new Map(), "markdown", { flatten });
  assert.deepEqual(missing.notes, ["The logo file is missing from the project, so it is not in the export."]);
  assert.equal(lookWords(project.look), "the starting fonts, no accent colour, a logo, a title page, Letter");
});
