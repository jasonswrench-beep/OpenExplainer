// Drafting a sentence for each callout that has none (part 4 of docs/local-ai-plan.md). The model is only ever given WORDS from the capture: the callout's name, what Windows said about the clicked
// item (its kind, shortcut, access key and description), the other callouts' names and sentences on the picture, the topic and chapter titles and the author's writing-style notes. Never a picture,
// never anything typed, nothing at all for a password box.
//
// A small model invents things when it has little to go on, even when told not to (tried on the real model, 2026-10-21). So the guards are code, not instructions:
//   - a callout is drafted only if there is something real to write from (`cluesFor`);
//   - every answer is checked before it is kept (`checkSentence`): one plain sentence, and no capitalised name that is not in the clues;
//   - a kept draft carries the clues it was given, so the author sees them in the review list and can judge.
// Nothing here touches the screen; the model is reached through the `ask` it is handed.
import { letterFor, type Callout, type CalloutRect } from "../project/callouts.ts";
import { addDraft, type CalloutPlace } from "../project/drafts.ts";
import { numbering, type Picture, type Project, type TreeNode } from "../project/model.ts";
import { AiError, type AiErrorCode, type Answer, type AskOptions, type ChatMessage } from "./types.ts";

// ---- Is there anything real to write from? ------------------------------------------------------------------------------------

/** Names that are not names: a number, only punctuation, or what a program calls a part of itself when it has no better word. */
const PLACEHOLDER = /^(button|pane|window|item|unknown|static|text|edit|group|custom|tab|document|image|icon|list|menu|toolbar|panel|label|control|element|dialog|titlebar|title bar|client|screen|area|box|field|view|frame)\s*\d*$/i;

/** Does this name say what the thing is? */
export function isRealName(name: string): boolean {
  const n = name.replace(/\s+/g, " ").trim();
  if (n.length < 2) return false;
  if (/^[\d\W_]+$/.test(n)) return false;
  return !PLACEHOLDER.test(n);
}

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const area = (r: CalloutRect) => r.width * r.height;

/** How much of the smaller of two rectangles is covered by the other, from 0 to 1. */
function overlap(a: CalloutRect, b: CalloutRect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.max(1, Math.min(area(a), area(b)));
}

/** Is this callout the one made from the click (so what Windows said about the clicked item is about it)? */
function isClickItem(picture: Picture, callout: Callout): boolean {
  const click = picture.click;
  if (!click) return false;
  const bounds = click.target?.bounds;
  if (bounds) return overlap(callout.target, bounds) >= 0.5;
  const t = callout.target;
  return click.x >= t.x && click.x <= t.x + t.width && click.y >= t.y && click.y <= t.y + t.height;
}

/** The chain of topics from a chapter down to the topic with this id. */
function pathTo(tree: TreeNode[], id: string): TreeNode[] {
  for (const node of tree) {
    if (node.id === id) return [node];
    const deeper = pathTo(node.children ?? [], id);
    if (deeper.length > 0) return [node, ...deeper];
  }
  return [];
}

export interface Clues {
  /** Can a sentence be written from these? */
  draftable: boolean;
  /** If not, why, in words that finish "it ...". */
  whyNot?: string;
  /** What the model is given, one plain line each. Kept with the draft. */
  lines: string[];
  /** The names the sentence may mention. */
  names: string[];
}

/** The clues for one callout. */
export function cluesFor(project: Project, place: CalloutPlace): Clues {
  const { node, picture, callout } = place;
  const click = picture.click;
  const clicked = isClickItem(picture, callout);
  const target = clicked ? click?.target : undefined;
  const ownName = callout.name.trim();
  const name = isRealName(ownName) ? ownName : !ownName && target?.name && isRealName(target.name) ? target.name : "";
  const description = target?.description?.trim() ?? "";
  const role = target?.role?.trim() ?? "";

  if (target?.password) return { draftable: false, whyNot: "is a password box, which is never described", lines: [], names: [] };
  if (!name && wordCount(description) < 3) {
    return { draftable: false, whyNot: ownName ? `has the name "${ownName}", which does not say what it is, and Windows gave no description of it` : "has no name, and Windows gave no description of it", lines: [], names: [] };
  }

  const path = pathTo(project.tree, node.id);
  const chapter = path.length > 1 ? path[0].title : "";
  const lines: string[] = [`Topic: ${node.title}${chapter ? ` (chapter: ${chapter})` : ""}`];
  lines.push(name ? `Item: ${role ? `${role} ` : ""}named "${name}"` : `Item: ${role || "item"} with no name`);
  if (target?.acceleratorKey) lines.push(`Keyboard shortcut: ${target.acceleratorKey}`);
  if (target?.accessKey) lines.push(`Access key: ${target.accessKey}`);
  if (description) lines.push(`Windows describes it as: "${description}"`);
  const others = (picture.callouts ?? []).filter((c) => c.id !== callout.id);
  const otherNames = others.map((c) => c.name.trim()).filter(isRealName).slice(0, 8);
  lines.push(otherNames.length > 0 ? `Other items on the same picture: ${otherNames.map((n) => `"${n}"`).join(", ")}` : "Other items on the same picture: none");
  const written = others.filter((c) => isRealName(c.name.trim()) && c.description.trim()).slice(0, 4);
  if (written.length > 0) lines.push(`Sentences already written for this picture: ${written.map((c) => `"${c.name.trim()}": "${c.description.trim()}"`).join("; ")}`);
  return { draftable: true, lines, names: [...new Set([name, target?.name ?? "", ...otherNames].filter(isRealName))] };
}

