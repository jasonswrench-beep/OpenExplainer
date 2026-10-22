// Suggesting boxed notes (part 6b of docs/local-ai-plan.md). The model reads ONE topic's words and points to up to three sentences in its paragraphs that a reader could easily miss, each with a short boxed note. Every box rests on a
// sentence the topic already says, and the program checks that in code: the sentence must be found word for word in a paragraph of the topic, so a box cannot be invented. The model chooses the kind of box badly (tried on the real model,
// 2026-10-22: it called a warning that work is lost a Design Tip, and "Printing can take a few minutes" a Time Saver), so a rule makes it a Caution when the sentence says work can be lost, and otherwise the kind is only a starting
// choice the author changes in the list: the model over-uses Caution (in the same try it called "Printing a long document can take a few minutes" a Caution), so a Caution the rule does not back starts as a Design Tip. The author reads
// every suggestion, next to the sentence it rests on, before it goes anywhere (src/drafts-dialog.ts). Nothing here touches the screen; the model is reached through the `ask` it is handed.
import { findNode, type Project } from "../project/model.ts";
import { addDraft, boxWaiting, blockWithEvidence, type BoxDraft } from "../project/drafts.ts";
import { calloutLabel, type CalloutKind } from "../project/page.ts";
import { blockText, splitSentences, topicText } from "../project/page-text.ts";
import { cutAt } from "./chapter-text.ts";
import { AiError, type AiErrorCode, type Answer, type AskOptions, type ChatMessage } from "./types.ts";

/** The most boxes suggested for one topic. */
export const MOST_BOXES = 3;
/** The most letters of the topic given to the model. */
export const MOST_TOPIC = 6000;
/** The kinds the model may name. "New in this version" is for the author to choose, never a guess. */
export const SUGGESTED_KINDS: CalloutKind[] = ["caution", "design-tip", "power-tip", "time-saver", "bright-idea"];

const loose = (text: string): string => text.replace(/\s+/g, " ").trim();
const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;
/** A sentence compared without capitals, final stop or the spacing. */
const bare = (text: string): string => loose(text).toLowerCase().replace(/[.!?\s]+$/u, "");

