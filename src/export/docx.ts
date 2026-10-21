// Word: the whole book as a .docx file (a zip of XML parts) with real Word styles, so the author or a publisher can edit and restyle it: Title, Heading 1 to 6 (so the navigation pane and a table of
// contents work), Step (a numbered list that starts again at 1 for each procedure), Callout box styles (one for each kind, said in words), Caption (the callout entries under a picture), a
// character style for control names, and Contents entries that link to their headings. Pictures are the flat PNGs (cut to the part shown, with their marks drawn in) with their description as the picture's
// alternative text. There is a running header with the book's name and a page number in the footer. Comments are never included. Nothing here needs a screen.
import { entries, entryWords } from "../project/callouts.ts";
import { numbering, type Picture, type Project, type TreeNode } from "../project/model.ts";
import { CALLOUT_KINDS, calloutLabel, type Block } from "../project/page.ts";
import type { Run } from "../project/text.ts";
import { PRINT_TEXT_WIDTH, shownPart } from "../project/views.ts";
import { altTextFor, fillVariables } from "../render/html.ts";
import { calloutInView } from "../render/overlay.ts";
import type { FlatPicture } from "./pictures.ts";
import { zip } from "../project/zip.ts";

const encoder = new TextEncoder();
const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const EMU_PER_PIXEL = 9525;
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Text made safe for an XML part. Characters Word cannot hold are dropped. */
export function xml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const run = (text: string, props = "") => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
export const para = (style: string, inner: string, extra = "") => `<w:p><w:pPr><w:pStyle w:val="${style}"/>${extra}</w:pPr>${inner}</w:p>`;

export function runsXml(runs: Run[], variables: Record<string, string>): string {
  return runs
    .map((r) => {
      const text = fillVariables(r.text, variables);
      if (r.mark === "bold") return run(text, "<w:b/>");
      if (r.mark === "italic") return run(text, "<w:i/>");
      if (r.mark === "control") return run(text, '<w:rStyle w:val="ControlName"/>');
      return run(text);
    })
    .join("");
}

export interface Context {
  project: Project;
  flat: Map<string, FlatPicture>;
  /** The pictures put in the document, in order, so each gets a relationship and a file. */
  images: { id: string; path: string }[];
  /** The numbered lists used so far: each procedure has its own so it starts at 1. */
  lists: number;
  bookmarks: Map<string, number>;
  drawingId: number;
}

/** A step's picture is indented half an inch (48 pixels at 96 to the inch), so it is narrower to stay inside the margins. */
const STEP_INDENT_PIXELS = 48;

/** A picture as an inline drawing, no wider than `maxWidthPx` (it keeps its shape), with `alt` as its alternative text. */
export function drawing(ctx: Context, made: FlatPicture, alt: string, maxWidthPx: number): string {
  let index = ctx.images.findIndex((i) => i.path === made.path);
  if (index < 0) { ctx.images.push({ id: `rIdImg${ctx.images.length + 1}`, path: made.path }); index = ctx.images.length - 1; }
  const rel = ctx.images[index].id;
  const widthPx = Math.min(made.width, maxWidthPx);
  const cx = Math.round(widthPx * EMU_PER_PIXEL);
  const cy = Math.round((widthPx * made.height * EMU_PER_PIXEL) / made.width);
  const id = ++ctx.drawingId;
  alt = xml(alt);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}" descr="${alt}"/>`
    + `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>`
    + `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${xml(made.path.replace("images/", ""))}" descr="${alt}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
    + `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

