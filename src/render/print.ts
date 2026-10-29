// The book as it will print, as HTML: a title page, the contents, and each chapter with its opener ("In This Chapter"), numbered headings, procedures, callout boxes and
// pictures with their callouts. It is an approximation drawn as sheets: real page breaks, running headers and page numbers are made when the PDF is exported, so
// the contents here has no page numbers. Comments are never part of it. Nothing here needs a screen.
import { buildBookIndex, type IndexEntry } from "../project/book-index.ts";
import { numbering, type Project, type TreeNode } from "../project/model.ts";
import { blocksHtml, esc, fillVariables, type RenderContext } from "./html.ts";
import { indexHtml } from "./index-html.ts";

/** The whole book as HTML, and the notes for the writer that the preview collected (also in the HTML, next to what they are about, as preview-only notes). */
export interface PrintPreview {
  html: string;
  /** What the writer should look at, in words. */
  notes: string[];
}

/** The id an anchor in the preview uses for a topic. */
export const topicAnchor = (id: string) => `pv-topic-${id}`;

/** The id of the index section, and the key of its page number among the contents' page numbers. */
export const INDEX_ANCHOR = "pv-index";
export const INDEX_KEY = "@index";

/** The page numbers for the contents, as the words to print for each topic (a PDF knows them only after it has been laid out once). Without them the contents has none, as in the preview. */
export type ContentsPages = Map<string, string>;

function contentsHtml(tree: TreeNode[], numbers: Map<string, string>, ctx: RenderContext, pages?: ContentsPages, withIndex = false): string {
  if (tree.length === 0) return "";
  const items = tree
    .map((node) => {
      const title = `${esc(numbers.get(node.id) ?? "")} ${esc(fillVariables(node.title, ctx.project.variables))}`;
      const page = pages?.get(node.id);
      // With page numbers the entry is its words, a dotted leader (which a screen reader skips) and the number.
      const inside = page === undefined ? title : `<span class="pv-toc-title">${title}</span><span class="pv-toc-leader" aria-hidden="true"></span><span class="pv-toc-page">${esc(page)}</span>`;
      return `<li><a href="#${esc(topicAnchor(node.id))}" data-anchor="${esc(topicAnchor(node.id))}">${inside}</a>${contentsHtml(node.children, numbers, ctx, pages)}</li>`;
    })
    .join("");
  // The index is the last entry of the contents, at the top level.
  const index = withIndex ? contentsEntry("Index", INDEX_ANCHOR, pages?.get(INDEX_KEY)) : "";
  return `<ol class="pv-toc-list">${items}${index}</ol>`;
}

function contentsEntry(title: string, anchor: string, page: string | undefined): string {
  const inside = page === undefined ? esc(title) : `<span class="pv-toc-title">${esc(title)}</span><span class="pv-toc-leader" aria-hidden="true"></span><span class="pv-toc-page">${esc(page)}</span>`;
  return `<li><a href="#${esc(anchor)}" data-anchor="${esc(anchor)}">${inside}</a></li>`;
}

/**
 * Where the places of an index entry are written. With page numbers (the PDF) each place is the page of a topic, once each in order, linking to the first topic on it; without them (the preview) it is
 * the topic's number, linking to the topic.
 */
function locatorsFor(entry: IndexEntry, pages?: ContentsPages): string[] {
  const link = (id: string, words: string) => `<a href="#${esc(topicAnchor(id))}" data-anchor="${esc(topicAnchor(id))}">${esc(words)}</a>`;
  if (!pages) return entry.topics.map((t) => link(t.id, t.number));
  const byPage = new Map<string, string>();
  for (const topic of entry.topics) {
    const page = pages.get(topic.id);
    if (page !== undefined && !byPage.has(page)) byPage.set(page, topic.id);
  }
  // A topic with no page found is still named, by its number.
  const unplaced = entry.topics.filter((t) => pages.get(t.id) === undefined).map((t) => link(t.id, t.number));
  return [...[...byPage.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([page, id]) => link(id, page)), ...unplaced];
}

function topicHtml(node: TreeNode, depth: number, numbers: Map<string, string>, ctx: RenderContext): string {
  const level = Math.min(6, depth + 1);
  const number = numbers.get(node.id) ?? "";
  const title = esc(fillVariables(node.title, ctx.project.variables));
  const children = node.children.map((child) => topicHtml(child, depth + 1, numbers, ctx)).join("\n");
  if (depth === 0) {
    // A chapter starts a new sheet, with an opener that lists the topics in it. A chapter named Appendix is an appendix, not "Chapter 16".
    const appendix = /^appendix\b/i.test(fillVariables(node.title, ctx.project.variables).trim());
    const inside = node.children.length
      ? `<div class="pv-in-chapter"><h2 class="pv-in-chapter-title">In This ${appendix ? "Appendix" : "Chapter"}</h2><ul>${node.children.map((c) => `<li><a href="#${esc(topicAnchor(c.id))}" data-anchor="${esc(topicAnchor(c.id))}">${esc(fillVariables(c.title, ctx.project.variables))}</a></li>`).join("")}</ul></div>`
      : "";
    return `<section class="pv-sheet pv-chapter" id="${esc(topicAnchor(node.id))}"><header class="pv-opener"><p class="pv-chapter-number">${appendix ? "Appendix" : `Chapter ${esc(number)}`}</p><h1>${title}</h1>${inside}</header>\n${blocksHtml(ctx, node, 1, `${number} ${node.title}`)}\n${children}</section>`;
  }
  return `<article class="pv-topic" id="${esc(topicAnchor(node.id))}"><h${level}><span class="pv-number">${esc(number)}</span> ${title}</h${level}>\n${blocksHtml(ctx, node, level, `${number} ${node.title}`)}\n${children}</article>`;
}

/** Writes the whole book as it will print. */
export function renderPrintPreview(base: RenderContext, options: { pages?: ContentsPages } = {}): PrintPreview {
  const notes: string[] = [];
  const ctx: RenderContext = { ...base, onNote: (words) => { notes.push(words); base.onNote?.(words); } };
  const project: Project = ctx.project;
  const numbers = numbering(project.tree);
  const bookIndex = buildBookIndex(project, numbers);
  const title = esc(fillVariables(project.name, project.variables));
  const details = ["PRODUCT", "VERSION", "COMPANY"].map((key) => project.variables[key]?.trim()).filter(Boolean).map((v) => `<p>${esc(v)}</p>`).join("");
  const parts = [
    `<section class="pv-sheet pv-title-page"><h1 class="pv-book-title">${title}</h1>${details}</section>`,
    project.tree.length ? `<section class="pv-sheet pv-toc"><h1>Contents</h1>${contentsHtml(project.tree, numbers, ctx, options.pages, bookIndex.terms > 0)}</section>` : "",
    ...project.tree.map((chapter) => topicHtml(chapter, 0, numbers, ctx)),
    bookIndex.terms > 0 ? `<section class="pv-sheet pv-index" id="${INDEX_ANCHOR}"><h1>Index</h1>${indexHtml(bookIndex, (entry) => locatorsFor(entry, options.pages), project.variables)}</section>` : "",
  ].filter(Boolean);
  const html = `<div class="pv-book">${parts.join("\n")}</div>`;
  return { html, notes };
}
