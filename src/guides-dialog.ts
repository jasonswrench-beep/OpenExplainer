// The Guides dialog: make, change and delete short step-by-step guides. A guide is only a list of topics that are already in the book (its tasks), a layout and a few choices, so nothing
// of the words is written here: editing a topic changes the book and every guide made from it. The rules are in src/project/guides.ts; this file draws them and changes a copy of the
// guides, which the project only takes when the author presses Save. Everything can be done by keyboard.
import { confirmDialog, open } from "./dialogs.ts";
import {
  addTask, checkGuideName, GUIDE_LAYOUTS, guideSummary, guideTasks, layoutOf, moveTask, newGuide, removeTask, setGuideLayout, setStepLayout, stepCount, tasksFromChapter, topicsWithSteps,
  type Guide, type GuideLayout,
} from "./project/guides.ts";
import { numbering, type TreeNode } from "./project/model.ts";
import { plainText } from "./project/text.ts";

export interface GuidesDialogOptions {
  guides: Guide[];
  tree: TreeNode[];
  /** The guide to start on, if any. */
  start?: string;
}

const layoutName = (id: GuideLayout) => GUIDE_LAYOUTS.find((l) => l.id === id)!.name;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Shows the guides. Returns the changed guides when the author presses Save, or `null` if cancelled. */
export async function guidesDialog(options: GuidesDialogOptions): Promise<Guide[] | null> {
  const guides: Guide[] = JSON.parse(JSON.stringify(options.guides));
  const tree = options.tree;
  const numbers = numbering(tree);
  const titleOf = (node: TreeNode) => `${numbers.get(node.id) ?? ""} ${node.title}`.trim();
  let selectedId: string | null = guides.find((g) => g.id === options.start)?.id ?? guides[0]?.id ?? null;

  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">Guides</h2>
      <p class="help" id="gd-intro">A guide is a few pages for one task, or for several: a title, then each task with its numbered steps, each step a heading, a picture with the step's number beside the clicked spot, and its words. It has no text of its own. It is made of topics already in the book, so editing a topic changes the book and every guide made from it. See a guide in the Guide preview tab.</p>
      <p id="gd-count" role="status"></p>
      <p><label for="gd-pick">Guide</label> <select id="gd-pick"></select>
        <button type="button" id="gd-new">New guide</button>
        <button type="button" id="gd-delete">Delete this guide</button></p>
      <p><label for="gd-chapter">Make a guide from a chapter</label> <select id="gd-chapter"></select>
        <button type="button" id="gd-from-chapter">Make the guide</button></p>
      <section id="gd-editor" aria-label="The selected guide">
        <p><label for="gd-name">Name of the guide</label><br><input id="gd-name" type="text" size="44" aria-describedby="gd-name-help"></p>
        <p class="help" id="gd-name-help">The title on the guide's first page.</p>
        <p id="gd-error" role="alert" class="error"></p>
        <fieldset id="gd-layouts"><legend>Layout of the steps</legend></fieldset>
        <p><label><input type="checkbox" id="gd-zoom"> Show a zoomed close-up of the clicked spot with each full picture that has a click</label></p>
        <fieldset id="gd-tasks-box"><legend>Tasks (topics with numbered steps)</legend>
          <ol id="gd-tasks" aria-label="Tasks in this guide"></ol>
          <p id="gd-tasks-empty" class="help" hidden>This guide has no tasks yet. Add a topic below, or make a guide from a chapter.</p>
          <p><label for="gd-add">Add a topic as a task</label> <select id="gd-add"></select> <button type="button" id="gd-add-button">Add task</button></p>
        </fieldset>
        <fieldset id="gd-steps-box"><legend>Layout of each step</legend>
          <p class="help" id="gd-steps-help">Every step follows the guide's layout unless you choose the other one for it here.</p>
          <ul id="gd-steps" aria-label="Layout of each step"></ul>
          <p id="gd-steps-empty" class="help" hidden>There are no steps yet.</p>
        </fieldset>
      </section>
      <p id="gd-status" class="visually-hidden" role="status"></p>
      <p><button value="ok" id="gd-save">Save</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const $ = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const say = (text: string) => { $("gd-status").textContent = ""; setTimeout(() => ($("gd-status").textContent = text), 30); };
  const current = () => guides.find((g) => g.id === selectedId) ?? null;

  // The two layouts, each described in words and tied to its button.
  const layouts = $<HTMLElement>("gd-layouts");
  for (const layout of GUIDE_LAYOUTS) {
    const p = document.createElement("p");
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "gd-layout";
    radio.value = layout.id;
    radio.id = `gd-layout-${layout.id}`;
    const words = document.createElement("span");
    words.className = "help";
    words.id = `gd-layout-${layout.id}-words`;
    words.textContent = layout.words;
    radio.setAttribute("aria-describedby", words.id);
    label.append(radio, ` ${layout.name}`);
    p.append(label, document.createElement("br"), words);
    layouts.append(p);
  }

  function drawChapters() {
    const select = $<HTMLSelectElement>("gd-chapter");
    select.replaceChildren();
    const usable = tree.filter((chapter) => tasksFromChapter(tree, chapter.id).length > 0);
    for (const chapter of usable) {
      const option = document.createElement("option");
      option.value = chapter.id;
      option.textContent = `${titleOf(chapter)} (${plural(tasksFromChapter(tree, chapter.id).length, "task")})`;
      select.append(option);
    }
    if (usable.length === 0) {
      const option = document.createElement("option");
      option.textContent = "No chapter has numbered steps yet";
      select.append(option);
    }
    select.disabled = usable.length === 0;
    $<HTMLButtonElement>("gd-from-chapter").disabled = usable.length === 0;
  }

  function drawPick() {
    const select = $<HTMLSelectElement>("gd-pick");
    select.replaceChildren();
    for (const guide of guides) {
      const option = document.createElement("option");
      option.value = guide.id;
      option.textContent = `${guide.name.trim() || "(no name yet)"} (${guideSummary({ tree }, guide)})`;
      select.append(option);
    }
    if (guides.length === 0) {
      const option = document.createElement("option");
      option.textContent = "No guides yet";
      select.append(option);
    }
    select.disabled = guides.length === 0;
    if (selectedId) select.value = selectedId;
    $("gd-count").textContent = guides.length === 0 ? "There are no guides yet. Choose New guide, or make one from a chapter." : `${plural(guides.length, "guide")}.`;
    $<HTMLButtonElement>("gd-delete").disabled = guides.length === 0;
    $("gd-editor").hidden = guides.length === 0;
  }

  /** A task was moved: the keyboard stays on the same kind of button, or goes to the other one when the task is now at that end of the list (its button is switched off there). */
  function moved(id: string, node: TreeNode, by: -1 | 1) {
    const guide = current();
    if (!guide || !moveTask(guide, id, by)) return;
    redraw();
    const now = guide.tasks.indexOf(id);
    const kind = by === -1 ? (now === 0 ? "down" : "up") : now === guide.tasks.length - 1 ? "up" : "down";
    drawTasks(`gd-${kind}-${id}`);
    say(`${titleOf(node)} is now task ${now + 1} of ${guide.tasks.length}.`);
  }

  /** Draws the tasks of the selected guide. `focus` says which control gets the keyboard afterwards (an id). */
  function drawTasks(focus?: string) {
    const guide = current();
    if (!guide) return;
    const list = $<HTMLElement>("gd-tasks");
    list.replaceChildren();
    guide.tasks.forEach((id, i) => {
      const node = findAny(id);
      if (!node) return;
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = `${titleOf(node)} (${plural(stepCount(node), "step")}) `;
      const up = document.createElement("button");
      up.type = "button"; up.id = `gd-up-${id}`; up.textContent = "Move up"; up.disabled = i === 0;
      up.setAttribute("aria-label", `Move up: ${titleOf(node)}`);
      up.addEventListener("click", () => moved(id, node, -1));
      const down = document.createElement("button");
      down.type = "button"; down.id = `gd-down-${id}`; down.textContent = "Move down"; down.disabled = i === guide.tasks.length - 1;
      down.setAttribute("aria-label", `Move down: ${titleOf(node)}`);
      down.addEventListener("click", () => moved(id, node, 1));
      const remove = document.createElement("button");
      remove.type = "button"; remove.id = `gd-remove-${id}`; remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove from the guide: ${titleOf(node)}`);
      remove.addEventListener("click", () => {
        removeTask(guide, id);
        redraw();
        drawTasks(guide.tasks.length ? `gd-remove-${guide.tasks[Math.min(i, guide.tasks.length - 1)]}` : "gd-add");
        say(`${titleOf(node)} was taken out of the guide. The topic is still in the book.`);
      });
      li.append(name, up, " ", down, " ", remove);
      list.append(li);
    });
    $("gd-tasks-empty").hidden = guide.tasks.length > 0;
    // The topics that can still be added: those with numbered steps that are not tasks yet.
    const add = $<HTMLSelectElement>("gd-add");
    add.replaceChildren();
    const free = topicsWithSteps(tree).filter((n) => !guide.tasks.includes(n.id));
    for (const node of free) {
      const option = document.createElement("option");
      option.value = node.id;
      option.textContent = `${titleOf(node)} (${plural(stepCount(node), "step")})`;
      add.append(option);
    }
    if (free.length === 0) {
      const option = document.createElement("option");
      option.textContent = topicsWithSteps(tree).length === 0 ? "No topic has numbered steps yet" : "Every topic with steps is already a task";
      add.append(option);
    }
    add.disabled = free.length === 0;
    $<HTMLButtonElement>("gd-add-button").disabled = free.length === 0;
    drawSteps();
    if (focus) ($(focus) ?? $("gd-add")).focus();
  }

  const findAny = (id: string): TreeNode | null => {
    const walk = (nodes: TreeNode[]): TreeNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node;
        const found = walk(node.children);
        if (found) return found;
      }
      return null;
    };
    return walk(tree);
  };

  /** One choice of layout for each step of the guide, with the words of the step so each can be told apart. */
  function drawSteps() {
    const guide = current();
    if (!guide) return;
    const list = $<HTMLElement>("gd-steps");
    list.replaceChildren();
    let any = false;
    for (const task of guideTasks({ tree }, guide)) {
      for (const item of task.items) {
        if (item.type !== "step") continue;
        any = true;
        const li = document.createElement("li");
        const select = document.createElement("select");
        select.id = `gd-step-${item.step.id}`;
        const words = plainText(item.step.text).trim();
        const short = words.length > 60 ? `${words.slice(0, 57)}...` : words;
        const label = document.createElement("label");
        label.htmlFor = select.id;
        label.textContent = `${titleOf(task.node)}, step ${item.number}: ${short || "(no words yet)"} `;
        const follow = document.createElement("option");
        follow.value = "";
        follow.textContent = `Follows the guide (${layoutName(guide.layout)})`;
        select.append(follow);
        for (const layout of GUIDE_LAYOUTS) {
          if (layout.id === guide.layout) continue;
          const option = document.createElement("option");
          option.value = layout.id;
          option.textContent = layout.name;
          select.append(option);
        }
        select.value = layoutOf(guide, item.step.id) === guide.layout ? "" : layoutOf(guide, item.step.id);
        select.addEventListener("change", () => {
          setStepLayout(guide, item.step.id, select.value === "" ? null : (select.value as GuideLayout));
          say(`Step ${item.number} of ${titleOf(task.node)}: ${select.value === "" ? `follows the guide, ${layoutName(guide.layout)}` : layoutName(select.value as GuideLayout)}.`);
        });
        li.append(label, select);
        list.append(li);
      }
    }
    $("gd-steps-empty").hidden = any;
  }

  /** Puts the selected guide's own choices in the boxes. */
  function drawEditor() {
    const guide = current();
    if (!guide) return;
    $<HTMLInputElement>("gd-name").value = guide.name;
    for (const layout of GUIDE_LAYOUTS) $<HTMLInputElement>(`gd-layout-${layout.id}`).checked = guide.layout === layout.id;
    $<HTMLInputElement>("gd-zoom").checked = guide.zoomFocus;
    $("gd-error").textContent = "";
    drawTasks();
  }

  /** The list of guides, with its words (the summary changes as tasks do). */
  function redraw() {
    drawPick();
  }

  function select(id: string | null, focus?: string) {
    selectedId = id;
    drawPick();
    drawEditor();
    if (focus) $(focus).focus();
  }

  $("gd-pick").addEventListener("change", () => {
    select($<HTMLSelectElement>("gd-pick").value);
    say(`Showing ${current()?.name ?? "the guide"}.`);
  });

  $("gd-new").addEventListener("click", () => {
    const guide = newGuide();
    guides.push(guide);
    select(guide.id, "gd-name");
    $<HTMLInputElement>("gd-name").select();
    say("A new guide was made. Give it a name, then add topics as tasks.");
  });

  $("gd-from-chapter").addEventListener("click", () => {
    const chapter = tree.find((c) => c.id === $<HTMLSelectElement>("gd-chapter").value);
    if (!chapter) return;
    const guide = newGuide(chapter.title, tasksFromChapter(tree, chapter.id));
    guides.push(guide);
    select(guide.id, "gd-name");
    say(`A guide was made from ${chapter.title}, with ${plural(guide.tasks.length, "task")}. Change its name or layout if you like.`);
  });

  $("gd-delete").addEventListener("click", async () => {
    const guide = current();
    if (!guide) return;
    if (!(await confirmDialog("Delete this guide?", `"${guide.name}" will be deleted when you press Save. No topic and no picture is deleted: a guide only lists topics of the book.`, "Delete the guide"))) {
      $("gd-delete").focus();
      return;
    }
    const at = guides.indexOf(guide);
    guides.splice(at, 1);
    select(guides[Math.min(at, guides.length - 1)]?.id ?? null);
    (guides.length ? $("gd-pick") : $("gd-new")).focus();
    say(`The guide "${guide.name}" will be deleted when you press Save.`);
  });

  $("gd-name").addEventListener("input", () => {
    const guide = current();
    if (!guide) return;
    guide.name = $<HTMLInputElement>("gd-name").value;
    $("gd-error").textContent = checkGuideName(guide.name) ?? "";
    // Only the words of the chosen item change, so the list keeps its place and the keyboard stays in the box.
    const option = $<HTMLSelectElement>("gd-pick").selectedOptions[0];
    if (option) option.textContent = `${guide.name.trim() || "(no name yet)"} (${guideSummary({ tree }, guide)})`;
  });

  for (const layout of GUIDE_LAYOUTS) {
    $(`gd-layout-${layout.id}`).addEventListener("change", () => {
      const guide = current();
      if (!guide) return;
      setGuideLayout(guide, layout.id);
      drawSteps();
      say(`Layout: ${layout.name}.`);
    });
  }

  $("gd-zoom").addEventListener("change", () => {
    const guide = current();
    if (!guide) return;
    guide.zoomFocus = $<HTMLInputElement>("gd-zoom").checked;
    say(guide.zoomFocus ? "Close-ups are shown." : "Close-ups are not shown.");
  });

  $("gd-add-button").addEventListener("click", () => {
    const guide = current();
    const id = $<HTMLSelectElement>("gd-add").value;
    if (!guide || !addTask(guide, tree, id)) return;
    const node = findAny(id)!;
    redraw();
    drawTasks(`gd-remove-${id}`);
    say(`${titleOf(node)} was added as task ${guide.tasks.length}.`);
  });

  dialog.querySelector<HTMLFormElement>("form")!.addEventListener("submit", (event) => {
    if ((event.submitter as HTMLButtonElement | null)?.value === "cancel") return;
    // Every guide needs a name; the first one that has none is shown, with the reason, and nothing is saved yet.
    const nameless = guides.find((g) => checkGuideName(g.name) !== null);
    if (nameless) {
      event.preventDefault();
      select(nameless.id, "gd-name");
      $("gd-error").textContent = checkGuideName(nameless.name)!;
    }
  });

  drawChapters();
  drawPick();
  drawEditor();
  await open(dialog, guides.length ? $("gd-pick") : $("gd-new"));
  return dialog.returnValue === "ok" ? guides : null;
}
