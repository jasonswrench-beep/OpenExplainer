// The book index (format version 13). Each topic keeps its own index terms, and the index of the book is worked out from them, never stored. The software writes the first pass from the book
// itself (the topic's title, its headings, the control names written in its text, and the names of the callouts on its pictures); the author edits the terms of any topic by hand, and can ask for
// an update, which brings in what is new in the book without undoing the author's work: terms the author added or changed stay, terms the author took out do not come back, and terms the
// software proposed that the book no longer supports go. No AI is needed, so this works with none. Nothing here needs a screen or the disk.
import type { Project, TreeNode } from "./model.ts";
import { hasContent, placedPictureIds, type Block } from "./page.ts";
import type { Run } from "./text.ts";
import { expandVariables } from "./model.ts";

/** Who wrote a term: the software's first pass or update, or the author (a term the author added or changed). */
export type TermBy = "software" | "author";

export interface IndexTerm {
  text: string;
  by: TermBy;
}

/** A topic's index terms. `removed` keeps the keys of software terms the author took out, so an update does not bring them back. */
export interface TopicIndex {
  terms: IndexTerm[];
  removed?: string[];
}

/** The longest a term can be, in letters. A longer one is a sentence, not an index term. */
export const MAX_TERM = 60;

/** What two spellings of a term share, so "Save", "save" and " Save " are one term. */
export const termKey = (text: string): string => text.replace(/\s+/g, " ").trim().toLowerCase();

/** A term as it is kept: tidy spaces and no full stop, comma or colon on the end. `null` when it is not an index term (empty, too short, too long, no letter in it, or an unfilled variable). */
export function cleanTerm(raw: string, variables: Record<string, string> = {}): string | null {
  const text = expandVariables(raw, variables).replace(/\s+/g, " ").trim().replace(/[.,:;!?]+$/, "").trim();
  if (text.length < 2 || text.length > MAX_TERM || text.includes("{{") || !/\p{L}/u.test(text)) return null;
  return text;
}

// ---- The first pass ---------------------------------------------------------------------------------------

function controlNames(runs: Run[] | undefined, into: string[]) {
  for (const run of runs ?? []) if (run.mark === "control") into.push(run.text);
}

function blockTerms(block: Block, into: string[]) {
  switch (block.type) {
    case "heading": into.push(block.text); break;
    case "paragraph": case "callout": controlNames(block.text, into); break;
    case "procedure": for (const step of block.steps) { controlNames(step.text, into); controlNames(step.result, into); } break;
    default: break;
  }
}

/**
 * The terms the book itself suggests for one topic, in the order found, each once: the topic's title, the headings on its page, the control names written in its text, and the names of the
 * callouts on the pictures that are on its page. A topic with nothing on its page suggests none.
 */
export function suggestedTerms(node: TreeNode, variables: Record<string, string> = {}): string[] {
  if (!hasContent(node.page)) return [];
  const raw: string[] = [node.title];
  for (const block of node.page.blocks) blockTerms(block, raw);
  const placed = placedPictureIds(node.page);
  for (const picture of node.pictures) if (placed.has(picture.id)) for (const callout of picture.callouts ?? []) raw.push(callout.name);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of raw) {
    const term = cleanTerm(text, variables);
    if (term && !seen.has(termKey(term))) { seen.add(termKey(term)); out.push(term); }
  }
  return out;
}

// ---- A topic's terms: editing and updating --------------------------------------------------------------------

/** The terms of a topic, one for each line, as the author edits them. */
export function termLines(node: TreeNode): string[] {
  return (node.index?.terms ?? []).map((t) => t.text);
}

const keep = (node: TreeNode, terms: IndexTerm[], removed: string[]) => {
  if (terms.length === 0 && removed.length === 0) delete node.index;
  else node.index = { terms, ...(removed.length ? { removed } : {}) };
};

/**
 * The author edited the terms of a topic as lines of text. A line that matches a term the software proposed keeps its place as the software's; any other line is the author's own. A software term whose
 * line is gone is remembered as taken out, so an update does not bring it back; a taken-out term that the author writes again is the author's again. Blank and unusable lines are dropped.
 */
export function setTermLines(node: TreeNode, lines: string[], variables: Record<string, string> = {}): void {
  const before = new Map((node.index?.terms ?? []).map((t) => [termKey(t.text), t]));
  const terms: IndexTerm[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const text = cleanTerm(line, variables);
    if (!text || seen.has(termKey(text))) continue;
    seen.add(termKey(text));
    const existing = before.get(termKey(text));
    // A software term the author left alone stays the software's, with its own spelling; one the author retyped (even with other capitals) is now theirs.
    terms.push(existing && existing.by === "software" && existing.text === text ? existing : { text, by: "author" });
  }
  const removed = new Set(node.index?.removed ?? []);
  for (const [key, term] of before) if (term.by === "software" && !seen.has(key)) removed.add(key);
  for (const key of seen) removed.delete(key);
  keep(node, terms, [...removed]);
}

/** What an update did to one topic. */
export interface UpdateResult {
  /** Terms the software added. */
  added: string[];
  /** Software terms the book no longer supports, which went. */
  dropped: string[];
}

/**
 * Brings a topic's terms up to date with the book: the author's own terms stay; terms the author took out do not come back; software terms the book still supports stay; software terms it no longer
 * supports go; new suggestions are added. The same call makes the first pass for a topic that has no terms yet.
 */
