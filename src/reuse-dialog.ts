// The Reuse window (format version 19): the book's snippets, conditions and targets, and a small window that chooses conditions for one topic, block or step. Everything works by keyboard. Nothing is kept
// until the author presses Save, and what is wrong (an empty or repeated name) is said in words next to the box before anything is kept. See src/project/snippets.ts for what each is.
import { open } from "./dialogs.ts";
import { newId } from "./project/ids.ts";
import { MOST_CONDITIONS, MOST_NAME, MOST_SNIPPETS, MOST_TARGETS, snippetFromText, snippetToText, type Condition, type Snippet, type Target } from "./project/snippets.ts";

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** What the Reuse window works on and hands back. A snippet is its id, its name and the text it is edited in. */
export interface ReuseState {
  snippets: { id: string; name: string; text: string }[];
  conditions: Condition[];
  targets: Target[];
}

/** The state of the book's reuse as the window shows it. */
export function reuseStateOf(project: { snippets: Snippet[]; conditions: Condition[]; targets: Target[] }): ReuseState {
  return {
    snippets: project.snippets.map((s) => ({ id: s.id, name: s.name, text: snippetToText(s.blocks) })),
    conditions: project.conditions.map((c) => ({ ...c })),
    targets: project.targets.map((t) => ({ ...t, hide: [...t.hide] })),
  };
}

/** What is wrong with the lists, in words, or an empty list when all is well. */
export function reuseProblems(state: ReuseState): string[] {
  const problems: string[] = [];
  const dup = (names: string[]) => names.find((n, i) => names.findIndex((m) => m.toLowerCase() === n.toLowerCase()) !== i);
  const named = (list: { name: string }[], what: string) => {
    if (list.some((x) => x.name.trim() === "")) problems.push(`A ${what} has no name. Give it a name or remove it.`);
    const repeated = dup(list.map((x) => x.name.trim()).filter(Boolean));
    if (repeated) problems.push(`There are two ${what}s called "${repeated}". Each name can be used once, whatever the capitals.`);
  };
  named(state.snippets, "snippet");
  named(state.conditions, "condition");
  named(state.targets, "target");
  return problems;
}

