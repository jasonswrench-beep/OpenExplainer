// The text of a page: plain text with a few marks. It is stored as runs ({ text, mark }) so print, the help site and JSON export can
// each show a mark their own way, and it is edited as plain text in a box using three small marks:
//   **bold**   *italic*   [[Control name]]
// A control name is the label of a button, menu or box exactly as it appears on screen (shown in bold in print). A backslash makes the next
// star or bracket an ordinary letter. Variables such as {{PRODUCT}} are ordinary text here; they are filled in when a book is exported.

export type Mark = "bold" | "italic" | "control" | "link";

/**
 * A piece of text with at most one mark. Neighbours with the same mark are always joined. A link (format version 17) is words that go to another topic: it keeps the topic's id, never its
 * number, so it still goes to the right place when chapters move. It is typed as [words](#topic-id), and the Link to a topic button makes that for the author.
 */
export interface Run {
  text: string;
  mark?: Mark;
  /** For a link: the id of the topic it goes to. */
  topic?: string;
}

/** What a topic id looks like in a saved file and in the typed form of a link. */
export const TOPIC_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const MARKS: { id: Mark; name: string; open: string; close: string }[] = [
  { id: "bold", name: "Bold", open: "**", close: "**" },
  { id: "italic", name: "Italic", open: "*", close: "*" },
  { id: "control", name: "Control name", open: "[[", close: "]]" },
];

const SPECIAL = new Set(["\\", "*", "[", "]"]);

function join(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    if (run.text === "") continue;
    const last = out[out.length - 1];
    if (last && last.mark === run.mark && last.topic === run.topic) last.text += run.text;
    else out.push(run.mark ? { text: run.text, mark: run.mark, ...(run.mark === "link" && run.topic ? { topic: run.topic } : {}) } : { text: run.text });
  }
  return out;
}

function markerAt(source: string, i: number): { mark: Mark; open: string; close: string } | null {
  if (source.startsWith("**", i)) return { mark: "bold", open: "**", close: "**" };
  if (source.startsWith("[[", i)) return { mark: "control", open: "[[", close: "]]" };
  if (source[i] === "*") return { mark: "italic", open: "*", close: "*" };
  return null;
}

/** Where the closing marker is, or -1. The text inside must not be empty or start or end with a space, so `2 * 3 * 4` stays as it is. */
function findClose(source: string, from: number, close: string): number {
  for (let i = from; i < source.length; i++) {
    if (source[i] === "\\") { i++; continue; }
    if (source.startsWith(close, i)) {
      const inner = source.slice(from, i);
      return inner.length > 0 && inner === inner.trim() ? i : -1;
    }
  }
  return -1;
}

function unescape(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && i + 1 < text.length && SPECIAL.has(text[i + 1])) { out += text[i + 1]; i++; } else out += text[i];
  }
  return out;
}

/** A link typed as [words](#topic-id) at `i`: its words, the topic's id and where it ends. The words must not be empty or start or end with a space. `null` when what is there is not a link. */
function linkAt(source: string, i: number): { words: string; topic: string; end: number } | null {
  if (source[i] !== "[" || source[i + 1] === "[") return null;
  let j = i + 1;
  for (; j < source.length; j++) {
    if (source[j] === "\\") { j++; continue; }
    if (source[j] === "]") break;
  }
  if (j >= source.length || !source.startsWith("(#", j + 1)) return null;
  const close = source.indexOf(")", j + 3);
  if (close < 0) return null;
  const topic = source.slice(j + 3, close);
  const inner = source.slice(i + 1, j);
  if (!TOPIC_ID.test(topic) || inner.length === 0 || inner !== inner.trim()) return null;
  return { words: unescape(inner), topic, end: close + 1 };
}

