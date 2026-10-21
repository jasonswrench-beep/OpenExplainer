// Makes any of the exports from a project and its pictures, as the bytes of the file to save. The app's Export dialog and the MCP server (an AI assistant asking for an export) both use this, so
// an export is the same whoever asked. Saving the bytes where they belong is the caller's. The drawing of marks onto pictures is a function that is passed in (src/render/flatten.ts in the
// window), and the PDF is printed by the app's shell, so the kinds that need either are only made in the app.
import type { Assets } from "../project/package.ts";
import type { Project } from "../project/model.ts";
import { packDocx } from "./docx.ts";
import { packGuideDocx } from "./guide-docx.ts";
import { buildHelpSite } from "./help-site.ts";
import { packJsonExport } from "./json.ts";
import { buildMarkdown } from "./markdown.ts";
import { makeBookPdf, makeGuidePdf } from "./pdf-make.ts";
import { flattenGuide, flattenPlaced, type Flattener } from "./pictures.ts";
import { zip } from "../project/zip.ts";

export type ExportKind = "help-site" | "json" | "markdown" | "word" | "pdf" | "guide-word" | "guide-pdf";

/** The kinds that export one guide. */
export const GUIDE_KINDS: ExportKind[] = ["guide-word", "guide-pdf"];

/** What file a kind makes: a zip to unzip, a Word file or a PDF. */
export const EXPORT_EXTENSION: Record<ExportKind, "zip" | "docx" | "pdf"> = {
  "help-site": "zip", json: "zip", markdown: "zip", word: "docx", pdf: "pdf", "guide-word": "docx", "guide-pdf": "pdf",
};

export interface MakeOptions {
  /** For a guide kind: which guide. */
  guideId?: string;
  /** For the JSON export: put the working comments in, too. */
  comments?: boolean;
  /** Draws a picture with its marks into a PNG (src/render/flatten.ts). */
  flatten: Flattener;
  /** When it was made, for the JSON export. */
  now?: string;
}

export interface MadeExport {
  bytes: Uint8Array;
  extension: "zip" | "docx" | "pdf";
  /** What could not be included, in plain words, for the person to read after. */
  notes: string[];
}

/** Makes an export. Throws an error whose words say why, such as a guide that is not in the project. Nothing in the project is changed. */
export async function makeExport(project: Project, assets: Assets, kind: ExportKind, options: MakeOptions): Promise<MadeExport> {
  const guide = GUIDE_KINDS.includes(kind) ? project.guides.find((g) => g.id === options.guideId) : undefined;
  if (GUIDE_KINDS.includes(kind) && !guide) throw new Error("There is no guide to export. Make one first (the guides are listed by list_guides in MCP, or under Guides in the app).");
  const notes: string[] = [];
  const extension = EXPORT_EXTENSION[kind];
  if (kind === "json") {
    const made = packJsonExport(project, assets, { comments: options.comments === true, now: options.now });
    notes.push(...made.missing.map((file) => `The picture file ${file} is missing from the project, so it is not in the export.`));
    return { bytes: made.bytes, extension, notes };
  }
  // The printed outputs (Word and the PDF) may zoom in on a picture that would print too small; the help site and Markdown are not for paper.
  const flat = guide ? await flattenGuide(project, guide, assets, options.flatten) : await flattenPlaced(project, assets, "book", options.flatten, { paper: kind === "word" || kind === "pdf" });
  notes.push(...flat.missing.map((m) => `The picture "${m}" is missing from the project, so it is not in the export.`), ...flat.failed.map((m) => `The picture "${m}" could not be drawn, so it is not in the export.`));
  let bytes: Uint8Array;
  if (kind === "pdf") {
    const made = await makeBookPdf(project, flat.flat);
    bytes = made.bytes;
    if (!made.numbered) notes.push("The contents list has no page numbers, because the pages of the topics could not be found in the PDF.");
  } else if (kind === "guide-pdf") {
    bytes = (await makeGuidePdf(project, guide!, flat.flat)).bytes;
  } else if (guide) {
    bytes = packGuideDocx(project, guide, flat.flat);
  } else if (kind === "word") {
    bytes = packDocx(project, flat.flat);
  } else {
    bytes = zip(kind === "help-site" ? buildHelpSite(project, flat.flat) : buildMarkdown(project, flat.flat));
  }
  return { bytes, extension, notes };
}
