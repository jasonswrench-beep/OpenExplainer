// How a project is laid out on disk: a folder holding project.json and structure.json.
// Splitting and joining is kept separate from reading and writing so it can be tested.
import { CURRENT_VERSION, type Project, type TreeNode } from "./model.ts";
import { migrate } from "./migrate.ts";
import { cleanClicks } from "./clicks.ts";
import { cleanHighlight, cleanTreeHighlights } from "./highlight.ts";

export const PROJECT_FILE = "project.json";
export const STRUCTURE_FILE = "structure.json";

export function toFiles(project: Project): Record<string, string> {
  const { tree: rawTree, ...header } = project;
  // Click notes are checked on the way out too, so a password box can never be written to a file.
  const tree = cleanTreeHighlights(cleanClicks(rawTree));
  return {
    [PROJECT_FILE]: JSON.stringify({ ...header, highlight: cleanHighlight(header.highlight) }, null, 2) + "\n",
    [STRUCTURE_FILE]: JSON.stringify({ version: project.version, tree }, null, 2) + "\n",
  };
}

export function fromFiles(files: Record<string, string>): Project {
  const header = JSON.parse(files[PROJECT_FILE] ?? "null");
  const structure = JSON.parse(files[STRUCTURE_FILE] ?? "null");
  if (!header || !structure) throw new Error("This folder is missing project.json or structure.json.");
  if (header.version !== structure.version) throw new Error("The project files do not match each other. They may be from different saves.");
  return migrate({ ...header, tree: structure.tree as TreeNode[] });
}

export { CURRENT_VERSION };
