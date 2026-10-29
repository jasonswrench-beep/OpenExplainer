// The project model: what a project is, and the plain functions that change its chapter tree.
// Nothing here touches the screen or the disk, so it can be tested on its own.

import { cleanPictureHighlight, defaultHighlight, type HighlightSettings, type PictureHighlight } from "./highlight.ts";
import { newId } from "./ids.ts";
import { emptyPage, forgetPicture, type Page } from "./page.ts";
import type { Callout } from "./callouts.ts";
import { cleanPictureView, defaultPaper, defaultZoom, type PaperSettings, type PictureView, type ZoomSettings } from "./views.ts";
import type { Shape } from "./shapes.ts";
import type { NamedStyle } from "./styles.ts";
import { emptyCheckSettings, type CheckSettings } from "./checks.ts";
import type { Guide } from "./guides.ts";
import type { TopicIndex } from "./book-index.ts";
import type { Draft } from "./drafts.ts";
import type { AvoidWord } from "./avoid-words.ts";

export { newId };

export const CURRENT_VERSION = 16;

export type Status = "not-started" | "captured" | "drafted" | "reviewed" | "needs-recheck";

// Every status has a word and a symbol as well as a color, so color is never the only signal.
export const STATUSES: { id: Status; word: string; symbol: string; color: string }[] = [
  { id: "not-started", word: "Not started", symbol: "○", color: "#595959" },
  { id: "captured", word: "Captured", symbol: "◐", color: "#1f4e8c" },
  { id: "drafted", word: "Drafted", symbol: "✎", color: "#7a4b00" },
  { id: "reviewed", word: "Reviewed", symbol: "✓", color: "#1b6b2f" },
  { id: "needs-recheck", word: "Needs recheck", symbol: "⚠", color: "#a31515" },
];

/** Which mouse button was used for a click. */
export type ClickButton = "left" | "right" | "middle";

/**
 * What Windows said was under the pointer (from Windows UI Automation). Every part is optional because Windows often cannot say.
 * For a password box only `password: true` is kept. What was typed in a box is never kept.
 */
export interface ClickTarget {
  /** The item's name, such as "Save". */
  name?: string;
  /** The kind of item, such as "button" or "menu item". */
  role?: string;
  /** A shortcut that does the same thing, such as "Ctrl+S". */
  acceleratorKey?: string;
  /** The key that reaches the item from a menu, such as "Alt+F". */
  accessKey?: string;
  /** Help text Windows gives for the item. */
  description?: string;
  /** The item's outline, in picture pixels from the picture's top left corner. */
  bounds?: { x: number; y: number; width: number; height: number };
  /** True when the item is a password box. Nothing else about it is kept. */
  password?: boolean;
}

/** A click, stored beside its picture and never drawn into it, so a highlight can be added, changed or removed later. */
export interface ClickInfo {
  /** Where the pointer was, in picture pixels from the picture's top left corner. */
  x: number;
  y: number;
  button: ClickButton;
  double?: boolean;
  target?: ClickTarget;
}

/** A picture held by a topic. The picture itself is a file inside the project package. */
export interface Picture {
  id: string;
  /** Path inside the package, such as images/abc123.png. */
  file: string;
  width: number;
  height: number;
  /** What the picture shows, for screen readers and the printed alt text. Empty means it still needs one. */
  altText: string;
  source: { kind: "import" | "window" | "region" | "click"; capturedAt: string; originalName?: string };
  /** Only for a picture made by a click-by-click capture (format version 3). */
  click?: ClickInfo;
  /** This picture's own choices about its click circle (format version 4). Without it the picture follows the project's setting. */
  highlight?: PictureHighlight;
  /** Lettered callouts on this picture, in order (format version 6). The letters are worked out from the order, never stored. */
  callouts?: Callout[];
  /** The part of the picture that is shown where it is used (format version 7): cropped to a region, or zoomed in on the click. Without it the whole picture is shown. */
  view?: PictureView;
  /** Marks drawn on the picture (format version 9): arrows, text boxes, rectangles and numbered markers, from the bottom one to the top one. */
  shapes?: Shape[];
}

