// Word: one short guide as a .docx file. It uses the same Word styles as the book (Title, Heading 1 for each task, Heading 2 for each step, Caption, the callout box styles, Control name), so a
// publisher can restyle both the same way, but it has no cover, no contents and no chapters: the guide's name at the top of the first page, then each task (a new page for each after the first)
// with its steps. A step is a heading ("Step 3"), its picture with the step's number beside the clicked spot, a zoomed close-up of that spot, and its words, in one of two layouts:
//   top:  the picture across the page, the close-up centred under it, the words below.
//   left: a table of two columns with no borders, the picture and its close-up stacked in the left one and the words in the right one. The table has a name and a description for screen readers.
// The pictures are the flat PNGs made for this guide (src/export/pictures.ts, flattenGuide), each with the description of its picture (or the words of its step) as alternative text.
// Comments are never included. Nothing here needs a screen.
import { entries, entryWords } from "../project/callouts.ts";
import { guideTasks, type Guide, type GuideStep } from "../project/guides.ts";
import type { Picture, Project } from "../project/model.ts";
import { CALLOUT_KINDS, calloutLabel } from "../project/page.ts";
import { plainText } from "../project/text.ts";
import { PRINT_TEXT_WIDTH, shownPart } from "../project/views.ts";
import { zip } from "../project/zip.ts";
import { altTextFor, fillVariables } from "../render/html.ts";
import { calloutInView } from "../render/overlay.ts";
import { assembleDocx, drawing, para, run, runsXml, xml, type Context } from "./docx.ts";
import { guideKey, type FlatPicture } from "./pictures.ts";

/** The width of a picture in the left layout's left column (the column is 2.7 inches; the rest is the cell's own margin). */
const LEFT_PICTURE_PIXELS = 240;
/** A close-up under a picture in the top layout is 55 percent of the text width, the same as in the preview. */
const CLOSE_UP_PIXELS = Math.round(PRINT_TEXT_WIDTH * 0.55);
/** The two columns of the left layout, in twentieths of a point: 2.7 inches and 3.8 inches of the 6.5 inches between the margins. */
const LEFT_COLUMN = 3900;
const RIGHT_COLUMN = 5460;

/** The callout entries of a picture, as caption lines, for the ones in the part shown. */
function captions(ctx: Context, picture: Picture): string {
  const shown = shownPart(picture, ctx.project.zoom, "guide");
  return entries(picture)
    .map((entry, i) => ({ entry, i }))
    .filter(({ i }) => calloutInView(picture, i, shown))
    .map(({ entry }) => para("Caption", run(fillVariables(entryWords(entry), ctx.project.variables))))
    .join("");
}

function stepXml(ctx: Context, item: GuideStep): string {
  const v = ctx.project.variables;
  const { step, picture } = item;
  const words = fillVariables(plainText(step.text), v);
  const head = para("Heading2", run(`Step ${item.number}`));
  const text = para("Normal", runsXml(step.text, v));
  const result = step.result && step.result.length ? para("Normal", run("Result: ", "<w:b/>") + runsXml(step.result, v)) : "";
  if (!picture) return head + text + result;
  const whole = ctx.flat.get(guideKey(step.id));
  if (!whole) return head + para("Normal", run(`(The picture "${picture.altText.trim() || picture.source.originalName || picture.file}" could not be included.)`, "<w:i/>")) + text + result;
  const close = ctx.flat.get(guideKey(step.id, true));
  const alt = altTextFor(picture, words);
  const closeAlt = `Close-up of the clicked spot. ${alt}`;
  if (item.layout === "top") {
    return head
      + para("Normal", drawing(ctx, whole, alt, PRINT_TEXT_WIDTH), "<w:keepNext/>")
      + captions(ctx, picture)
      + (close ? para("Normal", drawing(ctx, close, closeAlt, CLOSE_UP_PIXELS), '<w:keepNext/><w:jc w:val="center"/>') : "")
      + text + result;
  }
  const left = para("Normal", drawing(ctx, whole, alt, LEFT_PICTURE_PIXELS), close ? "<w:keepNext/>" : "")
    + captions(ctx, picture)
    + (close ? para("Normal", drawing(ctx, close, closeAlt, LEFT_PICTURE_PIXELS)) : "");
  const table = `<w:tbl><w:tblPr><w:tblW w:w="${LEFT_COLUMN + RIGHT_COLUMN}" w:type="dxa"/><w:tblLayout w:type="fixed"/>`
    + `<w:tblCaption w:val="${xml(`Step ${item.number}`)}"/><w:tblDescription w:val="Layout only: the pictures of the step are on the left and its words are on the right."/></w:tblPr>`
    + `<w:tblGrid><w:gridCol w:w="${LEFT_COLUMN}"/><w:gridCol w:w="${RIGHT_COLUMN}"/></w:tblGrid>`
    + `<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="${LEFT_COLUMN}" w:type="dxa"/></w:tcPr>${left}</w:tc>`
    + `<w:tc><w:tcPr><w:tcW w:w="${RIGHT_COLUMN}" w:type="dxa"/><w:tcMar><w:left w:w="200" w:type="dxa"/></w:tcMar></w:tcPr>${text}${result}</w:tc></w:tr></w:tbl>`;
  return head + table;
}

/** The files of a guide as a Word file, by their path inside the .docx. `flat` has the guide's pictures (see flattenGuide). */
export function buildGuideDocxParts(project: Project, guide: Guide, flat: Map<string, FlatPicture>, options: { now?: string } = {}): Record<string, Uint8Array> {
  const ctx: Context = { project, flat, images: [], lists: 0, bookmarks: new Map(), drawingId: 0 };
  const v = project.variables;
  const title = fillVariables(guide.name, v);
  const tasks = guideTasks(project, guide);
  let body = para("Title", run(title));
  if (tasks.length === 0) body += para("Normal", run("This guide has no tasks yet.", "<w:i/>"));
  tasks.forEach((task, index) => {
    body += para("Heading1", run(fillVariables(task.node.title, v)), index > 0 ? "<w:pageBreakBefore/>" : "");
    for (const item of task.items) {
      if (item.type === "step") body += stepXml(ctx, item);
      else body += para(`Callout${CALLOUT_KINDS.findIndex((k) => k.id === item.kind) + 1}`, run(`${calloutLabel(item.kind)}. `, "<w:b/>") + runsXml(item.text, v));
    }
    if (task.items.length === 0) body += para("Normal", run("(This topic has no numbered steps, so nothing of it is in the guide.)", "<w:i/>"));
  });
  // A table cannot be the last thing in the document: Word needs a paragraph after it.
  if (body.endsWith("</w:tbl>")) body += "<w:p/>";
  return assembleDocx(ctx, title, body, { ...options, guide: true });
}

/** The guide as the bytes of a .docx file. */
export function packGuideDocx(project: Project, guide: Guide, flat: Map<string, FlatPicture>, options: { now?: string } = {}): Uint8Array {
  return zip(buildGuideDocxParts(project, guide, flat, options));
}
