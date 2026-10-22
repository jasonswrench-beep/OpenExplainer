// Drafting the opener of a chapter and the summary of its topics (part 6a of docs/local-ai-plan.md). The model is given WORDS only: the chapter's and topics' own written text and titles, and the author's writing-style notes. It writes
// from text it is handed, which is what a small model does well (tried on the real model, 2026-10-22); it does not judge text against rules, which it does badly, so nothing here asks it to.
// Every answer is checked in code before it is kept (`checkProse`): plain sentences, the right number of them, no formatting, and no capitalised name that is not in the chapter's own text. The author reads the draft before it goes
// anywhere (src/drafts-dialog.ts). Nothing here touches the screen; the model is reached through the `ask` it is handed.
import { locate, type Project, type TreeNode } from "../project/model.ts";
import { addDraft, chapterTextWaiting } from "../project/drafts.ts";
import { splitSentences, topicText } from "../project/page-text.ts";
import { AiError, type AiErrorCode, type Answer, type AskOptions, type ChatMessage } from "./types.ts";

export type ChapterTextRole = "opener" | "summary";

/** The most letters of the chapter's text given to the model, spread over its topics (a model of this size has a limited memory). */
export const MOST_MATERIAL = 7000;
const LEAST_PER_TOPIC = 400;

export interface Material {
  chapter: string;
  /** The topics that have words, in order, each with its text (cut if the chapter is long). */
  topics: Array<{ title: string; text: string }>;
  /** True if some topic's text was cut short to fit. */
  shortened: boolean;
}

/** Cuts a text at the end of a sentence before `most` letters, or at a space. */
function cutAt(text: string, most: number): string {
  if (text.length <= most) return text;
  const head = text.slice(0, most);
  const end = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  return end > most * 0.5 ? head.slice(0, end + 1) : head.slice(0, Math.max(0, head.lastIndexOf(" ")));
}

function descendants(node: TreeNode): TreeNode[] {
  return node.children.flatMap((c) => [c, ...descendants(c)]);
}

/** The chapter that holds a node (the node itself if it is a chapter). */
export function chapterOf(project: Project, nodeId: string): TreeNode | null {
  let current = locate(project.tree, nodeId);
  if (!current) return null;
  while (current.parent) {
    const up = locate(project.tree, current.parent.id);
    if (!up) break;
    current = up;
  }
  return current.siblings[current.index];
}

/**
 * What the model reads: for an opener, the chapter's own text and all its topics; for a summary, the chapter's topics except the one that is to hold the summary (and anything under it).
 */
export function chapterMaterial(project: Project, nodeId: string, role: ChapterTextRole): Material | null {
  const chapter = chapterOf(project, nodeId);
  if (!chapter) return null;
  const skip = new Set<string>();
  if (role === "summary") {
    const holder = locate(project.tree, nodeId);
    if (holder) {
      const node = holder.siblings[holder.index];
      skip.add(node.id);
      for (const d of descendants(node)) skip.add(d.id);
    }
  }
  const nodes = [chapter, ...descendants(chapter)].filter((n) => !skip.has(n.id));
  const withText = nodes.map((n) => ({ title: n.title, text: topicText(n) })).filter((t) => t.text !== "");
  const share = Math.max(LEAST_PER_TOPIC, Math.floor(MOST_MATERIAL / Math.max(1, withText.length)));
  let shortened = false;
  const topics = withText.map((t) => {
    const text = cutAt(t.text, share);
    if (text.length < t.text.length) shortened = true;
    return { title: t.title, text };
  });
  return { chapter: chapter.title, topics, shortened };
}

/** Can this be drafted here? If not, why, in words. */
export function chapterTextPossible(project: Project, nodeId: string, role: ChapterTextRole): { ok: true } | { ok: false; words: string } {
  const where = locate(project.tree, nodeId);
  if (!where) return { ok: false, words: "That item was not found." };
  const isChapter = where.parent === null;
  if (role === "opener" && !isChapter) return { ok: false, words: "An opener goes at the top of a chapter. Select a chapter (a top-level item in the list of chapters and topics), then try again." };
  if (role === "summary" && isChapter) return { ok: false, words: "A summary goes on a topic inside a chapter, such as a last topic called Summary. Add that topic, select it, then try again." };
  if (chapterTextWaiting(project, nodeId, role)) return { ok: false, words: `A draft of the ${role} is already waiting for this ${isChapter ? "chapter" : "topic"}. Open Drafts and accept or reject it first.` };
  const material = chapterMaterial(project, nodeId, role);
  if (!material || material.topics.length === 0) return { ok: false, words: `There is nothing written in ${role === "opener" ? "this chapter" : "the other topics of this chapter"} yet to write the ${role} from. Write the topics first.` };
  return { ok: true };
}

