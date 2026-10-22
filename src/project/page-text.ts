// The words of a page as plain text, for reading by the AI (openers, summaries, suggested boxes) and by the consistency check. Marks are taken off, so a control name is just its words.
// Nothing here touches a screen.
import type { Block } from "./page.ts";
import type { TreeNode } from "./model.ts";
import { plainText } from "./text.ts";

/** What one block says, as plain text. A picture says nothing. */
export function blockText(block: Block): string {
  switch (block.type) {
    case "heading": return block.text;
    case "paragraph": case "callout": return plainText(block.text);
    case "procedure": return block.steps.map((s) => `${plainText(s.text)} ${plainText(s.result ?? [])}`.trim()).join(" ");
    case "picture": return "";
  }
}

/** The words of a topic's page: its paragraphs, headings, boxes, and steps (as "Steps: 1. ... 2. ..."), in order. Empty if it has nothing written. */
export function topicText(node: TreeNode): string {
  const parts: string[] = [];
  for (const block of node.page?.blocks ?? []) {
    if (block.type === "procedure") {
      const steps = block.steps.map((s, i) => `${i + 1}. ${plainText(s.text).trim()}${s.result ? ` ${plainText(s.result).trim()}` : ""}`).filter((s) => !/^\d+\.\s*$/.test(s));
      if (steps.length > 0) parts.push(`Steps: ${steps.join(" ")}`);
    } else {
      const words = blockText(block).replace(/\s+/g, " ").trim();
      if (words) parts.push(words);
    }
  }
  return parts.join(" ");
}

/** A text cut into sentences at a full stop, question mark or exclamation mark that is followed by a space and a capital letter. */
export function splitSentences(text: string): string[] {
  return text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=\p{Lu})/u).map((s) => s.trim()).filter(Boolean);
}