/** A picture in the document: the picture itself, then its callout entries as caption lines. `indent` puts it under a numbered step. */
function pictureXml(ctx: Context, picture: Picture, indent: boolean): string {
  const made = ctx.flat.get(picture.id);
  const style = indent ? "StepContinued" : "Normal";
  if (!made) return para(style, run(`(The picture "${picture.altText.trim() || picture.source.originalName || picture.file}" could not be included.)`, "<w:i/>"));
  const shown = shownPart(picture, ctx.project.zoom, "book");
  const lines = entries(picture)
    .map((entry, i) => ({ entry, i }))
    .filter(({ i }) => calloutInView(picture, i, shown))
    .map(({ entry }) => para(indent ? "StepContinued" : "Caption", run(fillVariables(entryWords(entry), ctx.project.variables))));
  return para(style, drawing(ctx, made, altTextFor(picture), PRINT_TEXT_WIDTH - (indent ? STEP_INDENT_PIXELS : 0)), '<w:keepNext/>') + lines.join("");
}

function blockXml(ctx: Context, node: TreeNode, block: Block, level: number): string {
  const v = ctx.project.variables;
  switch (block.type) {
    case "paragraph": return para("Normal", runsXml(block.text, v));
    case "heading": return block.text.trim() ? para(`Heading${Math.min(6, level + 1)}`, run(fillVariables(block.text, v))) : "";
    case "picture": {
      const picture = node.pictures.find((p) => p.id === block.pictureId);
      return picture ? pictureXml(ctx, picture, false) : "";
    }
    case "callout": return para(`Callout${CALLOUT_KINDS.findIndex((k) => k.id === block.kind) + 1}`, run(`${calloutLabel(block.kind)}. `, "<w:b/>") + runsXml(block.text, v));
    case "procedure": {
      const numId = ++ctx.lists + 1; // numId 1 is the bullets
      return block.steps
        .map((step) => {
          const picture = step.pictureId ? node.pictures.find((p) => p.id === step.pictureId) : undefined;
          // A step with a picture stays on the same page as it, so the words are never left alone above a page break.
          let out = para("Step", runsXml(step.text, v), `${picture ? "<w:keepNext/>" : ""}<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`);
          if (picture) out += pictureXml(ctx, picture, true);
          if (step.result && step.result.length) out += para("StepContinued", run("Result: ", "<w:b/>") + runsXml(step.result, v));
          return out;
        })
        .join("");
    }
  }
}

/** A topic's heading, with a bookmark the contents list links to. A chapter starts a new page. */
function heading(ctx: Context, level: number, number: string, title: string, id: string): string {
  const n = ctx.bookmarks.size + 1;
  ctx.bookmarks.set(id, n);
  const pageBreak = level === 1 ? "<w:pageBreakBefore/>" : "";
  return para(`Heading${Math.min(6, level)}`, `<w:bookmarkStart w:id="${n}" w:name="_Toc${n}"/>${run(`${number} ${fillVariables(title, ctx.project.variables)}`)}<w:bookmarkEnd w:id="${n}"/>`, pageBreak);
}

