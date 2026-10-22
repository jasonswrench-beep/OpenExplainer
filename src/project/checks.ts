// The book check and the accessibility check: a list of things worth fixing before the book is made, each said in plain words. It is optional, never required before an export, and
// it only ever advises. The author can fix a thing, ignore one, or ignore all of a kind, and that choice is saved with the project, so ignored things stay out of the way. The rules work
// on the project alone (and on whether each picture's file is there), so they can be tested without a screen. What the check cannot do without reading the picture's pixels, such as the
// contrast of an arrow against the picture behind it, is checked in the Drawing dialog; the check lists the marks whose colours were kept on purpose.
import { failing, kindName, needsAlt, shapeChecks } from "./shapes.ts";
import { numbering, type Picture, type Project, type TreeNode } from "./model.ts";
import { calloutLabel, placedPictureIds, type Block, type Step } from "./page.ts";
import { plainText } from "./text.ts";
import { forPaper, MIN_PRINT_SCALE, printScale, shownPart } from "./views.ts";

export type CheckKind =
  | "picture-alt" | "mark-alt" | "mark-contrast" | "callout-name" | "callout-description"
  | "empty-topic" | "empty-block" | "missing-file" | "picture-unplaced" | "variable-empty" | "variable-unused" | "print-small" | "ai-draft";

export interface CheckKindInfo {
  id: CheckKind;
  /** Where the check belongs: accessibility (for a reader who cannot see the picture or the colours) or the book itself. */
  group: "accessibility" | "book";
  /** A problem should be fixed; a note is only worth knowing. */
  severity: "problem" | "note";
  title: string;
}

export const CHECK_KINDS: CheckKindInfo[] = [
  { id: "picture-alt", group: "accessibility", severity: "problem", title: "Pictures with no description" },
  { id: "mark-alt", group: "accessibility", severity: "problem", title: "Arrows and rectangles with no alternative text" },
  { id: "mark-contrast", group: "accessibility", severity: "problem", title: "Marks with colours that are too close" },
  { id: "callout-name", group: "accessibility", severity: "problem", title: "Callouts with no name" },
  { id: "callout-description", group: "accessibility", severity: "problem", title: "Callouts with no description" },
  { id: "empty-topic", group: "book", severity: "problem", title: "Topics with nothing on their page" },
  { id: "empty-block", group: "book", severity: "problem", title: "Empty blocks and steps" },
  { id: "missing-file", group: "book", severity: "problem", title: "Pictures whose file is missing" },
  { id: "variable-empty", group: "book", severity: "problem", title: "Variables used with no value" },
  { id: "picture-unplaced", group: "book", severity: "note", title: "Pictures that are not on their page" },
  { id: "variable-unused", group: "book", severity: "note", title: "Variables that are not used" },
  { id: "print-small", group: "accessibility", severity: "note", title: "Pictures too small to read on paper" },
  { id: "ai-draft", group: "book", severity: "note", title: "Drafts waiting for review" },
];

export const kindInfo = (kind: CheckKind): CheckKindInfo => CHECK_KINDS.find((k) => k.id === kind)!;

/** One thing worth fixing. `key` stays the same while the thing stays the same, so an ignore choice keeps hold of it. */
export interface Issue {
  key: string;
  kind: CheckKind;
  nodeId: string | null;
  /** The topic's number and title, such as "2.1 Saving", for the list. */
  where: string;
  pictureId?: string;
  blockId?: string;
  shapeId?: string;
  /** What is wrong, in plain words. */
  words: string;
  /** What to do about it, in plain words. */
  fix: string;
}

/** The choices saved with the project: the keys of the things the author said to ignore. */
export interface CheckSettings {
  ignored: string[];
}

export const emptyCheckSettings = (): CheckSettings => ({ ignored: [] });

export interface CheckOptions {
  /** Is the picture file there? Without it the check cannot tell and skips that check. */
  hasFile?(path: string): boolean;
}

const VARIABLE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

const pictureLabel = (picture: Picture) => picture.altText.trim() || picture.source.originalName || picture.file;

const blockIsEmpty = (block: Block): boolean => {
  switch (block.type) {
    case "paragraph": case "callout": return plainText(block.text).trim() === "";
    case "heading": return block.text.trim() === "";
    case "picture": return !block.pictureId;
    case "procedure": return block.steps.length === 0;
  }
};

/** All the words in the project that can hold a {{VARIABLE}}, so unused and empty ones can be found. */
function wordsOf(project: Project): string[] {
  const out: string[] = [project.name];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      out.push(node.title);
      for (const block of node.page?.blocks ?? []) {
        if (block.type === "heading") out.push(block.text);
        else if (block.type === "paragraph" || block.type === "callout") out.push(plainText(block.text));
        else if (block.type === "procedure") for (const step of block.steps) out.push(plainText(step.text), plainText(step.result ?? []));
      }
      for (const picture of node.pictures) {
        out.push(picture.altText);
        for (const c of picture.callouts ?? []) out.push(c.name, c.description);
        for (const s of picture.shapes ?? []) out.push(s.alt, s.kind === "text" ? s.text : "");
      }
      walk(node.children);
    }
  };
  walk(project.tree);
  return out;
}