// ---- What the model is asked --------------------------------------------------------------------------------------------------

const OPENER_RULES = `You write the short introduction at the top of a chapter of a software manual: two or three plain sentences saying what the reader will be able to do after the chapter.
Rules:
- Name the tasks the topics teach (their titles tell you), in plain words. Do not describe the steps and do not say how to do them.
- Use only the topics and text given. Do not invent features, and do not name anything that is not in the text.
- Speak to the reader as you.
- Do not use quotation marks, lists or any other formatting.
- Write the introduction and nothing else.`;

// Tried on the real model (2026-10-22): asked to "restate the key points" it wrote a second introduction ("You will learn how to..."); asked for one fact per sentence taken from the text it wrote a real summary.
const SUMMARY_RULES = `You write the summary at the end of a chapter of a software manual. In three to five short sentences, give the facts a reader should remember from the chapter: what each task is for, and what to watch out for.
Rules:
- Each sentence states one fact taken from the text, in the present tense (for example "Saving over a document replaces it.").
- Never say "you will learn", "this chapter" or "in conclusion". Do not repeat the steps.
- Use only the text given. Do not add advice or features that are not in the text, and do not name anything that is not in the text.
- Speak to the reader as you.
- Do not use quotation marks, lists or any other formatting.
- Write the summary and nothing else.`;

export function buildChapterMessages(material: Material, role: ChapterTextRole, writingStyle: string): ChatMessage[] {
  const style = writingStyle.trim();
  const rules = role === "opener" ? OPENER_RULES : SUMMARY_RULES;
  const body = material.topics.map((t, i) => `Topic ${i + 1}: ${t.title}\n${t.text}`).join("\n\n");
  return [
    { role: "system", content: style ? `${rules}\nNotes from the author about the writing style:\n${style}` : rules },
    { role: "user", content: `Chapter: ${material.chapter}\n\n${body}\n\n${role === "opener" ? "Write the introduction." : "Write the summary."}` },
  ];
}

// ---- Is the answer fit to keep? -----------------------------------------------------------------------------------------------

export type Checked = { ok: true; text: string } | { ok: false; why: string };

const tokens = (text: string): string[] => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

const LIMITS: Record<ChapterTextRole, { least: number; most: number; words: number }> = {
  opener: { least: 2, most: 3, words: 70 },
  summary: { least: 3, most: 5, words: 120 },
};

/**
 * Checks what the model wrote. It is kept only if it is plain sentences (two or three for an opener, three to five for a summary, within a word limit), with no quotation marks, list or formatting, and every capitalised word in it
 * that does not begin a sentence is a word of the chapter's own text, its titles or the writing-style notes, so it cannot name a feature that is not in the book.
 */
export function checkProse(raw: string, role: ChapterTextRole, vocabularyText: string): Checked {
  let text = raw.replace(/\*\*|`|\*/g, "").trim();
  if (/\n\s*\n/.test(text)) return { ok: false, why: "it was more than one paragraph" };
  text = text.replace(/\s*\n\s*/g, " ").trim();
  if (/^(?:[-•]\s|\d+[.)]\s)/.test(text)) return { ok: false, why: "it was written as a list" };
  if (/["“”]/.test(text)) return { ok: false, why: "it had quotation marks in it" };
  if (!/[.!?]$/.test(text)) text += ".";
  const sentences = splitSentences(text);
  const { least, most, words } = LIMITS[role];
  const count = text.split(/\s+/).filter(Boolean).length;
  if (count < 8) return { ok: false, why: "it was too short to say anything" };
  if (sentences.length < least) return { ok: false, why: `it was too short (it needs at least ${least} sentences)` };
  if (sentences.length > most) return { ok: false, why: `it was too long (more than ${most} sentences)` };
  if (count > words) return { ok: false, why: `it was too long (more than ${words} words)` };
  // A summary that says "you will learn" is an introduction in the wrong place (the real model did this when asked to "restate the key points").
  if (role === "summary") {
    const filler = text.match(/\b(?:you will learn|this chapter|in conclusion|in summary|to summarize)\b/i);
    if (filler) return { ok: false, why: `it said "${filler[0].toLowerCase()}", which is an introduction, not a summary` };
  }
  const allowed = new Set(tokens(vocabularyText).map((t) => t.toLowerCase()));
  for (const sentence of sentences) {
    const found = tokens(sentence).slice(1).find((t) => t.length >= 2 && /^\p{Lu}/u.test(t) && !allowed.has(t.toLowerCase()));
    if (found) return { ok: false, why: `it mentioned "${found}", which is not in the chapter's text` };
  }
  return { ok: true, text };
}

