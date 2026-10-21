// How a project is laid out on disk: a folder holding project.json and structure.json.
// Splitting and joining is kept separate from reading and writing so it can be tested.
import { CURRENT_VERSION, type Project, type TreeNode } from "./model.ts";
import { migrate } from "./migrate.ts";
import { cleanClicks } from "./clicks.ts";
import { cleanHighlight, cleanTreeHighlights } from "./highlight.ts";
import { cleanPage, hasContent } from "./page.ts";
import { cleanTreeCallouts } from "./callouts.ts";
import { cleanTreeViews, cleanZoom } from "./views.ts";
import { cleanTreeShapes } from "./shapes.ts";
import { cleanStyles } from "./styles.ts";
import { cleanChecks } from "./checks.ts";

export const PROJECT_FILE = "project.json";
export const STRUCTURE_FILE = "structure.json";
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

export function toFiles(project: Project): Record<string, string> {
  const { tree: rawTree, ...header } = project;
  // Click notes are checked on the way out too, so a password box can never be written to a file.
  const tree = cleanTreeShapes(cleanTreeViews(cleanTreeCallouts(cleanTreeHighlights(cleanClicks(rawTree)))));
  const files: Record<string, string> = {
    [PROJECT_FILE]: JSON.stringify({ ...header, highlight: cleanHighlight(header.highlight), zoom: cleanZoom(header.zoom), styles: cleanStyles(header.styles), checks: cleanChecks(header.checks) }, null, 2) + "\n",
    [STRUCTURE_FILE]: JSON.stringify({ version: project.version, tree: withoutPages(tree) }, null, 2) + "\n",
  };
  pageFiles(tree, project.version, files);
  return files;
}

export function fromFiles(files: Record<string, string>): Project {
  const header = JSON.parse(files[PROJECT_FILE] ?? "null");
  const structure = JSON.parse(files[STRUCTURE_FILE] ?? "null");
  if (!header || !structure) throw new Error("This folder is missing project.json or structure.json.");
  if (header.version !== structure.version) throw new Error("The project files do not match each other. They may be from different saves.");
  const project = migrate({ ...header, tree: structure.tree as TreeNode[] });
  attachPages(project.tree, files, project.version);
  return project;
}

export { CURRENT_VERSION };
