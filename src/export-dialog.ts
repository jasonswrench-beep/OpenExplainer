// The Export dialog: which kind of export to make and its options. The author can run the book check first (optional, never required). Making the files and saving them is done by main.ts;
// this only asks. The kinds are made by src/export/.
import { open } from "./dialogs.ts";

export type ExportKind = "help-site" | "json" | "markdown" | "word" | "pdf" | "guide-word" | "guide-pdf";

/** The kinds that export one guide, chosen below the list. */
export const GUIDE_KINDS: ExportKind[] = ["guide-word", "guide-pdf"];

export interface ExportChoice {
  kind: ExportKind;
  /** For the JSON export: put the working comments in, too. */
  comments: boolean;
  /** For a guide: which one. */
  guideId?: string;
}

export const EXPORT_KINDS: { id: ExportKind; name: string; words: string }[] = [
  { id: "help-site", name: "Help site", words: "A folder of web pages, one for each topic, with the contents tree, breadcrumbs, previous and next links, search and a Print this page button. Saved as a zip file; unzip it and open index.html." },
  { id: "json", name: "JSON with images", words: "The whole book as one readable file, book.json (structure, text, callouts, marks, variables), with the picture files beside it, for other programs and AI assistants. It can be imported back. Saved as a zip file." },
  { id: "markdown", name: "Markdown", words: "The whole book as one plain text file, book.md, with each picture as a linked PNG file (cut to the part shown, with its marks drawn in). Saved as a zip file." },
  { id: "word", name: "Word", words: "The whole book as one Word document (.docx) that you can edit and restyle: real headings, numbered steps that start again at 1 for each procedure, callout boxes, a contents list with links, and every picture cut to the part shown with its marks drawn in and its description as alternative text." },
  { id: "pdf", name: "PDF", words: "The whole book as a PDF made for paper: tagged so a screen reader can read it, with a bookmark for each heading, a running header, page numbers, and a contents list with page numbers. Making it takes a moment." },
  { id: "guide-word", name: "Guide (Word)", words: "One short step-by-step guide, chosen below, as a Word document you can edit: its name, each task, and each step with its heading, its picture with the step's number on the clicked spot, a close-up, and its words, in the layout the guide uses." },
  { id: "guide-pdf", name: "Guide (PDF)", words: "One short step-by-step guide, chosen below, as a PDF made for paper, tagged for a screen reader, with a bookmark for each heading, a running header and page numbers." },
];

/** Asks what to export. `checkFirst` opens the book check; it is offered, never required. Returns the choice, or `null` if cancelled. */
export async function exportDialog(options: { checkFirst(): void; unresolved: number; guides: { id: string; name: string }[] }): Promise<ExportChoice | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">Export</h2>
      <p class="help" id="ex-intro">Choose what to make. The book is exported as it prints: pictures use the book's click circle and zoom settings. Comments are working notes and are not included unless you ask for them in the JSON export.</p>
      <fieldset id="ex-kinds"><legend>What to export</legend></fieldset>
      <p id="ex-json" hidden><label><input type="checkbox" id="ex-comments"> Include the working comments in the JSON export</label></p>
      <p id="ex-guide" hidden><label for="ex-guide-pick">Guide to export</label> <select id="ex-guide-pick"></select></p>
      <p class="help" id="ex-check-note"></p>
      <p><button type="button" id="ex-check">Check the book first (optional)</button></p>
      <p><button value="ok">Export</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const kinds = dialog.querySelector<HTMLElement>("#ex-kinds")!;
  EXPORT_KINDS.forEach((kind, i) => {
    const p = document.createElement("p");
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "ex-kind";
    radio.value = kind.id;
    radio.id = `ex-kind-${kind.id}`;
    radio.checked = i === 0;
    // A guide cannot be exported when there are none: the choice is there, switched off, and says why.
    if (GUIDE_KINDS.includes(kind.id) && options.guides.length === 0) radio.disabled = true;
    const words = document.createElement("span");
    words.className = "help";
    words.id = `ex-kind-${kind.id}-words`;
    words.textContent = GUIDE_KINDS.includes(kind.id) && options.guides.length === 0 ? `${kind.words} There are no guides yet: choose Guides in the toolbar to make one.` : kind.words;
    radio.setAttribute("aria-describedby", words.id);
    label.append(radio, ` ${kind.name}`);
    p.append(label, document.createElement("br"), words);
    kinds.append(p);
  });
  dialog.querySelector("#ex-check-note")!.textContent = options.unresolved > 0
    ? `The book has ${options.unresolved} unresolved ${options.unresolved === 1 ? "comment" : "comments"}. The check is optional and only advises: you can export without it.`
    : "The check is optional and only advises: you can export without it.";
  const jsonBox = dialog.querySelector<HTMLElement>("#ex-json")!;
  const guideBox = dialog.querySelector<HTMLElement>("#ex-guide")!;
  const guidePick = dialog.querySelector<HTMLSelectElement>("#ex-guide-pick")!;
  for (const guide of options.guides) {
    const option = document.createElement("option");
    option.value = guide.id;
    option.textContent = guide.name;
    guidePick.append(option);
  }
  const selected = () => (dialog.querySelector<HTMLInputElement>('input[name="ex-kind"]:checked')!.value as ExportKind);
  const sync = () => { jsonBox.hidden = selected() !== "json"; guideBox.hidden = !GUIDE_KINDS.includes(selected()); };
  dialog.querySelectorAll('input[name="ex-kind"]').forEach((r) => r.addEventListener("change", sync));
  dialog.querySelector("#ex-check")!.addEventListener("click", () => options.checkFirst());
  let result: ExportChoice | null = null;
  dialog.querySelector<HTMLFormElement>("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    if ((event.submitter as HTMLButtonElement | null)?.value === "cancel") return dialog.close("cancel");
    result = { kind: selected(), comments: selected() === "json" && dialog.querySelector<HTMLInputElement>("#ex-comments")!.checked, ...(GUIDE_KINDS.includes(selected()) ? { guideId: guidePick.value } : {}) };
    dialog.close("ok");
  });
  sync();
  await open(dialog, dialog.querySelector<HTMLElement>("#ex-kind-help-site")!);
  return dialog.returnValue === "ok" ? result : null;
}
