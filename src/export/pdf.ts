// A book or a guide as the page that is printed to a PDF, and reading back where each topic landed. The page is the print preview's HTML (src/render/print.ts, guide.ts) with the pictures
// already cut and drawn on (flat pictures), in a stylesheet made for paper (src/export/pdf-css.ts). The browser engine prints it (src-tauri/src/pdf.rs), which gives the PDF its real text, tags for
// a screen reader, a bookmark for each heading and a link for each contents entry. Page numbers in the contents are found by printing once: every contents entry links to its topic, and a
// PDF keeps each link's target as a named place with its page, which `anchorPages` reads. Nothing here needs a screen or the shell, so all of it is tested on its own.
import type { Guide } from "../project/guides.ts";
import type { Project, TreeNode } from "../project/model.ts";
import { renderGuide } from "../render/guide.ts";
import { esc, fillVariables, type RenderContext } from "../render/html.ts";
import { renderPrintPreview, topicAnchor, type ContentsPages } from "../render/print.ts";
import { pdfCss } from "./pdf-css.ts";
import { guideKey, type FlatPicture } from "./pictures.ts";

/** The name of a flat picture's file once it is put beside the page. */
export const pictureName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** The picture files to put beside the page, by file name. */
export function pictureFiles(flat: Map<string, FlatPicture>): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const f of flat.values()) out[pictureName(f.path)] = f.bytes;
  return out;
}

function document(title: string, header: string, bareFirstPage: boolean, body: string): string {
  // The page can show only its own words and pictures: no script, and nothing from the network.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'">
<title>${esc(title)}</title>
<style>${pdfCss({ header, bareFirstPage })}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

function context(project: Project, flat: Map<string, FlatPicture>): RenderContext {
  return {
    project,
    place: "book",
    paper: true,
    notes: false,
    flat: true,
    // A guide's pictures are made for each step (and a close-up), so they are found by the step; a book's by the picture.
    imageSrc: (picture, use) => {
      const made = use ? flat.get(guideKey(use.stepId, use.closeUp)) : flat.get(picture.id);
      return made ? pictureName(made.path) : null;
    },
  };
}

/** The words to print in the contents of a first pass, before any page is known. They are as wide as the real ones will be, so the pages do not move when the real ones go in. */
export function placeholderPages(project: Project): ContentsPages {
  const pages: ContentsPages = new Map();
  const walk = (nodes: TreeNode[]) => nodes.forEach((n) => { pages.set(n.id, "000"); walk(n.children); });
  walk(project.tree);
  return pages;
}

/** The whole book as the page to print. With `pages` its contents has page numbers; without, it has none. */
export function bookPdfHtml(project: Project, flat: Map<string, FlatPicture>, pages?: ContentsPages): string {
  const title = fillVariables(project.name, project.variables);
  const built = renderPrintPreview(context(project, flat), { pages });
  return document(title, title, true, built.html);
}

/** One guide as the page to print. */
export function guidePdfHtml(project: Project, guide: Guide, flat: Map<string, FlatPicture>): string {
  const title = fillVariables(guide.name, project.variables);
  return document(title, title, false, renderGuide(context(project, flat), guide).html);
}

// ---- Reading where each topic landed --------------------------------------------------------------------------

const latin1 = (bytes: Uint8Array) => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
};

/**
 * The page (counting from 1) each named place in a PDF is on. A link to `#pv-topic-x` in the page is kept in the PDF as the name `pv-topic-x` and where it goes, so this is how the
 * page of every topic is found. It reads only what it needs: the table of where each object is, the page list, and the table of names. Anything it does not understand gives an
 * empty answer (the contents then has no page numbers), never a wrong one.
 */
export function anchorPages(pdf: Uint8Array): Map<string, number> {
  const answer = new Map<string, number>();
  try {
    const text = latin1(pdf);
    const start = [...text.matchAll(/startxref\s+(\d+)/g)].pop();
    if (!start) return answer;
    const table = text.slice(Number(start[1]));
    const head = /^xref\s+(\d+)\s+(\d+)\s/.exec(table);
    if (!head) return answer; // a newer kind of table, which this does not read
    const offsets = new Map<number, number>();
    const first = Number(head[1]);
    const rows = table.slice(head[0].length).split(/\r?\n|\r/).slice(0, Number(head[2]));
    rows.forEach((row, i) => { const m = /^(\d{10}) (\d{5}) n/.exec(row.trim()); if (m) offsets.set(first + i, Number(m[1])); });
    const body = (n: number): string | null => {
      const at = offsets.get(n);
      if (at === undefined) return null;
      const end = text.indexOf("endobj", at);
      return text.slice(at, end < 0 ? at + 20000 : Math.min(end, at + 200000));
    };
    const root = /\/Root\s+(\d+)\s+\d+\s+R/.exec(text.slice(text.lastIndexOf("trailer")));
    const catalog = root ? body(Number(root[1])) : null;
    if (!catalog) return answer;
    // The pages, in order.
    const pageNumber = new Map<number, number>();
    const visit = (n: number, seen: Set<number>) => {
      if (seen.has(n)) return;
      seen.add(n);
      const dict = body(n);
      if (!dict) return;
      if (/\/Type\s*\/Pages\b/.test(dict)) {
        const kids = /\/Kids\s*\[([^\]]*)\]/.exec(dict);
        for (const m of (kids?.[1] ?? "").matchAll(/(\d+)\s+\d+\s+R/g)) visit(Number(m[1]), seen);
      } else if (/\/Type\s*\/Page\b/.test(dict)) pageNumber.set(n, pageNumber.size + 1);
    };
    const pages = /\/Pages\s+(\d+)\s+\d+\s+R/.exec(catalog);
    if (!pages) return answer;
    visit(Number(pages[1]), new Set());
    // The names, each with the page it points into.
    const dests = /\/Dests\s+(\d+)\s+\d+\s+R/.exec(catalog);
    const names = dests ? body(Number(dests[1])) : null;
    if (!names) return answer;
    for (const m of names.matchAll(/\/([^\s/\[\]<>()]+)\s*\[\s*(\d+)\s+\d+\s+R/g)) {
      const page = pageNumber.get(Number(m[2]));
      // A name can write a character as #XX.
      const name = m[1].replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      if (page !== undefined) answer.set(name, page);
    }
  } catch {
    answer.clear();
  }
  return answer;
}

/** The page of each chapter and topic, from where a first printing put them. `null` when none could be found, so the contents is left without numbers rather than with wrong ones. */
export function pageNumbersFor(project: Project, anchors: Map<string, number>): ContentsPages | null {
  const pages: ContentsPages = new Map();
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      const page = anchors.get(topicAnchor(node.id));
      if (page !== undefined) pages.set(node.id, String(page));
      walk(node.children);
    }
  };
  walk(project.tree);
  return pages.size > 0 ? pages : null;
}

/** Are the numbers the same as the ones the page was printed with? Then nothing moved, and the PDF is right. */
export function samePages(a: ContentsPages, b: ContentsPages): boolean {
  if (a.size !== b.size) return false;
  for (const [id, page] of a) if (b.get(id) !== page) return false;
  return true;
}
