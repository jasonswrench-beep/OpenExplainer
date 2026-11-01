// EPUB 3: the whole book as one reflowing e-book file (.epub), for e-readers and reading apps. It is a zip whose first entry is `mimetype` (stored, as the format requires), then META-INF/container.xml and an
// OEBPS folder with the package file (content.opf), the navigation document (nav.xhtml, the contents), a title page, one XHTML file for each chapter (with its topics), the index, a style sheet and the pictures.
// The pages are made from the same pieces as the help site and the print preview (src/render/html.ts), with the links as links between files, and the pictures are the flat PNGs (cut to the part shown, with their
// marks drawn in) with their descriptions as alternative text. The package says in its metadata what the book offers a reader who cannot see the pictures (a contents list, headings to move by, descriptions of
// every picture or not), and it claims no conformance it has not been checked for. Comments are never included. The reading order is the book's order. Nothing here needs a screen. See docs/exports.md ("EPUB").
import { buildBookIndex } from "../project/book-index.ts";
import { fontById } from "../project/look.ts";
import { numbering, type Picture, type Project, type TreeNode } from "../project/model.ts";
import { zip } from "../project/zip.ts";
import { BOX_COLOURS } from "./docx.ts";
import { altTextFor, blocksHtml, esc, fillVariables, type RenderContext, type TopicLinks } from "../render/html.ts";
import { indexHtml } from "../render/index-html.ts";
import { seeAlsoHtml } from "../render/see-also.ts";
import type { FlatPicture } from "./pictures.ts";

const encoder = new TextEncoder();
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';

/** The id an anchor in the book uses for a topic. */
const anchorOf = (id: string) => `t-${id}`;

/** HTML text made well-formed XML: the renderer writes `<img ...>`, which XHTML needs as `<img .../>`. Everything else it writes is already well-formed. */
const xhtml = (html: string) => html.replace(/<img ([^>]*?)(\/?)>/g, (_whole, attrs: string) => `<img ${attrs.trimEnd()}/>`);

const mediaType = (path: string) => (/\.png$/i.test(path) ? "image/png" : /\.jpe?g$/i.test(path) ? "image/jpeg" : "application/octet-stream");

function stylesheet(project: Project): string {
  const look = project.look;
  const accent = look.accent || "";
  const boxes = Object.entries(BOX_COLOURS).map(([kind, colour]) => `.pv-box-${kind} { border-left-color: #${colour}; }`).join("\n");
  return `/* The look of the book (Look of the book): fonts and the accent colour. Readers may use their own. */
body { font-family: ${fontById(look.bodyFont).css}; line-height: 1.5; margin: 0 1em; }
h1, h2, h3, h4, h5, h6 { font-family: ${fontById(look.headingFont).css};${accent ? ` color: ${accent};` : ""} line-height: 1.25; }
a { ${accent ? `color: ${accent}; ` : ""}text-decoration: underline; }
img { max-width: 100%; height: auto; }
figure { margin: 1em 0; }
.pv-entries { font-size: 0.9em; list-style: none; padding-left: 0; }
.pv-box { border: 1px solid #767676; border-left: 0.4em solid #767676; padding: 0.4em 0.8em; margin: 1em 0; }
.pv-box-label { font-weight: bold; margin: 0 0 0.25em 0; }
${boxes}
.pv-steps li { margin: 0.6em 0; }
.pv-result { margin: 0.4em 0; }
.pv-ref { font-size: 0.9em; }
.control-name { font-weight: bold; }
.title-page { text-align: center; margin-top: 15%; }
.title-page img { max-width: 60%; }
.in-chapter-title { font-weight: bold; margin-bottom: 0.2em; }
.pv-index-places { margin-left: 0.4em; }
.pv-index-groups ul, .index-list { list-style: none; padding-left: 0; }
nav ol { list-style: none; padding-left: 1.2em; }
`;
}

/** Everything a book needs to say about itself in the package file, in words a reader of the file can trust. */
function accessibility(project: Project, hasIndex: boolean): { features: string[]; modes: string[]; sufficient: string[]; summary: string } {
  const pictures: Picture[] = [];
  const walk = (nodes: TreeNode[]) => nodes.forEach((n) => { pictures.push(...n.pictures); walk(n.children); });
  walk(project.tree);
  // A picture counts only if a block of the page shows it, but one that is not shown is not a problem for a reader either.
  const withoutWords = pictures.filter((p) => altTextFor(p).trim() === "").length;
  const features = ["tableOfContents", "structuralNavigation", "readingOrder", ...(hasIndex ? ["index"] : []), ...(pictures.length > 0 && withoutWords === 0 ? ["alternativeText"] : [])];
  const modes = pictures.length ? ["textual", "visual"] : ["textual"];
  const sufficient = pictures.length === 0 || withoutWords === 0 ? ["textual", "textual,visual"] : ["textual,visual"];
  const summary = pictures.length === 0
    ? "The book is text with a contents list and headings to move by."
    : withoutWords === 0
      ? `The book has a contents list and headings to move by. All ${pictures.length} ${pictures.length === 1 ? "picture has" : "pictures have"} a description, and the steps and callout lists say what the pictures show. It has not been checked against an accessibility standard.`
      : `The book has a contents list and headings to move by. ${withoutWords} of its ${pictures.length} pictures have no description yet, so a reader who cannot see them has less to go on there. It has not been checked against an accessibility standard.`;
  return { features, modes, sufficient, summary };
}

