// AI drafts: sentences the built-in model has proposed for callouts, kept apart from the real text until the author accepts them. A draft is not in the tree, so no preview, no check of the
// words, no index and no export can see it; it becomes real text only through `acceptDraft`, which the author asks for, one draft at a time. Drafts are saved with the project in drafts.json
// (format version 14) so they wait there until they are looked at. The project's writing-style notes, which the model reads before every draft, are kept here too.
// Everything here works without a screen.
import { MOST_TEXT, letterFor, type Callout } from "./callouts.ts";
import { numbering, type Picture, type Project, type TreeNode } from "./model.ts";
import { newId } from "./ids.ts";

export type DraftKind = "callout-sentence";
export const DRAFT_KINDS: readonly DraftKind[] = ["callout-sentence"];

export interface Draft {
  id: string;
  kind: DraftKind;
  /** The picture and the callout on it that the draft is for. */
  pictureId: string;
  calloutId: string;
  /** The sentence that is proposed. */
  text: string;
  /** What the model was given, one plain line each, so the author can judge whether it had enough to go on. */
  clues: string[];
  /** When it was written (an ISO date and time). */
  madeAt: string;
  /** Which model wrote it. */
  model: string;
}

/** The most lines of clues, and the longest line, kept with a draft. */
export const MOST_CLUE_LINES = 14;
export const MOST_CLUE_TEXT = 300;
/** The longest writing-style note. */
export const MOST_STYLE = 2000;

const squeeze = (value: unknown, most: number): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, most) : "");

/** The writing-style notes as kept: line breaks made plain, trailing spaces taken off, the ends trimmed, and no more than 2000 letters. */
export function cleanWritingStyle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MOST_STYLE);
}

/** Where a callout is: the topic, the picture and the callout with its position in the picture's list. */
export interface CalloutPlace {
  node: TreeNode;
  picture: Picture;
  callout: Callout;
  index: number;
}

export function findCallout(tree: TreeNode[], pictureId: string, calloutId: string): CalloutPlace | null {
  for (const node of tree) {
    for (const picture of node.pictures ?? []) {
      if (picture.id !== pictureId) continue;
      const index = (picture.callouts ?? []).findIndex((c) => c.id === calloutId);
      if (index >= 0) return { node, picture, callout: picture.callouts![index], index };
    }
    const deeper = findCallout(node.children ?? [], pictureId, calloutId);
    if (deeper) return deeper;
  }
  return null;
}

/**
 * Drafts as they should be kept: only kinds this program knows, only for a callout that is there, with some words, cut to length, each id once, and only the newest draft for one callout.
 * Anything else is dropped. Used when a project is opened and saved.
 */
export function cleanDrafts(raw: unknown, tree: TreeNode[]): Draft[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const kept: Draft[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const d = item as Record<string, unknown>;
    if (!DRAFT_KINDS.includes(d.kind as DraftKind)) continue;
    if (typeof d.pictureId !== "string" || typeof d.calloutId !== "string") continue;
    if (!findCallout(tree, d.pictureId, d.calloutId)) continue;
    const text = squeeze(d.text, MOST_TEXT);
    if (text === "") continue;
    let id = typeof d.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(d.id) ? d.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    const clues = (Array.isArray(d.clues) ? d.clues : []).map((c) => squeeze(c, MOST_CLUE_TEXT)).filter((c) => c !== "").slice(0, MOST_CLUE_LINES);
    kept.push({ id, kind: d.kind as DraftKind, pictureId: d.pictureId, calloutId: d.calloutId, text, clues, madeAt: squeeze(d.madeAt, 40), model: squeeze(d.model, 100) });
  }
  // The newest draft for a callout wins: it is the later one in the list.
  return kept.filter((d, i) => !kept.slice(i + 1).some((later) => later.kind === d.kind && later.calloutId === d.calloutId));
}

