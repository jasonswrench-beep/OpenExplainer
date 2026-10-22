// Drafts: proposals kept apart from the real text until the author accepts them. Five kinds:
//   - a sentence the AI wrote for a callout (format version 14);
//   - a numbered procedure made from a topic's click pictures, written by rules from the click notes (format version 15, `procedure-draft.ts`);
//   - the opener of a chapter or the summary of its topics, written by the AI (format version 16, `ai/chapter-text.ts`);
//   - a boxed note (Caution, Design Tip and so on) the AI suggests, resting on a sentence the topic already says (format version 16, `ai/boxes.ts`).
// A draft is not in the tree, so no preview, no check of the words, no index and no export can see it; it becomes real only through `acceptDraft`, which the author asks for, one draft at a time.
// Drafts are saved with the project in drafts.json so they wait there until they are looked at. The project's writing-style notes, which the AI reads before every sentence, are kept here too.
// Everything here works without a screen.
import { MOST_TEXT, letterFor, type Callout } from "./callouts.ts";
import { ensurePage, findNode, numbering, type Picture, type Project, type TreeNode } from "./model.ts";
import { newId } from "./ids.ts";
import { CALLOUT_KINDS, calloutLabel, makeBlock, type Block, type CalloutBlock, type CalloutKind, type ParagraphBlock, type ProcedureBlock, type Step } from "./page.ts";
import { parseMarks } from "./text.ts";
import { blockText } from "./page-text.ts";

export type DraftKind = "callout-sentence" | "procedure" | "chapter-text" | "box";
export const DRAFT_KINDS: readonly DraftKind[] = ["callout-sentence", "procedure", "chapter-text", "box"];