// ---- The job ------------------------------------------------------------------------------------------------------------------

export interface ChapterTextJob {
  project: Project;
  /** The chapter for an opener, the topic that is to hold the summary for a summary. */
  nodeId: string;
  role: ChapterTextRole;
  ask(messages: ChatMessage[], options: AskOptions): Promise<Answer>;
  model: string;
  now(): string;
  signal?: AbortSignal;
  onProgress?(words: string): void;
}

export interface ChapterTextReport {
  made: boolean;
  /** Why no draft was made (when `made` is false and it did not stop), in words. */
  thrownAway: string[];
  /** Set if the job stopped for a reason outside the text. */
  stopped?: { code: AiErrorCode; words: string };
}

/** Drafts the opener or the summary. Makes at most one draft, after at most two tries; changes nothing else in the project. */
export async function draftChapterText(job: ChapterTextJob): Promise<ChapterTextReport> {
  const report: ChapterTextReport = { made: false, thrownAway: [] };
  const material = chapterMaterial(job.project, job.nodeId, job.role);
  if (!material || material.topics.length === 0) {
    report.thrownAway.push("there was nothing written to work from");
    return report;
  }
  const messages = buildChapterMessages(material, job.role, job.project.writingStyle);
  const vocabulary = [material.chapter, ...material.topics.flatMap((t) => [t.title, t.text]), job.project.writingStyle].join(" ");
  const maxTokens = job.role === "opener" ? 150 : 230;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (job.signal?.aborted) {
      report.stopped = { code: "cancelled", words: "Stopped." };
      return report;
    }
    job.onProgress?.(attempt === 0 ? `Reading ${material.topics.length} ${material.topics.length === 1 ? "topic" : "topics"} and writing the ${job.role}.` : "Trying once more.");
    let answer: Answer;
    try {
      answer = await job.ask(messages, { maxTokens, temperature: attempt === 0 ? 0.3 : 0.6, signal: job.signal });
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
    const checked = checkProse(answer.text, job.role, vocabulary);
    if (!checked.ok) {
      report.thrownAway.push(checked.why);
      continue;
    }
    const clues = [
      `Chapter: ${material.chapter}`,
      `Read ${material.topics.length} ${material.topics.length === 1 ? "topic" : "topics"}: ${material.topics.map((t) => t.title).join(", ")}`,
      ...(material.shortened ? ["Some long topics were cut short to fit."] : []),
      job.project.writingStyle.trim() ? "The writing-style notes were used." : "There were no writing-style notes.",
    ];
    const kept = addDraft(job.project, { kind: "chapter-text", nodeId: job.nodeId, role: job.role, text: checked.text, clues, madeAt: job.now(), model: job.model });
    report.made = kept !== null;
    return report;
  }
  return report;
}

/** What happened, in plain sentences, for the author. */
export function chapterReportWords(report: ChapterTextReport, role: ChapterTextRole): string[] {
  if (report.made) return [`The ${role} was drafted. It waits in Drafts until you accept or reject it.`];
  if (report.stopped) return [report.stopped.code === "cancelled" ? "The drafting was stopped." : report.stopped.words];
  const why = report.thrownAway.length > 0 ? ` (${[...new Set(report.thrownAway)].join("; ")})` : "";
  return [`No ${role} was drafted: the model's answers were not fit to keep${why}. You can try again.`];
}
