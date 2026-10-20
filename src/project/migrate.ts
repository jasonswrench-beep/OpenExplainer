// Turns a project of any older version into the current version.
// Every change to the saved format bumps CURRENT_VERSION and adds a step here.
import { CURRENT_VERSION, type Project, type TreeNode } from "./model.ts";
import { cleanClicks } from "./clicks.ts";
import { cleanHighlight, cleanTreeHighlights, defaultHighlight } from "./highlight.ts";

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
  if (Array.isArray(project.tree)) project.tree = cleanTreeHighlights(cleanClicks(project.tree as TreeNode[]));
  project.highlight = cleanHighlight(project.highlight);
  return project;
}
