// Translation by file: the book's words written as XLIFF 1.2 (the standard file that translation programs such as OmegaT and Weblate read and write), and a translation read back into a copy
// of the book. The export lists every piece of reader-facing text as a unit with a name that stays the same (src/translate/units.ts), with the marks kept as inline tags (bold, italic, a control name, a link)
// and the {{VARIABLES}} as placeholders the translator cannot break. The import never changes the book it was made from: it makes a copy in the new language, with the translations in place, and says what was
// not translated. Pictures are the same files in the copy; the author replaces them with pictures of the translated program (src/project/replace-picture.ts) and the callouts and marks stay where they are.
// Nothing here needs a screen. See docs/exports.md ("Translation").
import { childNamed, descendantsNamed, parseXml, textOf, type XmlNode } from "../import/xml.ts";
import { languageWords, tidyLanguage } from "../project/language.ts";
import type { Project } from "../project/model.ts";
import type { Run } from "../project/text.ts";
import { translatableUnits, type Unit } from "./units.ts";

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';
/** The file extension of an XLIFF file. */
export const XLIFF_EXTENSION = "xlf";

const VARIABLE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Text made safe for an XML file. Characters XML cannot hold are dropped. */
function escapeXml(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain words with each {{VARIABLE}} as an inline placeholder, so a translator's program keeps it whole. */
function withPlaceholders(text: string, counter: { n: number }): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(VARIABLE)) {
    out += escapeXml(text.slice(last, m.index));
    out += `<x id="v${++counter.n}" ctype="x-variable" equiv-text="${escapeXml(m[0])}"/>`;
    last = (m.index ?? 0) + m[0].length;
  }
  return out + escapeXml(text.slice(last));
}

/** A unit's source as the inside of `<source>`: marks as `<g>` elements numbered by the run they came from, variables as `<x/>`. */
export function sourceMarkup(source: string | Run[]): string {
  const counter = { n: 0 };
  if (typeof source === "string") return withPlaceholders(source, counter);
  return source
    .map((run, i) => {
      const inner = withPlaceholders(run.text, counter);
      if (!run.mark) return inner;
      const ctype = run.mark === "bold" ? "bold" : run.mark === "italic" ? "italic" : run.mark === "control" ? "x-control" : "link";
      return `<g id="${i + 1}" ctype="${ctype}">${inner}</g>`;
    })
    .join("");
}

const wordsIn = (source: string | Run[]) => (typeof source === "string" ? source : source.map((r) => r.text).join("")).split(/\s+/).filter(Boolean).length;

export interface XliffExport {
  /** The file's text. */
  xml: string;
  /** How many units, and how many words, the translator will see. */
  units: number;
  words: number;
}

/** Writes the book's words as XLIFF 1.2 for translating into `target` (a language tag). Nothing in the project is changed. */
export function buildXliff(project: Project, target: string, options: { now?: string } = {}): XliffExport {
  const language = tidyLanguage(target);
  if (!language) throw new Error("The language to translate into must be a language code such as fr, de or pt-BR.");
  const units = translatableUnits(project);
  const date = (options.now ? new Date(options.now) : new Date()).toISOString().replace(/\.\d+Z$/, "Z");
  const body = units
    .map((u) => `<trans-unit id="${escapeXml(u.id)}" xml:space="preserve">\n<source xml:lang="${escapeXml(project.language)}">${sourceMarkup(u.source)}</source>\n<note from="OpenExplainer">${escapeXml(u.note)}</note>\n</trans-unit>`)
    .join("\n");
  const xml = `${XML_HEAD}<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
<file original="${escapeXml(`${project.name}.openexplainer`)}" source-language="${escapeXml(project.language)}" target-language="${escapeXml(language)}" datatype="x-openexplainer" date="${date}">
<header><note>Translate the text inside each source into the target language. Keep the tags: a g tag marks bold or italic words, a control name or a link to another topic, and an x tag is a variable such as {{PRODUCT}}. Words in the g tags may move to where they belong in the translation.</note></header>
<body>
${body}
</body>
</file>
</xliff>
`;
  return { xml, units: units.length, words: units.reduce((n, u) => n + wordsIn(u.source), 0) };
}

