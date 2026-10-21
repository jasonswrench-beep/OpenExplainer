// The Export dialog: which kind of export to make and its options. The author can run the book check first (optional, never required). Making the files and saving them is done by main.ts;
// this only asks. The kinds are made by src/export/.
import { open } from "./dialogs.ts";

export type ExportKind = "help-site" | "json" | "markdown";

export interface ExportChoice {
  kind: ExportKind;
  /** For the JSON export: put the working comments in, too. */
  comments: boolean;
}

export const EXPORT_KINDS: { id: ExportKind; name: string; words: string }[] = [
  { id: "help-site", name: "Help site", words: "A folder of web pages, one for each topic, with the contents tree, breadcrumbs, previous and next links, search and a Print this page button. Saved as a zip file; unzip it and open index.html." },
  { id: "json", name: "JSON with images", words: "The whole book as one readable file, book.json (structure, text, callouts, marks, variables), with the picture files beside it, for other programs and AI assistants. It can be imported back. Saved as a zip file." },
  { id: "markdown", name: "Markdown", words: "The whole book as one plain text file, book.md, with each picture as a linked PNG file (cut to the part shown, with its marks drawn in). Saved as a zip file." },
];

/** Asks what to export. `checkFirst` opens the book check; it is offered, never required. Returns the choice, or `null` if cancelled. */
export async function exportDialog(options: { checkFirst(): void; unresolved: number }): Promise<ExportChoice | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">Export</h2>
      <p class="help" id="ex-intro">Choose what to make. The book is exported as it prints: pictures use the book's click circle and zoom settings. Comments are working notes and are not included unless you ask for them in the JSON export.</p>
      <fieldset id="ex-kinds"><legend>What to export</legend></fieldset>
      <p id="ex-json" hidden><label><input type="checkbox" id="ex-comments"> Include the working comments in the JSON export</label></p>
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
    const words = document.createElement("span");
    words.className = "help";
    words.id = `ex-kind-${kind.id}-words`;
    words.textContent = kind.words;
    radio.setAttribute("aria-describedby", words.id);
    label.append(radio, ` ${kind.name}`);
    p.append(label, document.createElement("br"), words);
    kinds.append(p);
  });
  dialog.querySelector("#ex-check-note")!.textContent = options.unresolved > 0
    ? `The book has ${options.unresolved} unresolved ${options.unresolved === 1 ? "comment" : "comments"}. The check is optional and only advises: you can export without it.`
    : "The check is optional and only advises: you can export without it.";
  const jsonBox = dialog.querySelector<HTMLElement>("#ex-json")!;
  const selected = () => (dialog.querySelector<HTMLInputElement>('input[name="ex-kind"]:checked')!.value as ExportKind);
  const sync = () => { jsonBox.hidden = selected() !== "json"; };
  dialog.querySelectorAll('input[name="ex-kind"]').forEach((r) => r.addEventListener("change", sync));
  dialog.querySelector("#ex-check")!.addEventListener("click", () => options.checkFirst());
  let result: ExportChoice | null = null;
  dialog.querySelector<HTMLFormElement>("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    if ((event.submitter as HTMLButtonElement | null)?.value === "cancel") return dialog.close("cancel");
    result = { kind: selected(), comments: selected() === "json" && dialog.querySelector<HTMLInputElement>("#ex-comments")!.checked };
    dialog.close("ok");
  });
  sync();
  await open(dialog, dialog.querySelector<HTMLElement>("#ex-kind-help-site")!);
  return dialog.returnValue === "ok" ? result : null;
}