/** Puts a draft in the project, in place of any draft already waiting for the same callout. Answers with the draft as kept, or `null` if the callout is not there or the sentence is empty. */
export function addDraft(project: Project, draft: Omit<Draft, "id"> & { id?: string }): Draft | null {
  if (!findCallout(project.tree, draft.pictureId, draft.calloutId)) return null;
  const text = squeeze(draft.text, MOST_TEXT);
  if (text === "") return null;
  const kept: Draft = {
    id: draft.id && /^[A-Za-z0-9_-]{1,64}$/.test(draft.id) ? draft.id : newId(),
    kind: draft.kind,
    pictureId: draft.pictureId,
    calloutId: draft.calloutId,
    text,
    clues: draft.clues.map((c) => squeeze(c, MOST_CLUE_TEXT)).filter((c) => c !== "").slice(0, MOST_CLUE_LINES),
    madeAt: squeeze(draft.madeAt, 40),
    model: squeeze(draft.model, 100),
  };
  project.drafts = [...project.drafts.filter((d) => !(d.kind === kept.kind && d.calloutId === kept.calloutId)), kept];
  return kept;
}

/** One waiting draft with where it is, for the review list. */
export interface DraftRow {
  draft: Draft;
  nodeId: string;
  /** The topic's number and title, such as "2.1 Saving your work". */
  where: string;
  pictureId: string;
  /** "picture 1": the picture's place among its topic's pictures. */
  pictureWords: string;
  /** The callout's letter and its name, such as "A: Save" (or "A" when it has no name). */
  calloutWords: string;
  /** The callout's sentence now, empty if it has none yet. */
  now: string;
}

/** The waiting drafts, in the order of the book (topic by topic, picture by picture, callout by callout). A draft whose callout has gone is left out. */
export function draftRows(project: Project): DraftRow[] {
  const numbers = numbering(project.tree);
  const rows: DraftRow[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      node.pictures.forEach((picture, p) => {
        (picture.callouts ?? []).forEach((callout, c) => {
          const draft = project.drafts.find((d) => d.pictureId === picture.id && d.calloutId === callout.id);
          if (!draft) return;
          const letter = letterFor(c);
          rows.push({
            draft,
            nodeId: node.id,
            where: `${numbers.get(node.id) ?? ""} ${node.title}`.trim(),
            pictureId: picture.id,
            pictureWords: `picture ${p + 1}`,
            calloutWords: callout.name.trim() ? `${letter}: ${callout.name.trim()}` : letter,
            now: callout.description.trim(),
          });
        });
      });
      walk(node.children ?? []);
    }
  };
  walk(project.tree);
  return rows;
}

/** How many drafts are waiting (those whose callout is still there). */
export function draftCount(project: Project): number {
  return draftRows(project).length;
}

/** Throws away drafts whose callout is gone. */
export function pruneDrafts(project: Project): void {
  project.drafts = cleanDrafts(project.drafts, project.tree);
}

export type AcceptResult = { ok: true; where: string; calloutWords: string } | { ok: false; words: string };

/**
 * The author accepts a draft, perhaps after changing its words: the sentence becomes the callout's real sentence (replacing what was there) and the draft is gone. Nothing else changes.
 * `text` is the sentence to use; without it the draft's own is used.
 */
export function acceptDraft(project: Project, draftId: string, text?: string): AcceptResult {
  const draft = project.drafts.find((d) => d.id === draftId);
  if (!draft) return { ok: false, words: "That draft is no longer waiting." };
  const place = findCallout(project.tree, draft.pictureId, draft.calloutId);
  if (!place) {
    project.drafts = project.drafts.filter((d) => d.id !== draftId);
    return { ok: false, words: "The callout this draft was for is gone, so the draft was dropped." };
  }
  const sentence = squeeze(text ?? draft.text, MOST_TEXT);
  if (sentence === "") return { ok: false, words: "A sentence is needed. Write one, or reject the draft." };
  place.callout.description = sentence;
  project.drafts = project.drafts.filter((d) => d.id !== draftId);
  const numbers = numbering(project.tree);
  const name = place.callout.name.trim();
  return { ok: true, where: `${numbers.get(place.node.id) ?? ""} ${place.node.title}`.trim(), calloutWords: name ? `${letterFor(place.index)}: ${name}` : letterFor(place.index) };
}

/** The author rejects a draft: it is gone and nothing else changes. */
export function rejectDraft(project: Project, draftId: string): boolean {
  const before = project.drafts.length;
  project.drafts = project.drafts.filter((d) => d.id !== draftId);
  return project.drafts.length < before;
}
