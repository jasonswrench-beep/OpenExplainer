// The list of unresolved comments across the whole book, and how a block is described next to a comment. It needs the project's tree and its pages, so it lives
// apart from the comment rules in comments.ts, which work on one page alone.
import type { Comment } from "./comments.ts";
import { numbering, type TreeNode } from "./model.ts";
import { blockLabel, calloutLabel, type Block } from "./page.ts";
import { plainText } from "./text.ts";

const excerpt = (text: string, most = 60) => {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= most) return flat;
  // Cut at a space when there is one, so a word is not left in half.
  const cut = flat.slice(0, most - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > most / 3 ? cut.slice(0, space) : cut).trimEnd()}...`;
};

/** A block in a few words, such as `Paragraph: Press Save to keep your work` or `Picture`. */
export function blockWords(block: Block): string {
  switch (block.type) {
    case "paragraph": return withText("Paragraph", plainText(block.text));
    case "heading": return withText("Heading", block.text);
    case "picture": return blockLabel("picture");
    case "snippet": return blockLabel("snippet");
    case "callout": return withText(`Callout box (${calloutLabel(block.kind)})`, plainText(block.text));
    case "procedure": return withText(`Numbered procedure of ${block.steps.length} ${block.steps.length === 1 ? "step" : "steps"}`, block.steps.length ? plainText(block.steps[0].text) : "");
  }
}

function withText(label: string, text: string): string {
  const said = excerpt(text);
  return said ? `${label}: ${said}` : label;
}

/** One unresolved comment, with where it is. */
export interface UnresolvedItem {
  nodeId: string;
  nodeTitle: string;
  /** The topic's number in the book, such as 2.1. */
  number: string;
  blockId: string;
  /** From 1. */
  blockPosition: number;
  blockWords: string;
  comment: Comment;
}

/** Every open comment in the book, in reading order: topics as they are numbered, blocks as they are on the page, comments as they were written. */
export function unresolvedIn(tree: TreeNode[]): UnresolvedItem[] {
  const numbers = numbering(tree);
  const out: UnresolvedItem[] = [];
  const visit = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      const page = node.page;
      if (page?.comments?.length) {
        page.blocks.forEach((block, index) => {
          for (const comment of page.comments!) {
            if (comment.blockId === block.id && !comment.resolved) {
              out.push({ nodeId: node.id, nodeTitle: node.title, number: numbers.get(node.id) ?? "", blockId: block.id, blockPosition: index + 1, blockWords: blockWords(block), comment });
            }
          }
        });
      }
      visit(node.children);
    }
  };
  visit(tree);
  return out;
}

/** How many comments are open in the book. */
export function unresolvedCount(tree: TreeNode[]): number {
  return unresolvedIn(tree).length;
}

/** An unresolved comment as one line of words, for a list and a screen reader. */
export function itemWords(item: UnresolvedItem): string {
  return `${item.number} ${item.nodeTitle}, block ${item.blockPosition} (${item.blockWords}): ${item.comment.text}`;
}