// ---- Reading a translation -------------------------------------------------------------------------------

interface Marked {
  mark?: Run["mark"];
  topic?: string;
}

/** Joins neighbouring runs that are marked the same way. */
function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    if (run.text === "") continue;
    const last = out[out.length - 1];
    if (last && last.mark === run.mark && last.topic === run.topic) last.text += run.text;
    else out.push({ ...run });
  }
  return out;
}

/** What a `<target>` says, as runs. The marks and the places links go come from the unit's own runs (by the number on the `<g>`), so a translator cannot point a link anywhere else. */
function runsFromTarget(target: XmlNode, original: Run[] | null, problems: { lostMarks: number }): Run[] {
  const out: Run[] = [];
  const walk = (node: XmlNode, inherited: Marked) => {
    for (const child of node.children) {
      if (child.name === "#text") {
        out.push({ text: child.text ?? "", ...(inherited.mark ? { mark: inherited.mark } : {}), ...(inherited.topic ? { topic: inherited.topic } : {}) });
      } else if (child.name === "g") {
        const from = original?.[Number(child.attrs["id"]) - 1];
        const ctype = child.attrs["ctype"];
        let next: Marked = inherited;
        if (from?.mark) next = { mark: from.mark, ...(from.topic ? { topic: from.topic } : {}) };
        else if (ctype === "bold") next = { mark: "bold" };
        else if (ctype === "italic") next = { mark: "italic" };
        else if (ctype === "x-control") next = { mark: "control" };
        else problems.lostMarks++;
        walk(child, next);
      } else if (child.name === "x" || child.name === "ph") {
        const words = child.attrs["equiv-text"] ?? textOf(child);
        out.push({ text: words, ...(inherited.mark ? { mark: inherited.mark } : {}), ...(inherited.topic ? { topic: inherited.topic } : {}) });
      } else {
        walk(child, inherited);
      }
    }
  };
  walk(target, {});
  return mergeRuns(out);
}

export interface ParsedXliff {
  sourceLanguage: string | null;
  targetLanguage: string | null;
  units: { id: string; target: XmlNode | null; state: string | null }[];
}

/** Reads an XLIFF 1.2 file. Throws, in words, when it is not one, or is version 2. */
export function parseXliff(text: string): ParsedXliff {
  const root = parseXml(text.replace(/^﻿/, ""));
  if (root.name !== "xliff") throw new Error("This is not an XLIFF file: its first element is not xliff. Nothing was imported.");
  if (!/^1\./.test(root.attrs["version"] ?? "")) throw new Error(`This is XLIFF ${root.attrs["version"] ?? "of an unknown version"}. OpenExplainer reads and writes XLIFF 1.2: save the file as XLIFF 1.2 from the translation program. Nothing was imported.`);
  const file = descendantsNamed(root, "file")[0];
  return {
    sourceLanguage: file?.attrs["source-language"] ?? null,
    targetLanguage: file?.attrs["target-language"] ?? null,
    units: descendantsNamed(root, "trans-unit").map((u) => {
      const target = childNamed(u, "target") ?? null;
      return { id: u.attrs["id"] ?? "", target, state: target?.attrs["state"] ?? null };
    }),
  };
}

/** States a translation program gives a target it has not translated yet. */
const NOT_YET = new Set(["new", "needs-translation", "needs-l10n", "needs-adaptation"]);

export interface Translation {
  /** The copy of the book, in the new language. The book it was made from is not changed. */
  project: Project;
  language: string;
  /** What was done and what was not, in plain words. */
  report: string[];
  translated: number;
  total: number;
}

const variablesOf = (text: string) => [...text.matchAll(VARIABLE)].map((m) => m[1]).sort().join(",");

