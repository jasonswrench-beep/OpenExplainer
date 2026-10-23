// The author's list of words to avoid: a word or phrase the book should not use, and what to say instead (format version 16, kept in project.json). The consistency check in the book check finds them
// (src/project/consistency.ts). It is a plain list the author types, not something an AI works out. Everything here works without a screen.

export interface AvoidWord {
  /** The word or phrase the book should not use. */
  avoid: string;
  /** What to use instead. May be empty when there is no one right word. */
  use: string;
}

/** The longest word or phrase, and the most pairs, kept. */
export const MOST_WORD = 60;
export const MOST_AVOID_WORDS = 100;

const squeeze = (value: unknown, most: number): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, most) : "");

/** The list as it should be kept: text only, white space squeezed, nothing empty to avoid, a word once (capitals aside), and no more than 100. */
export function cleanAvoidWords(raw: unknown): AvoidWord[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: AvoidWord[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const avoid = squeeze((item as { avoid?: unknown }).avoid, MOST_WORD);
    if (avoid === "" || /\[\[|\]\]/.test(avoid)) continue;
    const key = avoid.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ avoid, use: squeeze((item as { use?: unknown }).use, MOST_WORD) });
    if (out.length >= MOST_AVOID_WORDS) break;
  }
  return out;
}

/** The list as lines of text the author edits, "avoid => use" (or just "avoid"). */
export function avoidWordsToLines(words: AvoidWord[]): string {
  return words.map((w) => (w.use ? `${w.avoid} => ${w.use}` : w.avoid)).join("\n");
}

/** Lines of text read as a list: "file => document", or just "file". A line with nothing before the arrow is left out. */
export function avoidWordsFromLines(text: string): AvoidWord[] {
  return cleanAvoidWords(
    text.split(/\r?\n/).map((line) => {
      const at = line.indexOf("=>");
      return at >= 0 ? { avoid: line.slice(0, at), use: line.slice(at + 2) } : { avoid: line, use: "" };
    }),
  );
}

/** Says in words how many words and phrases a typed list has and how many lines will be left out. */
export function avoidCountWords(text: string): string {
  const kept = avoidWordsFromLines(text).length;
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "").length;
  const left = lines - kept;
  const said = `${kept} ${kept === 1 ? "word or phrase is" : "words and phrases are"} on the list.`;
  return left > 0 ? `${said} ${left} ${left === 1 ? "line is" : "lines are"} left out: nothing before the arrow, a word that is already there, or more than ${MOST_AVOID_WORDS} lines.` : said;
}
