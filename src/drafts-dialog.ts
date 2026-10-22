// The Drafts dialog: every proposal that is still waiting, one at a time. Four kinds: a sentence the AI wrote for a callout, a numbered procedure made by rules from a topic's click pictures, the opener or summary
// of a chapter written by the AI, and a boxed note the AI suggests. The author reads each, may change its words (and the kind of a box), and presses Accept (a sentence becomes the callout's real sentence; a procedure,
// an opener, a summary or a box is added to the topic's page) or Reject (it is thrown away). Nothing is accepted
// for the author and there is no "accept all". Each entry says where it is, who wrote it, and what it was made from, so the author can tell whether it is right. Everything can be done by keyboard; after
// Accept or Reject the keyboard moves to the next entry, and the number left is said in words.
import { open } from "./dialogs.ts";
import type { AcceptResult, BoxRow, ChapterTextRow, DraftRow, ProcedureRow, SentenceRow } from "./project/drafts.ts";
import { CALLOUT_KINDS, type CalloutKind } from "./project/page.ts";

export interface DraftsDialogOptions {
  /** The drafts waiting now, in book order. */
  rows(): DraftRow[];
  /** Accepts the draft. `texts` are the words as they are in the boxes now: one for a sentence, an opener, a summary or a box, one for each step of a procedure. `boxKind` is the kind of box the author chose. */
  accept(id: string, texts: string[], options?: { boxKind?: CalloutKind }): AcceptResult;
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
      <p class="help" id="drafts-help">Proposals for you to read. They are drafts: none is in your book until you press Accept. Sentences, openers, summaries and suggested boxes are written by the AI; a numbered procedure is made by rules from your click notes, with no AI. You can change the words first. Reject throws a draft away.</p>
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
  const wireButtons = (li: HTMLLIElement, row: DraftRow, accept: HTMLButtonElement, reject: HTMLButtonElement, go: HTMLButtonElement, boxes: () => HTMLTextAreaElement[], acceptOptions: () => { boxKind?: CalloutKind } = () => ({})) => {
    accept.addEventListener("click", () => {
      errorEl.textContent = "";
      const at = Array.from(list.children).indexOf(li);
      const result = options.accept(row.draft.id, boxes().map((b) => b.value), acceptOptions());
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

  /** The fold-out of what the AI was given, and who wrote the draft. */
  const givenAndWho = (clues: string[], model: string, madeAt: string, what: string): HTMLDetailsElement => {
    const given = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "What the AI was given";
    const list = document.createElement("ul");
    for (const clue of clues) list.append(Object.assign(document.createElement("li"), { textContent: clue }));
    const made = document.createElement("p");
    made.className = "help";
    made.textContent = `Written by the AI (${model || "the built-in model"})${madeAt ? ` on ${madeAt.slice(0, 10)}` : ""}. ${what}`;
    given.append(summary, list, made);
    return given;
  };

  const buildChapterText = (row: ChapterTextRow): HTMLLIElement => {
    const { draft } = row;
    const opener = draft.role === "opener";
    const li = document.createElement("li");
    li.className = "draft-row";
    li.dataset.draft = draft.id;
    const heading = document.createElement("h3");
    heading.textContent = opener ? `${row.where}, an opener for the chapter` : `${row.where}, a summary`;
    const where = document.createElement("p");
    where.textContent = opener
      ? `If you accept it, it is added as the first paragraph of the page of ${row.where}, which has ${row.blocksNow} ${row.blocksNow === 1 ? "block" : "blocks"} now.`
      : `If you accept it, it is added as a paragraph at the end of the page of ${row.where}, which has ${row.blocksNow} ${row.blocksNow === 1 ? "block" : "blocks"} now.`;
    const id = `draft-text-${draft.id}`;
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = opener ? "Draft opener (you can change it)" : "Draft summary (you can change it)";
    const box = document.createElement("textarea");
    box.id = id;
    box.rows = 5;
    box.cols = 70;
    box.maxLength = 1200;
    box.value = draft.text;
    const given = givenAndWho(draft.clues, draft.model, draft.madeAt, "It was given the written text of the chapter's topics and your writing-style notes, never a picture.");
    const accept = button("Accept", opener ? `Add the opener to the top of the page of ${row.where}` : `Add the summary to the end of the page of ${row.where}`);
    const reject = button("Reject", `Reject the ${draft.role} draft for ${row.where}`);
    const go = button(opener ? "Go to the chapter" : "Go to the topic", `Go to ${row.where}`);
    wireButtons(li, row, accept, reject, go, () => [box]);
    const buttons = document.createElement("p");
    buttons.append(accept, " ", reject, " ", go);
    li.append(heading, where, label, document.createElement("br"), box, given, buttons);
    return li;
  };

  const buildBox = (row: BoxRow): HTMLLIElement => {
    const { draft } = row;
    const li = document.createElement("li");
    li.className = "draft-row";
    li.dataset.draft = draft.id;
    const heading = document.createElement("h3");
    heading.textContent = `${row.where}, a suggested box`;
    const rests = document.createElement("p");
    rests.append(Object.assign(document.createElement("strong"), { textContent: "Suggested. " }), `It rests on this sentence from the topic: "${draft.evidence}"`);
    li.append(heading, rests);
    if (!row.evidenceFound) {
      const gone = document.createElement("p");
      gone.append(Object.assign(document.createElement("strong"), { textContent: "Needs your attention: " }), "the topic no longer says this sentence, so the box will be added at the end of the page.");
      li.append(gone);
    }
    const kindId = `draft-kind-${draft.id}`;
    const kindLabel = document.createElement("label");
    kindLabel.htmlFor = kindId;
    kindLabel.textContent = "Kind of box (the AI's guess; you choose)";
    const kind = document.createElement("select");
    kind.id = kindId;
    for (const k of CALLOUT_KINDS) kind.append(Object.assign(document.createElement("option"), { value: k.id, textContent: k.label }));
    kind.value = draft.boxKind;
    const id = `draft-text-${draft.id}`;
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = "Words of the box (you can change them)";
    const box = document.createElement("textarea");
    box.id = id;
    box.rows = 3;
    box.cols = 70;
    box.maxLength = 300;
    box.value = draft.text;
    const where = document.createElement("p");
    where.className = "help";
    where.textContent = row.evidenceFound ? `If you accept it, it is added to the page of ${row.where} right after the text it rests on.` : `If you accept it, it is added to the end of the page of ${row.where}.`;
    const given = givenAndWho(draft.clues, draft.model, draft.madeAt, "It was given the written text of the topic and your writing-style notes, never a picture.");
    const accept = button("Accept", `Add this box to the page of ${row.where}`);
    const reject = button("Reject", `Reject the suggested box for ${row.where}`);
    const go = button("Go to the topic", `Go to the topic ${row.where}`);
    wireButtons(li, row, accept, reject, go, () => [box], () => ({ boxKind: kind.value as CalloutKind }));
    const buttons = document.createElement("p");
    buttons.append(accept, " ", reject, " ", go);
    li.append(kindLabel, document.createElement("br"), kind, document.createElement("br"), label, document.createElement("br"), box, where, given, buttons);
    return li;
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

  for (const row of options.rows()) {
    list.append(
      row.draft.kind === "procedure" ? buildProcedure(row as ProcedureRow)
      : row.draft.kind === "chapter-text" ? buildChapterText(row as ChapterTextRow)
      : row.draft.kind === "box" ? buildBox(row as BoxRow)
      : buildSentence(row as SentenceRow),
    );
  }
  countEl.textContent = countWords();
  dialog.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    dialog.close("close");
  });
  const wanted = options.focus ? list.querySelector<HTMLElement>(`[data-draft="${options.focus}"] textarea`) : null;
  await open(dialog, wanted ?? (list.querySelector("textarea") as HTMLElement | null) ?? close);
  return dialog.returnValue === "go" ? chosen : null;
}
