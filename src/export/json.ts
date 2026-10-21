// JSON with images: the whole book as one readable file (book.json) and the picture files beside it, for another program or for an AI assistant to read. It holds the structure, the text of
// every page, the callouts and marks of every picture, the variables, the click circle and zoom settings, and the named styles. It is saved as a zip. Comments are working notes and are left
// out unless the author asks for them. An export can be read back into a project (readJsonExport). Nothing here needs a screen.
import { fromFiles } from "../project/files.ts";
import { numbering, pictureFiles, type Project, type TreeNode } from "../project/model.ts";
import type { Assets } from "../project/package.ts";
import { PROJECT_FILE, STRUCTURE_FILE, topicFile } from "../project/files.ts";
import { unzip, zip } from "../project/zip.ts";

export const BOOK_FILE = "book.json";
export const EXPORT_FORMAT = "openexplainer-export";
/** Changes whenever the layout of book.json changes in a way a reader of it would notice. */
export const EXPORT_VERSION = 1;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface JsonExportOptions {
  /** Put the working comments in, too. Off unless asked for. */
  comments?: boolean;
  /** When it was made, as an ISO date and time. */
  now?: string;
}

interface ExportNode {
  id: string;
  /** The topic's number in the book, such as 2.1. Informational: it is worked out again when the file is read. */
  number: string;
  title: string;
  status: string;
  page?: unknown;
  /** The topic's index terms, if it has any. */
  index?: unknown;
  pictures: unknown[];
  children: ExportNode[];
}

function exportNodes(nodes: TreeNode[], numbers: Map<string, string>, comments: boolean): ExportNode[] {
  return nodes.map((node) => {
    const page = node.page && node.page.blocks.length > 0 ? { blocks: node.page.blocks, ...(comments && node.page.comments ? { comments: node.page.comments } : {}) } : undefined;
    return { id: node.id, number: numbers.get(node.id) ?? "", title: node.title, status: node.status, ...(page ? { page } : {}), ...(node.index ? { index: node.index } : {}), pictures: node.pictures, children: exportNodes(node.children, numbers, comments) };
  });
}

/** The files of a JSON export: book.json and the picture files the book uses. `missing` names the picture files that were not in the project. */
export function buildJsonExport(project: Project, assets: Assets, options: JsonExportOptions = {}): { files: Record<string, Uint8Array>; missing: string[] } {
  const numbers = numbering(project.tree);
  const book = {
    format: EXPORT_FORMAT,
    exportVersion: EXPORT_VERSION,
    projectVersion: project.version,
    ...(options.now ? { exportedAt: options.now } : {}),
    name: project.name,
    template: project.template,
    variables: project.variables,
    highlight: project.highlight,
    zoom: project.zoom,
    styles: project.styles,
    guides: project.guides,
    paper: project.paper,
    tree: exportNodes(project.tree, numbers, options.comments === true),
  };
  const files: Record<string, Uint8Array> = { [BOOK_FILE]: encoder.encode(JSON.stringify(book, null, 2) + "\n") };
  const missing: string[] = [];
  for (const file of pictureFiles(project.tree)) {
    const bytes = assets.get(file);
    if (bytes) files[file] = bytes;
    else missing.push(file);
  }
  return { files, missing };
}

/** A JSON export as the bytes of one zip file. */
export function packJsonExport(project: Project, assets: Assets, options: JsonExportOptions = {}): { bytes: Uint8Array; missing: string[] } {
  const { files, missing } = buildJsonExport(project, assets, options);
  return { bytes: zip(files), missing };
}

/**
 * Reads an export back into a project. It is made from the same files a saved project is made from, so it goes through the same cleaning and upgrading: nothing odd in a hand-made
 * file reaches the project. An export that is not one, that is damaged, or that a newer program made is refused in plain words.
 */
export function readJsonExport(files: Record<string, Uint8Array>): { project: Project; assets: Assets; missing: string[] } {
  const raw = files[BOOK_FILE];
  if (!raw) throw new Error(`This is not an OpenExplainer export: it has no ${BOOK_FILE}.`);
  let book: Record<string, unknown>;
  try {
    book = JSON.parse(decoder.decode(raw));
  } catch {
    throw new Error(`The ${BOOK_FILE} in this export is damaged, so nothing was imported.`);
  }
  if (typeof book !== "object" || book === null || book.format !== EXPORT_FORMAT) throw new Error("This is not an OpenExplainer export.");
  if (typeof book.exportVersion !== "number" || book.exportVersion > EXPORT_VERSION) {
    throw new Error(`This export was made by a newer OpenExplainer (export format ${String(book.exportVersion)}). Update OpenExplainer to import it.`);
  }
  if (typeof book.projectVersion !== "number") throw new Error("This export does not say which project format it uses, so it cannot be imported safely.");
  const version = book.projectVersion;
  const topicFiles: Record<string, string> = {};
  const strip = (nodes: unknown): unknown[] =>
    (Array.isArray(nodes) ? nodes : []).map((n) => {
      const node = (typeof n === "object" && n !== null ? n : {}) as Record<string, unknown>;
      const { number: _number, page, children, ...rest } = node;
      if (typeof node.id === "string" && typeof page === "object" && page !== null) topicFiles[topicFile(node.id)] = JSON.stringify({ version, ...(page as object) });
      return { ...rest, children: strip(children) };
    });
  const tree = strip(book.tree);
  const header = { version, name: book.name, template: book.template, variables: book.variables, highlight: book.highlight, zoom: book.zoom, styles: book.styles, guides: book.guides, paper: book.paper };
  const project = fromFiles({
    [PROJECT_FILE]: JSON.stringify(header),
    [STRUCTURE_FILE]: JSON.stringify({ version, tree }),
    ...topicFiles,
  });
  const assets: Assets = new Map();
  for (const [name, data] of Object.entries(files)) if (name.startsWith("images/")) assets.set(name, data);
  const missing = [...pictureFiles(project.tree)].filter((file) => !assets.has(file));
  return { project, assets, missing };
}

/** Reads the bytes of a zip made by packJsonExport back into a project. */
export async function unpackJsonExport(bytes: Uint8Array): Promise<{ project: Project; assets: Assets; missing: string[] }> {
  return readJsonExport(await unzip(bytes));
}

