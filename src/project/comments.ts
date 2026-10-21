// Comments: working notes an author leaves on a block of a topic's page, to be resolved later. A comment belongs to one block, can be open or resolved, and is
// never part of what the reader sees: it is not put in a preview or an export. Everything here works on a page's `blocks` and `comments` alone, so it can be tested
// without a screen. How comments are saved is in docs/format-spec.md ("Comments").
import { newId } from "./ids.ts";

export interface Comment {
  id: string;
  /** The block it is on. A comment whose block is gone is dropped. */
  blockId: string;
  text: string;
  resolved: boolean;
  /** When it was written, as an ISO date and time. */
  createdAt: string;
  /** When it was last resolved, if it is resolved now. */
  resolvedAt?: string;
}

/** The most letters in one comment, so a mistake cannot fill a project. */
export const MOST_COMMENT = 1000;

/** What a comment is kept on: a page, which is its blocks and its comments. */
export interface CommentHost {
  blocks: { id: string }[];
  comments?: Comment[];
}

/** A comment's text as it is kept: line breaks made plain and the edges trimmed. */
function tidy(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
}

export type TextCheck = { ok: true; text: string } | { ok: false; message: string };

/** Checks what is typed for a comment. A mistake is explained in plain words. */
export function checkCommentText(input: string): TextCheck {
  const text = tidy(input);
  if (text === "") return { ok: false, message: "Write something in the comment first. An empty comment cannot be saved." };
  if (text.length > MOST_COMMENT) return { ok: false, message: `A comment can be at most ${MOST_COMMENT} letters. This one has ${text.length}.` };
  return { ok: true, text };
}

/** The comments on one block: the open ones first, then the resolved ones, each group in the order they were written. */
export function commentsOn(host: CommentHost | undefined, blockId: string): Comment[] {
  const all = (host?.comments ?? []).filter((c) => c.blockId === blockId);
  return [...all.filter((c) => !c.resolved), ...all.filter((c) => c.resolved)];
}

/** How many comments are open: on one block, or on the whole page when no block is given. */
export function openCount(host: CommentHost | undefined, blockId?: string): number {
  return (host?.comments ?? []).filter((c) => !c.resolved && (blockId === undefined || c.blockId === blockId)).length;
}

/** Adds a comment to a block. Returns it, or `null` when the block is not on the page or the text is not allowed. */
export function addComment(host: CommentHost, blockId: string, input: string, now: string): Comment | null {
  const checked = checkCommentText(input);
  if (!checked.ok || !host.blocks.some((b) => b.id === blockId)) return null;
  const comment: Comment = { id: newId(), blockId, text: checked.text, resolved: false, createdAt: now };
  (host.comments ??= []).push(comment);
  return comment;
}

/** Changes a comment's words. False when there is no such comment or the text is not allowed. */
export function editComment(host: CommentHost, id: string, input: string): boolean {
  const comment = host.comments?.find((c) => c.id === id);
  const checked = checkCommentText(input);
  if (!comment || !checked.ok) return false;
  comment.text = checked.text;
  return true;
}

/** Resolves a comment, or opens it again. False when there is no such comment. */
export function setResolved(host: CommentHost, id: string, resolved: boolean, now: string): boolean {
  const comment = host.comments?.find((c) => c.id === id);
  if (!comment) return false;
  comment.resolved = resolved;
  if (resolved) comment.resolvedAt = now;
  else delete comment.resolvedAt;
  return true;
}

export function deleteComment(host: CommentHost, id: string): boolean {
  const at = host.comments?.findIndex((c) => c.id === id) ?? -1;
  if (at < 0) return false;
  host.comments!.splice(at, 1);
  if (host.comments!.length === 0) delete host.comments;
  return true;
}

/** Drops the comments whose block is no longer on the page (and the list itself when none are left). */
export function pruneComments(host: CommentHost): void {
  if (!host.comments) return;
  const ids = new Set(host.blocks.map((b) => b.id));
  host.comments = host.comments.filter((c) => ids.has(c.blockId));
  if (host.comments.length === 0) delete host.comments;
}

/** Puts a block's comments in place of the ones it had (the others are left alone). An empty list leaves the block with none. */
export function replaceBlockComments(host: CommentHost, blockId: string, list: Comment[]): void {
  const others = (host.comments ?? []).filter((c) => c.blockId !== blockId);
  const next = [...others, ...list.map((c) => ({ ...c, blockId }))];
  if (next.length > 0) host.comments = next;
  else delete host.comments;
}

/** How many comments a block has, open and resolved. */
export function commentTotals(host: CommentHost | undefined, blockId: string): { open: number; resolved: number } {
  const all = (host?.comments ?? []).filter((c) => c.blockId === blockId);
  return { open: all.filter((c) => !c.resolved).length, resolved: all.filter((c) => c.resolved).length };
}

/** A count of comments in words, for a button name or a screen reader. */
export function commentsWords(open: number, resolved = 0): string {
  const say = (n: number, what: string) => `${n} ${what} ${n === 1 ? "comment" : "comments"}`;
  if (open === 0 && resolved === 0) return "No comments";
  if (resolved === 0) return say(open, "open");
  if (open === 0) return say(resolved, "resolved");
  return `${say(open, "open")} and ${resolved} resolved`;
}

// ---- Cleaning what is read from or written to a file ---------------------------------------

/**
 * The comments a page can keep: each on a block that is on the page, with words in it, a true or false for resolved, and a date. Anything else is dropped,
 * and a repeated id gets a new one.
 */
export function cleanComments(raw: unknown, blockIds: Set<string>): Comment[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Comment[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const input = item as Record<string, unknown>;
    const text = tidy(input.text).slice(0, MOST_COMMENT).trim();
    const blockId = typeof input.blockId === "string" ? input.blockId : "";
    if (text === "" || !blockIds.has(blockId)) continue;
    let id = typeof input.id === "string" && input.id.length > 0 ? input.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    const resolved = input.resolved === true;
    const createdAt = typeof input.createdAt === "string" && input.createdAt.length > 0 ? input.createdAt.slice(0, 40) : "";
    const comment: Comment = { id, blockId, text, resolved, createdAt };
    if (resolved && typeof input.resolvedAt === "string" && input.resolvedAt.length > 0) comment.resolvedAt = input.resolvedAt.slice(0, 40);
    out.push(comment);
  }
  return out;
}