export interface TreeNode {
  id: string;
  title: string;
  status: Status;
  pictures: Picture[];
  /** What the reader sees under the topic's title (format version 5). Left out until something is written. */
  page?: Page;
  /** The topic's index terms (format version 13). Left out until it has some. */
  index?: TopicIndex;
  children: TreeNode[];
}

export interface Project {
  version: number;
  name: string;
  template: "openstage-how-to-book" | "software-user-guide" | "empty";
  variables: Record<string, string>;
  /** The look of the click circle where pictures are used, and whether it is drawn (format version 4). */
  highlight: HighlightSettings;
  /** How much a zoomed picture shows, for the book and for a quick guide (format version 7). */
  zoom: ZoomSettings;
  /** Named sets of colours for marks (format version 9). */
  styles: NamedStyle[];
  /** What the author chose to ignore in the book check (format version 10). */
  checks: CheckSettings;
  /** Short step-by-step guides made from topics of the book (format version 11). */
  guides: Guide[];
  /** Choices about the printed book (format version 12). */
  paper: PaperSettings;
  /** Notes about voice and wording that the AI reads before every draft (format version 14). Empty to begin with. */
  writingStyle: string;
  /** Words the book should not use and what to use instead, for the consistency check (format version 16). Empty to begin with. */
  avoidWords: AvoidWord[];
  /** Proposals that wait for the author to accept or reject them: sentences the AI wrote for callouts (format version 14), procedures made from clicks (format version 15), and chapter openers, summaries and suggested boxes (format version 16). Kept apart from the real text; saved in drafts.json. */
  drafts: Draft[];
  tree: TreeNode[];
}

export function makeNode(title: string): TreeNode {
  return { id: newId(), title, status: "not-started", pictures: [], children: [] };
}

/**
 * The chapters of the OpenStage how-to book template: 15 chapters and an appendix, in the pattern of the reference how-to book (design spec, Templates), one for each feature area of the
 * program. They are empty to begin with; the author adds the topics. The OpenStage Author guide made with OpenExplainer follows this list.
 */
export const HOW_TO_BOOK_CHAPTERS = [
  "Introduction", "Getting Started", "Slides", "Objects on a Slide", "Text", "Pictures, Sound and Video", "Interactions", "Questions, Quizzes and Results",
  "Variables and Rules", "Timing and Animation", "Narration", "Games and Scenarios", "PowerPoint and Screen Recording", "Checking, Previewing and Publishing",
  "Keyboard and Screen Reader", "Appendix",
];

export const TEMPLATES: Project["template"][] = ["empty", "openstage-how-to-book", "software-user-guide"];

export function createProject(name: string, template: Project["template"] = "empty"): Project {
  const project: Project = {
    version: CURRENT_VERSION,
    name,
    template,
    variables: { PRODUCT: "", VERSION: "", COMPANY: "" },
    highlight: defaultHighlight(),
    zoom: defaultZoom(),
    styles: [],
    checks: emptyCheckSettings(),
    guides: [],
    paper: defaultPaper(),
    writingStyle: "",
    avoidWords: [],
    drafts: [],
    tree: [],
  };
  if (template === "openstage-how-to-book") {
    project.tree = HOW_TO_BOOK_CHAPTERS.map(makeNode);
  } else if (template === "software-user-guide") {
    project.tree = ["Overview", "Installation", "Using the Software", "Troubleshooting"].map(makeNode);
  }
  return project;
}

/** Where a node sits: the list that holds it and its position in that list. */
export interface Location {
  parent: TreeNode | null;
  siblings: TreeNode[];
  index: number;
}

export function locate(tree: TreeNode[], id: string): Location | null {
  const search = (siblings: TreeNode[], parent: TreeNode | null): Location | null => {
    for (let index = 0; index < siblings.length; index++) {
      if (siblings[index].id === id) return { parent, siblings, index };
      const found = search(siblings[index].children, siblings[index]);
      if (found) return found;
    }
    return null;
  };
  return search(tree, null);
}

export function findNode(tree: TreeNode[], id: string): TreeNode | null {
  const where = locate(tree, id);
  return where ? where.siblings[where.index] : null;
}

