import test from "node:test";
import assert from "node:assert/strict";
import { addNode, createProject, ensurePage, numbering, type Project } from "../src/project/model.ts";
import { addBlock, makeBlock } from "../src/project/page.ts";
import { setTermLines, updateBookIndex } from "../src/project/book-index.ts";
import { renderPrintPreview, INDEX_KEY } from "../src/render/print.ts";
import { bookPdfHtml, pageNumbersFor, placeholderPages } from "../src/export/pdf.ts";
import { buildDocxParts } from "../src/export/docx.ts";
import { buildHelpSiteText } from "../src/export/help-site.ts";
import { bookMarkdown } from "../src/export/markdown.ts";
import type { RenderContext } from "../src/render/html.ts";

const run = (text: string, mark?: "control") => ({ text, ...(mark ? { mark } : {}) });

function book(withIndex: boolean): { project: Project; ids: { chapter: string; saving: string; printing: string } } {
  const project = createProject("Index <output> test");
  const chapter = addNode(project.tree, null, "Getting started");
  const saving = addNode(project.tree, chapter.id, "Saving & closing");
  const printing = addNode(project.tree, null, "Printing");
  const para = makeBlock("paragraph"); (para as { text: unknown }).text = [run("Press "), run("Save", "control"), run(" or "), run("Zoom <in>", "control"), run(".")];
  addBlock(ensurePage(saving), para);
  const p2 = makeBlock("paragraph"); (p2 as { text: unknown }).text = [run("Choose "), run("Print", "control"), run(" and "), run("save", "control"), run(".")];
  addBlock(ensurePage(printing), p2);
  if (withIndex) updateBookIndex(project.tree, project.variables);
  return { project, ids: { chapter: chapter.id, saving: saving.id, printing: printing.id } };
}

const context = (project: Project, flat = false): RenderContext => ({ project, place: "book", notes: false, flat, imageSrc: () => null });

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
    if (m[1]) { if (stack.pop() !== m[2]) return `closing ${m[2]} does not match`; } else if (!m[4]) stack.push(m[2]);
  }
  return stack.length ? `${stack.pop()} is never closed` : null;
}

test("the print preview has the index at the end and in the contents, with the topics' numbers as links, and nothing when the book has none", () => {
  const { project, ids } = book(true);
  const html = renderPrintPreview(context(project)).html;
  assert.match(html, /<section class="pv-sheet pv-index" id="pv-index"><h1>Index<\/h1><div class="pv-index-groups">/, "an Index sheet after the chapters");
  assert.ok(html.lastIndexOf('id="pv-index"') > html.lastIndexOf('id="pv-topic-'), "it comes last");
  assert.match(html, /<li><a href="#pv-index" data-anchor="pv-index">Index<\/a><\/li><\/ol>/, "and is the last entry of the contents");
  assert.match(html, /<span class="pv-index-term">Save<\/span> <span class="pv-index-places"><a href="#pv-topic-[^"]+" data-anchor="[^"]+">1\.1<\/a>, <a href="#pv-topic-[^"]+" data-anchor="[^"]+">2<\/a><\/span>/, "a term in two topics lists both by number, as links");
  assert.match(html, /<h2 class="pv-index-letter" id="pv-index-s">S<\/h2>/, "a heading for each letter");
  assert.match(html, /Zoom &lt;in&gt;/, "terms are escaped");
  assert.ok(html.includes(`href="#pv-topic-${ids.saving}"`));
  const none = renderPrintPreview(context(book(false).project)).html;
  assert.ok(!none.includes("pv-index") && !none.includes(">Index<"), "no terms, no index and no contents entry");
});

