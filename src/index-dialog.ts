// The Index dialog: the index of the book as it will be printed, worked out from the index terms of every topic (src/project/book-index.ts). It can bring the terms up to date from the book (the
// software's first pass, or an update that keeps what the author wrote and does not bring back what the author took out) and lead to any topic an entry names. Editing the terms of one topic is done in
// that topic's Properties; this only shows the whole index and updates it. Everything can be done by keyboard.
import { open } from "./dialogs.ts";
import type { BookIndex } from "./project/book-index.ts";

export interface IndexDialogOptions {
  /** The index as it is now. Asked for again after an update. */
  build(): BookIndex;
  /** "12 terms in 8 topics". */
  summary(): string;
  /** Brings every topic's terms up to date and says what changed, in words. */
  update(): string;
}

/** Shows the index. Returns the id of the topic to go to, or `null` if it was only closed. */
export async function indexDialog(options: IndexDialogOptions): Promise<string | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">Index of the book</h2>
      <p class="help">The index is worked out from the index terms of every topic: each term is listed once, with every topic it is in. The software proposes terms from the book (a topic's title, the control
        names written in its text and the names of the callouts on its pictures). You change, add or remove the terms of a topic in that topic's Properties. Updating brings in what is new in the book, keeps your own
        terms, does not bring back anything you took out, and drops software terms the book no longer supports.</p>
      <p id="ix-summary" role="status"></p>
      <p><button type="button" id="ix-update">Update the index from the book</button></p>
      <p><label for="ix-filter">Show only terms that contain</label> <input type="search" id="ix-filter" autocomplete="off"></p>
      <div id="ix-list"></div>
      <p id="ix-status" class="visually-hidden" role="status"></p>
      <p><button value="cancel" id="ix-close" formnovalidate>Close</button></p>
    </form>`;
  const $ = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const say = (text: string) => { $("ix-status").textContent = ""; setTimeout(() => ($("ix-status").textContent = text), 30); };
  let chosen: string | null = null;

  function draw() {
    const index = options.build();
    const filter = $<HTMLInputElement>("ix-filter").value.trim().toLowerCase();
    $("ix-summary").textContent = options.summary();
    const list = $("ix-list");
    list.replaceChildren();
    if (index.terms === 0) {
      const none = document.createElement("p");
      none.className = "help";
      none.textContent = "There are no index terms yet. Choose Update the index from the book to make the first pass.";
      list.append(none);
      return;
    }
    let shown = 0;
    for (const group of index.groups) {
      const entries = group.entries.filter((e) => !filter || e.text.toLowerCase().includes(filter));
      if (entries.length === 0) continue;
      const section = document.createElement("section");
      section.setAttribute("aria-label", group.heading);
      const heading = document.createElement("h3");
      heading.textContent = group.heading;
      const ul = document.createElement("ul");
      ul.className = "ix-entries";
      for (const entry of entries) {
        shown++;
        const li = document.createElement("li");
        const term = document.createElement("strong");
        term.textContent = entry.text;
        li.append(term, ": ");
        entry.topics.forEach((topic, i) => {
          const go = document.createElement("button");
          go.type = "button";
          go.className = "ix-go";
          go.textContent = `${topic.number} ${topic.title}`;
          go.setAttribute("aria-label", `Go to topic ${topic.number} ${topic.title}, for the term ${entry.text}`);
          go.addEventListener("click", () => { chosen = topic.id; dialog.close("goto"); });
          li.append(go, i < entry.topics.length - 1 ? ", " : "");
        });
        ul.append(li);
      }
      section.append(heading, ul);
      list.append(section);
    }
    if (shown === 0) {
      const none = document.createElement("p");
      none.textContent = `No term contains "${$<HTMLInputElement>("ix-filter").value.trim()}".`;
      list.append(none);
    }
  }

  $("ix-update").addEventListener("click", () => {
    const words = options.update();
    draw();
    say(words);
    $("ix-summary").textContent = `${options.summary()}. ${words}`;
    $("ix-update").focus();
  });
  $("ix-filter").addEventListener("input", () => {
    draw();
    const shown = dialog.querySelectorAll("#ix-list li").length;
    say(`${shown} ${shown === 1 ? "term" : "terms"} shown.`);
  });
  draw();
  await open(dialog, $("ix-update"));
  return dialog.returnValue === "goto" ? chosen : null;
}
