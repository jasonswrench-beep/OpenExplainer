// The Check the book dialog: the list from src/project/checks.ts, grouped by what each thing is about, with a plain-words reason and what to do for each. For each the author can go
// to it, ignore it, or ignore all of its kind; what is ignored is kept apart in a list of its own, where it can be brought back. The check is optional and only advises. The rules
// are in src/project/checks.ts; this file only draws them and changes the choices.
import { open } from "./dialogs.ts";
import { CHECK_KINDS, ignoreIssue, ignoreKind, splitIssues, summaryWords, unignore, type CheckSettings, type Issue } from "./project/checks.ts";

export interface CheckDialogOptions {
  /** Everything the check finds now, ignored or not. Asked for again when the dialog changes. */
  issues(): Issue[];
  settings(): CheckSettings;
  /** Called with the new choices when the author ignores something or brings it back. */
  setSettings(next: CheckSettings): void;
}

const GROUPS: { id: "accessibility" | "book"; title: string; about: string }[] = [
  { id: "accessibility", title: "Accessibility", about: "Things a reader who cannot see the pictures or the colours would miss." },
  { id: "book", title: "The book", about: "Things that would be wrong, empty or missing in the finished book." },
];

/** Shows the check. Returns the thing to go to, or `null` if it was only closed. */
export async function checkDialog(options: CheckDialogOptions): Promise<Issue | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">Check the book</h2>
      <p class="help">This check is optional and only advises: nothing here stops you saving or exporting. For each thing you can go to it and fix it, ignore it, or ignore all of its kind. What you ignore is saved with the project and kept in a list at the bottom, where you can bring it back.</p>
      <p id="ck-summary" role="status"></p>
      <div id="ck-groups"></div>
      <details id="ck-ignored"><summary id="ck-ignored-summary"></summary><ul id="ck-ignored-list" class="comment-list" aria-label="Things you chose to ignore"></ul></details>
      <p id="ck-status" class="visually-hidden" role="status"></p>
      <p><button value="cancel" id="ck-close" formnovalidate>Close</button></p>
    </form>`;
  const groupsEl = dialog.querySelector<HTMLElement>("#ck-groups")!;
  const summaryEl = dialog.querySelector<HTMLElement>("#ck-summary")!;
  const statusEl = dialog.querySelector<HTMLElement>("#ck-status")!;
  const ignoredBox = dialog.querySelector<HTMLDetailsElement>("#ck-ignored")!;
  const say = (text: string) => { statusEl.textContent = ""; setTimeout(() => (statusEl.textContent = text), 30); };
  let chosen: Issue | null = null;
  let counter = 0;

  /** Draws the list again from what the check finds now. `focus` says where the keyboard goes afterwards (an id), else it stays where it is. */
  function draw(focus?: string) {
    const all = options.issues();
    const { active, ignored } = splitIssues(all, options.settings());
    summaryEl.textContent = summaryWords(active, ignored);
    groupsEl.replaceChildren();
    counter = 0;
    for (const group of GROUPS) {
      const kinds = CHECK_KINDS.filter((k) => k.group === group.id);
      const here = active.filter((i) => kinds.some((k) => k.id === i.kind));
      const section = document.createElement("section");
      section.setAttribute("aria-label", group.title);
      const heading = document.createElement("h3");
      heading.textContent = `${group.title} (${here.length})`;
      const about = document.createElement("p");
      about.className = "help";
      about.textContent = group.about;
      section.append(heading, about);
      if (here.length === 0) {
        const none = document.createElement("p");
        none.textContent = "Nothing to fix here.";
        section.append(none);
      }
      for (const kind of kinds) {
        const items = here.filter((i) => i.kind === kind.id);
        if (items.length === 0) continue;
        const sub = document.createElement("h4");
        sub.textContent = `${kind.title}: ${items.length}${kind.severity === "note" ? " (notes)" : ""}`;
        const all = document.createElement("button");
        all.type = "button";
        all.id = `ck-all-${kind.id}`;
        all.textContent = items.length === 1 ? "Ignore this" : `Ignore all ${items.length} of these`;
        all.setAttribute("aria-label", items.length === 1 ? `Ignore the one thing under ${kind.title}` : `Ignore all ${items.length} things under ${kind.title}`);
        all.addEventListener("click", () => {
          options.setSettings(ignoreKind(options.settings(), all_issues(), kind.id));
          draw(undefined);
          say(`${items.length} ${items.length === 1 ? "thing" : "things"} under ${kind.title} ignored.`);
          dialog.querySelector<HTMLElement>("#ck-close")!.focus();
        });
        const list = document.createElement("ul");
        list.className = "comment-list";
        list.setAttribute("aria-label", kind.title);
        for (const issue of items) {
          const n = counter++;
          const li = document.createElement("li");
          li.className = "comment";
          const words = document.createElement("p");
          words.textContent = issue.words;
          const fix = document.createElement("p");
          fix.className = "help";
          fix.textContent = issue.fix;
          const go = document.createElement("button");
          go.type = "button";
          go.id = `ck-go-${n}`;
          go.textContent = "Go to it";
          go.setAttribute("aria-label", `Go to it: ${issue.words}`);
          go.addEventListener("click", () => { chosen = issue; dialog.close("goto"); });
          const ignore = document.createElement("button");
          ignore.type = "button";
          ignore.id = `ck-ignore-${n}`;
          ignore.textContent = "Ignore this";
          ignore.setAttribute("aria-label", `Ignore this: ${issue.words}`);
          ignore.addEventListener("click", () => {
            options.setSettings(ignoreIssue(options.settings(), issue.key));
            // The next thing slides into this place, so the keyboard stays on the same number; with none left it goes to Close.
            draw(`ck-ignore-${n}`);
            const now = splitIssues(options.issues(), options.settings());
            say(`Ignored. ${summaryWords(now.active, now.ignored)}`);
          });
          li.append(words, fix, go, " ", ignore);
          list.append(li);
        }
        // With one thing under a kind, ignoring the kind and ignoring the thing are the same, so only the thing has a button.
        if (items.length > 1) section.append(sub, all, list); else section.append(sub, list);
      }
      groupsEl.append(section);
    }
    // What was ignored, with a way back.
    ignoredBox.hidden = ignored.length === 0;
    dialog.querySelector("#ck-ignored-summary")!.textContent = `Ignored: ${ignored.length}`;
    const ignoredList = dialog.querySelector<HTMLElement>("#ck-ignored-list")!;
    ignoredList.replaceChildren();
    ignored.forEach((issue, i) => {
      const li = document.createElement("li");
      li.className = "comment resolved";
      const words = document.createElement("p");
      words.textContent = issue.words;
      const back = document.createElement("button");
      back.type = "button";
      back.id = `ck-back-${i}`;
      back.textContent = "Stop ignoring";
      back.setAttribute("aria-label", `Stop ignoring: ${issue.words}`);
      back.addEventListener("click", () => {
        options.setSettings(unignore(options.settings(), issue.key));
        draw();
        say("It is on the list again.");
        dialog.querySelector<HTMLElement>("#ck-close")!.focus();
      });
      li.append(words, back);
      ignoredList.append(li);
    });
    if (focus) (dialog.querySelector<HTMLElement>(`#${focus}`) ?? dialog.querySelector<HTMLElement>(`#ck-ignore-${Math.max(0, counter - 1)}`) ?? dialog.querySelector<HTMLElement>("#ck-close")!).focus();
  }

  /** The things found now, so "ignore all" works on the list as it is. */
  const all_issues = () => options.issues();

  draw();
  await open(dialog, dialog.querySelector<HTMLElement>("#ck-go-0") ?? dialog.querySelector<HTMLElement>("#ck-close")!);
  return dialog.returnValue === "goto" ? chosen : null;
}
