// Turns a project of any older version into the current version.
// Every change to the saved format bumps CURRENT_VERSION and adds a step here.
import { CURRENT_VERSION, type Project, type TreeNode } from "./model.ts";
import { cleanClicks } from "./clicks.ts";
import { cleanHighlight, cleanTreeHighlights, defaultHighlight } from "./highlight.ts";
import { cleanTreeCallouts } from "./callouts.ts";
import { cleanPaper, cleanTreeViews, cleanZoom, defaultZoom } from "./views.ts";
import { cleanTreeShapes } from "./shapes.ts";
import { cleanStyles } from "./styles.ts";
import { cleanChecks } from "./checks.ts";
import { cleanGuides } from "./guides.ts";
import { cleanTreeIndex } from "./book-index.ts";
import { cleanDrafts, cleanWritingStyle } from "./drafts.ts";
import { cleanAvoidWords } from "./avoid-words.ts";
import { cleanTreeSeeAlso } from "./links.ts";
import { cleanLook, defaultLook } from "./look.ts";

type Raw = { version?: unknown; [key: string]: unknown };

type RawNode = { pictures?: unknown; children?: RawNode[] };

function addPictures(nodes: RawNode[] | undefined): void {
  for (const node of nodes ?? []) {
    if (!Array.isArray(node.pictures)) node.pictures = [];
    addPictures(node.children);
  }
}

const steps: Record<number, (raw: Raw) => Raw> = {
  // Version 1 to 2: every chapter and topic can hold pictures.
  1: (raw) => {
    addPictures(raw.tree as RawNode[] | undefined);
    return { ...raw, version: 2 };
  },
  // Version 2 to 3: a picture can carry a click note. Nothing needs adding to an older project.
  2: (raw) => ({ ...raw, version: 3 }),
  // Version 3 to 4: the project keeps the look of the click circle. An older project gets the starting look (off for the book, on for a quick guide).
  3: (raw) => ({ ...raw, version: 4, highlight: defaultHighlight() }),
  // Version 4 to 5: a topic can have a page, saved in its own file. An older project simply has no pages yet.
  4: (raw) => ({ ...raw, version: 5 }),
  // Version 5 to 6: a picture can have lettered callouts. An older project has none.
  5: (raw) => ({ ...raw, version: 6 }),
  // Version 6 to 7: the project keeps how much a zoomed picture shows, and a picture can have a view. An older project gets the starting sizes and no views.
  6: (raw) => ({ ...raw, version: 7, zoom: defaultZoom() }),
  // Version 7 to 8: a page can have comments on its blocks. An older project has none.
  7: (raw) => ({ ...raw, version: 8 }),
  // Version 8 to 9: a picture can have marks drawn on it, and the project keeps named styles. An older project has none.
  8: (raw) => ({ ...raw, version: 9, styles: [] }),
  // Version 9 to 10: the project keeps what the author chose to ignore in the book check. An older project ignores nothing.
  9: (raw) => ({ ...raw, version: 10, checks: { ignored: [] } }),
  // Version 10 to 11: the project can hold short guides made from topics. An older project has none.
  10: (raw) => ({ ...raw, version: 11, guides: [] }),
  // Version 11 to 12: the project keeps choices about the printed book. An older project has the zoom for print switched off.
  11: (raw) => ({ ...raw, version: 12, paper: { autoZoom: false } }),
  // Version 12 to 13: a topic can have index terms. An older project has none; the first pass is made when the author asks.
  12: (raw) => ({ ...raw, version: 13 }),
  // Version 13 to 14: the project keeps writing-style notes for the AI, and AI drafts wait in their own file. An older project has neither.
  13: (raw) => ({ ...raw, version: 14, writingStyle: "" }),
  // Version 14 to 15: drafts.json can hold a second kind of draft, a numbered procedure made from clicks. An older project has none.
  14: (raw) => ({ ...raw, version: 15 }),
  // Version 15 to 16: drafts.json can hold chapter openers, summaries and suggested boxes, and the project keeps a list of words to avoid. An older project has none.
  15: (raw) => ({ ...raw, version: 16, avoidWords: [] }),
  // Version 16 to 17: words in a page can be a link to another topic, and a topic can have a See also list. An older project has neither.
  16: (raw) => ({ ...raw, version: 17 }),
  // Version 17 to 18: the project keeps the look of the outputs. An older project gets the look it always had: Georgia and Segoe UI, no accent colour or logo, a title page, Letter paper.
  17: (raw) => ({ ...raw, version: 18, look: defaultLook() }),
};

export function migrate(input: unknown): Project {
  if (typeof input !== "object" || input === null) throw new Error("This is not an OpenExplainer project.");
  let raw = input as Raw;
  if (typeof raw.version !== "number") throw new Error("This project has no version number, so it cannot be opened safely.");
  if (raw.version > CURRENT_VERSION) {
    throw new Error(`This project was saved by a newer OpenExplainer (format ${raw.version}). Update OpenExplainer to open it.`);
  }
  while ((raw.version as number) < CURRENT_VERSION) {
    const step = steps[raw.version as number];
    if (!step) throw new Error(`There is no way to upgrade project format ${raw.version}.`);
    raw = step(raw);
  }
  // A click note and the circle's settings are checked every time a project is opened, whatever version it was saved as.
  const project = raw as unknown as Project;
  if (Array.isArray(project.tree)) project.tree = cleanTreeSeeAlso(cleanTreeIndex(cleanTreeShapes(cleanTreeViews(cleanTreeCallouts(cleanTreeHighlights(cleanClicks(project.tree as TreeNode[])))))));
  project.highlight = cleanHighlight(project.highlight);
  project.zoom = cleanZoom(project.zoom);
  project.styles = cleanStyles(project.styles);
  project.checks = cleanChecks(project.checks);
  project.guides = cleanGuides(project.guides, project.tree ?? []);
  project.paper = cleanPaper(project.paper);
  project.look = cleanLook(project.look);
  const writingStyle = cleanWritingStyle(project.writingStyle);
  // Drafts are read from their own file after this (files.ts); any that arrive here are cleaned against the tree.
  const drafts = cleanDrafts(project.drafts, project.tree ?? []);
  // The parts in the order a new project has them, so a project that is saved and opened again is the same in every way.
  const avoidWords = cleanAvoidWords(project.avoidWords);
  const { tree, writingStyle: _style, avoidWords: _avoid, drafts: _drafts, ...rest } = project;
  return { ...rest, writingStyle, avoidWords, drafts, tree } as Project;
}
