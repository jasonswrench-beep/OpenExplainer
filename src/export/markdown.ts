// Markdown: the whole book as one plain text file (book.md) with the pictures as linked files beside it. Each picture is its flat PNG (cut to the part that is shown, with its marks drawn in),
// with its description as the alternative text and its callout entries as a list under it. Comments are never included. Everything that comes from the project is escaped so it reads as
// text, not as Markdown. Nothing here needs a screen.
import { buildBookIndex } from "../project/book-index.ts";
import { entries, entryWords } from "../project/callouts.ts";
import { numbering, type Picture, type Project, type TreeNode } from "../project/model.ts";
import { calloutLabel, type Block } from "../project/page.ts";
import { wordsSayNumber } from "../project/links.ts";
import type { Run } from "../project/text.ts";
import { shownPart } from "../project/views.ts";
import { altTextFor, fillVariables } from "../render/html.ts";
import { calloutInView } from "../render/overlay.ts";
import { flatFiles, type FlatPicture } from "./pictures.ts";

export const MARKDOWN_FILE = "book.md";

/** Text made safe to read as plain text inside a line of Markdown. */
export function escapeInline(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/([*_`\[\]])/g, "\\$1")
    .replace(/</g, "&lt;");
}

/** Text made safe to read as plain text at the start of its own line, where a # or a - or a 1. would otherwise start a heading, a list or a quotation. */
export function escapeMarkdown(text: string): string {
  return escapeInline(text)
    .replace(/^([#>+-])/gm, "\\$1")
    .replace(/^(\d+)([.)])/gm, "$1\\$2");
}

/** Text with marks as Markdown. `lineStart` says the first words are at the start of a line, so they are escaped for that. */
function runsMarkdown(runs: Run[], variables: Record<string, string>, lineStart = false, numbers?: Map<string, string>, hrefs?: Map<string, string>): string {
  return runs
    .map((run, i) => {
      const filled = fillVariables(run.text, variables);
      const words = (lineStart && i === 0 ? escapeMarkdown(filled) : escapeInline(filled)).replace(/\n/g, " ");
      if (words.trim() === "") return words;
      if (run.mark === "bold" || run.mark === "control") return `**${words}**`;
      if (run.mark === "italic") return `*${words}*`;
      // A link to another topic is its words and the topic's number; where the other topics are pages of their own (the help site's Markdown pages) it is also a link to that page.
      if (run.mark === "link" && run.topic && numbers?.has(run.topic)) {
        const href = hrefs?.get(run.topic);
        const after = wordsSayNumber(filled, numbers.get(run.topic)!) ? "" : ` (${numbers.get(run.topic)})`;
        return href ? `[${words}](${href})${after}` : `${words}${after}`;
      }
      return words;
    })
    .join("");
}

const one = (text: string) => text.replace(/\s+/g, " ").trim();

function pictureMarkdown(project: Project, picture: Picture, flat: Map<string, FlatPicture>): string {
  const made = flat.get(picture.id);
  if (!made) return `*(The picture "${escapeInline(picture.altText.trim() || picture.source.originalName || picture.file)}" could not be included.)*`;
  // Inside ![ ] only a backslash and the square brackets matter.
  const alt = one(altTextFor(picture)).replace(/\\/g, "\\\\").replace(/([[\]])/g, "\\$1");
  const shown = shownPart(picture, project.zoom, "book");
  const list = entries(picture)
    .map((entry, i) => ({ entry, i }))
    .filter(({ i }) => calloutInView(picture, i, shown))
    .map(({ entry }) => `- ${escapeInline(fillVariables(entryWords(entry), project.variables))}`);
  return [`![${alt}](${made.path})`, ...(list.length ? ["", ...list] : [])].join("\n");
}

function blockMarkdown(project: Project, node: TreeNode, block: Block, level: number, flat: Map<string, FlatPicture>, numbers: Map<string, string>, hrefs?: Map<string, string>): string {
  const v = project.variables;
  switch (block.type) {
    case "snippet": return ""; // an output sees snippets already written out (expandOutput)
    case "paragraph": return runsMarkdown(block.text, v, true, numbers, hrefs);
    case "heading": return block.text.trim() ? `${"#".repeat(Math.min(6, level + 1))} ${escapeInline(one(fillVariables(block.text, v)))}` : "";
    case "picture": {
      const picture = node.pictures.find((p) => p.id === block.pictureId);
      return picture ? pictureMarkdown(project, picture, flat) : "";
    }
    case "callout": return `> **${calloutLabel(block.kind)}.** ${runsMarkdown(block.text, v, false, numbers, hrefs)}`;
    case "procedure":
      return block.steps
        .map((step, i) => {
          const lines = [`${i + 1}. ${runsMarkdown(step.text, v, false, numbers, hrefs)}`];
          const picture = step.pictureId ? node.pictures.find((p) => p.id === step.pictureId) : undefined;
          if (picture) lines.push("", ...pictureMarkdown(project, picture, flat).split("\n").map((l) => (l ? `   ${l}` : l)));
          if (step.result && step.result.length) lines.push("", `   *Result:* ${runsMarkdown(step.result, v, false, numbers, hrefs)}`);
          return lines.join("\n");
        })
        .join("\n\n");
  }
}

function contents(nodes: TreeNode[], numbers: Map<string, string>, variables: Record<string, string>, depth: number): string[] {
  return nodes.flatMap((n) => [`${"  ".repeat(depth)}- ${escapeInline(`${numbers.get(n.id)} ${one(fillVariables(n.title, variables))}`)}`, ...contents(n.children, numbers, variables, depth + 1)]);
}

function topicMarkdown(project: Project, node: TreeNode, depth: number, numbers: Map<string, string>, flat: Map<string, FlatPicture>): string[] {
  const level = Math.min(6, depth + 2);
  const out = [`${"#".repeat(level)} ${escapeInline(`${numbers.get(node.id)} ${one(fillVariables(node.title, project.variables))}`)}`];
  for (const block of node.page?.blocks ?? []) {
    const text = blockMarkdown(project, node, block, level, flat, numbers);
    if (text) out.push(text);
  }
  const titles = new Map<string, string>();
  const collect = (nodes: TreeNode[]) => nodes.forEach((n) => { titles.set(n.id, n.title); collect(n.children); });
  collect(project.tree);
  const related = (node.seeAlso ?? []).filter((id) => titles.has(id) && numbers.has(id));
  if (related.length > 0) out.push("**See also**", related.map((id) => `- ${escapeInline(`${numbers.get(id)} ${one(fillVariables(titles.get(id)!, project.variables))}`)}`).join("\n"));
  for (const child of node.children) out.push(...topicMarkdown(project, child, depth + 1, numbers, flat));
  return out;
}

/**
 * One topic as a page of Markdown, for the help site's per-page Markdown: its title, where it is in the book, its blocks and its See also list, but not the topics under it (they have pages of their own).
 * `hrefs` says the file of each topic, so a link in the text or in See also is a link; pictures are linked by their path from the site's root, where the page is.
 */
export function topicPageMarkdown(project: Project, node: TreeNode, numbers: Map<string, string>, flat: Map<string, FlatPicture>, hrefs: Map<string, string>): string {
  const v = project.variables;
  const parts = [`# ${escapeInline(`${numbers.get(node.id)} ${one(fillVariables(node.title, v))}`)}`];
  // Where the topic is, so a reader of this page alone knows which book and chapter it belongs to.
  const trail: string[] = [];
  const find = (nodes: TreeNode[], path: TreeNode[]): TreeNode[] | null => {
    for (const n of nodes) {
      if (n.id === node.id) return path;
      const found = find(n.children, [...path, n]);
      if (found) return found;
    }
    return null;
  };
  for (const above of find(project.tree, []) ?? []) trail.push(escapeInline(`${numbers.get(above.id)} ${one(fillVariables(above.title, v))}`));
  parts.push(`*From ${escapeInline(one(fillVariables(project.name, v)))}${trail.length ? `, in ${trail.join(" > ")}` : ""}.*`);
  const level = 1;
  for (const block of node.page?.blocks ?? []) {
    const text = blockMarkdown(project, node, block, level, flat, numbers, hrefs);
    if (text) parts.push(text);
  }
  const titles = new Map<string, string>();
  const collect = (nodes: TreeNode[]) => nodes.forEach((n) => { titles.set(n.id, n.title); collect(n.children); });
  collect(project.tree);
  const related = (node.seeAlso ?? []).filter((id) => titles.has(id) && numbers.has(id));
  if (related.length > 0) {
    parts.push("**See also**", related.map((id) => {
      const words = escapeInline(`${numbers.get(id)} ${one(fillVariables(titles.get(id)!, v))}`);
      return hrefs.has(id) ? `- [${words}](${hrefs.get(id)})` : `- ${words}`;
    }).join("\n"));
  }
  if (node.children.length > 0) parts.push("**In this topic**", node.children.map((c) => { const words = escapeInline(`${numbers.get(c.id)} ${one(fillVariables(c.title, v))}`); return hrefs.has(c.id) ? `- [${words}](${hrefs.get(c.id)})` : `- ${words}`; }).join("\n"));
  return parts.join("\n\n") + "\n";
}

/** The book as Markdown text. */
export function bookMarkdown(project: Project, flat: Map<string, FlatPicture>): string {
  const numbers = numbering(project.tree);
  const parts = [`# ${escapeInline(one(fillVariables(project.name, project.variables)))}`];
  if (project.tree.length > 0) parts.push("## Contents", contents(project.tree, numbers, project.variables, 0).join("\n"));
  for (const chapter of project.tree) parts.push(...topicMarkdown(project, chapter, 0, numbers, flat));
  const index = buildBookIndex(project, numbers);
  if (index.terms > 0) {
    parts.push("## Index");
    for (const group of index.groups) {
      parts.push(`### ${escapeInline(group.heading)}`);
      parts.push(group.entries.map((e) => `- **${escapeInline(one(fillVariables(e.text, project.variables)))}**: ${e.topics.map((t) => `${t.number} ${escapeInline(one(fillVariables(t.title, project.variables)))}`).join(", ")}`).join("\n"));
    }
  }
  return parts.join("\n\n") + "\n";
}

/** The files of a Markdown export: book.md and the pictures it links. */
export function buildMarkdown(project: Project, flat: Map<string, FlatPicture>): Record<string, Uint8Array> {
  return { [MARKDOWN_FILE]: new TextEncoder().encode(bookMarkdown(project, flat)), ...flatFiles(flat) };
}
