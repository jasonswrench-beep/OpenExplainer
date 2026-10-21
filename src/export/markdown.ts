// Markdown: the whole book as one plain text file (book.md) with the pictures as linked files beside it. Each picture is its flat PNG (cut to the part that is shown, with its marks drawn in),
// with its description as the alternative text and its callout entries as a list under it. Comments are never included. Everything that comes from the project is escaped so it reads as
// text, not as Markdown. Nothing here needs a screen.
import { entries, entryWords } from "../project/callouts.ts";
import { numbering, type Picture, type Project, type TreeNode } from "../project/model.ts";
import { calloutLabel, type Block } from "../project/page.ts";
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
function runsMarkdown(runs: Run[], variables: Record<string, string>, lineStart = false): string {
  return runs
    .map((run, i) => {
      const filled = fillVariables(run.text, variables);
      const words = (lineStart && i === 0 ? escapeMarkdown(filled) : escapeInline(filled)).replace(/\n/g, " ");
      if (words.trim() === "") return words;
      if (run.mark === "bold" || run.mark === "control") return `**${words}**`;
      if (run.mark === "italic") return `*${words}*`;
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

function blockMarkdown(project: Project, node: TreeNode, block: Block, level: number, flat: Map<string, FlatPicture>): string {
  const v = project.variables;
  switch (block.type) {
    case "paragraph": return runsMarkdown(block.text, v, true);
    case "heading": return block.text.trim() ? `${"#".repeat(Math.min(6, level + 1))} ${escapeInline(one(fillVariables(block.text, v)))}` : "";
    case "picture": {
      const picture = node.pictures.find((p) => p.id === block.pictureId);
      return picture ? pictureMarkdown(project, picture, flat) : "";
    }
    case "callout": return `> **${calloutLabel(block.kind)}.** ${runsMarkdown(block.text, v)}`;
    case "procedure":
      return block.steps
        .map((step, i) => {
          const lines = [`${i + 1}. ${runsMarkdown(step.text, v)}`];
          const picture = step.pictureId ? node.pictures.find((p) => p.id === step.pictureId) : undefined;
          if (picture) lines.push("", ...pictureMarkdown(project, picture, flat).split("\n").map((l) => (l ? `   ${l}` : l)));
          if (step.result && step.result.length) lines.push("", `   *Result:* ${runsMarkdown(step.result, v)}`);
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
    const text = blockMarkdown(project, node, block, level, flat);
    if (text) out.push(text);
  }
  for (const child of node.children) out.push(...topicMarkdown(project, child, depth + 1, numbers, flat));
  return out;
}

/** The book as Markdown text. */
export function bookMarkdown(project: Project, flat: Map<string, FlatPicture>): string {
  const numbers = numbering(project.tree);
  const parts = [`# ${escapeInline(one(fillVariables(project.name, project.variables)))}`];
  if (project.tree.length > 0) parts.push("## Contents", contents(project.tree, numbers, project.variables, 0).join("\n"));
  for (const chapter of project.tree) parts.push(...topicMarkdown(project, chapter, 0, numbers, flat));
  return parts.join("\n\n") + "\n";
}

/** The files of a Markdown export: book.md and the pictures it links. */
export function buildMarkdown(project: Project, flat: Map<string, FlatPicture>): Record<string, Uint8Array> {
  return { [MARKDOWN_FILE]: new TextEncoder().encode(bookMarkdown(project, flat)), ...flatFiles(flat) };
}