// ---- What the model is asked ----------------------------------------------------------------------------------------------------

const RULES = `You write the one-sentence explanations in the "what each part does" list under a screenshot in a software manual.
Rules:
- One plain sentence of 6 to 20 words, in the present tense, saying what the item does for the reader.
- Use only the clues you are given. Describe only this item. Do not name or describe any other control, menu, folder, program or feature, and do not invent what it does.
- Do not use quotation marks, bold, lists or any other formatting.
- Write the sentence and nothing else.`;

export function buildMessages(clues: Clues, writingStyle: string): ChatMessage[] {
  const style = writingStyle.trim();
  return [
    { role: "system", content: style ? `${RULES}\nNotes from the author about the writing style:\n${style}` : RULES },
    { role: "user", content: `${clues.lines.join("\n")}\nWrite the sentence.` },
  ];
}

// ---- Is the answer fit to keep? -------------------------------------------------------------------------------------------------

export type Checked = { ok: true; text: string } | { ok: false; why: string };

const tokens = (text: string): string[] => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * Checks what the model wrote. A sentence is kept only if it is one plain sentence of 3 to 30 words, with no quotation marks or formatting, and every capitalised word inside it (not the first) is a word from the clues,
 * so it cannot name a control, folder or program that is not in the capture.
 */
