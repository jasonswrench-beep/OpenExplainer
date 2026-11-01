// More rules for the book check, for a book that has grown: topics with no title, topics in one chapter that share a title, topics whose page says exactly the same words (a copy that was never
// turned into a snippet), and links whose words say nothing about where they go ("here"). They work on the tree alone, so they can be tested without a screen, and like the rest of the check they
// only advise. The check itself is in checks.ts.
import { linksIn } from "./links.ts";
import type { TreeNode } from "./model.ts";
import { plainText } from "./text.ts";

/** The fewest words a page needs before two pages with the same words are worth mentioning: a short note repeated is not a copy. */
export const MIN_COPY_WORDS = 8;

const fill = (text: string, variables: Record<string, string>) => text.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (whole, name: string) => (variables[name]?.trim() ? variables[name] : whole));
const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/** Groups of topics under one parent (or at the top of the book) that have the same title, ignoring capitals and extra spaces. Each group has two or more ids, in book order. */
export function duplicateTitles(tree: TreeNode[], variables: Record<string, string>): string[][] {
  const groups: string[][] = [];
  const level = (nodes: TreeNode[]) => {
    const byTitle = new Map<string, string[]>();
    for (const n of nodes) {
      const key = squash(fill(n.title, variables)).toLowerCase();
      if (key !== "") byTitle.set(key, [...(byTitle.get(key) ?? []), n.id]);
    }
    for (const ids of byTitle.values()) if (ids.length > 1) groups.push(ids);
    for (const n of nodes) level(n.children);
  };
  level(tree);
  return groups;
}

/** The words of a topic's own page as one line: paragraphs, headings, boxes, steps and their results. Pictures and snippet blocks do not count. */
export function pageWords(node: TreeNode, variables: Record<string, string>): string {
  const parts: string[] = [];
  for (const block of node.page?.blocks ?? []) {
    if (block.type === "paragraph" || block.type === "callout") parts.push(plainText(block.text));
    else if (block.type === "heading") parts.push(block.text);
    else if (block.type === "procedure") for (const step of block.steps) parts.push(plainText(step.text), plainText(step.result ?? []));
  }
  return squash(fill(parts.join(" "), variables)).toLowerCase();
}

/** Groups of topics anywhere in the book whose pages say exactly the same words (at least MIN_COPY_WORDS of them). Each group has two or more ids, in book order. */
export function duplicateTexts(tree: TreeNode[], variables: Record<string, string>): string[][] {
  const byText = new Map<string, string[]>();
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      const words = pageWords(n, variables);
      if (words.split(" ").filter(Boolean).length >= MIN_COPY_WORDS) byText.set(words, [...(byText.get(words) ?? []), n.id]);
      walk(n.children);
    }
  };
  walk(tree);
  return [...byText.values()].filter((ids) => ids.length > 1);
}

/** Link words that say nothing about where the link goes, so a screen reader user going through a list of links cannot tell them apart. */
const VAGUE = /^(?:click\s+|tap\s+|press\s+)?(?:here|this|that|link|this link|this page|this topic|this section|more|read more|learn more|see more|more info(?:rmation)?|details|see this|go|go here|it)$/i;

/** Is this what a link says? "here", "click here", "read more" and the like. The words are compared with capitals, spaces and end punctuation ignored. */
export function isVagueLinkText(words: string): boolean {
  return VAGUE.test(squash(words).replace(/[.!:;,>»›…\s]+$/, "").replace(/^[«‹<\s]+/, ""));
}

/** The links in a topic's own page whose words are vague, in order. */
export function vagueLinksOf(node: TreeNode): string[] {
  return linksIn(node).filter((l) => isVagueLinkText(l.words)).map((l) => squash(l.words));
}
