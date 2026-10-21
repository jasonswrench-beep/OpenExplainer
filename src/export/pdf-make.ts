// Makes the PDF of a book or a guide: puts the page and its pictures in a folder, has the shell print it, and, for a book, prints it again with the page numbers the first printing found, so the
// contents list has real page numbers. If the numbers move the pages (a longer number pushes a line over), it prints once more with the new ones. The page itself is in src/export/pdf.ts and
// the shell is reached through src/export/pdf-job.ts. This returns the PDF's bytes; saving them where the author chose is the caller's.
import type { Guide } from "../project/guides.ts";
import type { Project } from "../project/model.ts";
import type { ContentsPages } from "../render/print.ts";
import { PAGE_FILE, withPdfWorkspace, type PdfWorkspace } from "./pdf-job.ts";
import { anchorPages, bookPdfHtml, guidePdfHtml, pageNumbersFor, pictureFiles, placeholderPages, samePages } from "./pdf.ts";
import type { FlatPicture } from "./pictures.ts";

export interface PdfResult {
  bytes: Uint8Array;
  /** For a book: did the contents get page numbers? `false` when the pages of the topics could not be found in the PDF (the contents is then left without numbers). */
  numbered: boolean;
  /** How many times the page was printed to get there (a guide is printed once; a book once more to settle its page numbers). */
  prints: number;
}

/** The most times a book is printed to settle its contents. */
const MOST_PRINTS = 4;

async function putPictures(workspace: PdfWorkspace, flat: Map<string, FlatPicture>) {
  for (const [name, bytes] of Object.entries(pictureFiles(flat))) await workspace.write(name, bytes);
}

/** The book as a PDF: tagged, with a bookmark for each heading, a running header, page numbers, and a contents list with page numbers. */
export async function makeBookPdf(project: Project, flat: Map<string, FlatPicture>): Promise<PdfResult> {
  return withPdfWorkspace(async (workspace) => {
    await putPictures(workspace, flat);
    // The first printing has stand-in numbers of the right width, only to find where each topic lands.
    let used: ContentsPages = placeholderPages(project);
    let bytes: Uint8Array | null = null;
    let numbered = false;
    let prints = 0;
    for (let print = 1; print <= MOST_PRINTS; print++) {
      await workspace.write(PAGE_FILE, bookPdfHtml(project, flat, used));
      const file = `print-${print}.pdf`;
      await workspace.print(workspace.path(file));
      prints++;
      bytes = await workspace.read(file);
      const found = pageNumbersFor(project, anchorPages(bytes));
      if (!found) { numbered = false; break; }
      numbered = true;
      // The same numbers as the ones this printing used: nothing moved, so it is right.
      if (samePages(found, used)) break;
      used = found;
    }
    if (!bytes) throw new Error("The PDF could not be made.");
    if (!numbered) {
      // No page numbers could be found, so the page is printed again without any (the stand-ins would be wrong in the finished book).
      await workspace.write(PAGE_FILE, bookPdfHtml(project, flat));
      await workspace.print(workspace.path("print-plain.pdf"));
      prints++;
      bytes = await workspace.read("print-plain.pdf");
    }
    return { bytes, numbered, prints };
  });
}

/** One guide as a PDF: tagged, with a bookmark for each heading, a running header and page numbers. */
export async function makeGuidePdf(project: Project, guide: Guide, flat: Map<string, FlatPicture>): Promise<PdfResult> {
  return withPdfWorkspace(async (workspace) => {
    await putPictures(workspace, flat);
    await workspace.write(PAGE_FILE, guidePdfHtml(project, guide, flat));
    await workspace.print(workspace.path("guide.pdf"));
    return { bytes: await workspace.read("guide.pdf"), numbered: true, prints: 1 };
  });
}
