// The pieces of a page as HTML text: its text with marks, a picture with its callouts and their entries, a numbered procedure, a callout box. The print preview, the help
// site preview and (later) the exports all build their pages from these, so a topic reads the same wherever it is shown. Nothing here needs a screen: it makes text.
// Everything that comes from the project (titles, words, variables) is escaped, so nothing a person types can add markup to a page.
import { entries, entryWords } from "../project/callouts.ts";
import { circleFor, type HighlightKind } from "../project/highlight.ts";
import type { Picture, Project, TreeNode } from "../project/model.ts";
import { calloutLabel, type Block, type CalloutKind, type Step } from "../project/page.ts";
import { failing, kindName, missingAlt, shapeChecks, shapesDescription } from "../project/shapes.ts";
import type { Run } from "../project/text.ts";
import { isWhole, MIN_PRINT_SCALE, PRINT_TEXT_WIDTH, printScale, shownPart } from "../project/views.ts";

export { MIN_PRINT_SCALE, PRINT_TEXT_WIDTH, printScale };
import { calloutInView, overlayFor, overlaySvg } from "./overlay.ts";

/** What a page needs to know to be written out. */
export interface RenderContext {
  project: Project;
  /** Which place the pages are for: the click circle and the zoom size follow that place's settings. */
  place: HighlightKind;
  /** Where a picture's bytes can be shown from (a blob address in a preview, a file name in an export), or `null` when the file is missing. */
  imageSrc(picture: Picture): string | null;
  /** Add notes for the writer, marked as not part of the output. A preview does; an export does not. */
  notes: boolean;
  /** The pictures come already cut to the part shown, with the click circle, the marks and the callouts drawn in (see src/render/flatten.ts), so no drawing is laid over them. */
  flat?: boolean;
  /** Told each note as it is written (with where it is, when known), so a preview can list them all. */
  onNote?(words: string): void;
}

/** Text made safe to put in HTML. */
export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Variables such as {{PRODUCT}} filled in from the project. One with no value yet stays as it is, so it can be seen and fixed. */
export function fillVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (whole, name: string) => (variables[name] && variables[name].trim() ? variables[name] : whole));
}

/** A note for the writer, in a preview only. `where` says which topic it is in, for the list of notes. */
export function noteHtml(ctx: RenderContext, words: string, where?: string): string {
  if (!ctx.notes) return "";
  ctx.onNote?.(where ? `${where}: ${words}` : words);
  return `<p class="pv-note" data-preview-only="true"><strong>Note for the writer:</strong> ${esc(words)}</p>`;
}

/** Text with marks as HTML: bold, italic, and a control name (the label of a button or menu, in bold). */
export function runsHtml(ctx: RenderContext, runs: Run[]): string {
  return runs
    .map((run) => {
      const words = esc(fillVariables(run.text, ctx.project.variables));
      if (run.mark === "bold") return `<strong>${words}</strong>`;
      if (run.mark === "italic") return `<em>${words}</em>`;
      if (run.mark === "control") return `<strong class="control-name">${words}</strong>`;
      return words;
    })
    .join("");
}

/**
 * The words that say what is in a picture, for a screen reader: what the author wrote, or else its callouts, then the marks drawn on it (the words of a text box, the label of a
 * marker and the description of an arrow or a rectangle), or else nothing.
 */
export function altTextFor(picture: Picture, fallback?: string): string {
  const written = picture.altText.trim();
  const list = entries(picture).filter((e) => !e.needsName || !e.needsDescription);
  // In a guide a picture with no description of its own takes the words of its step.
  const base = written || fallback?.trim() || (list.length ? `Callouts: ${list.map(entryWords).join(" ")}` : "");
  return [base, shapesDescription(picture)].filter(Boolean).join(" ");
}

/** What a picture needs beyond the usual when it is a step of a guide. */
export interface FigureOptions {
  /** Draw this step number as a marker on the clicked spot. */
  stepNumber?: number;
  /** Words for a picture that has no description of its own, such as the words of its step. */
  altFallback?: string;
  /** A zoomed close-up shown with the whole picture: no callout entries or notes of its own, and its description says it is a close-up. */
  closeUp?: boolean;
  /** Leave out the note about writing that is too small on paper (the picture has a close-up beside it). */
  noSmallNote?: boolean;
}

