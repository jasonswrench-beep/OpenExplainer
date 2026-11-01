// How a project is laid out on disk: a folder holding project.json and structure.json.
// Splitting and joining is kept separate from reading and writing so it can be tested.
import { CURRENT_VERSION, type Project, type TreeNode } from "./model.ts";
import { migrate } from "./migrate.ts";
import { cleanClicks } from "./clicks.ts";
import { cleanHighlight, cleanTreeHighlights } from "./highlight.ts";
import { cleanPage, hasContent } from "./page.ts";
import { cleanTreeCallouts } from "./callouts.ts";
import { cleanPaper, cleanTreeViews, cleanZoom } from "./views.ts";
import { cleanTreeShapes } from "./shapes.ts";
import { cleanStyles } from "./styles.ts";
import { cleanChecks } from "./checks.ts";
import { cleanGuides } from "./guides.ts";
import { cleanTreeIndex } from "./book-index.ts";
import { cleanDrafts, cleanWritingStyle } from "./drafts.ts";
import { cleanAvoidWords } from "./avoid-words.ts";
import { cleanTreeSeeAlso } from "./links.ts";
import { cleanLook } from "./look.ts";
import { cleanConditions, cleanSnippets, cleanTargets, cleanTreeConditions } from "./snippets.ts";

export const PROJECT_FILE = "project.json";
export const STRUCTURE_FILE = "structure.json";
/** The AI drafts that are waiting for the author (format version 14), only when there are some. */
export const DRAFTS_FILE = "drafts.json";
/** A topic's page is saved as topics/<its id>.json, and only when it has something on it. */
export const TOPICS_FOLDER = "topics/";

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const topicFile = (id: string) => `${TOPICS_FOLDER}${id}.json`;

const pictureIdsOf = (node: TreeNode) => new Set(node.pictures.map((p) => p.id));

/** The tree without its pages, which are saved in their own files, so structure.json stays small and easy to read. */
function withoutPages(tree: TreeNode[]): TreeNode[] {
  return tree.map(({ page: _page, ...node }) => ({ ...node, children: withoutPages(node.children ?? []) }));
}

/** The pages worth saving, each as the text of its file. */
function pageFiles(tree: TreeNode[], version: number, into: Record<string, string>): void {
  for (const node of tree) {
    if (hasContent(node.page) && SAFE_ID.test(node.id)) {
      const page = cleanPage(node.page, pictureIdsOf(node));
      if (page.blocks.length > 0) into[topicFile(node.id)] = JSON.stringify({ version, blocks: page.blocks, ...(page.comments ? { comments: page.comments } : {}) }, null, 2) + "\n";
    }
    pageFiles(node.children ?? [], version, into);
  }
}

/** Reads each topic's page file, if there is one, and puts the page on the topic. A damaged page file is refused rather than lost. */
function attachPages(tree: TreeNode[], files: Record<string, string>, version: number): void {
  for (const node of tree) {
    const text = SAFE_ID.test(node.id) ? files[topicFile(node.id)] : undefined;
    if (text !== undefined) {
      let parsed: { version?: unknown } & Record<string, unknown>;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`The page of the topic "${node.title}" is damaged, so the project was not opened. Nothing was changed.`);
      }
      if (parsed.version !== version) throw new Error("The project files do not match each other. They may be from different saves.");
      const page = cleanPage(parsed, pictureIdsOf(node));
      if (page.blocks.length > 0) node.page = page;
    }
    attachPages(node.children ?? [], files, version);
  }
}

/** Reads drafts.json, if there is one, and puts the drafts on the project. A damaged file is refused rather than lost. */
function attachDrafts(project: Project, files: Record<string, string>, savedVersion: number): void {
  const text = files[DRAFTS_FILE];
  if (text === undefined) return;
  let parsed: { version?: unknown; drafts?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The file of AI drafts is damaged, so the project was not opened. Nothing was changed.");
  }
  if (!parsed || parsed.version !== savedVersion) throw new Error("The project files do not match each other. They may be from different saves.");
  project.drafts = cleanDrafts(parsed.drafts, project.tree);
}

export function toFiles(project: Project): Record<string, string> {
  const { tree: rawTree, drafts: rawDrafts, writingStyle: rawStyle, avoidWords: rawAvoid, ...header } = project;
  // Click notes are checked on the way out too, so a password box can never be written to a file.
  const tree = cleanTreeConditions(cleanTreeSeeAlso(cleanTreeIndex(cleanTreeShapes(cleanTreeViews(cleanTreeCallouts(cleanTreeHighlights(cleanClicks(rawTree))))))), cleanConditions(project.conditions));
  const writingStyle = cleanWritingStyle(rawStyle);
  const avoidWords = cleanAvoidWords(rawAvoid);
  const files: Record<string, string> = {
    [PROJECT_FILE]: JSON.stringify({ ...header, highlight: cleanHighlight(header.highlight), zoom: cleanZoom(header.zoom), styles: cleanStyles(header.styles), checks: cleanChecks(header.checks), guides: cleanGuides(header.guides, tree), paper: cleanPaper(header.paper), look: cleanLook(header.look), snippets: cleanSnippets(header.snippets), conditions: cleanConditions(header.conditions), targets: cleanTargets(header.targets, cleanConditions(header.conditions)), ...(writingStyle ? { writingStyle } : {}), ...(avoidWords.length > 0 ? { avoidWords } : {}) }, null, 2) + "\n",
    [STRUCTURE_FILE]: JSON.stringify({ version: project.version, tree: withoutPages(tree) }, null, 2) + "\n",
  };
  pageFiles(tree, project.version, files);
  const drafts = cleanDrafts(rawDrafts, tree);
  if (drafts.length > 0) files[DRAFTS_FILE] = JSON.stringify({ version: project.version, drafts }, null, 2) + "\n";
  return files;
}

export function fromFiles(files: Record<string, string>): Project {
  const header = JSON.parse(files[PROJECT_FILE] ?? "null");
  const structure = JSON.parse(files[STRUCTURE_FILE] ?? "null");
  if (!header || !structure) throw new Error("This folder is missing project.json or structure.json.");
  if (header.version !== structure.version) throw new Error("The project files do not match each other. They may be from different saves.");
  const project = migrate({ ...header, tree: structure.tree as TreeNode[] });
  // Every file of one save carries the version it was saved with, so the page and draft files are compared with that, not with the version the project has been upgraded to.
  attachPages(project.tree, files, header.version);
  // The pages are on now, so a condition that is not the project's is taken off their blocks and steps as well.
  project.tree = cleanTreeConditions(project.tree, project.conditions);
  attachDrafts(project, files, header.version);
  return project;
}

export { CURRENT_VERSION };