function topicXml(ctx: Context, node: TreeNode, depth: number, numbers: Map<string, string>): string {
  const level = depth + 1;
  let out = heading(ctx, level, numbers.get(node.id) ?? "", node.title, node.id);
  if (depth === 0 && node.children.length > 0) {
    out += para("ChapterOpener", run("In This Chapter", "<w:b/>"));
    out += node.children.map((c) => para("ListBullet", run(fillVariables(c.title, ctx.project.variables)), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>')).join("");
  }
  for (const block of node.page?.blocks ?? []) out += blockXml(ctx, node, block, level);
  for (const child of node.children) out += topicXml(ctx, child, depth + 1, numbers);
  return out;
}

/** The contents entries, in order: each links to its heading. */
function contentsEntries(ctx: Context, nodes: TreeNode[], numbers: Map<string, string>, depth: number): { style: string; link: string }[] {
  return nodes.flatMap((n) => {
    const bookmark = ctx.bookmarks.get(n.id);
    const label = run(`${numbers.get(n.id)} ${fillVariables(n.title, ctx.project.variables)}`, '<w:rStyle w:val="Hyperlink"/>');
    const link = bookmark ? `<w:hyperlink w:anchor="_Toc${bookmark}" w:history="1">${label}</w:hyperlink>` : label;
    return [{ style: `Contents${Math.min(3, depth + 1)}`, link }, ...contentsEntries(ctx, n.children, numbers, depth + 1)];
  });
}

/**
 * The contents as Word's own table of contents field, holding the entries as they are now. They link to their headings and have no page numbers yet,
 * because only Word knows where the pages break: in Word, right-click the contents and choose Update Field to add the page numbers.
 */
function contentsXml(ctx: Context, nodes: TreeNode[], numbers: Map<string, string>): string {
  const entries = contentsEntries(ctx, nodes, numbers, 0);
  const begin = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>';
  const end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
  return entries.map((e, i) => para(e.style, `${i === 0 ? begin : ""}${e.link}${i === entries.length - 1 ? end : ""}`)).join("");
}

// ---- The fixed parts -----------------------------------------------------------------------------------

export const BOX_COLOURS: Record<string, string> = { "design-tip": "1F4E8C", caution: "A31515", "bright-idea": "8A6D00", "power-tip": "5A2A82", "time-saver": "1B6B2F", "new-feature": "00606B" };

function stylesXml(guide: boolean): string {
  const heading = (n: number, size: number, before: number) =>
    `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${before}" w:after="80"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
  const box = CALLOUT_KINDS.map((k, i) =>
    `<w:style w:type="paragraph" w:customStyle="1" w:styleId="Callout${i + 1}"><w:name w:val="Callout box, ${calloutLabel(k.id)}"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepLines/><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="767676"/><w:left w:val="single" w:sz="48" w:space="6" w:color="${BOX_COLOURS[k.id]}"/><w:bottom w:val="single" w:sz="4" w:space="4" w:color="767676"/><w:right w:val="single" w:sz="4" w:space="4" w:color="767676"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F4F6F9"/><w:spacing w:before="160" w:after="160"/><w:ind w:left="240" w:right="240"/></w:pPr></w:style>`).join("");
  const contents = [1, 2, 3].map((n) => `<w:style w:type="paragraph" w:styleId="Contents${n}"><w:name w:val="toc ${n}"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="39"/><w:pPr><w:spacing w:after="40"/><w:ind w:left="${(n - 1) * 360}"/></w:pPr></w:style>`).join("");
  return `${XML_HEAD}<w:styles xmlns:w="${NS_W}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="10"/><w:qFormat/>${guide ? '<w:pPr><w:spacing w:before="0" w:after="200"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr>' : '<w:pPr><w:spacing w:before="2400" w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr>'}</w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="11"/><w:qFormat/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
${heading(1, 40, 360)}${heading(2, 32, 280)}${heading(3, 28, 240)}${heading(4, 26, 200)}${heading(5, 24, 200)}${heading(6, 22, 200)}
<w:style w:type="paragraph" w:customStyle="1" w:styleId="ContentsHeading"><w:name w:val="Contents heading"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
${contents}
<w:style w:type="paragraph" w:customStyle="1" w:styleId="ChapterOpener"><w:name w:val="Chapter opener"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="60"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:pPr><w:spacing w:after="40"/></w:pPr></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="Step"><w:name w:val="Step"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="80" w:after="80"/></w:pPr></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="StepContinued"><w:name w:val="Step continued"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="35"/><w:qFormat/><w:pPr><w:spacing w:after="20"/></w:pPr><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>
${box}
<w:style w:type="character" w:customStyle="1" w:styleId="ControlName"><w:name w:val="Control name"/><w:basedOn w:val="DefaultParagraphFont"/><w:qFormat/><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:rPr><w:color w:val="0B57D0"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:pPr><w:spacing w:after="0"/><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
</w:styles>`;
}

function numberingXml(lists: number): string {
  const steps = Array.from({ length: lists }, (_, i) => `<w:num w:numId="${i + 2}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join("");
  return `${XML_HEAD}<w:numbering xmlns:w="${NS_W}">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>${steps}
</w:numbering>`;
}

/**
 * Puts the parts of a .docx together around a body: the document, its relationships, styles, numbering, header, footer and properties, and the picture files the body used.
 * `title` is the name in the running header and the document's properties. A guide's title is left aligned at the top of its first page instead of being a cover.
 */
export function assembleDocx(ctx: Context, title: string, body: string, options: { now?: string; guide?: boolean } = {}): Record<string, Uint8Array> {
  const document = `${XML_HEAD}<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
<w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body>
</w:document>`;
  const rels = [
    `<Relationship Id="rIdStyles" Type="${NS_R}/styles" Target="styles.xml"/>`,
    `<Relationship Id="rIdNumbering" Type="${NS_R}/numbering" Target="numbering.xml"/>`,
    `<Relationship Id="rIdHeader" Type="${NS_R}/header" Target="header1.xml"/>`,
    `<Relationship Id="rIdFooter" Type="${NS_R}/footer" Target="footer1.xml"/>`,
    ...ctx.images.map((i) => `<Relationship Id="${i.id}" Type="${NS_R}/image" Target="media/${xml(i.path.replace("images/", ""))}"/>`),
  ].join("");
  const now = options.now ?? new Date().toISOString();
  const files: Record<string, string> = {
    "[Content_Types].xml": `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>`
      + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`
      + `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>`
      + `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    "_rels/.rels": `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    "word/document.xml": document,
    "word/_rels/document.xml.rels": `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
    "word/styles.xml": stylesXml(options.guide === true),
    "word/numbering.xml": numberingXml(ctx.lists),
    "word/header1.xml": `${XML_HEAD}<w:hdr xmlns:w="${NS_W}" xmlns:r="${NS_R}">${para("Header", run(title))}</w:hdr>`,
    "word/footer1.xml": `${XML_HEAD}<w:ftr xmlns:w="${NS_W}" xmlns:r="${NS_R}"><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`,
    "docProps/core.xml": `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(title)}</dc:title><dc:language>en-US</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${xml(now)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${xml(now)}</dcterms:modified></cp:coreProperties>`,
  };
  const out: Record<string, Uint8Array> = {};
  for (const [path, text] of Object.entries(files)) out[path] = encoder.encode(text);
  for (const image of ctx.images) {
    const made = [...ctx.flat.values()].find((f) => f.path === image.path);
    if (made) out[`word/media/${image.path.replace("images/", "")}`] = made.bytes;
  }
  return out;
}

/** The files of a Word export, by their path inside the .docx. */
export function buildDocxParts(project: Project, flat: Map<string, FlatPicture>, options: { now?: string } = {}): Record<string, Uint8Array> {
  const numbers = numbering(project.tree);
  const ctx: Context = { project, flat, images: [], lists: 0, bookmarks: new Map(), drawingId: 0 };
  const title = fillVariables(project.name, project.variables);
  const details = ["PRODUCT", "VERSION", "COMPANY"].map((k) => project.variables[k]?.trim()).filter(Boolean);
  // The headings are made first so the contents can link to them; the contents then goes in front of them.
  const body = project.tree.map((chapter) => topicXml(ctx, chapter, 0, numbers)).join("");
  const front = para("Title", run(title)) + details.map((d) => para("Subtitle", run(d))).join("");
  const contents = project.tree.length > 0 ? para("ContentsHeading", run("Contents"), '<w:pageBreakBefore/>') + contentsXml(ctx, project.tree, numbers) : "";
  return assembleDocx(ctx, title, `${front}${contents}${body}`, options);
}

/** The book as the bytes of a .docx file. */
export function packDocx(project: Project, flat: Map<string, FlatPicture>, options: { now?: string } = {}): Uint8Array {
  return zip(buildDocxParts(project, flat, options));
}