/** A picture as it is shown where it is used: only the part chosen, with its click circle and callouts over it, and the callout entries under it. */
export function figureHtml(ctx: RenderContext, picture: Picture, where?: string, options: FigureOptions = {}): string {
  const src = ctx.imageSrc(picture);
  if (!src) return `<p class="pv-missing">This picture file is missing from the project.</p>${noteHtml(ctx, "A picture file is missing from the project.", where)}`;
  const shown = shownPart(picture, ctx.project.zoom, ctx.place);
  const circle = circleFor(picture, ctx.project.highlight, ctx.place);
  const overlay = overlayFor(picture, circle, shown, options.stepNumber);
  const alt = `${options.closeUp ? "Close-up of the clicked spot. " : ""}${altTextFor(picture, options.altFallback)}`.trim();
  const crop = isWhole(shown, picture) ? "" : ` style="object-view-box: xywh(${shown.x}px ${shown.y}px ${shown.width}px ${shown.height}px)"`;
  const list = options.closeUp ? [] : entries(picture);
  const listed = list
    .map((entry, i) => ({ entry, i }))
    .filter(({ i }) => calloutInView(picture, i, shown))
    .map(({ entry }) => `<li>${esc(fillVariables(entryWords(entry), ctx.project.variables))}</li>`)
    .join("");
  const hidden = options.closeUp ? 0 : list.length - list.filter((_, i) => calloutInView(picture, i, shown)).length;
  if (ctx.flat) {
    return `<figure class="pv-figure" style="max-width: ${shown.width}px"><img src="${esc(src)}" alt="${esc(alt)}" width="${shown.width}" height="${shown.height}">`
      + (listed ? `<figcaption><ul class="pv-entries" aria-label="Callouts on this picture">${listed}</ul></figcaption>` : "")
      + "</figure>";
  }
  const notes: string[] = [];
  const scale = printScale(shown.width);
  // A close-up has no notes of its own: the whole picture beside it carries them.
  if (!options.closeUp && scale < MIN_PRINT_SCALE && !options.noSmallNote) notes.push(`Small on paper: the writing in this picture will print at about ${Math.round(scale * 100)} percent of its size on screen. A crop or a zoom (Picture view) would make it easier to read.`);
  if (!options.closeUp && !picture.altText.trim() && !options.altFallback?.trim()) notes.push("This picture has no description yet, so a screen reader has little to say about it.");
  const unnamed = options.closeUp ? 0 : missingAlt(picture);
  if (unnamed > 0) notes.push(`${unnamed} ${unnamed === 1 ? "mark (an arrow or a rectangle) has" : "marks (arrows or rectangles) have"} no alternative text yet, so a screen reader cannot say what ${unnamed === 1 ? "it points" : "they point"} at.`);
  for (const mark of options.closeUp ? [] : picture.shapes ?? []) {
    for (const bad of failing(shapeChecks(mark))) notes.push(`${kindName(mark.kind)}: ${bad.words}${mark.keptLowContrast ? " (The colours were kept on purpose.)" : ""}`);
  }
  if (hidden > 0) notes.push(`${hidden} ${hidden === 1 ? "callout is" : "callouts are"} outside the part of the picture that is shown, so ${hidden === 1 ? "it is" : "they are"} left out of the list and the drawing.`);
  return `<figure class="pv-figure" style="max-width: ${Math.min(shown.width, PRINT_TEXT_WIDTH)}px">`
    + `<div class="pv-shot" style="aspect-ratio: ${shown.width} / ${shown.height}"><img src="${esc(src)}" alt="${esc(alt)}"${crop}>${overlay ? overlaySvg(overlay, "pv-marks") : ""}</div>`
    + (listed ? `<figcaption><ul class="pv-entries" aria-label="Callouts on this picture">${listed}</ul></figcaption>` : "")
    + `</figure>${notes.map((n) => noteHtml(ctx, n, where)).join("")}`;
}

const BOX_SYMBOLS: Record<CalloutKind, string> = {
  "design-tip": "✎", caution: "⚠", "bright-idea": "☀", "power-tip": "↯", "time-saver": "⏲", "new-feature": "★",
};

/** A callout box: a symbol, its label in words and its text, so the kind is never shown by colour alone. */
export function boxHtml(ctx: RenderContext, kind: CalloutKind, text: Run[]): string {
  const label = calloutLabel(kind);
  return `<aside class="pv-box pv-box-${esc(kind)}" aria-label="${esc(label)}"><p class="pv-box-label"><span aria-hidden="true">${BOX_SYMBOLS[kind]}</span> ${esc(label)}</p><p>${runsHtml(ctx, text)}</p></aside>`;
}

function stepHtml(ctx: RenderContext, node: TreeNode, step: Step, where?: string): string {
  const picture = step.pictureId ? node.pictures.find((p) => p.id === step.pictureId) : undefined;
  const result = step.result && step.result.length ? `<p class="pv-result"><strong>Result:</strong> ${runsHtml(ctx, step.result)}</p>` : "";
  return `<li><p>${runsHtml(ctx, step.text)}</p>${picture ? figureHtml(ctx, picture, where) : ""}${result}</li>`;
}

/** A numbered procedure. The numbers are worked out from the order, never stored. */
export function procedureHtml(ctx: RenderContext, node: TreeNode, steps: Step[], where?: string): string {
  return `<ol class="pv-steps">${steps.map((s) => stepHtml(ctx, node, s, where)).join("")}</ol>`;
}

/** The blocks of a topic's page, each as HTML. `level` is the heading level of the topic's own title; a heading block goes one below it. `where` names the topic for the notes. */
export function blocksHtml(ctx: RenderContext, node: TreeNode, level: number, where?: string): string {
  const headingLevel = Math.min(6, level + 1);
  return (node.page?.blocks ?? [])
    .map((block: Block) => {
      switch (block.type) {
        case "paragraph": return `<p>${runsHtml(ctx, block.text)}</p>`;
        case "heading": return block.text.trim() ? `<h${headingLevel}>${esc(fillVariables(block.text, ctx.project.variables))}</h${headingLevel}>` : "";
        case "picture": {
          const picture = node.pictures.find((p) => p.id === block.pictureId);
          return picture ? figureHtml(ctx, picture, where) : "";
        }
        case "procedure": return procedureHtml(ctx, node, block.steps, where);
        case "callout": return boxHtml(ctx, block.kind, block.text);
      }
    })
    .join("\n");
}