export interface EpubOptions {
  /** When it was made (ISO), for the package's modified date. */
  now?: string;
  /** The unique id of this book, such as `urn:uuid:...`. Made at random when left out. */
  identifier?: string;
}

/** The files of an EPUB, by their path inside it. `mimetype` is first. */
export function buildEpubParts(project: Project, flat: Map<string, FlatPicture>, options: EpubOptions = {}): Record<string, Uint8Array> {
  const numbers = numbering(project.tree);
  const v = project.variables;
  const bookTitle = fillVariables(project.name, v);
  const modified = (options.now ? new Date(options.now) : new Date()).toISOString().replace(/\.\d+Z$/, "Z");
  const identifier = options.identifier ?? `urn:uuid:${globalThis.crypto.randomUUID()}`;

  // Which file each topic is in: a chapter and all its topics share one.
  const fileOf = new Map<string, string>();
  const chapters = project.tree.map((chapter, i) => ({ node: chapter, file: `ch${i + 1}.xhtml` }));
  const assign = (node: TreeNode, file: string) => { fileOf.set(node.id, file); node.children.forEach((c) => assign(c, file)); };
  for (const c of chapters) assign(c.node, c.file);
  const hrefTo = (id: string) => `${fileOf.get(id) ?? "ch1.xhtml"}#${anchorOf(id)}`;

  const topicLinks: TopicLinks = { number: (id) => (fileOf.has(id) ? numbers.get(id) ?? null : null), attrs: (id) => `href="${esc(hrefTo(id))}"`, showNumber: true };
  const ctx: RenderContext = { project, place: "book", notes: false, flat: true, imageSrc: (p) => flat.get(p.id)?.path ?? null, topicLinks };

  const page = (title: string, body: string) =>
    `${XML_HEAD}<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">\n<head>\n<meta charset="utf-8"/>\n<title>${esc(title)}</title>\n<link rel="stylesheet" type="text/css" href="styles.css"/>\n</head>\n<body>\n${xhtml(body)}\n</body>\n</html>\n`;

  const topicHtml = (node: TreeNode, depth: number): string => {
    const level = Math.min(6, depth + 1);
    const number = numbers.get(node.id) ?? "";
    const title = esc(fillVariables(node.title, v));
    const appendix = depth === 0 && /^appendix\b/i.test(fillVariables(node.title, v).trim());
    const opener = depth === 0 && node.children.length
      ? `<div class="in-chapter"><p class="in-chapter-title">In This ${appendix ? "Appendix" : "Chapter"}</p><ul>${node.children.map((c) => `<li><a href="${esc(hrefTo(c.id))}">${esc(fillVariables(c.title, v))}</a></li>`).join("")}</ul></div>\n`
      : "";
    const type = depth === 0 ? ` epub:type="${appendix ? "appendix" : "chapter"}"` : "";
    return `<section id="${esc(anchorOf(node.id))}"${type}>\n<h${level}>${esc(number)} ${title}</h${level}>\n${opener}${blocksHtml(ctx, node, level)}${seeAlsoHtml(ctx, node, level)}\n${node.children.map((c) => topicHtml(c, depth + 1)).join("\n")}</section>`;
  };

  const out: Record<string, Uint8Array> = {};
  const put = (path: string, text: string) => { out[path] = encoder.encode(text); };
  put("mimetype", "application/epub+zip");
  put("META-INF/container.xml", `${XML_HEAD}<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n`);

  // ---- The reading order: title page, chapters, index.
  const docs: { id: string; file: string; title: string }[] = [];
  const logo = flat.get("@logo");
  if (project.look.cover) {
    const details = ["PRODUCT", "VERSION", "COMPANY"].map((k) => v[k]?.trim()).filter(Boolean).map((d) => `<p>${esc(d)}</p>`).join("");
    const logoImg = logo && project.look.logo ? `<img src="${esc(logo.path)}" alt="${esc(project.look.logo.alt)}" width="${project.look.logo.width}" height="${project.look.logo.height}"/>` : "";
    put("OEBPS/title.xhtml", page(bookTitle, `<section class="title-page" epub:type="titlepage">${logoImg}<h1>${esc(bookTitle)}</h1>${details}</section>`));
    docs.push({ id: "title", file: "title.xhtml", title: "Title page" });
  }
  chapters.forEach(({ node, file }, i) => {
    put(`OEBPS/${file}`, page(`${numbers.get(node.id)} ${fillVariables(node.title, v)} - ${bookTitle}`, topicHtml(node, 0)));
    docs.push({ id: `ch${i + 1}`, file, title: `${numbers.get(node.id)} ${fillVariables(node.title, v)}` });
  });
  const bookIndex = buildBookIndex(project, numbers);
  const withIndex = bookIndex.terms > 0;
  if (withIndex) {
    put("OEBPS/book-index.xhtml", page(`Index - ${bookTitle}`, `<section id="index" epub:type="index">\n<h1>Index</h1>\n${indexHtml(bookIndex, (entry) => entry.topics.map((t) => `<a href="${esc(hrefTo(t.id))}">${esc(t.number)}</a>`), v)}\n</section>`));
    docs.push({ id: "index", file: "book-index.xhtml", title: "Index" });
  }
  if (docs.length === 0) {
    put("OEBPS/empty.xhtml", page(bookTitle, `<section><h1>${esc(bookTitle)}</h1><p>This book has no topics yet.</p></section>`));
    docs.push({ id: "empty", file: "empty.xhtml", title: bookTitle });
  }

  // ---- The contents (nav.xhtml): the book's tree, each entry a link; and the landmarks.
  const tocList = (nodes: TreeNode[]): string =>
    nodes.length ? `<ol>${nodes.map((n) => `<li><a href="${esc(hrefTo(n.id))}">${esc(numbers.get(n.id) ?? "")} ${esc(fillVariables(n.title, v))}</a>${tocList(n.children)}</li>`).join("")}</ol>` : "";
  const entries = [...(project.look.cover ? [`<li><a href="title.xhtml">Title page</a></li>`] : []), ...(project.tree.length ? [tocList(project.tree).replace(/^<ol>|<\/ol>$/g, "")] : []), ...(withIndex ? [`<li><a href="book-index.xhtml">Index</a></li>`] : [])];
  put("OEBPS/nav.xhtml", page(`Contents - ${bookTitle}`,
    `<nav epub:type="toc" id="toc" role="doc-toc">\n<h1>Contents</h1>\n<ol>${entries.join("")}</ol>\n</nav>\n<nav epub:type="landmarks" id="landmarks" hidden="">\n<h2>Landmarks</h2>\n<ol><li><a epub:type="toc" href="nav.xhtml#toc">Contents</a></li><li><a epub:type="bodymatter" href="${esc(docs[project.look.cover && docs.length > 1 ? 1 : 0].file)}">Start of the book</a></li></ol>\n</nav>`));
  put("OEBPS/styles.css", stylesheet(project));

  // ---- The pictures.
  const images = [...flat.values()];
  for (const image of images) out[`OEBPS/${image.path}`] = image.bytes;

  // ---- The package file: what the book is, what is in it, and in what order to read it.
  const a11y = accessibility(project, withIndex);
  const meta = (property: string, value: string) => `<meta property="${property}">${esc(value)}</meta>`;
  const publisher = v.COMPANY?.trim();
  const opf = `${XML_HEAD}<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${esc(identifier)}</dc:identifier>
<dc:title>${esc(bookTitle)}</dc:title>
<dc:language>en</dc:language>
${publisher ? `<dc:publisher>${esc(publisher)}</dc:publisher>\n` : ""}${meta("dcterms:modified", modified)}
${a11y.modes.map((m) => meta("schema:accessMode", m)).join("\n")}
${a11y.sufficient.map((m) => meta("schema:accessModeSufficient", m)).join("\n")}
${a11y.features.map((f) => meta("schema:accessibilityFeature", f)).join("\n")}
${meta("schema:accessibilityHazard", "none")}
${meta("schema:accessibilitySummary", a11y.summary)}
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="styles.css" media-type="text/css"/>
${docs.map((d) => `<item id="${d.id}" href="${d.file}" media-type="application/xhtml+xml"/>`).join("\n")}
${images.map((image, i) => `<item id="img${i + 1}" href="${esc(image.path)}" media-type="${mediaType(image.path)}"/>`).join("\n")}
</manifest>
<spine>
${docs.map((d) => `<itemref idref="${d.id}"/>`).join("\n")}
</spine>
</package>
`;
  put("OEBPS/content.opf", opf);
  return out;
}

/** The book as the bytes of an .epub file. */
export function packEpub(project: Project, flat: Map<string, FlatPicture>, options: EpubOptions = {}): Uint8Array {
  return zip(buildEpubParts(project, flat, options));
}