/** Plain text with marks, as typed in a box, to runs. A marker with no partner stays as ordinary text. */
export function parseMarks(source: string): Run[] {
  const runs: Run[] = [];
  let plain = "";
  let i = 0;
  while (i < source.length) {
    if (source[i] === "\\" && i + 1 < source.length && SPECIAL.has(source[i + 1])) {
      plain += source[i + 1];
      i += 2;
      continue;
    }
    const link = linkAt(source, i);
    if (link) {
      runs.push({ text: plain });
      plain = "";
      runs.push({ text: link.words, mark: "link", topic: link.topic });
      i = link.end;
      continue;
    }
    const marker = markerAt(source, i);
    if (marker) {
      const end = findClose(source, i + marker.open.length, marker.close);
      if (end !== -1) {
        runs.push({ text: plain });
        plain = "";
        runs.push({ text: unescape(source.slice(i + marker.open.length, end)), mark: marker.mark });
        i = end + marker.close.length;
        continue;
      }
    }
    plain += source[i];
    i++;
  }
  runs.push({ text: plain });
  return join(runs);
}

function escape(text: string): string {
  let out = "";
  for (const c of text) out += SPECIAL.has(c) ? `\\${c}` : c;
  return out;
}

/** Runs to the text a person edits: the opposite of `parseMarks`. */
export function formatMarks(runs: Run[]): string {
  return runs
    .map((run) => {
      if (run.mark === "link" && run.topic) {
        // The brackets must touch the words, so spaces at the edges are put outside them.
        const lead = run.text.length - run.text.trimStart().length;
        const trail = run.text.length - run.text.trimEnd().length;
        const words = run.text.trim();
        return words ? `${run.text.slice(0, lead)}[${escape(words)}](#${run.topic})${trail ? run.text.slice(run.text.length - trail) : ""}` : escape(run.text);
      }
      const marker = run.mark && run.mark !== "link" ? MARKS.find((m) => m.id === run.mark)! : null;
      return marker ? `${marker.open}${escape(run.text)}${marker.close}` : escape(run.text);
    })
    .join("");
}

/** Words that go to another topic. */
export function linkRun(words: string, topicId: string): Run {
  return { text: words, mark: "link", topic: topicId };
}

/** The words with no marks, for a search, a screen reader label and a contents list. */
export function plainText(runs: Run[]): string {
  return runs.map((run) => run.text).join("");
}

/** Runs read from a saved file: only text with a known mark is kept, empty pieces go and neighbours are joined. */
export function cleanRuns(raw: unknown): Run[] {
  if (!Array.isArray(raw)) return [];
  const runs: Run[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const { text, mark, topic } = item as { text?: unknown; mark?: unknown; topic?: unknown };
    if (typeof text !== "string") continue;
    // A link with no good topic id is only its words.
    if (mark === "link") { runs.push(typeof topic === "string" && TOPIC_ID.test(topic) ? { text, mark: "link", topic } : { text }); continue; }
    runs.push(MARKS.some((m) => m.id === mark) ? { text, mark: mark as Mark } : { text });
  }
  return join(runs);
}

/**
 * Puts a mark round a part of the text in a box: `start` and `end` are the selection. With nothing selected, an empty pair of markers is not
 * made (it would stay as plain text); the caller is told to select something first. Returns the new text and where the selection should be.
 */
export function applyMark(text: string, start: number, end: number, mark: Mark): { text: string; start: number; end: number } | null {
  if (end <= start) return null;
  const marker = MARKS.find((m) => m.id === mark)!;
  const inner = text.slice(start, end);
  if (inner !== inner.trim()) {
    // Spaces at the edges of the selection stay outside the marks, because the markers must touch the words.
    const lead = inner.length - inner.trimStart().length;
    const trail = inner.length - inner.trimEnd().length;
    return applyMark(text, start + lead, end - trail, mark);
  }
  const next = text.slice(0, start) + marker.open + inner + marker.close + text.slice(end);
  return { text: next, start: start + marker.open.length, end: end + marker.open.length };
}