test("in the PDF the places of a term are page numbers, once each in order, and the contents has a page for the index", () => {
  const { project, ids } = book(true);
  const pages = new Map([[ids.chapter, "3"], [ids.saving, "3"], [ids.printing, "12"], [INDEX_KEY, "14"]]);
  const html = bookPdfHtml(project, new Map(), pages);
  assert.match(html, /<span class="pv-index-places"><a href="#pv-topic-[^"]+" data-anchor="[^"]+">3<\/a>, <a href="#pv-topic-[^"]+" data-anchor="[^"]+">12<\/a><\/span>/, "Save: pages 3 and 12");
  assert.match(html, /<span class="pv-toc-title">Index<\/span><span class="pv-toc-leader" aria-hidden="true"><\/span><span class="pv-toc-page">14<\/span>/, "the contents gives the index its page");
  const sameSpot = bookPdfHtml(project, new Map(), new Map([[ids.chapter, "3"], [ids.saving, "5"], [ids.printing, "5"], [INDEX_KEY, "6"]]));
  assert.ok(!/>5<\/a>, <a[^>]*>5<\/a>/.test(sameSpot), "two topics on one page are one page number");
  const partial = bookPdfHtml(project, new Map(), new Map([[ids.saving, "4"]]));
  assert.match(partial, /pv-index-places"><a [^>]*>4<\/a>, <a [^>]*>2<\/a>/, "a topic with no page found is still named, by its number");
  assert.equal(placeholderPages(project).get(INDEX_KEY), "000", "the first printing has a stand-in for the index too");
  assert.equal(placeholderPages(book(false).project).has(INDEX_KEY), false, "and none when there is no index");
  const found = pageNumbersFor(project, new Map([["pv-topic-" + ids.chapter, 3], ["pv-index", 9]]))!;
  assert.equal(found.get(INDEX_KEY), "9");
  const bare = book(false);
  assert.equal(pageNumbersFor(bare.project, new Map([["pv-index", 9], ["pv-topic-" + bare.ids.chapter, 3]]))!.has(INDEX_KEY), false, "an index page for a book with no index is ignored");
});

test("the Word file has the index with its own heading and styles, links to the topics, and a contents entry for it", () => {
  const { project } = book(true);
  const parts = buildDocxParts(project, new Map());
  for (const name of Object.keys(parts).filter((n) => /\.(xml|rels)$/.test(n))) assert.equal(xmlProblem(new TextDecoder().decode(parts[name])), null, name);
  const doc = new TextDecoder().decode(parts["word/document.xml"]);
  assert.match(doc, /<w:pStyle w:val="Heading1"\/><w:pageBreakBefore\/><\/w:pPr><w:bookmarkStart w:id="\d+" w:name="_Toc\d+"\/><w:r><w:t xml:space="preserve">Index<\/w:t>/, "an Index heading on its own page, without a number");
  assert.match(doc, /<w:pStyle w:val="IndexHeading"\/><\/w:pPr><w:r><w:t xml:space="preserve">S<\/w:t>/);
  assert.match(doc, /<w:pStyle w:val="Index1"\/><\/w:pPr><w:r><w:t xml:space="preserve">Save, <\/w:t><\/w:r><w:hyperlink w:anchor="_Toc\d+" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"\/><\/w:rPr><w:t xml:space="preserve">1\.1<\/w:t><\/w:r><\/w:hyperlink><w:r><w:t xml:space="preserve">, <\/w:t><\/w:r><w:hyperlink w:anchor="_Toc\d+" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"\/><\/w:rPr><w:t xml:space="preserve">2<\/w:t>/, "a term, then the numbers of its topics as links");
  assert.match(doc, /<w:hyperlink w:anchor="_Toc\d+" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"\/><\/w:rPr><w:t xml:space="preserve">Index<\/w:t><\/w:r><\/w:hyperlink><w:r><w:fldChar w:fldCharType="end"\/>/, "the last entry of the contents is the index");
  const anchors = [...doc.matchAll(/w:anchor="(_Toc\d+)"/g)].map((m) => m[1]);
  for (const anchor of new Set(anchors)) assert.ok(doc.includes(`w:name="${anchor}"`), `${anchor} is a bookmark`);
  const styles = new TextDecoder().decode(parts["word/styles.xml"]);
  assert.ok(styles.includes('w:styleId="IndexHeading"') && styles.includes('<w:name w:val="index 1"/>'), "the index styles are in the file");
  const plain = new TextDecoder().decode(buildDocxParts(book(false).project, new Map())["word/document.xml"]);
  assert.ok(!plain.includes("Index1") && !plain.includes(">Index<"), "no index, nothing of it");
});

test("the help site has an Index page linked from every page, with each term's topics as links to their pages, and none without terms", () => {
  const { project } = book(true);
  const site = buildHelpSiteText(project, new Map());
  assert.ok(site["book-index.html"], "an Index page");
  const page = site["book-index.html"];
  assert.match(page, /<h1>Index<\/h1>/);
  assert.match(page, /<title>Index - Index &lt;output&gt; test<\/title>/);
  assert.match(page, /<span class="pv-index-term">Save<\/span> <span class="pv-index-places"><a href="1-1-saving-closing\.html">1\.1 Saving &amp; closing<\/a>, <a href="2-printing\.html">2 Printing<\/a>/);
  for (const [name, html] of Object.entries(site)) if (name.endsWith(".html")) assert.ok(html.includes('<nav class="site-nav" aria-label="Site"><a href="book-index.html">Index</a></nav>'), `${name} links to the index`);
  for (const [name, html] of Object.entries(site)) if (name.endsWith(".html")) assert.ok(!/<a href="#"/.test(html), `${name} has only real links`);
  const none = buildHelpSiteText(book(false).project, new Map());
  assert.ok(!none["book-index.html"] && !Object.entries(none).some(([name, h]) => name.endsWith(".html") && h.includes("site-nav")), "no terms, no page and no link");
});

test("the Markdown has the index as a list for each letter, escaped as text", () => {
  const { project } = book(true);
  const md = bookMarkdown(project, new Map());
  assert.match(md, /\n## Index\n\n### P\n\n- \*\*Print\*\*: 2 Printing\n- \*\*Printing\*\*: 2 Printing\n\n### S\n\n- \*\*Save\*\*: 1\.1 Saving & closing, 2 Printing\n/);
  assert.match(md, /- \*\*Zoom &lt;in>\*\*: 1\.1 Saving & closing/, "terms are escaped as text");
  assert.ok(!bookMarkdown(book(false).project, new Map()).includes("## Index"));
  // an author's term is in too
  setTermLines(project.tree[1], ["Printing", "Page setup"], project.variables);
  assert.match(bookMarkdown(project, new Map()), /### P\n\n- \*\*Page setup\*\*: 2 Printing\n- \*\*Printing\*\*: 2 Printing\n/);
  void numbering;
});