/** Numbers like "1", "1.2", "1.2.3", worked out from position so they never go stale. */
export function numbering(tree: TreeNode[]): Map<string, string> {
  const numbers = new Map<string, string>();
  const walk = (nodes: TreeNode[], prefix: string) => {
    nodes.forEach((node, i) => {
      const number = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      numbers.set(node.id, number);
      walk(node.children, number);
    });
  };
  walk(tree, "");
  return numbers;
}

/** The nodes in the order they appear on screen, skipping the children of collapsed nodes. */
export function visibleNodes(tree: TreeNode[], collapsed: Set<string>): { node: TreeNode; level: number }[] {
  const out: { node: TreeNode; level: number }[] = [];
  const walk = (nodes: TreeNode[], level: number) => {
    for (const node of nodes) {
      out.push({ node, level });
      if (!collapsed.has(node.id)) walk(node.children, level + 1);
    }
  };
  walk(tree, 1);
  return out;
}

/** Add a new chapter at the end (no parent) or a topic at the end of a parent's children. */
export function addNode(tree: TreeNode[], parentId: string | null, title: string): TreeNode {
  const node = makeNode(title);
  if (parentId === null) {
    tree.push(node);
  } else {
    const parent = findNode(tree, parentId);
    if (!parent) throw new Error("The parent topic was not found.");
    parent.children.push(node);
  }
  return node;
}

export function renameNode(tree: TreeNode[], id: string, title: string): void {
  const node = findNode(tree, id);
  if (node) node.title = title;
}

export function setStatus(tree: TreeNode[], id: string, status: Status): void {
  const node = findNode(tree, id);
  if (node) node.status = status;
}

export function removeNode(tree: TreeNode[], id: string): boolean {
  const where = locate(tree, id);
  if (!where) return false;
  where.siblings.splice(where.index, 1);
  return true;
}

export function moveUp(tree: TreeNode[], id: string): boolean {
  const where = locate(tree, id);
  if (!where || where.index === 0) return false;
  const { siblings, index } = where;
  [siblings[index - 1], siblings[index]] = [siblings[index], siblings[index - 1]];
  return true;
}

export function moveDown(tree: TreeNode[], id: string): boolean {
  const where = locate(tree, id);
  if (!where || where.index >= where.siblings.length - 1) return false;
  const { siblings, index } = where;
  [siblings[index + 1], siblings[index]] = [siblings[index], siblings[index + 1]];
  return true;
}

/** Make a node the last child of the sibling just above it (a chapter becomes a topic). */
export function indent(tree: TreeNode[], id: string): boolean {
  const where = locate(tree, id);
  if (!where || where.index === 0) return false;
  const [node] = where.siblings.splice(where.index, 1);
  where.siblings[where.index - 1].children.push(node);
  return true;
}

/** Move a node up one level, to sit just after its parent (a topic becomes a chapter). */
export function outdent(tree: TreeNode[], id: string): boolean {
  const where = locate(tree, id);
  if (!where || !where.parent) return false;
  const parentWhere = locate(tree, where.parent.id);
  if (!parentWhere) return false;
  const [node] = where.siblings.splice(where.index, 1);
  parentWhere.siblings.splice(parentWhere.index + 1, 0, node);
  return true;
}

/**
 * Moves a node, with everything under it, to be a chapter (`parentId` null) or a child of another node, at a place in that list (1 is first; left out puts it last).
 * Its pictures, page and id stay with it, so a guide that uses it still does. A node cannot be moved under itself or under one of its own topics.
 */
export function moveNode(tree: TreeNode[], id: string, parentId: string | null, position?: number): void {
  const where = locate(tree, id);
  if (!where) throw new Error("The topic was not found.");
  const node = where.siblings[where.index];
  if (parentId !== null) {
    if (parentId === id || findNode(node.children, parentId)) throw new Error("A topic cannot be moved under itself or under one of its own topics.");
    if (!findNode(tree, parentId)) throw new Error("The parent topic was not found.");
  }
  where.siblings.splice(where.index, 1);
  const list = parentId === null ? tree : findNode(tree, parentId)!.children;
  const at = position === undefined ? list.length : Math.min(Math.max(Math.round(position) - 1, 0), list.length);
  list.splice(at, 0, node);
}