/** Makes a copy of the book in the language the file was translated into, with every translation in place, and says what is still in the original language. Throws, in words, when the file cannot be used. */
export function translatedCopy(project: Project, xliffText: string): Translation {
  const parsed = parseXliff(xliffText);
  const language = tidyLanguage(parsed.targetLanguage);
  if (!language) throw new Error("The file does not say which language it is in (its target-language is missing or not a language code), so it cannot be used. Nothing was imported.");
  const copy = structuredClone(project);
  // Proposals and snapshots belong to the book as it was written; the translated copy starts clean.
  copy.drafts = [];
  copy.history = [];
  copy.language = language;
  const byId = new Map(translatableUnits(copy).map((u) => [u.id, u]));
  const original = new Map(translatableUnits(project).map((u) => [u.id, u]));
  const used = new Set<string>();
  let translated = 0;
  let notYet = 0;
  let unknown = 0;
  const problems = { lostMarks: 0, lostLinks: 0, variables: 0 };
  for (const u of parsed.units) {
    const unit: Unit | undefined = byId.get(u.id);
    if (!unit) { unknown++; continue; }
    if (used.has(u.id)) continue;
    used.add(u.id);
    if (!u.target || (u.state !== null && NOT_YET.has(u.state)) || textOf(u.target).trim() === "" && u.target.children.every((c) => c.name === "#text")) { notYet++; continue; }
    const src = original.get(u.id)!.source;
    const runs = runsFromTarget(u.target, typeof src === "string" ? null : src, problems);
    if (typeof src === "string") {
      const words = runs.map((r) => r.text).join("").trim();
      if (words === "") { notYet++; continue; }
      if (variablesOf(words) !== variablesOf(src)) problems.variables++;
      unit.apply(words);
    } else {
      if (runs.length === 0) { notYet++; continue; }
      // Leading and trailing spaces of the whole piece are not words.
      runs[0].text = runs[0].text.trimStart();
      runs[runs.length - 1].text = runs[runs.length - 1].text.trimEnd();
      const links = (r: Run[]) => r.filter((x) => x.mark === "link" && x.topic).length;
      if (links(runs) < links(src)) problems.lostLinks += links(src) - links(runs);
      if (variablesOf(runs.map((r) => r.text).join("")) !== variablesOf(src.map((r) => r.text).join(""))) problems.variables++;
      unit.apply(mergeRuns(runs.filter((r) => r.text !== "")));
    }
    translated++;
  }
  const missing = byId.size - used.size;
  const total = byId.size;
  if (copy.name === project.name) copy.name = `${project.name} (${language})`;
  const report = [`Translated ${translated} of ${total} pieces of text into ${languageWords(language)} (${language}).`];
  const left = notYet + missing;
  if (left > 0) report.push(`${left} ${left === 1 ? "piece" : "pieces"} of text ${left === 1 ? "was" : "were"} left in ${languageWords(project.language)}: ${notYet > 0 ? `${notYet} had no translation or were marked as not translated yet` : ""}${notYet > 0 && missing > 0 ? ", and " : ""}${missing > 0 ? `${missing} ${missing === 1 ? "is" : "are"} not in the file (the book may have changed since the file was made)` : ""}.`);
  if (unknown > 0) report.push(`${unknown} ${unknown === 1 ? "piece" : "pieces"} of text in the file ${unknown === 1 ? "is" : "are"} not in this book, so ${unknown === 1 ? "it was" : "they were"} not used.`);
  if (parsed.sourceLanguage && tidyLanguage(parsed.sourceLanguage) !== project.language) report.push(`The file was made from a book in ${parsed.sourceLanguage}, and this book is in ${project.language}. Check that it is the right file.`);
  if (problems.lostLinks > 0) report.push(`${problems.lostLinks} ${problems.lostLinks === 1 ? "link to another topic is" : "links to other topics are"} missing from the translation, so ${problems.lostLinks === 1 ? "its" : "their"} words are plain words now.`);
  if (problems.lostMarks > 0) report.push(`${problems.lostMarks} marked ${problems.lostMarks === 1 ? "part" : "parts"} of the translation had a tag the book does not know, so ${problems.lostMarks === 1 ? "it was" : "they were"} read as plain words.`);
  if (problems.variables > 0) report.push(`In ${problems.variables} ${problems.variables === 1 ? "piece" : "pieces"} of text the variables ({{PRODUCT}} and the like) do not match the original. Look at them in the copy.`);
  report.push("The pictures in the copy are the pictures of the original. To show the translated program, replace each picture's file in the copy with a screen of the same size (Replace the picture file): its callouts and marks stay where they are, and their words are in the translation.");
  return { project: copy, language, report, translated, total };
}
