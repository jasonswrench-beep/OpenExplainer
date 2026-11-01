// Puts what the Word reader found into a book: the chapters go at the end of the contents and their picture files into the package. Nothing here needs a screen, so the program and the assistant tools use the same code.
import type { Project, TreeNode } from "../project/model.ts";
import type { Assets } from "../project/package.ts";
import type { DocxImport } from "./docx.ts";

/** The topics under these nodes, not counting the nodes themselves. */
function below(nodes: TreeNode[]): number {
  return nodes.reduce((sum, n) => sum + n.children.length + below(n.children), 0);
}

/** Adds the imported chapters at the end of the book and their picture files to the package. Returns the chapters, so the first can be selected, and how many topics came with them. */
export function addImported(project: Project, assets: Assets, imported: DocxImport): { chapters: TreeNode[]; topics: number } {
  for (const [file, bytes] of imported.assets) assets.set(file, bytes);
  project.tree.push(...imported.chapters);
  return { chapters: imported.chapters, topics: below(imported.chapters) };
}

/** What the author is told before anything is added: how much, and what was left out. */
export function importQuestion(fileName: string, imported: DocxImport): string {
  return `${fileName}\n\n${imported.report.join("\n")}\n\nAdd them to the end of this book? You can move, rename or delete them afterwards.`;
}