/** A readable list of every node, used for screen reader announcements and tests. */
export function outline(tree: TreeNode[]): string[] {
  const numbers = numbering(tree);
  return visibleNodes(tree, new Set()).map(({ node, level }) => `${"  ".repeat(level - 1)}${numbers.get(node.id)} ${node.title}`);
}

// ---- Variables ---------------------------------------------------------------------------
// Variables are written {{NAME}} in text and replaced when the project is exported.

export const CORE_VARIABLES = ["PRODUCT", "VERSION", "COMPANY"];

/** A variable name is capital letters, digits and underscores, so it is easy to type and spot. */
export function cleanVariableName(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Fill in variables. One with no value is left as {{NAME}} so it is easy to see and fix. */
export function expandVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{([A-Z0-9_]+)\}\}/g, (whole, name: string) => (variables[name] ? variables[name] : whole));
}

// ---- Find and replace --------------------------------------------------------------------

function pattern(query: string, matchCase: boolean): RegExp {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), matchCase ? "g" : "gi");
}

/** The nodes whose titles contain the text, in the order they appear. */
export function findNodes(tree: TreeNode[], query: string, matchCase: boolean): TreeNode[] {
  if (!query) return [];
  const re = pattern(query, matchCase);
  return visibleNodes(tree, new Set()).map((r) => r.node).filter((n) => {
    re.lastIndex = 0;
    return re.test(n.title);
  });
}

/** Replace in every title. Returns how many replacements were made. */
export function replaceInTitles(tree: TreeNode[], find: string, replacement: string, matchCase: boolean): number {
  if (!find) return 0;
  const re = pattern(find, matchCase);
  let count = 0;
  for (const { node } of visibleNodes(tree, new Set())) {
    node.title = node.title.replace(re, () => { count++; return replacement; });
  }
  return count;
}

// ---- Pictures ----------------------------------------------------------------------------

export function addPicture(tree: TreeNode[], nodeId: string, picture: Picture): void {
  const node = findNode(tree, nodeId);
  if (!node) throw new Error("The item to add the picture to was not found.");
  node.pictures.push(picture);
}

export function removePicture(tree: TreeNode[], nodeId: string, pictureId: string): Picture | null {
  const node = findNode(tree, nodeId);
  const at = node ? node.pictures.findIndex((p) => p.id === pictureId) : -1;
  if (!node || at < 0) return null;
  // The picture is gone from the page too: its block goes, and a step that had it just loses it.
  if (node.page) forgetPicture(node.page, pictureId);
  return node.pictures.splice(at, 1)[0];
}

/** The page of a topic, made (empty) if it has none yet. */
export function ensurePage(node: TreeNode): Page {
  if (!node.page) node.page = emptyPage();
  return node.page;
}

export function setAltText(tree: TreeNode[], nodeId: string, pictureId: string, altText: string): void {
  const picture = findNode(tree, nodeId)?.pictures.find((p) => p.id === pictureId);
  if (picture) picture.altText = altText;
}

/** Sets a picture's own click circle choices, or removes them (so it follows the project) when `highlight` is `null` or has nothing in it. */
export function setPictureHighlight(tree: TreeNode[], nodeId: string, pictureId: string, highlight: PictureHighlight | null): void {
  const picture = findNode(tree, nodeId)?.pictures.find((p) => p.id === pictureId);
  if (!picture) return;
  const clean = highlight === null ? null : cleanPictureHighlight(highlight);
  if (clean) picture.highlight = clean;
  else delete picture.highlight;
}

/** Sets a picture's own view (cropped, or zoomed on the click), or takes it off (so the whole picture is shown) when `view` is `null`. */
export function setPictureView(tree: TreeNode[], nodeId: string, pictureId: string, view: PictureView | null): void {
  const picture = findNode(tree, nodeId)?.pictures.find((p) => p.id === pictureId);
  if (!picture) return;
  const clean = view === null ? null : cleanPictureView(view, picture);
  if (clean) picture.view = clean;
  else delete picture.view;
}

/** Every picture file the project uses, so unused files are left out when saving. */
export function pictureFiles(tree: TreeNode[]): Set<string> {
  return new Set(visibleNodes(tree, new Set()).flatMap((r) => r.node.pictures.map((p) => p.file)));
}
