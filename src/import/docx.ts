// Import from Word (format-free: nothing here changes the project format). A Word file (.docx) is read into chapters and topics that can be added to a book, so an existing manual does not have to be typed again.
// What is brought in: the headings (the top level becomes chapters, the next topics, deeper ones sub-headings), paragraphs with bold, italic and control-name marks, numbered lists as numbered procedures
// (a "Result:" line after a step becomes its result), boxed notes made by the callout styles OpenExplainer writes or named Note, Tip, Caution or Warning, and PNG and JPEG pictures with their descriptions. Bullets become
// paragraphs that start with a bullet, a table becomes one line for each row, and links keep their words only. Headers, footers, comments, footnotes, drawings and other picture kinds are left out, and the
// report says what was left out, so nothing goes missing silently. Nothing here needs a screen. See docs/exports.md ("Import from Word").
import { readImageInfo } from "../project/image.ts";
import { newId } from "../project/ids.ts";
import type { Picture, TreeNode } from "../project/model.ts";
import { CALLOUT_KINDS, type Block, type CalloutKind, type ProcedureBlock, type Step } from "../project/page.ts";
import type { Run } from "../project/text.ts";
import { unzip } from "../project/zip.ts";
import { childNamed, childrenNamed, parseXml, textOf, type XmlNode } from "./xml.ts";

export interface DocxImport {
  /** The chapters to add to a book, each with its topics, pages and pictures. */
  chapters: TreeNode[];
  /** The picture files, by their path in the package (images/<id>.png). */
  assets: Map<string, Uint8Array>;
  /** The title of the document, from its properties or its Title paragraph, or empty. */
  title: string;
  /** What was brought in and what was left out, in plain words. */
  report: string[];
}

interface StyleInfo {
  name: string;
  basedOn?: string;
  outline?: number;
  numId?: string;
}

const val = (node: XmlNode | undefined): string | undefined => node?.attrs["w:val"];
const isOn = (node: XmlNode | undefined): boolean => !!node && !["0", "false", "off"].includes(node.attrs["w:val"] ?? "true");

/** Styles that carry the book's own furniture when a file was made by OpenExplainer: a title page, a contents list and an index. They are not content, so they are not brought in. */
const FURNITURE = new Set(["title", "subtitle", "contents heading", "toc 1", "toc 2", "toc 3", "index letter", "index 1", "chapter opener", "caption", "header", "footer"]);

const KIND_BY_WORD: [RegExp, CalloutKind][] = [
  [/caution|warning|danger|important/i, "caution"],
  [/power tip/i, "power-tip"],
  [/time saver/i, "time-saver"],
  [/bright idea/i, "bright-idea"],
  [/new in this version|new feature/i, "new-feature"],
  [/design tip|tip/i, "design-tip"],
  [/note/i, "design-tip"],
];

/** Which boxed note a style name means, or `undefined`. "Callout box, Caution" is what OpenExplainer writes; Note, Tip, Caution and Warning are what people usually name theirs. */
function calloutOf(styleName: string): CalloutKind | undefined {
  const exact = /^callout box,\s*(.+)$/i.exec(styleName);
  const word = exact ? exact[1] : /^(note|tip|caution|warning|important|danger)\b/i.test(styleName) ? styleName : "";
  if (!word) return undefined;
  for (const [pattern, kind] of KIND_BY_WORD) if (pattern.test(word)) return kind;
  return "design-tip";
}

