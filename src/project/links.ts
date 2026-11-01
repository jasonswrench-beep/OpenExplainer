// Links between topics (format version 17): words in a page that go to another topic, and a See also list a topic can have. Both hold the other topic's id, never its number, so they still go to the
// right place when chapters are added, moved or renumbered. A link or a See also entry to a topic that is gone is never left to point at nothing: deleting a topic turns the links to it into plain
// words and takes it off every See also list, and the book check says so if one is found anyway. Nothing here touches a screen or a disk.
import type { TreeNode } from "./model.ts";
import type { Block } from "./page.ts";
import { TOPIC_ID, type Run } from "./text.ts";

/** The most topics a See also list can hold, so a mistake cannot fill a page. */
export const MOST_SEE_ALSO = 12;

/** Calls `visit` with every list of runs of a page: paragraphs, boxes, and each step's words and result. `replace` puts a new list in the same place. */
function eachRuns(blocks: Block[], visit: (runs: Run[], replace: (next: Run[]) => void) => void): void {
  for (const block of blocks) {
    if (block.type === "paragraph" || block.type === "callout") visit(block.text, (next) => { block.text = next; });
    else if (block.type === "procedure") {
      for (const step of block.steps) {
        visit(step.text, (next) => { step.text = next; });
        if (step.result) visit(step.result, (next) => { step.result = next; });
      }
    }
  }
}

/** Every link in some blocks, in order. */
export function linksInBlocks(blocks: Block[]): { topic: string; words: string }[] {
  const found: { topic: string; words: string }[] = [];
  eachRuns(blocks, (runs) => {
    for (const run of runs) if (run.mark === "link" && run.topic) found.push({ topic: run.topic, words: run.text });
  });
  return found;
}

/** Every link in a topic's own page, in order. */
export function linksIn(node: TreeNode): { topic: string; words: string }[] {
  return linksInBlocks(node.page?.blocks ?? []);
}

function walk(tree: TreeNode[], visit: (node: TreeNode) => void): void {
  for (const node of tree) {
    visit(node);
    walk(node.children, visit);
  }
}

/** The ids of a topic and of everything under it. */
export function subtreeIds(node: TreeNode): Set<string> {
  const ids = new Set<string>();
  const collect = (n: TreeNode) => { ids.add(n.id); n.children.forEach(collect); };
  collect(node);
  return ids;
}

/** How many links in the text, and how many See also entries, anywhere in the book, go to these topics. Nothing is changed. */
export function countLinksTo(tree: TreeNode[], topics: Set<string>): { links: number; seeAlso: number } {
  let links = 0;
  let seeAlso = 0;
  walk(tree, (node) => {
    for (const link of linksIn(node)) if (topics.has(link.topic)) links++;
    for (const id of node.seeAlso ?? []) if (topics.has(id)) seeAlso++;
  });
  return { links, seeAlso };
}

/** The words that say what deleting topics will do to links, or an empty string when nothing goes to them. */
export function linkLossWords(count: { links: number; seeAlso: number }): string {
  const parts: string[] = [];
  if (count.links) parts.push(`${count.links} ${count.links === 1 ? "link" : "links"} in the text will become plain words`);
  if (count.seeAlso) parts.push(`${count.seeAlso} See also ${count.seeAlso === 1 ? "entry" : "entries"} will be taken off`);
  return parts.length ? `${parts.join(", and ")}.` : "";
}

/**
 * Do the linked words already say the topic's number ("Chapter 4", "topic 6.1", "6.1")? Then the book does not add the number again after the link, as it does after words such as "Saving a copy"
 * (a link reads "Chapter 4, page 57" in a PDF, not "Chapter 4 (4), page 57"). The number must stand alone: 6.1 is not found in 16.1 or 6.12.
 */
export function wordsSayNumber(words: string, number: string): boolean {
  return new RegExp(`(?<![0-9.])${number.replace(/\./g, "\\.")}(?![0-9]|\\.[0-9])`).test(words);
}

/** The id of every topic in the tree. */
export function topicIds(tree: TreeNode[]): Set<string> {
  const ids = new Set<string>();
  walk(tree, (n) => ids.add(n.id));
  return ids;
}

