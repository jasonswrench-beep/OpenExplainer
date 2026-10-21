// The part of making a PDF that talks to the app's shell (src-tauri/src/pdf.rs): a folder on this PC to put the page and its pictures in, a request to print the page to a PDF with the
// browser engine that already shows the app, and clearing the folder away afterwards. Everything about what the page looks like is in src/export/pdf.ts, which needs none of this and
// is tested on its own.
import { invoke } from "@tauri-apps/api/core";
import { readBytes, writeBytes } from "../project/disk.ts";

/** What the browser engine is asked for when it prints: a tagged PDF (so a screen reader can read it) with a bookmark for each heading, the page's own size and margins, and its colours. */
export const PDF_PRINT_OPTIONS = {
  printBackground: true,
  preferCSSPageSize: true,
  generateTaggedPDF: true,
  generateDocumentOutline: true,
  displayHeaderFooter: false,
};

/** A folder to put a page and its pictures in, for one PDF. */
export interface PdfWorkspace {
  /** The page is always this file in the folder. */
  readonly page: string;
  /** Puts a file in the folder (text as UTF-8). Pictures are put beside the page, so the page names them by file name only. */
  write(name: string, content: string | Uint8Array): Promise<void>;
  /** Prints the page to a PDF at `pdf` (a path that ends in .pdf). Rejects with a plain sentence if it cannot. */
  print(pdf: string): Promise<void>;
  /** The path of a file in the folder. */
  path(name: string): string;
  /** Reads a file in the folder. */
  read(name: string): Promise<Uint8Array>;
}

export const PAGE_FILE = "book.html";

const encoder = new TextEncoder();

/** The words for something that went wrong, from whatever the shell sent back. */
export function pdfErrorWords(error: unknown): string {
  const words = typeof error === "string" ? error : error instanceof Error ? error.message : String(error);
  return words.trim() || "The PDF could not be made.";
}

/** Makes the folder, lets `use` work in it, and always clears it away again, whatever happens. */
export async function withPdfWorkspace<T>(use: (workspace: PdfWorkspace) => Promise<T>): Promise<T> {
  let folder: string;
  try {
    folder = await invoke<string>("pdf_workspace");
  } catch (error) {
    throw new Error(pdfErrorWords(error));
  }
  const path = (name: string) => `${folder}\\${name}`;
  const workspace: PdfWorkspace = {
    page: path(PAGE_FILE),
    path,
    write: (name, content) => writeBytes(path(name), typeof content === "string" ? encoder.encode(content) : content),
    read: (name) => readBytes(path(name)),
    print: async (pdf) => {
      try {
        await invoke("print_pdf", { page: path(PAGE_FILE), pdf, options: JSON.stringify(PDF_PRINT_OPTIONS) });
      } catch (error) {
        throw new Error(pdfErrorWords(error));
      }
    },
  };
  try {
    return await use(workspace);
  } finally {
    try { await invoke("pdf_workspace_remove", { path: folder }); } catch { /* what is left is cleared out the next time */ }
  }
}
