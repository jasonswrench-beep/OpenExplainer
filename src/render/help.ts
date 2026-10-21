// A page of the help site, as HTML: the contents tree on the left, then the topic with its breadcrumbs, its page, and links to the previous and next topic. Each topic
// is one page. Search, the index and the collapsible FAQ come with the export. Comments are never part of it. Nothing here needs a screen.
import { buildBookIndex } from "../project/book-index.ts";
import { numbering, type Project, type TreeNode } from "../project/model.ts";
import { blocksHtml, esc, fillVariables, type RenderContext } from "./html.ts";
import { indexHtml, topicWords } from "./index-html.ts";

/** Every topic in reading order (the order of the numbers), with the chain of titles above it. */
export interface Placed {
  node: TreeNode;
  /** The topics above it, from the chapter down. */
  parents: TreeNode[];
}

export function placedTopics(tree: TreeNode[]): Placed[] {
  const out: Placed[] = [];
  const walk = (nodes: TreeNode[], parents: TreeNode[]) => {
    for (const node of nodes) {
      out.push({ node, parents });
      walk(node.children, [...parents, node]);
    }
  };
  walk(tree, []);
  return out;
}

/** How a link to a topic is written: in the app a topic is opened by script; in the help site it is a file. */
export type LinkFor = (nodeId: string) => string;

const topicLink = (links: LinkFor | undefined, id: string) => (links ? `href="${esc(links(id))}"` : `href="#" data-topic="${esc(id)}"`);

function treeHtml(tree: TreeNode[], numbers: Map<string, string>, currentId: string | null, ctx: RenderContext, links?: LinkFor): string {
  if (tree.length === 0) return "";
  const items = tree
    .map((node) => {
      const here = node.id === currentId;
      return `<li><a ${topicLink(links, node.id)}${here ? ' aria-current="page"' : ""}>${esc(numbers.get(node.id) ?? "")} ${esc(fillVariables(node.title, ctx.project.variables))}</a>${treeHtml(node.children, numbers, currentId, ctx, links)}</li>`;
    })
    .join("");
  return `<ul class="hs-tree-list">${items}</ul>`;
}

/** Does the book have an index to show? */
export function hasIndex(project: Project): boolean {
  return buildBookIndex(project, numbering(project.tree)).terms > 0;
}

/** The index as a page of the help site, with the contents tree: each term with the topics it is in, as links. `links` says where each topic's page is. */
export function renderHelpIndexPage(ctx: RenderContext, links: LinkFor): string {
  const project: Project = ctx.project;
  const numbers = numbering(project.tree);
  const book = esc(fillVariables(project.name, project.variables));
  const all = placedTopics(project.tree);
  const nav = `<nav class="hs-tree" aria-label="Contents of ${book}">${treeHtml(project.tree, numbers, null, ctx, links)}</nav>`;
  const index = buildBookIndex(project, numbers);
  const places = (entry: { topics: { id: string; number: string; title: string }[] }) => entry.topics.map((t) => `<a ${topicLink(links, t.id)}>${esc(topicWords(t, project.variables))}</a>`);
  const crumbs = `<li><a ${topicLink(links, all[0]?.node.id ?? "")}>${book}</a></li><li aria-current="page">Index</li>`;
  return `<div class="hs">${nav}<main class="hs-page" id="topic-main"><nav class="hs-crumbs" aria-label="Breadcrumb"><ol>${crumbs}</ol></nav><article><h1>Index</h1>\n${indexHtml(index, places, project.variables)}</article></main></div>`;
}

/** Writes one page of the help site, with its contents tree. `currentId` is the topic shown; with none, the page says so. */
export function renderHelpPage(ctx: RenderContext, currentId: string | null, links?: LinkFor): string {
  const project: Project = ctx.project;
  const numbers = numbering(project.tree);
  const all = placedTopics(project.tree);
  const at = all.findIndex((p) => p.node.id === currentId);
  const book = esc(fillVariables(project.name, project.variables));
  const nav = `<nav class="hs-tree" aria-label="Contents of ${book}">${treeHtml(project.tree, numbers, currentId, ctx, links)}</nav>`;
  if (at < 0) return `<div class="hs">${nav}<main class="hs-page" id="topic-main"><p>Select a chapter or topic to see its page.</p></main></div>`;
  const { node, parents } = all[at];
  const link = (p: Placed | undefined, word: string, arrow: string, flip: boolean) =>
    p
      ? `<a ${topicLink(links, p.node.id)} class="hs-${word.toLowerCase()}">${flip ? `${arrow} ` : ""}${word}: ${esc(numbers.get(p.node.id) ?? "")} ${esc(fillVariables(p.node.title, project.variables))}${flip ? "" : ` ${arrow}`}</a>`
      : "";
  const crumbs = [
    `<li><a ${topicLink(links, all[0].node.id)}>${book}</a></li>`,
    ...parents.map((p) => `<li><a ${topicLink(links, p.id)}>${esc(fillVariables(p.title, project.variables))}</a></li>`),
    `<li aria-current="page">${esc(fillVariables(node.title, project.variables))}</li>`,
  ].join("");
  // A topic that holds other topics lists them, as the chapter opener does in the book.
  const inside = node.children.length
    ? `<section class="hs-inside"><h2>In this section</h2><ul>${node.children.map((c) => `<li><a ${topicLink(links, c.id)}>${esc(fillVariables(c.title, project.variables))}</a></li>`).join("")}</ul></section>`
    : "";
  const pager = `<nav class="hs-pager" aria-label="Previous and next topic">${link(all[at - 1], "Previous", "←", true)}${link(all[at + 1], "Next", "→", false)}</nav>`;
  return `<div class="hs">${nav}<main class="hs-page" id="topic-main"><nav class="hs-crumbs" aria-label="Breadcrumb"><ol>${crumbs}</ol></nav><article><h1>${esc(numbers.get(node.id) ?? "")} ${esc(fillVariables(node.title, project.variables))}</h1>\n${blocksHtml(ctx, node, 1)}\n${inside}</article>${pager}</main></div>`;
}