/** Links, in any topic, to a topic that is not in the book, and See also entries the same. */
export interface BrokenLink {
  /** The topic the link or the entry is in. */
  node: TreeNode;
  /** The id it goes to. */
  topic: string;
  /** The linked words, or `null` for a See also entry. */
  words: string | null;
}

/** The links and See also entries of one topic that go to an id that is not in `ids` (every topic of the book). */
export function brokenLinksOf(node: TreeNode, ids: Set<string>): BrokenLink[] {
  const broken: BrokenLink[] = [];
  for (const link of linksIn(node)) if (!ids.has(link.topic)) broken.push({ node, topic: link.topic, words: link.words });
  for (const id of node.seeAlso ?? []) if (!ids.has(id)) broken.push({ node, topic: id, words: null });
  return broken;
}

export function brokenLinks(tree: TreeNode[]): BrokenLink[] {
  const ids = topicIds(tree);
  const broken: BrokenLink[] = [];
  walk(tree, (node) => broken.push(...brokenLinksOf(node, ids)));
  return broken;
}

/** A list of runs with the links to these topics turned into plain words. */
function unlinked(runs: Run[], gone: Set<string>): { runs: Run[]; count: number } {
  let count = 0;
  const next: Run[] = [];
  for (const run of runs) {
    if (run.mark === "link" && run.topic && gone.has(run.topic)) {
      count++;
      const last = next[next.length - 1];
      if (last && !last.mark) last.text += run.text;
      else next.push({ text: run.text });
    } else next.push(run);
  }
  return { runs: count ? next : runs, count };
}

/**
 * Takes these topics out of every link and See also list in the book: a link to one is turned into its plain words and a See also entry for one is removed. Returns how many links and entries
 * were changed, so the author can be told.
 */
export function forgetTopics(tree: TreeNode[], gone: Set<string>): { links: number; seeAlso: number } {
  let links = 0;
  let seeAlso = 0;
  walk(tree, (node) => {
    eachRuns(node.page?.blocks ?? [], (runs, replace) => {
      const result = unlinked(runs, gone);
      if (result.count) { links += result.count; replace(result.runs); }
    });
    if (node.seeAlso) {
      const kept = node.seeAlso.filter((id) => !gone.has(id));
      seeAlso += node.seeAlso.length - kept.length;
      if (kept.length) node.seeAlso = kept;
      else delete node.seeAlso;
    }
  });
  return { links, seeAlso };
}

/** A See also list read from a saved file or an assistant: only ids of other topics in the book, each once, in order, up to the most allowed. */
export function cleanSeeAlso(raw: unknown, own: string, ids: Set<string>): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id === "string" && TOPIC_ID.test(id) && id !== own && ids.has(id) && !out.includes(id)) out.push(id);
    if (out.length >= MOST_SEE_ALSO) break;
  }
  return out;
}

/** The tree with every See also list cleaned (and left out when empty). */
export function cleanTreeSeeAlso(tree: TreeNode[]): TreeNode[] {
  const ids = topicIds(tree);
  const clean = (nodes: TreeNode[]): TreeNode[] =>
    nodes.map((node) => {
      const { seeAlso: raw, ...rest } = node;
      const list = cleanSeeAlso(raw, node.id, ids);
      return { ...rest, ...(list.length ? { seeAlso: list } : {}), children: clean(node.children ?? []) };
    });
  return clean(tree);
}

/** Replaces a topic's See also list. Returns how many entries it has now. Throws, saying why, when an entry is not another topic of the book or there are too many. */
export function setSeeAlso(tree: TreeNode[], topicId: string, list: string[]): number {
  const ids = topicIds(tree);
  if (!ids.has(topicId)) throw new Error("The topic was not found.");
  if (list.length > MOST_SEE_ALSO) throw new Error(`A See also list can hold up to ${MOST_SEE_ALSO} topics.`);
  for (const id of list) {
    if (id === topicId) throw new Error("A topic cannot list itself under See also.");
    if (!ids.has(id)) throw new Error(`There is no topic with the id "${id}".`);
  }
  const unique = list.filter((id, i) => list.indexOf(id) === i);
  walk(tree, (node) => {
    if (node.id !== topicId) return;
    if (unique.length) node.seeAlso = unique;
    else delete node.seeAlso;
  });
  return unique.length;
}

