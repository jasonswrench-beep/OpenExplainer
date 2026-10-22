// The Drafts dialog: every proposal that is still waiting, one at a time. Two kinds: a sentence the AI wrote for a callout, and a numbered procedure made by rules from a topic's click pictures. The author
// reads each, may change its words, and presses Accept (a sentence becomes the callout's real sentence; a procedure is added to the end of the topic's page) or Reject (it is thrown away). Nothing is accepted
// for the author and there is no "accept all". Each entry says where it is, who wrote it, and what it was made from, so the author can tell whether it is right. Everything can be done by keyboard; after
// Accept or Reject the keyboard moves to the next entry, and the number left is said in words.
import { open } from "./dialogs.ts";
import type { AcceptResult, DraftRow, ProcedureRow, SentenceRow } from "./project/drafts.ts";

export interface DraftsDialogOptions {
  /** The drafts waiting now, in book order. */
  rows(): DraftRow[];
  /** Accepts the draft. `texts` are the words as they are in the boxes now: one for a sentence, one for each step of a procedure. */
  accept(id: string, texts: string[]): AcceptResult;
  reject(id: string): boolean;
  /** The id of a draft to put the keyboard on first, instead of the first in the list. */
  focus?: string;
}

/** Shows the waiting drafts. Returns the entry the author chose to go to, or `null` when the dialog was just closed. */
export async function draftsDialog(options: DraftsDialogOptions): Promise<DraftRow | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">Drafts</h2>
      <p class="help" id="drafts-help">Proposals for you to read. They are drafts: none is in your book until you press Accept. A sentence for a callout is written by the AI; a numbered procedure is made by rules from your click notes, with no AI. You can change the words first. Reject throws a draft away.</p>
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
    return n === 0 ? "No drafts are waiting." : `${n} ${n === 1 ? "draft is" : "drafts are"} waiting.`;
  };
  const say = (words: string) => { countEl.textContent = ""; setTimeout(() => (countEl.textContent = words), 30); };

  /** Moves the keyboard to the entry that took the place of the one just dealt with. */
  const focusAfter = (index: number) => {
    const rows = Array.from(list.children) as HTMLElement[];
    const next = rows[Math.min(index, rows.length - 1)];
    (next?.querySelector<HTMLElement>("textarea") ?? close).focus();
  };

  const button = (text: string, label: string): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.setAttribute("aria-label", label);
    return b;
  };

  /** What happens when Accept is pressed on an entry, whichever kind it is. */
  const wireButtons = (li: HTMLLIElement, row: DraftRow, accept: HTMLButtonElement, reject: HTMLButtonElement, go: HTMLButtonElement, boxes: () => HTMLTextAreaElement[]) => {
    accept.addEventListener("click", () => {
      errorEl.textContent = "";
      const at = Array.from(list.children).indexOf(li);
      const result = options.accept(row.draft.id, boxes().map((b) => b.value));
      if (!result.ok) {
        errorEl.textContent = result.words;
        // A draft whose callout or topic has gone is dropped from the project; take it off the list too.
        if (!options.rows().some((r) => r.draft.id === row.draft.id)) {
          li.remove();
          say(`${result.words} ${countWords()}`);
          focusAfter(at);
        } else (boxes().find((b) => b.value.trim() === "") ?? boxes()[0]).focus();
        return;
      }
      li.remove();
      say(`${result.words} ${countWords()}`);
      focusAfter(at);
    });
    reject.addEventListener("click", () => {
      errorEl.textContent = "";
      const at = Array.from(list.children).indexOf(li);
      options.reject(row.draft.id);
      li.remove();
      say(`Rejected. ${countWords()}`);
      focusAfter(at);
    });
    go.addEventListener("click", () => {
      chosen = row;
      dialog.close("go");
    });
  };

  const buildSentence = (row: SentenceRow): HTMLLIElement => {
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
    made.textContent = `Written by the AI (${draft.model || "the built-in model"})${draft.madeAt ? ` on ${draft.madeAt.slice(0, 10)}` : ""}. It was given words only, never a picture.`;
    given.append(summary, clues, made);
    const accept = button("Accept", `Accept the draft for callout ${row.calloutWords} in ${row.where}`);
    const reject = button("Reject", `Reject the draft for callout ${row.calloutWords} in ${row.where}`);
    const go = button("Go to the picture", `Go to the picture of callout ${row.calloutWords} in ${row.where}`);
    wireButtons(li, row, accept, reject, go, () => [box]);
    const buttons = document.createElement("p");
    buttons.append(accept, " ", reject, " ", go);
    li.append(heading, now, label, document.createElement("br"), box, given, buttons);
    return li;
  };

  const buildProcedure = (row: ProcedureRow): HTMLLIElement => {
    const { draft } = row;
    const n = draft.steps.length;
    const li = document.createElement("li");
    li.className = "draft-row";
    li.dataset.draft = draft.id;
    const heading = document.createElement("h3");
    heading.textContent = `${row.where}, a numbered procedure of ${n} ${n === 1 ? "step" : "steps"}`;
    const who = document.createElement("p");
    who.textContent = `${draft.by === "model" ? "Written by the built-in model" : "Made by rules from the click notes, with no AI"}${draft.madeAt ? ` on ${draft.madeAt.slice(0, 10)}` : ""}. If you accept it, it is added as a numbered procedure at the end of the page of ${row.where}, which has ${row.blocksNow} ${row.blocksNow === 1 ? "block" : "blocks"} now. Each step keeps its picture.`;
    const steps = document.createElement("ol");
    steps.className = "draft-steps";
    const boxes: HTMLTextAreaElement[] = [];
    draft.steps.forEach((step, i) => {
      const item = document.createElement("li");
      const id = `draft-step-${draft.id}-${i}`;
      const label = document.createElement("label");
      label.htmlFor = id;
      label.textContent = `Step ${i + 1} (${row.pictureWords[i]})`;
      const box = document.createElement("textarea");
      box.id = id;
      box.rows = 2;
      box.cols = 70;
      box.maxLength = 300;
      box.value = step.text;
      boxes.push(box);
      const from = document.createElement("p");
      from.className = "help";
      from.textContent = `Made from: ${step.from}`;
      item.append(label, document.createElement("br"), box, from);
      if (step.flag) {
        const flag = document.createElement("p");
        flag.append(Object.assign(document.createElement("strong"), { textContent: "Needs your attention: " }), step.flag);
        item.append(flag);
      }
      steps.append(item);
    });
    const accept = button("Accept", `Add the ${n} ${n === 1 ? "step" : "steps"} to the page of ${row.where}`);
    const reject = button("Reject", `Reject the procedure draft for ${row.where}`);
    const go = button("Go to the topic", `Go to the topic ${row.where}`);
    wireButtons(li, row, accept, reject, go, () => boxes);
    const buttons = document.createElement("p");
    buttons.append(accept, " ", reject, " ", go);
    li.append(heading, who, steps, buttons);
    return li;
  };

  for (const row of options.rows()) list.append(row.draft.kind === "procedure" ? buildProcedure(row as ProcedureRow) : buildSentence(row as SentenceRow));
  countEl.textContent = countWords();
  dialog.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    dialog.close("close");
  });
  const wanted = options.focus ? list.querySelector<HTMLElement>(`[data-draft="${options.focus}"] textarea`) : null;
  await open(dialog, wanted ?? (list.querySelector("textarea") as HTMLElement | null) ?? close);
  return dialog.returnValue === "go" ? chosen : null;
}