/** Everything worth fixing, in reading order: topic by topic, and in a topic by the order of the kinds above. */
export function checkProject(project: Project, options: CheckOptions = {}): Issue[] {
  const numbers = numbering(project.tree);
  const issues: Issue[] = [];
  const add = (issue: Issue) => issues.push(issue);

  const visit = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      const where = `${numbers.get(node.id) ?? ""} ${node.title}`.trim();
      const base = { nodeId: node.id, where };
      const placed = placedPictureIds(node.page);
      const blocks = node.page?.blocks ?? [];
      const nothingOnPage = blocks.every(blockIsEmpty);
      if (project.drafts.some((d) => d.kind === "procedure" && d.nodeId === node.id)) {
        add({ ...base, key: `ai-draft:${node.id}:procedure`, kind: "ai-draft", words: `A draft of a numbered procedure is waiting for "${where}". It is not in the book until you accept it.`, fix: "Open Drafts and accept or reject it." });
      }

      if (nothingOnPage && node.children.length === 0) {
        add({ ...base, key: `empty-topic:${node.id}`, kind: "empty-topic", words: `"${where}" has nothing on its page.`, fix: "Write something on the page, or delete the topic." });
      }
      blocks.forEach((block, i) => {
        if (blockIsEmpty(block) && !(nothingOnPage && node.children.length === 0)) {
          add({ ...base, key: `empty-block:${node.id}:${block.id}`, kind: "empty-block", blockId: block.id, words: `Block ${i + 1} (${block.type === "callout" ? `callout box, ${calloutLabel(block.kind)}` : block.type}) of "${where}" is empty.`, fix: "Fill it in, or delete the block." });
        }
        if (block.type === "procedure") {
          block.steps.forEach((step: Step, s) => {
            if (plainText(step.text).trim() === "") {
              add({ ...base, key: `empty-block:${node.id}:${block.id}:${step.id}`, kind: "empty-block", blockId: block.id, words: `Step ${s + 1} of the procedure in block ${i + 1} of "${where}" has no text.`, fix: "Say what to do in the step, or delete the step." });
            }
          });
        }
      });

      for (const picture of node.pictures) {
        const label = pictureLabel(picture);
        const pic = { ...base, pictureId: picture.id };
        if (options.hasFile && !options.hasFile(picture.file)) {
          add({ ...pic, key: `missing-file:${picture.id}`, kind: "missing-file", words: `The file of the picture "${label}" in "${where}" is missing from the project.`, fix: "Remove the picture and import or capture it again." });
        }
        if (!placed.has(picture.id)) {
          add({ ...pic, key: `picture-unplaced:${picture.id}`, kind: "picture-unplaced", words: `The picture "${label}" is in "${where}" but is not on its page, so it will not be in the book.`, fix: "Add a Picture block (or use it in a step), or remove the picture." });
          continue;
        }
        if (picture.altText.trim() === "") {
          add({ ...pic, key: `picture-alt:${picture.id}`, kind: "picture-alt", words: `The picture "${label}" in "${where}" has no description, so a screen reader has little to say about it.`, fix: "Choose Edit description for the picture and say what it shows." });
        }
        for (const callout of picture.callouts ?? []) {
          const letter = (picture.callouts ?? []).indexOf(callout);
          if (project.drafts.some((d) => d.kind === "callout-sentence" && d.pictureId === picture.id && d.calloutId === callout.id)) {
            add({ ...pic, key: `ai-draft:${picture.id}:${callout.id}`, kind: "ai-draft", words: `A draft is waiting for callout ${String.fromCharCode(65 + (letter % 26))}${callout.name.trim() ? ` ("${callout.name.trim()}")` : ""} on the picture "${label}" in "${where}". It is not in the book until you accept it.`, fix: "Open Drafts and accept or reject it." });
          }
          const name = `callout ${String.fromCharCode(65 + (letter % 26))}`;
          if (callout.name.trim() === "") add({ ...pic, key: `callout-name:${picture.id}:${callout.id}`, kind: "callout-name", words: `The ${name} on the picture "${label}" in "${where}" has no name.`, fix: "Open Callouts for the picture and give it a name." });
          if (callout.description.trim() === "") add({ ...pic, key: `callout-description:${picture.id}:${callout.id}`, kind: "callout-description", words: `The ${name}${callout.name.trim() ? ` ("${callout.name.trim()}")` : ""} on the picture "${label}" in "${where}" has no sentence about it.`, fix: "Open Callouts for the picture and write a sentence." });
        }
        for (const shape of picture.shapes ?? []) {
          if (needsAlt(shape)) {
            add({ ...pic, shapeId: shape.id, key: `mark-alt:${picture.id}:${shape.id}`, kind: "mark-alt", words: `${kindName(shape.kind)} on the picture "${label}" in "${where}" has no alternative text, so a reader who cannot see it does not know what it points at.`, fix: "Open Drawing for the picture and say what it marks." });
          }
          const bad = failing(shapeChecks(shape));
          if (bad.length > 0 || shape.keptLowContrast) {
            const why = bad.length > 0 ? bad[0].words : "Its colours were kept although they are close to the picture behind it.";
            add({ ...pic, shapeId: shape.id, key: `mark-contrast:${picture.id}:${shape.id}`, kind: "mark-contrast", words: `${kindName(shape.kind)} on the picture "${label}" in "${where}": ${why}${shape.keptLowContrast ? " (Kept on purpose.)" : ""}`, fix: "Open Drawing for the picture and choose colours that are further apart, or ignore this if you mean to keep them." });
          }
        }
        // On paper a picture may be zoomed in on its click automatically (a setting), which can make it big enough.
        const shown = shownPart(forPaper(picture, project.zoom, project.paper), project.zoom, "book");
        if (printScale(shown.width) < MIN_PRINT_SCALE) {
          add({ ...pic, key: `print-small:${picture.id}`, kind: "print-small", words: `The picture "${label}" in "${where}" will print at about ${Math.round(printScale(shown.width) * 100)} percent of its size on screen, which may be too small to read.`, fix: `Choose Picture view for the picture and crop it or zoom in on the click${picture.click ? ", or turn on the automatic zoom for print in Zoom settings" : ""}.` });
        }
      }
      visit(node.children);
    }
  };
  visit(project.tree);

  // Variables: one used with no value would be printed as {{NAME}}; one with a value that nothing uses is only worth knowing.
  const used = new Set<string>();
  for (const text of wordsOf(project)) for (const m of text.matchAll(VARIABLE)) used.add(m[1]);
  for (const name of [...used].sort()) {
    if (!project.variables[name] || project.variables[name].trim() === "") {
      add({ nodeId: null, where: "Project variables", key: `variable-empty:${name}`, kind: "variable-empty", words: `The variable {{${name}}} is used in the book but has no value, so it would appear as {{${name}}}.`, fix: "Choose Project variables and give it a value." });
    }
  }
  for (const [name, value] of Object.entries(project.variables).sort(([a], [b]) => a.localeCompare(b))) {
    if (value.trim() !== "" && !used.has(name)) {
      add({ nodeId: null, where: "Project variables", key: `variable-unused:${name}`, kind: "variable-unused", words: `The variable {{${name}}} has a value but is not used anywhere in the book.`, fix: "Use it in the text as {{" + name + "}}, or ignore this." });
    }
  }
  return issues;
}

