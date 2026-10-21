// The stylesheet of the page that is printed to a PDF (src/export/pdf.ts). It is the print preview's look, made for paper: a letter page with its margins, a running header and a page number in
// the margin (written as CSS margin boxes, which the browser engine prints), each chapter or task on a new page, pictures that never split across pages, and the book's contents with page
// numbers and dotted leaders. The page's text is black on white and the sizes are in points and inches, because this is for paper, not for a screen.

/** A piece of text as a CSS string, safe to put between double quotes. */
export function cssString(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ").replace(/</g, "\\3C ");
}

export interface PdfCssOptions {
  /** The running header, in the top margin of every page after the first when `bareFirstPage`. */
  header: string;
  /** The first page is a title page, with no running header and no page number. */
  bareFirstPage: boolean;
}

export function pdfCss(options: PdfCssOptions): string {
  const first = options.bareFirstPage ? "@page :first { @top-left { content: none; } @bottom-center { content: none; } }" : "";
  return `
@page {
  size: Letter;
  margin: 1in 1in 0.9in 1in;
  @top-left { content: "${cssString(options.header)}"; font: 9pt "Segoe UI", Calibri, Arial, sans-serif; color: #333; }
  @bottom-center { content: counter(page); font: 10pt "Segoe UI", Calibri, Arial, sans-serif; color: #333; }
}
${first}
html { font-family: Georgia, "Times New Roman", serif; font-size: 11pt; line-height: 1.4; color: #111; background: #fff; }
body { margin: 0; }
h1, h2, h3, h4, h5, h6 { break-after: avoid; font-family: "Segoe UI", Calibri, Arial, sans-serif; line-height: 1.2; }
h1 { font-size: 22pt; margin: 0 0 0.5em; }
h2 { font-size: 16pt; margin: 1.2em 0 0.4em; }
h3 { font-size: 13pt; margin: 1.1em 0 0.4em; }
h4, h5, h6 { font-size: 11.5pt; margin: 1em 0 0.3em; }
p { margin: 0.4em 0; orphans: 3; widows: 3; }
.pv-book > .pv-sheet { break-before: page; }
.pv-book > .pv-sheet:first-child { break-before: auto; }
.pv-title-page { text-align: center; min-height: 8in; display: flex; flex-direction: column; justify-content: center; }
.pv-book-title { font-size: 34pt !important; }
.pv-title-page p { font-size: 14pt; margin: 0.3em 0; }
.pv-toc-list { list-style: none; padding-left: 1.3em; margin: 0; }
.pv-toc > .pv-toc-list { padding-left: 0; }
.pv-toc-list li { margin: 0.18em 0; }
.pv-toc-list a { color: inherit; text-decoration: none; display: flex; align-items: baseline; gap: 0.4em; }
.pv-toc-leader { flex: 1 1 auto; border-bottom: 1px dotted #555; min-width: 1em; transform: translateY(-0.25em); }
.pv-toc-page { flex: 0 0 auto; min-width: 2em; text-align: right; font-variant-numeric: tabular-nums; }
.pv-chapter-number { text-transform: uppercase; letter-spacing: 0.12em; font-size: 10pt; margin: 0; color: #444; font-family: "Segoe UI", Calibri, Arial, sans-serif; }
.pv-in-chapter { border: 1.5pt solid #222; padding: 0.3em 1em; margin: 1em 0 1.4em; break-inside: avoid; }
.pv-in-chapter-title { font-size: 12pt; margin: 0.2em 0; }
.pv-in-chapter ul { margin: 0.2em 0; padding-left: 1.2em; }
.pv-in-chapter a { color: inherit; text-decoration: none; }
.pv-number { margin-right: 0.4em; color: #333; }
.pv-figure { margin: 0.7em 0; width: 100%; break-inside: avoid; }
.pv-figure img { display: block; width: 100%; height: auto; max-height: 8.2in; object-fit: contain; object-position: left top; }
.pv-entries { margin: 0.3em 0 0; padding: 0; list-style: none; font-family: "Segoe UI", Calibri, Arial, sans-serif; font-size: 9.5pt; }
.pv-steps { padding-left: 1.5em; }
.pv-steps li { margin: 0.5em 0; break-inside: avoid; }
.pv-result { margin: 0.3em 0; }
.pv-box { border: 0.75pt solid #555; border-left-width: 6pt; padding: 0.2em 0.8em; margin: 0.9em 0; font-family: "Segoe UI", Calibri, Arial, sans-serif; font-size: 10.5pt; background: #f6f7f9; break-inside: avoid; }
.pv-box p { margin: 0.3em 0; }
.pv-box-label { font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-size: 9pt; }
.pv-box-design-tip { border-left-color: #1f4e8c; }
.pv-box-caution { border-left-color: #a31515; }
.pv-box-bright-idea { border-left-color: #8a6d00; }
.pv-box-power-tip { border-left-color: #5a2a82; }
.pv-box-time-saver { border-left-color: #1b6b2f; }
.pv-box-new-feature { border-left-color: #00606b; }
.pv-missing { font-family: "Segoe UI", Calibri, Arial, sans-serif; color: #8a1c1c; font-weight: 600; }
.gd-title { font-size: 26pt !important; margin-bottom: 0.3em !important; }
.gd-task-title { font-size: 18pt; margin: 0.8em 0 0.5em; }
.gd-step { margin: 1.1em 0; }
.gd-step-heading { font-size: 11pt; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 0.4em; color: #1f4e8c; }
.gd-step-text { font-size: 11.5pt; margin: 0.2em 0 0.4em; }
.gd-pictures .pv-figure { margin: 0 0 0.5em; }
.gd-step-top .gd-closeup { width: 55%; margin: 0 auto; }
.gd-step-left { display: grid; grid-template-columns: minmax(0, 44%) minmax(0, 1fr); column-gap: 0.25in; align-items: start; }
.gd-step-left .gd-step-heading { grid-column: 1 / -1; }
.gd-step-left .gd-pictures { grid-column: 1; }
.gd-step-left .gd-words { grid-column: 2; }
.gd-step-left.gd-step-nopicture { display: block; }
.gd-step { break-inside: avoid; }
`;
}