/** A sentence the AI proposed for a callout. */
export interface SentenceDraft {
  id: string;
  kind: "callout-sentence";
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

/** One proposed step of a procedure. */
export interface ProcedureStep {
  /** The click picture this step is for. */
  pictureId: string;
  /** The step as the author edits it, with `[[Control name]]` marks. */
  text: string;
  /** What the step was made from, in plain words. */
  from: string;
  /** Set (in words) when the step needs the author's attention, such as a control that has no name. */
  flag?: string;
}

/** A numbered procedure proposed for a topic, to be added to the end of its page when accepted. */
export interface ProcedureDraft {
  id: string;
  kind: "procedure";
  /** The topic it is for. */
  nodeId: string;
  steps: ProcedureStep[];
  madeAt: string;
  /** Who wrote the wording: the rules ("rule"), or the model ("model"). */
  by: "rule" | "model";
}

/** The opener of a chapter (two or three sentences for the top of its page) or a summary of its topics (a short paragraph for the end of a topic's page), written by the AI. */
export interface ChapterTextDraft {
  id: string;
  kind: "chapter-text";
  /** The page it will be added to: the chapter for an opener, the topic that is to hold the summary for a summary. */
  nodeId: string;
  role: "opener" | "summary";
  text: string;
  /** What the model was given, one plain line each. */
  clues: string[];
  madeAt: string;
  model: string;
}

/** A boxed note the AI suggests for a topic. It rests on `evidence`, one sentence the topic's text already says, word for word. The author chooses the kind of box when accepting. */
export interface BoxDraft {
  id: string;
  kind: "box";
  /** The topic it is for. */
  nodeId: string;
  /** Which box the model guessed; the author may change it. */
  boxKind: CalloutKind;
  text: string;
  /** The sentence of the topic's text the box rests on. */
  evidence: string;
  clues: string[];
  madeAt: string;
  model: string;
}

export type Draft = SentenceDraft | ProcedureDraft | ChapterTextDraft | BoxDraft;

export const isSentence = (d: Draft): d is SentenceDraft => d.kind === "callout-sentence";
export const isProcedure = (d: Draft): d is ProcedureDraft => d.kind === "procedure";
export const isChapterText = (d: Draft): d is ChapterTextDraft => d.kind === "chapter-text";
export const isBox = (d: Draft): d is BoxDraft => d.kind === "box";

/** The most lines of clues, and the longest line, kept with a draft. */
export const MOST_CLUE_LINES = 14;
export const MOST_CLUE_TEXT = 300;
/** The most steps in a procedure draft. */
export const MOST_STEPS = 60;
/** The longest opener or summary, and the longest evidence sentence of a box. */
export const MOST_PROSE = 1200;
export const MOST_EVIDENCE = 400;
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

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A draft cleaned as one of its kind, or `null` if nothing usable is left. */
function cleanOne(item: unknown, tree: TreeNode[], id: string): Draft | null {
  if (typeof item !== "object" || item === null) return null;
  const d = item as Record<string, unknown>;
  if (d.kind === "callout-sentence") {
    if (typeof d.pictureId !== "string" || typeof d.calloutId !== "string") return null;
    if (!findCallout(tree, d.pictureId, d.calloutId)) return null;
    const text = squeeze(d.text, MOST_TEXT);
    if (text === "") return null;
    const clues = (Array.isArray(d.clues) ? d.clues : []).map((c) => squeeze(c, MOST_CLUE_TEXT)).filter((c) => c !== "").slice(0, MOST_CLUE_LINES);
    return { id, kind: "callout-sentence", pictureId: d.pictureId, calloutId: d.calloutId, text, clues, madeAt: squeeze(d.madeAt, 40), model: squeeze(d.model, 100) };
  }
  if (d.kind === "procedure") {
    if (typeof d.nodeId !== "string") return null;
    const node = findNode(tree, d.nodeId);
    if (!node) return null;
    const have = new Set(node.pictures.map((p) => p.id));
    const steps: ProcedureStep[] = [];
    for (const raw of Array.isArray(d.steps) ? d.steps : []) {
      if (typeof raw !== "object" || raw === null) continue;
      const s = raw as Record<string, unknown>;
      if (typeof s.pictureId !== "string" || !have.has(s.pictureId)) continue;
      const text = squeeze(s.text, MOST_TEXT);
      if (text === "") continue;
      const step: ProcedureStep = { pictureId: s.pictureId, text, from: squeeze(s.from, MOST_CLUE_TEXT) };
      const flag = squeeze(s.flag, 200);
      if (flag) step.flag = flag;
      steps.push(step);
      if (steps.length >= MOST_STEPS) break;
    }
    if (steps.length === 0) return null;
    return { id, kind: "procedure", nodeId: d.nodeId, steps, madeAt: squeeze(d.madeAt, 40), by: d.by === "model" ? "model" : "rule" };
  }
  const cluesOf = (): string[] => (Array.isArray(d.clues) ? d.clues : []).map((c) => squeeze(c, MOST_CLUE_TEXT)).filter((c) => c !== "").slice(0, MOST_CLUE_LINES);
  if (d.kind === "chapter-text") {
    if (typeof d.nodeId !== "string" || !findNode(tree, d.nodeId)) return null;
    if (d.role !== "opener" && d.role !== "summary") return null;
    const text = squeeze(d.text, MOST_PROSE);
    if (text === "") return null;
    return { id, kind: "chapter-text", nodeId: d.nodeId, role: d.role, text, clues: cluesOf(), madeAt: squeeze(d.madeAt, 40), model: squeeze(d.model, 100) };
  }
  if (d.kind === "box") {
    if (typeof d.nodeId !== "string" || !findNode(tree, d.nodeId)) return null;
    const boxKind = CALLOUT_KINDS.find((k) => k.id === d.boxKind)?.id;
    if (!boxKind) return null;
    const text = squeeze(d.text, MOST_TEXT);
    const evidence = squeeze(d.evidence, MOST_EVIDENCE);
    if (text === "" || evidence === "") return null;
    return { id, kind: "box", nodeId: d.nodeId, boxKind, text, evidence, clues: cluesOf(), madeAt: squeeze(d.madeAt, 40), model: squeeze(d.model, 100) };
  }
  return null;
}

/** What makes two drafts stand in for the same thing, so only the newest is kept: one sentence for a callout, one procedure for a topic. */
const keyOf = (d: Draft): string => (isSentence(d) ? `s:${d.calloutId}` : isProcedure(d) ? `p:${d.nodeId}` : isChapterText(d) ? `t:${d.nodeId}:${d.role}` : `b:${d.nodeId}:${d.evidence}`);

/**
 * Drafts as they should be kept: only kinds this program knows, only for a callout or topic that is there, with some words, cut to length, each id once, and only the newest draft for one callout or topic.
 * Anything else is dropped. Used when a project is opened and saved.
 */
export function cleanDrafts(raw: unknown, tree: TreeNode[]): Draft[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const kept: Draft[] = [];
  for (const item of raw) {
    const wanted = typeof item === "object" && item !== null ? (item as { id?: unknown }).id : undefined;
    let id = typeof wanted === "string" && SAFE_ID.test(wanted) ? wanted : newId();
    if (seen.has(id)) id = newId();
    const one = cleanOne(item, tree, id);
    if (!one) continue;
    seen.add(id);
    kept.push(one);
  }
  // The newest draft wins: it is the later one in the list.
  return kept.filter((d, i) => !kept.slice(i + 1).some((later) => keyOf(later) === keyOf(d)));
}

export type NewDraft =
  | (Omit<SentenceDraft, "id"> & { id?: string })
  | (Omit<ProcedureDraft, "id"> & { id?: string })
  | (Omit<ChapterTextDraft, "id"> & { id?: string })
  | (Omit<BoxDraft, "id"> & { id?: string });

/** Puts a draft in the project, in place of any draft already waiting for the same callout or topic. Answers with the draft as kept, or `null` if what it is for is not there or there is nothing in it. */
export function addDraft(project: Project, draft: NewDraft): Draft | null {
  const [kept] = cleanDrafts([{ ...draft, id: draft.id ?? newId() }], project.tree);
  if (!kept) return null;
  project.drafts = [...project.drafts.filter((d) => keyOf(d) !== keyOf(kept)), kept];
  return kept;
}

/** Fields every waiting draft has in the list. */
interface RowBase {
  nodeId: string;
  /** The topic's number and title, such as "2.1 Saving your work". */
  where: string;
}

/** One waiting sentence with where it is, for the list. */
export interface SentenceRow extends RowBase {
  draft: SentenceDraft;
  pictureId: string;
  /** "picture 1": the picture's place among its topic's pictures. */
  pictureWords: string;
  /** The callout's letter and its name, such as "A: Save" (or "A" when it has no name). */
  calloutWords: string;
  /** The callout's sentence now, empty if it has none yet. */
  now: string;
}

/** One waiting procedure with where it is going, for the list. */
export interface ProcedureRow extends RowBase {
  draft: ProcedureDraft;
  /** "picture 3": each step's picture's place among the topic's pictures. */
  pictureWords: string[];
  /** How many blocks the topic's page has now. */
  blocksNow: number;
}

/** One waiting opener or summary with where it will go. */
export interface ChapterTextRow extends RowBase {
  draft: ChapterTextDraft;
  blocksNow: number;
}

/** One waiting suggested box with where it will go. */
export interface BoxRow extends RowBase {
  draft: BoxDraft;
  /** Is the sentence it rests on still in the topic's text? */
  evidenceFound: boolean;
  blocksNow: number;
}

export type DraftRow = SentenceRow | ProcedureRow | ChapterTextRow | BoxRow;

/** The waiting drafts, in the order of the book (topic by topic; a topic's procedure first, then its callouts picture by picture). A draft whose callout or topic has gone is left out. */
export function draftRows(project: Project): DraftRow[] {
  const numbers = numbering(project.tree);
  const rows: DraftRow[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      const where = `${numbers.get(node.id) ?? ""} ${node.title}`.trim();
      const blocksNow = node.page?.blocks.length ?? 0;
      const opener = project.drafts.find((d): d is ChapterTextDraft => isChapterText(d) && d.nodeId === node.id && d.role === "opener");
      if (opener) rows.push({ draft: opener, nodeId: node.id, where, blocksNow });
      const plan = project.drafts.find((d): d is ProcedureDraft => isProcedure(d) && d.nodeId === node.id);
      if (plan) {
        rows.push({ draft: plan, nodeId: node.id, where, pictureWords: plan.steps.map((s) => `picture ${node.pictures.findIndex((p) => p.id === s.pictureId) + 1}`), blocksNow: node.page?.blocks.length ?? 0 });
      }
      for (const box of project.drafts.filter((d): d is BoxDraft => isBox(d) && d.nodeId === node.id)) {
        rows.push({ draft: box, nodeId: node.id, where, evidenceFound: blockWithEvidence(node.page?.blocks ?? [], box.evidence) >= 0, blocksNow });
      }
      const summary = project.drafts.find((d): d is ChapterTextDraft => isChapterText(d) && d.nodeId === node.id && d.role === "summary");
      if (summary) rows.push({ draft: summary, nodeId: node.id, where, blocksNow });
      node.pictures.forEach((picture, p) => {
        (picture.callouts ?? []).forEach((callout, c) => {
          const draft = project.drafts.find((d): d is SentenceDraft => isSentence(d) && d.pictureId === picture.id && d.calloutId === callout.id);
          if (!draft) return;
          const letter = letterFor(c);
          rows.push({
            draft,
            nodeId: node.id,
            where,
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

/** How many drafts are waiting (those whose callout or topic is still there). */
export function draftCount(project: Project): number {
  return draftRows(project).length;
}

/** Is a procedure draft waiting for this topic? */
export function procedureWaiting(project: Project, nodeId: string): boolean {
  return draftRows(project).some((r) => isProcedure(r.draft) && r.nodeId === nodeId);
}

/** Throws away drafts whose callout or topic is gone. */
export function pruneDrafts(project: Project): void {
  project.drafts = cleanDrafts(project.drafts, project.tree);
}

const loose = (text: string): string => text.replace(/\s+/g, " ").trim();

/** The position of the block whose words contain this sentence (white space aside), or -1. */
export function blockWithEvidence(blocks: Block[], evidence: string): number {
  const wanted = loose(evidence);
  return wanted === "" ? -1 : blocks.findIndex((b) => loose(blockText(b)).includes(wanted));
}

/** Is an opener or a summary draft waiting for this topic? */
export function chapterTextWaiting(project: Project, nodeId: string, role: "opener" | "summary"): boolean {
  return project.drafts.some((d) => isChapterText(d) && d.nodeId === nodeId && d.role === role) && draftRows(project).some((r) => isChapterText(r.draft) && r.nodeId === nodeId && r.draft.role === role);
}

export type AcceptResult = { ok: true; where: string; words: string } | { ok: false; words: string };

/**
 * The author accepts a draft, perhaps after changing its words. `texts` are the words to use, one for a sentence and one for each step of a procedure; a missing one means the draft's own.
 * A sentence becomes the callout's real sentence (replacing what was there). A procedure becomes a numbered procedure block at the end of the topic's page, each step with its picture. The draft is gone either way
 * and nothing else changes.
 */
export function acceptDraft(project: Project, draftId: string, texts?: string | string[], options: { boxKind?: CalloutKind } = {}): AcceptResult {
  const draft = project.drafts.find((d) => d.id === draftId);
  if (!draft) return { ok: false, words: "That draft is no longer waiting." };
  const given = texts === undefined ? [] : Array.isArray(texts) ? texts : [texts];
  const numbers = numbering(project.tree);
  const drop = () => { project.drafts = project.drafts.filter((d) => d.id !== draftId); };

  if (isSentence(draft)) {
    const place = findCallout(project.tree, draft.pictureId, draft.calloutId);
    if (!place) {
      drop();
      return { ok: false, words: "The callout this draft was for is gone, so the draft was dropped." };
    }
    const sentence = squeeze(given[0] ?? draft.text, MOST_TEXT);
    if (sentence === "") return { ok: false, words: "A sentence is needed. Write one, or reject the draft." };
    place.callout.description = sentence;
    drop();
    const where = `${numbers.get(place.node.id) ?? ""} ${place.node.title}`.trim();
    const name = place.callout.name.trim();
    const what = name ? `${letterFor(place.index)}: ${name}` : letterFor(place.index);
    return { ok: true, where, words: `Accepted for callout ${what} in ${where}.` };
  }

  const node = findNode(project.tree, draft.nodeId);
  if (!node) {
    drop();
    return { ok: false, words: "The topic this draft was for is gone, so the draft was dropped." };
  }
  const whereNode = `${numbers.get(node.id) ?? ""} ${node.title}`.trim();

  if (isChapterText(draft)) {
    const prose = squeeze(given[0] ?? draft.text, MOST_PROSE);
    if (prose === "") return { ok: false, words: draft.role === "opener" ? "The opener needs some words. Write them, or reject the draft." : "The summary needs some words. Write them, or reject the draft." };
    const block = makeBlock("paragraph") as ParagraphBlock;
    block.text = parseMarks(prose);
    const page = ensurePage(node);
    if (draft.role === "opener") page.blocks.unshift(block);
    else page.blocks.push(block);
    drop();
    return { ok: true, where: whereNode, words: draft.role === "opener" ? `Added the opener to the top of the page of ${whereNode}.` : `Added the summary to the end of the page of ${whereNode}.` };
  }

  if (isBox(draft)) {
    const note = squeeze(given[0] ?? draft.text, MOST_TEXT);
    if (note === "") return { ok: false, words: "The box needs some words. Write them, or reject the draft." };
    const kind = CALLOUT_KINDS.find((k) => k.id === options.boxKind)?.id ?? draft.boxKind;
    const block = makeBlock("callout", { kind }) as CalloutBlock;
    block.text = parseMarks(note);
    const page = ensurePage(node);
    const after = blockWithEvidence(page.blocks, draft.evidence);
    page.blocks.splice(after >= 0 ? after + 1 : page.blocks.length, 0, block);
    drop();
    return { ok: true, where: whereNode, words: `Added a ${calloutLabel(kind)} box to the page of ${whereNode}${after >= 0 ? ", right after the text it rests on" : ""}.` };
  }

  const have = new Set(node.pictures.map((p) => p.id));
  const steps: Step[] = [];
  for (let i = 0; i < draft.steps.length; i++) {
    const planned = draft.steps[i];
    if (!have.has(planned.pictureId)) continue; // the picture has gone since: the step loses it
    const text = squeeze(given[i] ?? planned.text, MOST_TEXT);
    if (text === "") return { ok: false, words: `Step ${i + 1} has no words. Write it, or reject the draft.` };
    steps.push({ id: newId(), text: parseMarks(text), pictureId: planned.pictureId });
  }
  if (steps.length === 0) {
    drop();
    return { ok: false, words: "The pictures this procedure was made from are gone, so the draft was dropped." };
  }
  const block = makeBlock("procedure") as ProcedureBlock;
  block.steps = steps;
  ensurePage(node).blocks.push(block);
  drop();
  const where = `${numbers.get(node.id) ?? ""} ${node.title}`.trim();
  return { ok: true, where, words: `Added a numbered procedure of ${steps.length} ${steps.length === 1 ? "step" : "steps"} to the end of the page of ${where}.` };
}

/** The author rejects a draft: it is gone and nothing else changes. */
export function rejectDraft(project: Project, draftId: string): boolean {
  const before = project.drafts.length;
  project.drafts = project.drafts.filter((d) => d.id !== draftId);
  return project.drafts.length < before;
}