/** The issues the author has not ignored, and the ones they have. */
export function splitIssues(issues: Issue[], settings: CheckSettings): { active: Issue[]; ignored: Issue[] } {
  const ignored = new Set(settings.ignored);
  return { active: issues.filter((i) => !ignored.has(i.key)), ignored: issues.filter((i) => ignored.has(i.key)) };
}

/** Ignores one thing. The choice is kept with the project. */
export function ignoreIssue(settings: CheckSettings, key: string): CheckSettings {
  return settings.ignored.includes(key) ? settings : { ignored: [...settings.ignored, key] };
}

/** Ignores every thing of one kind that is on the list now (a new one of the same kind found later still shows). */
export function ignoreKind(settings: CheckSettings, issues: Issue[], kind: CheckKind): CheckSettings {
  const keys = issues.filter((i) => i.kind === kind).map((i) => i.key);
  return { ignored: [...settings.ignored, ...keys.filter((k) => !settings.ignored.includes(k))] };
}

/** Stops ignoring a thing, so it shows on the list again. */
export function unignore(settings: CheckSettings, key: string): CheckSettings {
  return { ignored: settings.ignored.filter((k) => k !== key) };
}

/** What the list says at the top, in words. */
export function summaryWords(active: Issue[], ignored: Issue[]): string {
  const problems = active.filter((i) => kindInfo(i.kind).severity === "problem").length;
  const notes = active.length - problems;
  const said = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const tail = ignored.length > 0 ? ` ${said(ignored.length, "thing is", "things are")} ignored.` : "";
  if (active.length === 0) return `Nothing to fix.${tail}`;
  const parts = [problems > 0 ? said(problems, "thing to fix", "things to fix") : "", notes > 0 ? said(notes, "note", "notes") : ""].filter(Boolean);
  return `${parts.join(" and ")}.${tail}`;
}

/** Checks the saved choices: only keys that are text, once each. */
export function cleanChecks(raw: unknown): CheckSettings {
  const list = typeof raw === "object" && raw !== null && Array.isArray((raw as { ignored?: unknown }).ignored) ? (raw as { ignored: unknown[] }).ignored : [];
  const keys = list.filter((k): k is string => typeof k === "string" && k.length > 0 && k.length <= 200);
  return { ignored: [...new Set(keys)] };
}

