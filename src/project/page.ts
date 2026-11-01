// A topic's page: the blocks that make up what the reader sees under the topic's title, in order.
// Everything here works on a page alone, so it can be tested without a screen. How a page is saved is in docs/format-spec.md.
import { cleanComments, pruneComments, type Comment } from "./comments.ts";
import { newId } from "./ids.ts";
import { cleanRuns, type Run } from "./text.ts";

/** The built-in callout boxes. Each has an icon, a label word and a coloured band when it is printed or shown on the help site. */
export type CalloutKind = "design-tip" | "caution" | "bright-idea" | "power-tip" | "time-saver" | "new-feature";

export const CALLOUT_KINDS: { id: CalloutKind; label: string }[] = [
  { id: "design-tip", label: "Design Tip" },
  { id: "caution", label: "Caution" },
  { id: "bright-idea", label: "Bright Idea" },
  { id: "power-tip", label: "Power Tip" },
  { id: "time-saver", label: "Time Saver" },
  { id: "new-feature", label: "New in this version" },
];

/**
 * Every block can carry conditions (format version 19): ids of the project's conditions. An output made for a target that hides any of them leaves the block out. A block with none is in every output.
 * See src/project/snippets.ts.
 */
export interface Conditional {
  conditions?: string[];
}

/** A sub-heading under the topic's own title. The topic's title is not a block. */
export interface HeadingBlock extends Conditional {
  id: string;
  type: "heading";
  text: string;
}

export interface ParagraphBlock extends Conditional {
  id: string;
  type: "paragraph";
  text: Run[];
}

/** One of the topic's pictures, shown here. A picture is only on the page where it is placed. */
export interface PictureBlock extends Conditional {
  id: string;
  type: "picture";
  pictureId: string;
}

/** A snippet used here (format version 19): the project's snippet of this id, written out in its place in every output. Change the snippet once and every topic that uses it changes. */
export interface SnippetBlock extends Conditional {
  id: string;
  type: "snippet";
  snippetId: string;
}

export interface Step extends Conditional {
  id: string;
  /** What to do. It starts with a verb and names the control exactly as it appears on screen. */
  text: Run[];
  /** One of the topic's pictures for this step. */
  pictureId?: string;
  /** What happens next, such as "The Format pane opens." */
  result?: Run[];
}

/** Numbered steps. The numbers are never stored: they are worked out from the order. */
export interface ProcedureBlock extends Conditional {
  id: string;
  type: "procedure";
  steps: Step[];
}

export interface CalloutBlock extends Conditional {
  id: string;
  type: "callout";
  kind: CalloutKind;
  text: Run[];
}

export type Block = HeadingBlock | ParagraphBlock | PictureBlock | ProcedureBlock | CalloutBlock | SnippetBlock;
export type BlockType = Block["type"];

export interface Page {
  blocks: Block[];
  /** Working notes on the blocks (format version 8). Never part of what the reader sees. Left out until there is one. */
  comments?: Comment[];
}

export const BLOCK_TYPES: { id: BlockType; label: string }[] = [
  { id: "paragraph", label: "Paragraph" },
  { id: "heading", label: "Heading" },
  { id: "picture", label: "Picture" },
  { id: "procedure", label: "Numbered procedure" },
  { id: "callout", label: "Callout box" },
  { id: "snippet", label: "Snippet" },
];

export function blockLabel(type: BlockType): string {
  return BLOCK_TYPES.find((t) => t.id === type)!.label;
}

export function calloutLabel(kind: CalloutKind): string {
  return CALLOUT_KINDS.find((k) => k.id === kind)?.label ?? "Callout box";
}

export function emptyPage(): Page {
  return { blocks: [] };
}

// ---- Making blocks -----------------------------------------------------------------------

export function makeStep(): Step {
  return { id: newId(), text: [] };
}

/** A new block of a kind, empty and ready to fill in. A procedure starts with one empty step so there is something to type in. */
export function makeBlock(type: BlockType, options: { pictureId?: string; kind?: CalloutKind } = {}): Block {
  const id = newId();
  switch (type) {
    case "heading": return { id, type, text: "" };
    case "paragraph": return { id, type, text: [] };
    case "picture": return { id, type, pictureId: options.pictureId ?? "" };
    case "procedure": return { id, type, steps: [makeStep()] };
    case "callout": return { id, type, kind: options.kind ?? "design-tip", text: [] };
    case "snippet": return { id, type, snippetId: "" };
  }
}

// ---- Changing a page ---------------------------------------------------------------------

/** Moves one item of a list up or down. Returns false at the end of the list, where nothing can move. */
export function moveItem<T>(list: T[], index: number, by: -1 | 1): boolean {
  const to = index + by;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return false;
  [list[index], list[to]] = [list[to], list[index]];
  return true;
}

/** Adds a block after the one at `after` (or at the end if that is -1 or left out). Returns where it went. */
export function addBlock(page: Page, block: Block, after: number = page.blocks.length - 1): number {
  const at = Math.min(page.blocks.length, Math.max(0, after + 1));
  page.blocks.splice(at, 0, block);
  return at;
}

/** Removes a block, and its comments with it. */
export function removeBlock(page: Page, id: string): Block | null {
  const at = page.blocks.findIndex((b) => b.id === id);
  const removed = at >= 0 ? page.blocks.splice(at, 1)[0] : null;
  if (removed) pruneComments(page);
  return removed;
}