/** Runs with the spaces at the edges of a marked run moved out (the marks must touch the words), empty ones gone, and neighbours with the same mark joined. */
export function tidyRuns(raw: Run[]): Run[] {
  const out: Run[] = [];
  const push = (text: string, mark?: Run["mark"]) => {
    if (text === "") return;
    const last = out[out.length - 1];
    if (last && last.mark === mark) last.text += text;
    else out.push(mark ? { text, mark } : { text });
  };
  for (const run of raw) {
    if (!run.mark) { push(run.text); continue; }
    const lead = run.text.length - run.text.trimStart().length;
    const trail = run.text.length - run.text.trimEnd().length;
    const core = run.text.trim();
    if (core === "") { push(run.text); continue; }
    push(run.text.slice(0, lead));
    push(core, run.mark);
    push(trail ? run.text.slice(run.text.length - trail) : "");
  }
  // Leading and trailing spaces of the whole line are not words.
  if (out.length && !out[0].mark) out[0].text = out[0].text.trimStart();
  if (out.length && !out[out.length - 1].mark) out[out.length - 1].text = out[out.length - 1].text.trimEnd();
  return out.filter((r) => r.text !== "");
}

const plain = (runs: Run[]) => runs.map((r) => r.text).join("");

/** Reads a .docx file. Throws an error whose words say what is wrong when it is not one. */
export async function importDocx(bytes: Uint8Array, options: { name?: string; now?: string } = {}): Promise<DocxImport> {
  let files: Record<string, Uint8Array>;
  try {
    files = await unzip(bytes);
  } catch {
    throw new Error("This is not a Word file (.docx): it could not be opened as one. Nothing was imported.");
  }
  const documentPart = files["word/document.xml"];
  if (!documentPart) throw new Error("This is not a Word file (.docx): it has no word/document.xml. A Word file in the older .doc form must be saved as .docx first. Nothing was imported.");
  const text = (path: string) => (files[path] ? new TextDecoder().decode(files[path]) : "");
  const report: string[] = [];
  const now = options.now ?? new Date().toISOString();
  const body = childNamed(parseXml(text("word/document.xml")), "w:body");
  if (!body) throw new Error("This Word file has no body, so there was nothing to import.");

  // ---- Styles, lists and pictures the paragraphs refer to
  const styles = new Map<string, StyleInfo>();
  if (files["word/styles.xml"]) {
    for (const s of childrenNamed(parseXml(text("word/styles.xml")), "w:style")) {
      const id = s.attrs["w:styleId"];
      if (!id) continue;
      const pPr = childNamed(s, "w:pPr");
      const outline = val(childNamed(pPr, "w:outlineLvl"));
      styles.set(id, { name: (val(childNamed(s, "w:name")) ?? id).toLowerCase(), basedOn: val(childNamed(s, "w:basedOn")), outline: outline !== undefined ? Number(outline) : undefined, numId: val(childNamed(childNamed(pPr, "w:numPr"), "w:numId")) });
    }
  }
  const styleChain = (id: string | undefined): StyleInfo[] => {
    const chain: StyleInfo[] = [];
    let at = id;
    for (let depth = 0; at && depth < 10; depth++) {
      const s = styles.get(at);
      if (!s) break;
      chain.push(s);
      at = s.basedOn;
    }
    return chain;
  };
  const numbered = new Map<string, boolean>(); // numId -> does it count (decimal, letters) rather than bullet
  if (files["word/numbering.xml"]) {
    const doc = parseXml(text("word/numbering.xml"));
    const abstracts = new Map<string, boolean>();
    for (const a of childrenNamed(doc, "w:abstractNum")) {
      const first = childrenNamed(a, "w:lvl")[0];
      abstracts.set(a.attrs["w:abstractNumId"], !["bullet", "none"].includes(val(childNamed(first, "w:numFmt")) ?? "decimal"));
    }
    for (const n of childrenNamed(doc, "w:num")) numbered.set(n.attrs["w:numId"], abstracts.get(val(childNamed(n, "w:abstractNumId")) ?? "") ?? true);
  }
  const relations = new Map<string, string>();
  if (files["word/_rels/document.xml.rels"]) for (const r of childrenNamed(parseXml(text("word/_rels/document.xml.rels")), "Relationship")) relations.set(r.attrs["Id"], r.attrs["Target"]);
  const coreTitle = files["docProps/core.xml"] ? textOf(childNamed(parseXml(text("docProps/core.xml")), "dc:title") ?? { name: "#text", attrs: {}, children: [], text: "" }).trim() : "";

  // ---- What each paragraph is
  const infoOf = (p: XmlNode) => {
    const pPr = childNamed(p, "w:pPr");
    const styleId = val(childNamed(pPr, "w:pStyle"));
    const chain = styleChain(styleId);
    const name = chain[0]?.name ?? (styleId ?? "").toLowerCase();
    let level: number | undefined;
    for (const s of chain) {
      const m = /^heading\s*(\d)/.exec(s.name);
      if (m) { level = Number(m[1]); break; }
      if (s.outline !== undefined && s.outline < 9) { level = s.outline + 1; break; }
    }
    const direct = val(childNamed(pPr, "w:outlineLvl"));
    if (level === undefined && direct !== undefined && Number(direct) < 9) level = Number(direct) + 1;
    const numPr = childNamed(pPr, "w:numPr");
    let numId = val(childNamed(numPr, "w:numId"));
    if (numId === undefined) numId = chain.find((s) => s.numId !== undefined)?.numId;
    const inList = numId !== undefined && numId !== "0" && !level;
    return { name, level, numId: inList ? numId : undefined, counted: inList ? numbered.get(numId!) ?? true : false, callout: calloutOf(name) };
  };

  /** The words of a paragraph as runs, with bold, italic and control names, and the pictures in it. */
  const readParagraph = (p: XmlNode): { runs: Run[]; images: { rid: string; alt: string }[] } => {
    const runs: Run[] = [];
    const images: { rid: string; alt: string }[] = [];
    const run = (r: XmlNode) => {
      const rPr = childNamed(r, "w:rPr");
      const style = (styleId: string | undefined) => (styleId ? (styles.get(styleId)?.name ?? styleId).toLowerCase() : "");
      const rStyle = style(val(childNamed(rPr, "w:rStyle")));
      const mark: Run["mark"] = /^control name$|controlname/.test(rStyle) ? "control" : isOn(childNamed(rPr, "w:b")) || rStyle === "strong" ? "bold" : isOn(childNamed(rPr, "w:i")) || rStyle === "emphasis" ? "italic" : undefined;
      for (const c of r.children) {
        if (c.name === "w:t") runs.push(mark ? { text: textOf(c), mark } : { text: textOf(c) });
        else if (c.name === "w:tab" || c.name === "w:noBreakHyphen") runs.push({ text: c.name === "w:tab" ? " " : "-" });
        else if (c.name === "w:br" && c.attrs["w:type"] !== "page") runs.push({ text: " " });
        else if (c.name === "w:drawing" || c.name === "w:pict") {
          const blip = findDeep(c, "a:blip");
          const rid = blip?.attrs["r:embed"];
          const prop = findDeep(c, "wp:docPr");
          if (rid) images.push({ rid, alt: (prop?.attrs["descr"] || prop?.attrs["title"] || "").trim() });
        }
      }
    };
    const walk = (node: XmlNode) => {
      for (const c of node.children) {
        if (c.name === "w:r") run(c);
        else if (["w:hyperlink", "w:ins", "w:smartTag", "w:fldSimple", "w:sdt", "w:sdtContent", "w:customXml"].includes(c.name)) walk(c);
      }
    };
    walk(p);
    return { runs: tidyRuns(runs), images };
  };

  // ---- Reading the body into chapters, topics and blocks
  const chapters: TreeNode[] = [];
  const assets = new Map<string, Uint8Array>();
  const counts = { topics: 0, pictures: 0, bullets: 0, tables: 0, tableRows: 0, other: 0, skippedFurniture: 0 };
  let skippedPictures = 0;
  const makeNode = (title: string): TreeNode => ({ id: newId(), title: title.slice(0, 200), status: "drafted", pictures: [], children: [] });

  // Which heading levels are used decides what is a chapter and what is a topic.
  const entries: { kind: "p" | "table"; node: XmlNode }[] = [];
  const collect = (parent: XmlNode) => {
    for (const c of parent.children) {
      if (c.name === "w:p") entries.push({ kind: "p", node: c });
      else if (c.name === "w:tbl") entries.push({ kind: "table", node: c });
      else if (c.name === "w:sdt") collect(childNamed(c, "w:sdtContent") ?? c);
    }
  };
  collect(body);
  const levelsUsed = [...new Set(entries.filter((e) => e.kind === "p").map((e) => infoOf(e.node).level).filter((l): l is number => l !== undefined))].sort((a, b) => a - b);
  const chapterLevel = levelsUsed[0];
  const topicLevel = levelsUsed[1];
  // The title comes from the file's properties, else from its Title paragraph.
  let documentTitle = coreTitle;
  if (!documentTitle) {
    const titled = entries.find((e) => e.kind === "p" && infoOf(e.node).name === "title");
    if (titled) documentTitle = plain(readParagraph(titled.node).runs).trim();
  }
  // Word files that number their headings by hand ("1 Getting started", "1.2 Saving", as OpenExplainer writes them) lose the number, because the book numbers its own topics.
  const NUMBERED = /^\d{1,3}(\.\d{1,3})*\.?\s+(?=\S)/;
  const levelWords = entries.filter((e) => e.kind === "p").map((e) => ({ level: infoOf(e.node).level, words: plain(readParagraph(e.node).runs).trim() })).filter((h) => h.level !== undefined && (h.level === chapterLevel || h.level === topicLevel) && h.words !== "");
  const stripNumbers = levelWords.length >= 2 && levelWords.filter((h) => NUMBERED.test(h.words)).length >= levelWords.length * 0.8;
  const headingTitle = (words: string): string => (stripNumbers ? words.replace(NUMBERED, "") : words);

  let chapter: TreeNode | null = null;
  let topic: TreeNode | null = null;
  let procedure: ProcedureBlock | null = null;
  let procedureNumId: string | undefined;
  let skipBullets = false; // the bullets under an "In This Chapter" line of a file OpenExplainer made
  const fallbackName = (documentTitle || options.name || "Imported from Word").slice(0, 120);
  const current = (): TreeNode => {
    if (topic) return topic;
    if (chapter) return chapter;
    chapter = makeNode(fallbackName);
    chapters.push(chapter);
    return chapter;
  };
  const addBlock = (block: Block) => { const node = current(); (node.page ??= { blocks: [] }).blocks.push(block); };
  const endProcedure = () => { procedure = null; procedureNumId = undefined; };

  const imageOf = new Map<string, string>(); // topic id + relationship id -> picture id, so a picture shown twice in a topic is one picture
  const addImage = (rid: string, alt: string): string | null => {
    const owner = current();
    const known = imageOf.get(`${owner.id}:${rid}`);
    if (known) return known;
    const target = relations.get(rid);
    const path = target ? (target.startsWith("/") ? target.slice(1) : `word/${target}`) : "";
    const data = path ? files[path] : undefined;
    const info = data ? readImageInfo(data) : null;
    if (!data || !info) { skippedPictures++; return null; }
    const id = newId();
    const file = `images/${id}.${info.extension}`;
    assets.set(file, data);
    const picture: Picture = { id, file, width: info.width, height: info.height, altText: alt.slice(0, 600), source: { kind: "import", capturedAt: now, originalName: path.slice(path.lastIndexOf("/") + 1) } };
    owner.pictures.push(picture);
    imageOf.set(`${owner.id}:${rid}`, id);
    counts.pictures++;
    return id;
  };

  for (const entry of entries) {
    if (entry.kind === "table") {
      counts.tables++;
      for (const row of childrenNamed(entry.node, "w:tr")) {
        const cells = childrenNamed(row, "w:tc").map((tc) => tidyRuns(childrenNamed(tc, "w:p").flatMap((p, i) => [...(i ? [{ text: " " }] : []), ...readParagraph(p).runs])));
        const line = cells.map((c) => plain(c).trim()).filter(Boolean);
        if (line.length === 0) continue;
        counts.tableRows++;
        endProcedure();
        addBlock({ id: newId(), type: "paragraph", text: tidyRuns(cells.flatMap((c, i) => [...(i ? [{ text: " | " }] : []), ...c])) });
      }
      continue;
    }
    const info = infoOf(entry.node);
    const { runs, images } = readParagraph(entry.node);
    const words = plain(runs).trim();

    if (info.name === "title") { counts.skippedFurniture++; continue; }
    if (info.level !== undefined) {
      endProcedure();
      skipBullets = false;
      if (words === "") continue;
      if (info.level === chapterLevel && levelsUsed.length > 1) {
        chapter = makeNode(headingTitle(words));
        chapters.push(chapter);
        topic = null;
      } else if (levelsUsed.length === 1) {
        // Only one level of heading: each heading is a topic in one chapter named after the document.
        if (!chapter) { chapter = makeNode(fallbackName); chapters.push(chapter); }
        topic = makeNode(headingTitle(words));
        chapter.children.push(topic);
        counts.topics++;
      } else if (info.level === topicLevel) {
        if (!chapter) { chapter = makeNode(fallbackName); chapters.push(chapter); }
        topic = makeNode(headingTitle(words));
        chapter.children.push(topic);
        counts.topics++;
      } else {
        addBlock({ id: newId(), type: "heading", text: words });
      }
      continue;
    }
    // The furniture of a book OpenExplainer made: contents, index, the opener's list, the callout entries under a picture.
    if (FURNITURE.has(info.name)) { counts.skippedFurniture++; skipBullets = info.name === "chapter opener"; continue; }
    if (skipBullets && info.name === "list bullet") { counts.skippedFurniture++; continue; }
    skipBullets = false;

    // A line that continues a step (OpenExplainer's "Step continued"): its result, or its picture.
    if (info.name === "step continued") {
      const lastStep = procedure ? (procedure as ProcedureBlock).steps[(procedure as ProcedureBlock).steps.length - 1] : undefined;
      if (lastStep) {
        const result = /^Result:\s*/.exec(plain(runs));
        if (result) lastStep.result = tidyRuns(trimPrefix(runs, result[0].length));
        for (const image of images) { const id = addImage(image.rid, image.alt); if (id && !lastStep.pictureId) lastStep.pictureId = id; }
      }
      continue;
    }

    if (images.length) {
      endProcedure();
      for (const image of images) {
        const id = addImage(image.rid, image.alt);
        if (id) addBlock({ id: newId(), type: "picture", pictureId: id });
      }
      if (words === "") continue;
    }
    if (words === "") continue;

    if (info.numId && info.counted) {
      if (!procedure || procedureNumId !== info.numId) {
        procedure = { id: newId(), type: "procedure", steps: [] };
        procedureNumId = info.numId;
        addBlock(procedure);
      }
      (procedure as ProcedureBlock).steps.push({ id: newId(), text: runs } as Step);
      continue;
    }
    endProcedure();
    if (info.numId) { counts.bullets++; addBlock({ id: newId(), type: "paragraph", text: tidyRuns([{ text: "• " }, ...runs]) }); continue; }
    if (info.callout) {
      const label = CALLOUT_KINDS.find((k) => k.id === info.callout)!.label;
      addBlock({ id: newId(), type: "callout", kind: info.callout, text: tidyRuns(stripLabel(runs, label)) });
      continue;
    }
    addBlock({ id: newId(), type: "paragraph", text: runs });
  }

  // Nothing is brought in empty: a heading with no words under it and nothing below it is left out, as the contents and the index of a Word file are.
  const prune = (nodes: TreeNode[]): TreeNode[] => nodes.map((n) => ({ ...n, children: prune(n.children) })).filter((n) => (n.page?.blocks.length ?? 0) > 0 || n.pictures.length > 0 || n.children.length > 0);
  const kept = prune(chapters);

  const topics = (nodes: TreeNode[]): number => nodes.reduce((sum, n) => sum + 1 + topics(n.children), 0);
  report.push(`Brought in ${kept.length} ${kept.length === 1 ? "chapter" : "chapters"} and ${topics(kept) - kept.length} ${topics(kept) - kept.length === 1 ? "topic" : "topics"}, with ${counts.pictures} ${counts.pictures === 1 ? "picture" : "pictures"}.`);
  if (levelsUsed.length === 0) report.push("The file has no headings, so everything is in one topic. Split it by hand.");
  else if (levelsUsed.length === 1) report.push("The file uses one level of heading, so each heading became a topic in one chapter.");
  else if (levelsUsed.length > 2) report.push("Headings deeper than the second level became sub-headings inside their topic.");
  if (stripNumbers) report.push("The numbers at the start of the headings (such as 1.2) were removed, because the book numbers its own chapters and topics.");
  if (counts.bullets) report.push(`${counts.bullets} bulleted ${counts.bullets === 1 ? "line" : "lines"} became paragraphs that start with a bullet.`);
  if (counts.tables) report.push(`${counts.tables} ${counts.tables === 1 ? "table" : "tables"} became one line for each of ${counts.tableRows} rows, with the cells divided by |.`);
  if (skippedPictures) report.push(`${skippedPictures} ${skippedPictures === 1 ? "picture" : "pictures"} could not be brought in: only PNG and JPEG are used, and the file may hold others (such as GIF, EMF or a drawing).`);
  if (counts.skippedFurniture) report.push(`${counts.skippedFurniture} ${counts.skippedFurniture === 1 ? "line" : "lines"} of a title page, contents list, index or picture notes ${counts.skippedFurniture === 1 ? "was" : "were"} left out.`);
  for (const [path, what, tag, first] of [["word/comments.xml", "comment", "w:comment", 0], ["word/footnotes.xml", "footnote", "w:footnote", 1], ["word/endnotes.xml", "endnote", "w:endnote", 1]] as const) {
    // Word numbers the separators of footnotes and endnotes below 1; a comment can be number 0.
    const count = files[path] ? childrenNamed(parseXml(text(path)), tag).filter((n) => Number(n.attrs["w:id"]) >= first && textOf(n).trim() !== "").length : 0;
    if (count) report.push(`${count} ${what}${count === 1 ? "" : "s"} in the file ${count === 1 ? "was" : "were"} not brought in.`);
  }
  if (Object.keys(files).some((f) => /^word\/(header|footer)\d*\.xml$/.test(f) && textOf(parseXml(text(f))).trim() !== "")) report.push("The running header and footer were not brought in (the Look of the book sets those).");
  if (kept.length === 0) report.push("There was no text to bring in.");
  report.push("Every topic is marked Drafted. Read each one: the words came from a file that was made for another tool.");
  return { chapters: kept, assets, title: documentTitle, report };
}

function findDeep(node: XmlNode, name: string): XmlNode | undefined {
  for (const c of node.children) {
    if (c.name === name) return c;
    const found = findDeep(c, name);
    if (found) return found;
  }
  return undefined;
}

/** The runs without their first `count` letters. */
function trimPrefix(runs: Run[], count: number): Run[] {
  const out: Run[] = [];
  let left = count;
  for (const run of runs) {
    if (left >= run.text.length) { left -= run.text.length; continue; }
    out.push({ ...run, text: run.text.slice(left) });
    left = 0;
  }
  return out;
}

/** A boxed note's runs without the label ("Caution. ", "Note: ") that OpenExplainer, or the person who wrote the file, put before its words. */
function stripLabel(runs: Run[], label: string): Run[] {
  const words = plain(runs);
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^(?:${escaped}|note|tip|caution|warning|important|danger)\\s*[.:]\\s*`, "i").exec(words);
  return match ? trimPrefix(runs, match[0].length) : runs;
}