/** Does this sentence say work can be lost, replaced, overwritten or deleted, or that something cannot be undone? Then the box is a Caution, whatever the model said. */
export function warnsOfLoss(sentence: string): boolean {
  return /\b(?:lost|lose|loses|losing|replace|replaces|replaced|overwrite|overwrites|overwritten|overwriting|delete|deletes|deleted|erase|erases|erased|permanent|permanently|cannot be undone|can't be undone|can not be undone|no way to undo)\b/i.test(sentence);
}

// ---- What the model is asked --------------------------------------------------------------------------------------------------

const RULES = `You read one topic of a software manual. Pick out up to three sentences that a reader could easily miss and would be glad to see in a boxed note, and write the note for each.
Each box has:
- evidence: one sentence copied from a paragraph of the topic exactly, word for word. Not from the numbered steps.
- text: the evidence sentence said again as a short note for the reader, in other words. Add nothing: no reasons, no results, no advice and no facts that the evidence sentence does not say. One short sentence.
- kind: caution (something can go wrong or be lost), design-tip (advice on doing it well), power-tip (a quicker or more advanced way), time-saver (how to save time), bright-idea (a good way to use it).
Speak to the reader as you. Do not use quotation marks in text. If nothing in the topic deserves a box, return an empty list.
Example. Evidence: Deleting a photo from the album removes it from every device. Text: The photo disappears from all your devices when you delete it. Kind: caution.
Example. Evidence: The Zoom slider changes the size of the page on the screen. Text: The Zoom slider makes the page bigger or smaller on the screen. Kind: power-tip.`;
// Tried on the real model (2026-10-22): asked only to "say what the evidence says in the way that helps the reader most" it added reasons and results the topic never gives ("the printer is likely still working in the background"); asked to
// say it again in other words and add nothing, with two examples, it stayed with the sentence.

/** The shape the answer must have. The server is told to produce exactly this (valid JSON every time, tried on the real model); the program checks it again. Evidence comes first so the model copies the sentence before it writes the note. */
export const BOX_SCHEMA = {
  type: "object",
  properties: {
    boxes: {
      type: "array",
      maxItems: MOST_BOXES,
      items: {
        type: "object",
        properties: { evidence: { type: "string" }, text: { type: "string" }, kind: { type: "string", enum: SUGGESTED_KINDS } },
        required: ["evidence", "text", "kind"],
        additionalProperties: false,
      },
    },
  },
  required: ["boxes"],
  additionalProperties: false,
};

export interface TopicMaterial {
  title: string;
  /** The topic's words as the model reads them (paragraphs, headings, boxes, steps), cut if long. */
  text: string;
  shortened: boolean;
  /** The sentences of the topic's paragraphs that a box could rest on. */
  sentences: string[];
}

/** A sentence that can be the evidence for a box: from a paragraph, long enough to say something. */
const MOST_EVIDENCE_WORDS = 60;
const LEAST_EVIDENCE_WORDS = 5;

export function topicMaterial(project: Project, nodeId: string): TopicMaterial | null {
  const node = findNode(project.tree, nodeId);
  if (!node) return null;
  const all = topicText(node);
  const text = cutAt(all, MOST_TOPIC);
  const sentences = (node.page?.blocks ?? [])
    .filter((b) => b.type === "paragraph")
    .flatMap((b) => splitSentences(blockText(b)))
    .filter((s) => wordCount(s) >= LEAST_EVIDENCE_WORDS && wordCount(s) <= MOST_EVIDENCE_WORDS);
  return { title: node.title, text, shortened: text.length < all.length, sentences };
}

export function buildBoxMessages(material: TopicMaterial, writingStyle: string): ChatMessage[] {
  const style = writingStyle.trim();
  return [
    { role: "system", content: style ? `${RULES}\nNotes from the author about the writing style:\n${style}` : RULES },
    { role: "user", content: `Topic: ${material.title}\n\n${material.text}\n\nSuggest the boxes.` },
  ];
}

/** Can boxes be suggested for this topic? If not, why, in words. */
export function boxesPossible(project: Project, nodeId: string): { ok: true } | { ok: false; words: string } {
  const node = findNode(project.tree, nodeId);
  if (!node) return { ok: false, words: "That topic was not found." };
  if (boxWaiting(project, nodeId)) return { ok: false, words: "Suggested boxes are already waiting for this topic. Open Drafts and accept or reject them first." };
  const material = topicMaterial(project, nodeId);
  if (!material || material.sentences.length === 0) return { ok: false, words: "This topic has no paragraph text to rest a box on yet. Write its paragraphs first." };
  return { ok: true };
}

// ---- Is the answer fit to keep? -----------------------------------------------------------------------------------------------

const tokens = (text: string): string[] => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export interface Suggestion {
  boxKind: CalloutKind;
  text: string;
  evidence: string;
  /** Why this kind: "rule" when the sentence says work can be lost, "model" when it is the model's suggestion, "changed" when the model said Caution but the sentence does not say work can be lost. */
  kindBy: "rule" | "model" | "changed";
}

export interface Checked {
  kept: Suggestion[];
  /** Why each box that was not kept was thrown away, in words. */
  thrownAway: string[];
  /** True if the answer was well formed JSON with a list of boxes, empty or not. */
  understood: boolean;
}

/**
 * Checks what the model wrote. A box is kept only if its evidence is a whole sentence of one of the topic's paragraphs (so it rests on something the topic says) that is not already inside a box on the page, its note is one or two plain
 * sentences that do not just repeat the evidence, with no quotation marks and no capitalised word in mid-sentence that is not in the topic, its titles or the style notes. At most three are kept, in the order they appear on the page.
 */
export function checkBoxes(raw: string, project: Project, nodeId: string): Checked {
  const checked: Checked = { kept: [], thrownAway: [], understood: false };
  const node = findNode(project.tree, nodeId);
  const material = topicMaterial(project, nodeId);
  if (!node || !material) return checked;
  let list: unknown;
  try {
    list = (JSON.parse(raw) as { boxes?: unknown }).boxes;
  } catch {
    checked.thrownAway.push("the answer was not in the expected form");
    return checked;
  }
  if (!Array.isArray(list)) {
    checked.thrownAway.push("the answer was not in the expected form");
    return checked;
  }
  checked.understood = true;
  const blocks = node.page?.blocks ?? [];
  const boxes = blocks.filter((b) => b.type === "callout").map((b) => bare(blockText(b)));
  const allowed = new Set(tokens([node.title, material.text, project.writingStyle].join(" ")).map((t) => t.toLowerCase()));
  const sentenceSet = new Set(material.sentences.map(bare));
  const seen = new Set<string>();
  const found: Array<Suggestion & { at: number }> = [];

  for (const item of list) {
    const entry = typeof item === "object" && item !== null ? (item as { evidence?: unknown; text?: unknown; kind?: unknown }) : {};
    const evidence = typeof entry.evidence === "string" ? loose(entry.evidence) : "";
    const text = typeof entry.text === "string" ? loose(entry.text.replace(/\*\*|`|\*/g, "")) : "";
    if (evidence === "" || text === "") {
      checked.thrownAway.push("a box had no sentence to rest on, or no words");
      continue;
    }
    const at = blockWithEvidence(blocks, evidence);
    if (!sentenceSet.has(bare(evidence)) || at < 0 || blocks[at].type !== "paragraph") {
      checked.thrownAway.push(`a box rested on a sentence that is not in the topic's paragraphs ("${evidence.slice(0, 60)}")`);
      continue;
    }
    if (seen.has(bare(evidence))) continue;
    seen.add(bare(evidence));
    if (boxes.some((b) => b.includes(bare(evidence)) || bare(text) === b)) {
      checked.thrownAway.push("a box repeated one already on the page");
      continue;
    }
    if (/["“”]/.test(text)) {
      checked.thrownAway.push("a note had quotation marks in it");
      continue;
    }
    const count = wordCount(text);
    const sentences = splitSentences(/[.!?]$/.test(text) ? text : `${text}.`);
    if (count < 4 || count > 45 || sentences.length > 2) {
      checked.thrownAway.push(count < 4 ? "a note was too short to say anything" : "a note was too long (a box holds one or two short sentences)");
      continue;
    }
    if (bare(text) === bare(evidence)) {
      checked.thrownAway.push("a note only repeated the sentence it rests on");
      continue;
    }
    const stranger = sentences.flatMap((s) => tokens(s).slice(1)).find((t) => t.length >= 2 && /^\p{Lu}/u.test(t) && !allowed.has(t.toLowerCase()));
    if (stranger) {
      checked.thrownAway.push(`a note mentioned "${stranger}", which is not in the topic`);
      continue;
    }
    const named = SUGGESTED_KINDS.find((k) => k === entry.kind);
    const byRule = warnsOfLoss(evidence) || warnsOfLoss(text);
    const kindBy = byRule ? "rule" : named === "caution" ? "changed" : "model";
    found.push({ boxKind: byRule ? "caution" : named === undefined || named === "caution" ? "design-tip" : named, text: /[.!?]$/.test(text) ? text : `${text}.`, evidence, kindBy, at });
  }
  found.sort((a, b) => a.at - b.at);
  checked.kept = found.slice(0, MOST_BOXES).map(({ at: _at, ...rest }) => rest);
  if (found.length > MOST_BOXES) checked.thrownAway.push(`only the first ${MOST_BOXES} boxes on the page were kept`);
  return checked;
}

// ---- The job ------------------------------------------------------------------------------------------------------------------

export interface BoxJob {
  project: Project;
  nodeId: string;
  ask(messages: ChatMessage[], options: AskOptions): Promise<Answer>;
  model: string;
  now(): string;
  signal?: AbortSignal;
  onProgress?(words: string): void;
}

export interface BoxReport {
  /** How many suggestions were put in Drafts. */
  made: number;
  /** True if the model looked and found nothing worth a box. */
  nothingFound: boolean;
  /** Why boxes were thrown away, in words. */
  thrownAway: string[];
  /** Set if the job stopped for a reason outside the text. */
  stopped?: { code: AiErrorCode; words: string };
}

const kindWords = (s: Suggestion): string =>
  s.kindBy === "rule"
    ? `Kind: ${calloutLabel(s.boxKind)}, because the sentence says work can be lost or replaced (a rule, not the model).`
    : s.kindBy === "changed"
      ? `Kind: ${calloutLabel(s.boxKind)}. The model said Caution, but the sentence does not say work can be lost, so it starts as ${calloutLabel(s.boxKind)}. Change it if it does not fit.`
      : `Kind: ${calloutLabel(s.boxKind)}, the model's suggestion. Change it if it does not fit.`;

/** Suggests boxes for one topic: at most three, after at most two tries. Changes nothing in the book; the suggestions wait in Drafts. */
export async function draftBoxes(job: BoxJob): Promise<BoxReport> {
  const report: BoxReport = { made: 0, nothingFound: false, thrownAway: [] };
  const material = topicMaterial(job.project, job.nodeId);
  if (!material || material.sentences.length === 0) {
    report.thrownAway.push("there was no paragraph text to work from");
    return report;
  }
  const messages = buildBoxMessages(material, job.project.writingStyle);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (job.signal?.aborted) {
      report.stopped = { code: "cancelled", words: "Stopped." };
      return report;
    }
    job.onProgress?.(attempt === 0 ? `Reading "${material.title}" and looking for sentences worth a box.` : "Trying once more.");
    let answer: Answer;
    try {
      answer = await job.ask(messages, { maxTokens: 450, temperature: attempt === 0 ? 0.3 : 0.6, signal: job.signal, jsonSchema: BOX_SCHEMA });
    } catch (error) {
      if (error instanceof AiError && error.code === "bad-answer") {
        report.thrownAway.push(error.message);
        continue;
      }
      report.stopped = error instanceof AiError ? { code: error.code, words: error.message } : { code: "failed", words: `The drafting stopped because of a problem. ${error instanceof Error ? error.message : String(error)}` };
      return report;
    }
    if (answer.truncated) {
      report.thrownAway.push("it ran out of room before the end");
      continue;
    }
    const checked = checkBoxes(answer.text, job.project, job.nodeId);
    report.thrownAway.push(...checked.thrownAway);
    if (checked.understood && checked.kept.length === 0 && checked.thrownAway.length === 0) {
      report.nothingFound = true;
      return report;
    }
    if (checked.kept.length === 0) continue;
    const waiting = new Set(job.project.drafts.filter((d): d is BoxDraft => d.kind === "box" && d.nodeId === job.nodeId).map((d) => bare(d.evidence)));
    for (const s of checked.kept) {
      if (waiting.has(bare(s.evidence))) continue;
      const clues = [
        `Topic: ${material.title}`,
        `Rests on the sentence: ${s.evidence}`,
        kindWords(s),
        ...(material.shortened ? ["The topic was long, so its end was cut short to fit."] : []),
        job.project.writingStyle.trim() ? "The writing-style notes were used." : "There were no writing-style notes.",
      ];
      const kept = addDraft(job.project, { kind: "box", nodeId: job.nodeId, boxKind: s.boxKind, text: s.text, evidence: s.evidence, clues, madeAt: job.now(), model: job.model });
      if (kept) report.made++;
    }
    return report;
  }
  return report;
}

/** What happened, in plain sentences, for the author. */
export function boxReportWords(report: BoxReport): string[] {
  if (report.made > 0) {
    return [`${report.made} ${report.made === 1 ? "box was" : "boxes were"} suggested. ${report.made === 1 ? "It waits" : "They wait"} in Drafts until you accept or reject ${report.made === 1 ? "it" : "each"}.`];
  }
  if (report.stopped) return [report.stopped.code === "cancelled" ? "The drafting was stopped." : report.stopped.words];
  if (report.nothingFound) return ["The model read the topic and found no sentence worth a box."];
  const why = report.thrownAway.length > 0 ? ` (${[...new Set(report.thrownAway)].join("; ")})` : "";
  return [`No box was suggested: the model's answers were not fit to keep${why}. You can try again.`];
}