export function updateTopicIndex(node: TreeNode, variables: Record<string, string> = {}): UpdateResult {
  const suggestions = suggestedTerms(node, variables);
  const suggested = new Map(suggestions.map((t) => [termKey(t), t]));
  const removed = new Set(node.index?.removed ?? []);
  const terms: IndexTerm[] = [];
  const have = new Set<string>();
  const dropped: string[] = [];
  for (const term of node.index?.terms ?? []) {
    if (term.by === "software" && !suggested.has(termKey(term.text))) { dropped.push(term.text); continue; }
    terms.push(term);
    have.add(termKey(term.text));
  }
  const added: string[] = [];
  for (const text of suggestions) {
    const key = termKey(text);
    if (have.has(key) || removed.has(key)) continue;
    terms.push({ text, by: "software" });
    have.add(key);
    added.push(text);
  }
  keep(node, terms, [...removed]);
  return { added, dropped };
}

const walk = (nodes: TreeNode[], into: TreeNode[] = []): TreeNode[] => {
  for (const node of nodes) { into.push(node); walk(node.children, into); }
  return into;
};

/** The update for every topic of the book. */
export function updateBookIndex(tree: TreeNode[], variables: Record<string, string> = {}): { topics: number; added: number; dropped: number } {
  let topics = 0, added = 0, dropped = 0;
  for (const node of walk(tree)) {
    const result = updateTopicIndex(node, variables);
    if (result.added.length || result.dropped.length) topics++;
    added += result.added.length;
    dropped += result.dropped.length;
  }
  return { topics, added, dropped };
}

// ---- The index of the book ---------------------------------------------------------------------------------------

export interface IndexLocator {
  id: string;
  /** The topic's number in the book, such as 2.1. */
  number: string;
  title: string;
}

export interface IndexEntry {
  text: string;
  /** Every topic the term is in, in the order of the book, each once. */
  topics: IndexLocator[];
}

export interface IndexGroup {
  /** "A" to "Z", or "Symbols and numbers". */
  heading: string;
  entries: IndexEntry[];
}

export interface BookIndex {
  groups: IndexGroup[];
  /** How many different terms. */
  terms: number;
}

export const SYMBOLS_HEADING = "Symbols and numbers";

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** The heading an entry is listed under: its first letter, without accents, or the group for everything else. */
export function groupOf(text: string): string {
  const first = text.normalize("NFD").charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : SYMBOLS_HEADING;
}

/**
 * The index of the book, worked out from every topic's terms: the same term in two topics is one entry listing both (the author's spelling wins, else the first), entries are in alphabetical order under
 * a heading for each letter (symbols and numbers first), and each entry lists the topics, in book order, by their numbers. Never stored.
 */
export function buildBookIndex(project: Pick<Project, "tree">, numbers: Map<string, string>): BookIndex {
  const byKey = new Map<string, { text: string; by: TermBy; topics: IndexLocator[] }>();
  for (const node of walk(project.tree)) {
    for (const term of node.index?.terms ?? []) {
      const key = termKey(term.text);
      const entry = byKey.get(key) ?? { text: term.text, by: term.by, topics: [] };
      if (term.by === "author" && entry.by === "software") { entry.text = term.text; entry.by = "author"; }
      if (!entry.topics.some((t) => t.id === node.id)) entry.topics.push({ id: node.id, number: numbers.get(node.id) ?? "", title: node.title });
      byKey.set(key, entry);
    }
  }
  const entries = [...byKey.values()].map(({ text, topics }): IndexEntry => ({ text, topics })).sort((a, b) => collator.compare(a.text, b.text) || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
  const groups: IndexGroup[] = [];
  for (const entry of entries) {
    const heading = groupOf(entry.text);
    const group = groups.find((g) => g.heading === heading);
    if (group) group.entries.push(entry);
    else groups.push({ heading, entries: [entry] });
  }
  // Symbols and numbers come first; the letters follow in order.
  groups.sort((a, b) => (a.heading === SYMBOLS_HEADING ? -1 : b.heading === SYMBOLS_HEADING ? 1 : a.heading < b.heading ? -1 : 1));
  return { groups, terms: entries.length };
}

/** "12 terms in 8 topics" in words. */
export function indexSummary(tree: TreeNode[]): string {
  const topics = walk(tree).filter((n) => (n.index?.terms.length ?? 0) > 0);
  const terms = new Set(topics.flatMap((n) => n.index!.terms.map((t) => termKey(t.text))));
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  return `${plural(terms.size, "term")} in ${plural(topics.length, "topic")}`;
}

// ---- Cleaning what is read from or written to a file -------------------------------------------------------------

/** A topic's index made only of what belongs in one, or `null` when nothing is left. */
export function cleanIndex(raw: unknown): TopicIndex | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const terms: IndexTerm[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(input.terms) ? input.terms : []) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as Record<string, unknown>;
    const text = typeof entry.text === "string" ? cleanTerm(entry.text) : null;
    if (!text || seen.has(termKey(text))) continue;
    seen.add(termKey(text));
    terms.push({ text, by: entry.by === "author" ? "author" : "software" });
  }
  const removed = [...new Set((Array.isArray(input.removed) ? input.removed : []).filter((k): k is string => typeof k === "string" && k.trim() !== "").map((k) => termKey(k)))].filter((k) => !seen.has(k));
  if (terms.length === 0 && removed.length === 0) return null;
  return { terms, ...(removed.length ? { removed } : {}) };
}

type WithIndex = { index?: unknown; children?: WithIndex[] };

/** A copy of the tree in which every topic's index is cleaned, and left off when it has nothing. */
export function cleanTreeIndex<T extends WithIndex>(tree: T[]): T[] {
  return tree.map((node) => {
    const { index, ...rest } = node;
    const clean = index === undefined ? null : cleanIndex(index);
    return { ...rest, ...(clean ? { index: clean } : {}), children: cleanTreeIndex((node.children ?? []) as T[]) } as unknown as T;
  });
}