export function findBlock(page: Page, id: string): Block | null {
  return page.blocks.find((b) => b.id === id) ?? null;
}

export function moveBlock(page: Page, id: string, by: -1 | 1): boolean {
  return moveItem(page.blocks, page.blocks.findIndex((b) => b.id === id), by);
}

/** The pictures a block shows: one for a picture block, one for each step that has one. */
export function picturesOf(block: Block): string[] {
  if (block.type === "picture") return block.pictureId ? [block.pictureId] : [];
  if (block.type === "procedure") return block.steps.flatMap((s) => (s.pictureId ? [s.pictureId] : []));
  return [];
}

/** Every picture a page shows: a picture block, or a step's picture. A picture that is only in the topic's list, and not on its page, is not in the book. */
export function placedPictureIds(page: Page | undefined): Set<string> {
  const ids = new Set<string>();
  for (const block of page?.blocks ?? []) for (const id of picturesOf(block)) ids.add(id);
  return ids;
}

/** A picture was removed from the topic: take it off the page. A picture block goes, and a step just loses its picture. */
export function forgetPicture(page: Page, pictureId: string): void {
  page.blocks = page.blocks.filter((b) => !(b.type === "picture" && b.pictureId === pictureId));
  for (const block of page.blocks) {
    if (block.type !== "procedure") continue;
    for (const step of block.steps) if (step.pictureId === pictureId) delete step.pictureId;
  }
  pruneComments(page);
}

/** Does the page hold anything? An empty page is not saved. */
export function hasContent(page: Page | undefined): page is Page {
  return !!page && page.blocks.length > 0;
}

// ---- Cleaning what is read from or written to a file ---------------------------------------

const CALLOUT_IDS = new Set<string>(CALLOUT_KINDS.map((k) => k.id));
const text = (v: unknown) => (typeof v === "string" ? v : "");
const idOf = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : newId());

/** The condition ids on a block, step or topic as read from a file: ids that look like ids, each once. Whether they are the project's conditions is checked for the whole book (cleanTreeConditions). */
export function cleanConditionIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const id of raw) if (typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id) && !out.includes(id)) out.push(id);
  return out.slice(0, 20);
}

function cleanStep(raw: unknown, pictureIds: Set<string> | null): Step | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const step: Step = { id: idOf(input.id), text: cleanRuns(input.text) };
  const stepConditions = cleanConditionIds(input.conditions);
  if (stepConditions.length > 0) step.conditions = stepConditions;
  if (typeof input.pictureId === "string" && input.pictureId && (!pictureIds || pictureIds.has(input.pictureId))) step.pictureId = input.pictureId;
  const result = cleanRuns(input.result);
  if (result.length > 0) step.result = result;
  return step;
}

function cleanBlock(raw: unknown, pictureIds: Set<string> | null): Block | null {
  const block = cleanBlockBody(raw, pictureIds);
  if (!block) return null;
  const conditions = cleanConditionIds((raw as Record<string, unknown>).conditions);
  if (conditions.length > 0) block.conditions = conditions;
  return block;
}

function cleanBlockBody(raw: unknown, pictureIds: Set<string> | null): Block | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const id = idOf(input.id);
  switch (input.type) {
    case "snippet": return { id, type: "snippet", snippetId: text(input.snippetId) };
    case "heading": return { id, type: "heading", text: text(input.text) };
    case "paragraph": return { id, type: "paragraph", text: cleanRuns(input.text) };
    case "picture": {
      const pictureId = text(input.pictureId);
      // A picture block whose picture is not in the topic is a leftover, so it is dropped (a block with no picture chosen yet is kept).
      return pictureIds && pictureId && !pictureIds.has(pictureId) ? null : { id, type: "picture", pictureId };
    }
    case "procedure": {
      const steps = (Array.isArray(input.steps) ? input.steps : []).map((s) => cleanStep(s, pictureIds)).filter((s): s is Step => s !== null);
      return { id, type: "procedure", steps };
    }
    case "callout": return { id, type: "callout", kind: CALLOUT_IDS.has(text(input.kind)) ? (input.kind as CalloutKind) : "design-tip", text: cleanRuns(input.text) };
    default: return null;
  }
}

/**
 * A page made only of what belongs in one: blocks of a known kind, text that is text, and a picture only if the topic still has it
 * (`pictureIds`; pass `null` to skip that check). Anything else is dropped, so a hand-made file cannot put something odd on a page.
 */
export function cleanPage(raw: unknown, pictureIds: Set<string> | null = null): Page {
  const blocks = typeof raw === "object" && raw !== null && Array.isArray((raw as { blocks?: unknown }).blocks) ? (raw as { blocks: unknown[] }).blocks : [];
  const seen = new Set<string>();
  const page: Page = { blocks: [] };
  for (const item of blocks) {
    const block = cleanBlock(item, pictureIds);
    if (!block) continue;
    // Two blocks with one id would make one of them impossible to address, so the second gets a new id.
    if (seen.has(block.id)) block.id = newId();
    seen.add(block.id);
    page.blocks.push(block);
  }
  // Comments stay only on blocks that are on the page.
  const comments = cleanComments(typeof raw === "object" && raw !== null ? (raw as { comments?: unknown }).comments : undefined, seen);
  if (comments.length > 0) page.comments = comments;
  return page;
}
