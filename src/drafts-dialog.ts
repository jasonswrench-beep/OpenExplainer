// The AI drafts dialog: every sentence the AI has proposed and that is still waiting, one at a time. The author reads each, may change its words, and presses Accept (the sentence becomes the callout's
// real sentence) or Reject (it is thrown away). Nothing is accepted for the author and there is no "accept all". Each entry says where the callout is, what its sentence is now, and what the AI was
// given, so the author can tell whether it had enough to go on. Everything can be done by keyboard; after Accept or Reject the keyboard moves to the next entry, and the number left is said in words.
import { open } from "./dialogs.ts";
import type { AcceptResult, DraftRow } from "./project/drafts.ts";

export interface DraftsDialogOptions {
  /** The drafts waiting now, in book order. */
  rows(): DraftRow[];
  /** Makes the draft the callout's sentence (with the words as they are in the box now). */
  accept(id: string, text: string): AcceptResult;
  reject(id: string): boolean;
}

/** Shows the waiting drafts. Returns the entry the author chose to go to, or `null` when the dialog was just closed. */
export async function draftsDialog(options: DraftsDialogOptions): Promise<DraftRow | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">AI drafts</h2>
      <p class="help" id="drafts-help">Sentences the AI wrote for callouts. They are drafts: none is in your book until you press Accept. You can change the words first. Reject throws a draft away.</p>
      <p id="drafts-count" role="status"></p>
      <p id="drafts-error" role="alert" class="error"></p>
      <ul id="drafts-list" class="drafts-list"></ul>
      <p><button value="close" id="drafts-close">Close</button></p>
    </form>`;
  const list = dialog.querySelector<HTMLUListElement>("#drafts-list")!;
  const countEl = dialog.querySelector<HTMLElement>("#drafts-count")!;
  const errorEl = dialog.querySelector<HTMLElement>("#drafts-error")!;
  const close = dialog.querySelector<HTMLButtonElement>("#drafts-close")!;
  let chosen: DraftRow | null = null;

  const countWords = () => {
    const n = list.children.length;
    return n === 0 ? "No AI drafts are waiting." : `${n} ${n === 1 ? "draft is" : "drafts are"} waiting.`;
  };
  const say = (words: string) => { countEl.textContent = ""; setTimeout(() => (countEl.textContent = words), 30); };

  /** Moves the keyboard to the entry that took the place of the one just dealt with. */
  const focusAfter = (index: number) => {
    const rows = Array.from(list.children) as HTMLElement[];
    const next = rows[Math.min(index, rows.length - 1)];
    (next?.querySelector<HTMLElement>("textarea") ?? close).focus();
  };

  const build = (row: DraftRow): HTMLLIElement => {
    const { draft } = row;
    const li = document.createElement("li");
    li.className = "draft-row";
    li.dataset.draft = draft.id;
    const heading = document.createElement("h3");
    heading.textContent = `${row.where}, ${row.pictureWords}, callout ${row.calloutWords}`;
    const now = document.createElement("p");
    now.append(Object.assign(document.createElement("strong"), { textContent: "Now: " }), row.now ? `"${row.now}"` : "no sentence yet.");
    const id = `draft-text-${draft.id}`;
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = "Draft sentence (you can change it)";
    const box = document.createElement("textarea");
    box.id = id;
    box.rows = 2;
    box.cols = 70;
    box.maxLength = 300;
    box.value = draft.text;
    const given = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "What the AI was given";
    const clues = document.createElement("ul");
    for (const clue of draft.clues) clues.append(Object.assign(document.createElement("li"), { textContent: clue }));
    const made = document.createElement("p");
    made.className = "help";
    made.textContent = `Written by ${draft.model || "the built-in model"}${draft.madeAt ? ` on ${draft.madeAt.slice(0, 10)}` : ""}. It was given words only, never a picture.`;
    given.append(summary, clues, made);
    const accept = document.createElement("button");
    accept.type = "button";
    accept.textContent = "Accept";
    accept.setAttribute("aria-label", `Accept the draft for callout ${row.calloutWords} in ${row.where}`);
    const reject = document.createElement("button");
    reject.type = "button";
    reject.textContent = "Reject";
    reject.setAttribute("aria-label", `Reject the draft for callout ${row.calloutWords} in ${row.where}`);
    const go = document.createElement("button");
    go.type = "button";
    go.textContent = "Go to the picture";
    go.setAttribute("aria-label", `Go to the picture of callout ${row.calloutWords} in ${row.where}`);

    accept.addEventListener("click", () => {
      errorEl.textContent = "";
      const at = Array.from(list.children).indexOf(li);
      const result = options.accept(draft.id, box.value);
      if (!result.ok) {
        errorEl.textContent = result.words;
        // A draft whose callout has gone is dropped from the project; take it off the list too.
        if (!options.rows().some((r) => r.draft.id === draft.id) && /gone|no longer/.test(result.words)) {
          li.remove();
          say(`${result.words} ${countWords()}`);
          focusAfter(at);
        } else box.focus();
        return;
      }
      li.remove();
      say(`Accepted for callout ${result.calloutWords} in ${result.where}. ${countWords()}`);
      focusAfter(at);
    });
    reject.addEventListener("click", () => {
      errorEl.textContent = "";
      const at = Array.from(list.children).indexOf(li);
      options.reject(draft.id);
      li.remove();
      say(`Rejected. ${countWords()}`);
      focusAfter(at);
    });
    go.addEventListener("click", () => {
      chosen = row;
      dialog.close("go");
    });
    const buttons = document.createElement("p");
    buttons.append(accept, " ", reject, " ", go);
    li.append(heading, now, label, document.createElement("br"), box, given, buttons);
    return li;
  };

  for (const row of options.rows()) list.append(build(row));
  countEl.textContent = countWords();
  dialog.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    dialog.close("close");
  });
  await open(dialog, (list.querySelector("textarea") as HTMLElement | null) ?? close);
  return dialog.returnValue === "go" ? chosen : null;
}
