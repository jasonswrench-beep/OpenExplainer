// The help site: a folder of plain web pages, one for each topic, with the contents tree, breadcrumbs, previous and next links, a search box and a Print this page button. The pages are made from
// the same pieces as the help site preview (src/render/help.ts and html.ts), with the links as links between files. Pictures are the flat PNGs (cut to the part shown, with their marks drawn
// in), so the pages open in any browser. Comments are never included. Saved as a zip. Nothing here needs a screen.
import { numbering, type Project, type TreeNode } from "../project/model.ts";
import { plainText } from "../project/text.ts";
import { entries, entryWords } from "../project/callouts.ts";
import { esc, fillVariables, type RenderContext } from "../render/html.ts";
import { hasIndex, placedTopics, renderHelpIndexPage, renderHelpPage } from "../render/help.ts";
import { flatFiles, type FlatPicture } from "./pictures.ts";
import { SITE_CSS, SITE_JS } from "./site-assets.ts";

const encoder = new TextEncoder();

/** A short, plain name for a file from a title: lower case letters and digits joined by hyphens. */
export function slugOf(title: string): string {
  const slug = title.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\u00df/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/g, "");
  return slug || "topic";
}

/** The file a topic's page is in: its number and its title, such as 2-1-saving-your-work.html. */
export function pageFile(number: string, title: string): string {
  return `${number.replace(/\./g, "-")}-${slugOf(title)}.html`;
}

/** The words of one topic for the search box: its title, its page text and the entries under its pictures. */
function topicText(project: Project, node: TreeNode): string {
  const v = project.variables;
  const out: string[] = [];
  for (const block of node.page?.blocks ?? []) {
    if (block.type === "paragraph" || block.type === "callout") out.push(plainText(block.text));
    else if (block.type === "heading") out.push(block.text);
    else if (block.type === "procedure") for (const step of block.steps) out.push(plainText(step.text), plainText(step.result ?? []));
    else if (block.type === "picture") {
      const picture = node.pictures.find((p) => p.id === block.pictureId);
      if (picture) out.push(picture.altText, ...entries(picture).map(entryWords));
    }
  }
  return fillVariables(out.join(" "), v).replace(/\s+/g, " ").trim();
}

export interface SiteFile {
  path: string;
  content: string;
}

/** The pages of the site as text, by path: one for each topic, index.html (the first topic), and the style sheet, the script and the search index. */
export function buildHelpSiteText(project: Project, flat: Map<string, FlatPicture>): Record<string, string> {
  const numbers = numbering(project.tree);
  const topics = placedTopics(project.tree);
  const files = new Map<string, string>();
  const used = new Set<string>();
  for (const { node } of topics) {
    let name = pageFile(numbers.get(node.id) ?? "0", node.title);
    // Two topics can have the same number and title only by mistake; a second gets a counter so no page is lost.
    for (let n = 2; used.has(name); n++) name = name.replace(/(\.html)$/, `-${n}$1`);
    used.add(name);
    files.set(node.id, name);
  }
  const links = (id: string) => files.get(id) ?? "index.html";
  const ctx: RenderContext = { project, place: "book", notes: false, flat: true, imageSrc: (p) => flat.get(p.id)?.path ?? null };
  const book = esc(fillVariables(project.name, project.variables));
  const out: Record<string, string> = {};
  // A book with an index has an Index page, linked from the header of every page.
  const withIndex = hasIndex(project);
  const indexLink = withIndex ? `<nav class="site-nav" aria-label="Site"><a href="book-index.html">Index</a></nav>` : "";
  const document = (title: string, body: string) =>
    `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="assets/site.css">
</head>
<body>
<a class="skip-link" href="#topic-main">Skip to the topic</a>
<header class="site-header">
<p class="site-title"><a href="index.html">${book}</a></p>
${indexLink}
<form id="site-search" role="search" class="site-search"><label for="site-search-input">Search this help</label> <input id="site-search-input" type="search" autocomplete="off"> <button type="submit">Search</button></form>
</header>
<div id="search-results" class="search-results" hidden tabindex="-1"><h2 id="search-title"></h2><ol id="search-list"></ol><p><button type="button" id="search-close">Close the results</button></p></div>
${body}
<p class="site-footer"><button type="button" id="print-page">Print this page</button></p>
<script src="assets/search-index.js"></script>
<script src="assets/site.js"></script>
</body>
</html>
`;
  topics.forEach(({ node }, i) => {
    const title = `${numbers.get(node.id)} ${fillVariables(node.title, project.variables)} - ${fillVariables(project.name, project.variables)}`;
    const page = document(title, renderHelpPage(ctx, node.id, links));
    out[files.get(node.id)!] = page;
    if (i === 0) out["index.html"] = page;
  });
  if (topics.length === 0) out["index.html"] = document(fillVariables(project.name, project.variables), `<main class="hs" id="topic-main"><p>This book has no topics yet.</p></main>`);
  if (withIndex) out["book-index.html"] = document(`Index - ${fillVariables(project.name, project.variables)}`, renderHelpIndexPage(ctx, links));
  const index = topics.map(({ node }) => ({ number: numbers.get(node.id) ?? "", title: fillVariables(node.title, project.variables), url: files.get(node.id)!, text: topicText(project, node) }));
  out["assets/search-index.js"] = `window.SEARCH_INDEX = ${JSON.stringify(index).replace(/</g, "\\u003c")};\n`;
  out["assets/site.css"] = SITE_CSS;
  out["assets/site.js"] = SITE_JS;
  return out;
}

/** The files of a help site export: the pages, the style sheet, the script, the search index and the pictures. */
export function buildHelpSite(project: Project, flat: Map<string, FlatPicture>): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(buildHelpSiteText(project, flat))) files[path] = encoder.encode(content);
  return { ...files, ...flatFiles(flat) };
}