export function checkSentence(raw: string, clues: Clues): Checked {
  let text = raw.replace(/\*\*|`|\*/g, "").trim();
  if (/^needs info/i.test(text)) return { ok: false, why: "the model said there was not enough to go on" };
  text = text.replace(/^(?:[-•]\s+|\d+[.)]\s+)/, "").trim();
  if (/[\r\n]/.test(text)) return { ok: false, why: "it was more than one line" };
  if (/["“”]/.test(text)) return { ok: false, why: "it had quotation marks in it" };
  const words = wordCount(text);
  if (words < 3) return { ok: false, why: "it was too short to say anything" };
  if (words > 30) return { ok: false, why: "it was too long for one sentence" };
  if (/[.!?]\s+\S/.test(text)) return { ok: false, why: "it was more than one sentence" };
  if (!/[.!?]$/.test(text)) text += ".";
  if (text.length > 300) return { ok: false, why: "it was too long for one sentence" };
  const allowed = new Set(tokens(clues.lines.join(" ")).map((t) => t.toLowerCase()));
  const found = tokens(text).slice(1).find((t) => t.length >= 2 && /^\p{Lu}/u.test(t) && !allowed.has(t.toLowerCase()));
  if (found) return { ok: false, why: `it mentioned "${found}", which is not in the capture` };
  return { ok: true, text };
}

// ---- The job --------------------------------------------------------------------------------------------------------------------

export interface DraftJob {
  project: Project;
  /** The topic to draft for, and one of its pictures if only that picture is wanted. */
  nodeId: string;
  pictureId?: string;
  ask(messages: ChatMessage[], options: AskOptions): Promise<Answer>;
  /** The model's file name, kept with each draft. */
  model: string;
  now(): string;
  signal?: AbortSignal;
  onProgress?(done: number, total: number, words: string): void;
}

export interface DraftReport {
  made: number;
  /** Callouts nothing could be written for, with why. */
  skipped: Array<{ where: string; callout: string; why: string }>;
  /** Answers that were not kept, with why. */
  thrownAway: Array<{ where: string; callout: string; why: string }>;
  /** Callouts that already had a draft waiting, which were left alone. */
  alreadyWaiting: number;
  /** Set if the job stopped before the end. */
  stopped?: { code: AiErrorCode; words: string };
  /** Callouts that needed a sentence and could be drafted (the length of the job). */
  total: number;
}

function walkNode(tree: TreeNode[], id: string): TreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    const deeper = walkNode(node.children ?? [], id);
    if (deeper) return deeper;
  }
  return null;
}

/** Drafts a sentence for each callout without one in a topic (or on one of its pictures). Drafts go into the project; nothing else in it changes. */
export async function draftCallouts(job: DraftJob): Promise<DraftReport> {
  const report: DraftReport = { made: 0, skipped: [], thrownAway: [], alreadyWaiting: 0, total: 0 };
  const node = walkNode(job.project.tree, job.nodeId);
  if (!node) return report;
  const numbers = numbering(job.project.tree);
  const where = `${numbers.get(node.id) ?? ""} ${node.title}`.trim();

  const todo: Array<{ place: CalloutPlace; clues: Clues; label: string }> = [];
  for (const picture of node.pictures) {
    if (job.pictureId && picture.id !== job.pictureId) continue;
    (picture.callouts ?? []).forEach((callout, index) => {
      if (callout.description.trim() !== "") return;
      const label = `${letterFor(index)}${callout.name.trim() ? ` (${callout.name.trim()})` : ""}`;
      if (job.project.drafts.some((d) => d.pictureId === picture.id && d.calloutId === callout.id)) {
        report.alreadyWaiting++;
        return;
      }
      const place: CalloutPlace = { node, picture, callout, index };
      const clues = cluesFor(job.project, place);
      if (!clues.draftable) report.skipped.push({ where, callout: label, why: clues.whyNot ?? "there is nothing to write from" });
      else todo.push({ place, clues, label });
    });
  }
  report.total = todo.length;

  let done = 0;
  for (const item of todo) {
    if (job.signal?.aborted) {
      report.stopped = { code: "cancelled", words: "Stopped." };
      break;
    }
    job.onProgress?.(done, todo.length, `Drafting ${done + 1} of ${todo.length}: callout ${item.label} in ${where}`);
    let answer: Answer;
    try {
      answer = await job.ask(buildMessages(item.clues, job.project.writingStyle), { maxTokens: 90, temperature: 0.3, signal: job.signal });
    } catch (error) {
      if (error instanceof AiError && error.code === "bad-answer") {
        report.thrownAway.push({ where, callout: item.label, why: error.message });
        done++;
        continue;
      }
      report.stopped = error instanceof AiError ? { code: error.code, words: error.message } : { code: "failed", words: `The drafting stopped because of a problem. ${error instanceof Error ? error.message : String(error)}` };
      break;
    }
    done++;
    if (answer.truncated) {
      report.thrownAway.push({ where, callout: item.label, why: "it ran out of room before the end of the sentence" });
      continue;
    }
    const checked = checkSentence(answer.text, item.clues);
    if (!checked.ok) {
      report.thrownAway.push({ where, callout: item.label, why: checked.why });
      continue;
    }
    const kept = addDraft(job.project, { kind: "callout-sentence", pictureId: item.place.picture.id, calloutId: item.place.callout.id, text: checked.text, clues: item.clues.lines, madeAt: job.now(), model: job.model });
    if (kept) report.made++;
  }
  job.onProgress?.(done, todo.length, "Finished.");
  return report;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What happened, in plain sentences, for the author. */
export function reportWords(report: DraftReport): string[] {
  const lines: string[] = [];
  if (report.made > 0) lines.push(`${plural(report.made, "sentence was", "sentences were")} drafted. They wait in AI drafts until you accept or reject each one.`);
  if (report.stopped) lines.push(report.stopped.code === "cancelled" ? "The drafting was stopped." : report.stopped.words);
  if (report.skipped.length > 0) {
    const list = report.skipped.slice(0, 5).map((s) => `callout ${s.callout} in ${s.where} (it ${s.why})`).join("; ");
    lines.push(`${plural(report.skipped.length, "callout was", "callouts were")} left alone because there is nothing in the capture to write from: ${list}${report.skipped.length > 5 ? `; and ${report.skipped.length - 5} more` : ""}. Give them names first.`);
  }
  if (report.thrownAway.length > 0) {
    const list = report.thrownAway.slice(0, 3).map((t) => `callout ${t.callout} (${t.why})`).join("; ");
    lines.push(`${plural(report.thrownAway.length, "answer was", "answers were")} thrown away: ${list}${report.thrownAway.length > 3 ? `; and ${report.thrownAway.length - 3} more` : ""}.`);
  }
  if (report.alreadyWaiting > 0) lines.push(`${plural(report.alreadyWaiting, "callout already has", "callouts already have")} a draft waiting.`);
  if (lines.length === 0) lines.push("Every callout here already has a sentence, so there was nothing to draft.");
  if (report.made === 0 && !report.stopped && lines.length > 0 && report.total > 0) lines.unshift("No drafts were made.");
  return lines;
}