/** Shows the Reuse window. Returns the state when the author presses Save, or `null` if cancelled. */
export async function reuseDialog(current: ReuseState, inUse: (snippetId: string) => number): Promise<ReuseState | null> {
  const state: ReuseState = { snippets: current.snippets.map((s) => ({ ...s })), conditions: current.conditions.map((c) => ({ ...c })), targets: current.targets.map((t) => ({ ...t, hide: [...t.hide] })) };
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "ru-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="ru-title">Reuse: snippets, conditions and targets</h2>
      <p class="help" id="ru-help">Write something once and use it in many topics, or keep content for some readers or versions only. Nothing is kept until you choose Save.</p>
      <fieldset id="ru-snippets"><legend>Snippets</legend>
        <p class="help" id="ru-snip-help">A snippet is a piece of a page you write once. Add it to any topic with a Snippet block, and every topic that uses it changes when you change it. Write blocks separated by a blank line: <code># words</code> is a heading, <code>&gt; Caution: words</code> is a boxed note, <code>1. words</code> lines are the steps of a numbered procedure (a line <code>Result: words</code> after a step is its result), anything else is a paragraph. A snippet holds no pictures.</p>
        <p><label for="ru-snip-pick">Snippet</label> <select id="ru-snip-pick" aria-describedby="ru-snip-help"></select> <button type="button" id="ru-snip-new">New snippet</button> <button type="button" id="ru-snip-del">Delete this snippet</button></p>
        <p><label for="ru-snip-name">Name (up to ${MOST_NAME} letters)</label><br><input id="ru-snip-name" type="text" size="40" maxlength="${MOST_NAME}"></p>
        <p><label for="ru-snip-text">What it says</label><br><textarea id="ru-snip-text" rows="8" cols="70" aria-describedby="ru-snip-line"></textarea></p>
        <p id="ru-snip-line" class="help" role="status"></p>
      </fieldset>
      <fieldset id="ru-conditions"><legend>Conditions</legend>
        <p class="help" id="ru-cond-help">A condition is a name for content that is only for some readers or versions, such as Administrators or Version 2. You put it on a topic, a block or a step. Up to ${MOST_CONDITIONS}.</p>
        <ul id="ru-cond-list" aria-describedby="ru-cond-help"></ul>
        <p><button type="button" id="ru-cond-add">Add a condition</button></p>
      </fieldset>
      <fieldset id="ru-targets"><legend>Targets</legend>
        <p class="help" id="ru-target-help">A target is a named output, such as Guide for students. It hides some conditions: an output made for it leaves out everything that carries any of them. Without a target nothing is left out. Up to ${MOST_TARGETS}.</p>
        <div id="ru-target-list" aria-describedby="ru-target-help"></div>
        <p><button type="button" id="ru-target-add">Add a target</button></p>
      </fieldset>
      <p id="ru-problems" class="help" role="alert"></p>
      <p><button value="ok" id="ru-save">Save</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const q = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const pick = q<HTMLSelectElement>("ru-snip-pick");
  const name = q<HTMLInputElement>("ru-snip-name");
  const text = q<HTMLTextAreaElement>("ru-snip-text");
  const line = q("ru-snip-line");
  const del = q<HTMLButtonElement>("ru-snip-del");
  let at = state.snippets.length ? 0 : -1;

  const sayBlocks = () => {
    const s = state.snippets[at];
    if (!s) { line.textContent = state.snippets.length ? "" : "There are no snippets yet. Choose New snippet."; return; }
    const parsed = snippetFromText(text.value);
    const uses = inUse(s.id);
    line.textContent = `${parsed.blocks.length} ${parsed.blocks.length === 1 ? "block" : "blocks"}. ${uses ? `Used in ${uses} ${uses === 1 ? "place" : "places"}.` : "Not used yet."}${parsed.problems.length ? ` ${parsed.problems.join(" ")}` : ""}`;
  };
  const drawPick = () => {
    pick.replaceChildren();
    state.snippets.forEach((s, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = s.name.trim() || "(no name yet)"; pick.append(o); });
    pick.disabled = state.snippets.length === 0;
    if (at >= 0) pick.value = String(at);
    const s = state.snippets[at];
    name.value = s?.name ?? ""; text.value = s?.text ?? "";
    name.disabled = text.disabled = del.disabled = !s;
    sayBlocks();
  };
  pick.addEventListener("change", () => { at = Number(pick.value); drawPick(); });
  name.addEventListener("input", () => { if (state.snippets[at]) { state.snippets[at].name = name.value; pick.options[at].textContent = name.value.trim() || "(no name yet)"; } });
  text.addEventListener("input", () => { if (state.snippets[at]) { state.snippets[at].text = text.value; sayBlocks(); } });
  q("ru-snip-new").addEventListener("click", () => {
    if (state.snippets.length >= MOST_SNIPPETS) { line.textContent = `A book can have up to ${MOST_SNIPPETS} snippets.`; return; }
    state.snippets.push({ id: newId(), name: "", text: "" });
    at = state.snippets.length - 1;
    drawPick();
    name.focus();
  });
  del.addEventListener("click", () => {
    const s = state.snippets[at];
    if (!s) return;
    const uses = inUse(s.id);
    state.snippets.splice(at, 1);
    at = state.snippets.length ? Math.min(at, state.snippets.length - 1) : -1;
    drawPick();
    line.textContent = `Deleted${uses ? `. The ${uses} ${uses === 1 ? "place" : "places"} that used it will keep the words as ordinary blocks when you save` : ""}.`;
    (state.snippets.length ? pick : q("ru-snip-new")).focus();
  });

  const condList = q<HTMLUListElement>("ru-cond-list");
  const targetList = q("ru-target-list");
  const drawConditions = () => {
    condList.replaceChildren();
    state.conditions.forEach((c, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<label>Condition ${i + 1} <input type="text" size="30" maxlength="${MOST_NAME}" value="${esc(c.name)}"></label> <button type="button">Remove</button>`;
      const input = li.querySelector("input")!;
      input.addEventListener("input", () => { c.name = input.value; drawTargets(); });
      li.querySelector("button")!.addEventListener("click", () => {
        state.conditions.splice(i, 1);
        for (const t of state.targets) t.hide = t.hide.filter((h) => h !== c.id);
        drawConditions(); drawTargets();
        (condList.querySelector<HTMLElement>("input") ?? q("ru-cond-add")).focus();
      });
      condList.append(li);
    });
    q<HTMLButtonElement>("ru-cond-add").disabled = state.conditions.length >= MOST_CONDITIONS;
  };
  q("ru-cond-add").addEventListener("click", () => {
    state.conditions.push({ id: newId(), name: "" });
    drawConditions(); drawTargets();
    [...condList.querySelectorAll("input")].pop()!.focus();
  });
  const drawTargets = () => {
    targetList.replaceChildren();
    state.targets.forEach((t, i) => {
      const box = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = `Target ${i + 1}`;
      box.append(legend);
      const row = document.createElement("p");
      row.innerHTML = `<label>Name <input type="text" size="30" maxlength="${MOST_NAME}" value="${esc(t.name)}"></label> <button type="button">Remove this target</button>`;
      row.querySelector("input")!.addEventListener("input", (e) => { t.name = (e.target as HTMLInputElement).value; });
      row.querySelector("button")!.addEventListener("click", () => { state.targets.splice(i, 1); drawTargets(); (targetList.querySelector<HTMLElement>("input") ?? q("ru-target-add")).focus(); });
      box.append(row);
      if (state.conditions.length === 0) {
        const none = document.createElement("p");
        none.className = "help";
        none.textContent = "There are no conditions yet, so there is nothing to hide.";
        box.append(none);
      }
      state.conditions.forEach((c) => {
        const label = document.createElement("label");
        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = t.hide.includes(c.id);
        check.addEventListener("change", () => { t.hide = check.checked ? [...t.hide, c.id] : t.hide.filter((h) => h !== c.id); });
        label.append(check, ` Hides ${c.name.trim() || "(a condition with no name yet)"}`);
        box.append(label, document.createElement("br"));
      });
      targetList.append(box);
    });
    q<HTMLButtonElement>("ru-target-add").disabled = state.targets.length >= MOST_TARGETS;
  };
  q("ru-target-add").addEventListener("click", () => {
    state.targets.push({ id: newId(), name: "", hide: [] });
    drawTargets();
    [...targetList.querySelectorAll<HTMLElement>("input[type=text]")].pop()!.focus();
  });

  dialog.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    if ((event.submitter as HTMLButtonElement | null)?.value === "cancel") return dialog.close("cancel");
    const problems = reuseProblems(state);
    q("ru-problems").textContent = problems.length ? `⚠ ${problems.join(" ")}` : "";
    if (problems.length) return;
    dialog.close("ok");
  });
  drawPick(); drawConditions(); drawTargets();
  await open(dialog, state.snippets.length ? pick : q("ru-snip-new"));
  return dialog.returnValue === "ok" ? state : null;
}

/** Asks which conditions something carries. `what` says what it is, for the title ("this topic", "block 2"). Returns the ids, or `null` if cancelled. */
export async function conditionsDialog(conditions: Condition[], chosen: string[], what: string): Promise<string[] | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "cd-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="cd-title">Conditions of ${esc(what)}</h2>
      <p class="help" id="cd-help">An output made for a target that hides any of these leaves ${esc(what)} out. With none ticked it is in every output.</p>
      <div id="cd-list" role="group" aria-labelledby="cd-title" aria-describedby="cd-help"></div>
      <p><button value="ok">Keep these</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const list = dialog.querySelector<HTMLElement>("#cd-list")!;
  if (conditions.length === 0) list.textContent = "The book has no conditions yet. Choose Reuse in the toolbar to make some.";
  for (const c of conditions) {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = c.id;
    box.checked = chosen.includes(c.id);
    label.append(box, ` ${c.name}`);
    list.append(label, document.createElement("br"));
  }
  dialog.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    dialog.close((event.submitter as HTMLButtonElement | null)?.value === "cancel" ? "cancel" : "ok");
  });
  await open(dialog, list.querySelector<HTMLElement>("input") ?? dialog.querySelector<HTMLElement>("button")!);
  return dialog.returnValue === "ok" ? [...list.querySelectorAll<HTMLInputElement>("input:checked")].map((b) => b.value) : null;
}
