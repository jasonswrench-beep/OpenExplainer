// The page in the middle pane: a block editor. Every paragraph, heading, picture, procedure step and callout box is its own labelled box, with buttons
// to add a block, move it up or down, and delete it. Nothing here is free-flowing, so every part is reachable by keyboard and has a name a screen reader can say.
// The rules about what a page is live in src/project/page.ts and src/project/text.ts; this file only draws them and changes them.
import { confirmDialog } from "./dialogs.ts";
import { commentTotals } from "./project/comments.ts";
import type { Picture, TreeNode } from "./project/model.ts";
import { ensurePage } from "./project/model.ts";
import {
  addBlock, blockLabel, BLOCK_TYPES, CALLOUT_KINDS, calloutLabel, makeBlock, makeStep, moveBlock, moveItem, removeBlock,
  type Block, type BlockType, type CalloutBlock, type CalloutKind, type HeadingBlock, type ParagraphBlock, type PictureBlock, type ProcedureBlock, type Step,
} from "./project/page.ts";
import { applyMark, formatMarks, linkRun, MARKS, parseMarks, plainText, type Mark, type Run } from "./project/text.ts";

export interface PageEditorDeps {
  /** Where the blocks are drawn. */
  host: HTMLElement;
  /** The topic whose page is shown, or null when none is selected. */
  node(): TreeNode | null;
  /** The bytes of a picture file, for a thumbnail. */
  bytes(file: string): Uint8Array | undefined;
  /** A picture as it is shown where it is used: its view, with the click circle and the callouts over it. */
  show(picture: Picture, url: string, alt: string): HTMLElement;
  /** The callout entries to list under a picture, or null for none. */
  entries(picture: Picture): HTMLElement | null;
  /** Changes whenever what `show` draws changes for a reason outside the pictures themselves (the circle and zoom settings, the preview). */
  marksKey(): string;
  /** Opens the comments of a block. */
  comments(block: Block): void | Promise<void>;
  /** The page was changed: the project now has unsaved changes. */
  changed(): void;
  announce(text: string): void;
  /** The block that has the keyboard changed, or there is none. */
  selectionChanged(): void;
  /** Asks which topic a link should go to. Returns its id, or `null` if the author cancels. */
  chooseTopic(): Promise<string | null>;
  /** A topic's title, for the words of a link made with nothing selected. */
  topicTitle(id: string): string;
  /** The book's snippets, for the Snippet block: each with its name and its first words. */
  snippets(): { id: string; name: string; gist: string }[];
  /** Asks which conditions a block carries. `what` says which block. Returns the ids, or `null` if cancelled. */
  chooseConditions(current: string[], what: string): Promise<string[] | null>;
  /** The names of conditions by id, for words. */
  conditionNames(ids: string[]): string[];
  /** Does the book have any conditions? The Conditions button only shows when it does. */
  hasConditions(): boolean;
}

export interface SelectedBlock {
  block: Block;
  /** From 1. */
  position: number;
  total: number;
}

export interface PageEditor {
  /** Draws the page again if the topic or its pictures changed, or when `force` is set. */
  refresh(force?: boolean): void;
  selected(): SelectedBlock | null;
  /** Puts the keyboard on the page: the first block, or the Add buttons when the page is empty. */
  focus(): void;
  /** Puts the keyboard on one control of a block (such as its Comments button), if the page is drawn. */
  focusBlockControl(blockId: string, role: string): void;
}

const ADDABLE: BlockType[] = ["paragraph", "heading", "picture", "procedure", "callout", "snippet"];

/** A picture as a person would name it: its description if it has one, else where it came from. */
export function pictureName(picture: Picture): string {
  const what = picture.altText.trim() || picture.source.originalName || picture.file;
  return `${what} (${picture.width} by ${picture.height} pixels)`;
}

/** Runs shown as they will look, for eyes only: the box above is what a screen reader reads. */
function drawRuns(into: HTMLElement, runs: Run[]) {
  into.replaceChildren();
  for (const run of runs) {
    if (!run.mark) { into.append(run.text); continue; }
    const el = document.createElement(run.mark === "italic" ? "em" : run.mark === "link" ? "span" : "strong");
    if (run.mark === "control") el.className = "control-name";
    if (run.mark === "link") el.className = "topic-link";
    el.textContent = run.text;
    into.append(el);
  }
}

function emptyRuns(runs: Run[] | undefined): boolean {
  return !runs || plainText(runs).trim() === "";
}

export function createPageEditor(deps: PageEditorDeps): PageEditor {
  let currentId: string | null = null;
  let renderedKey = "";
  let urls: string[] = [];

  const node = () => deps.node();

  function keyFor(n: TreeNode | null): string {
    return n ? `${n.id}|${n.title}|${deps.marksKey()}|${n.pictures.map((p) => `${p.id}:${p.altText}:${p.file}:${JSON.stringify(p.callouts ?? [])}:${JSON.stringify(p.highlight ?? null)}:${JSON.stringify(p.view ?? null)}:${JSON.stringify(p.shapes ?? [])}`).join(",")}|${JSON.stringify(n.page?.comments ?? [])}` : "";
  }

  function setCurrent(id: string | null) {
    if (currentId === id) return;
    currentId = id;
    deps.host.querySelectorAll<HTMLElement>(".block").forEach((el) => el.classList.toggle("current", el.dataset.blockId === id));
    deps.selectionChanged();
  }

  function selected(): SelectedBlock | null {
    const n = node();
    if (!n?.page || !currentId) return null;
    const index = n.page.blocks.findIndex((b) => b.id === currentId);
    return index < 0 ? null : { block: n.page.blocks[index], position: index + 1, total: n.page.blocks.length };
  }

  /** Where the keyboard goes after the page is drawn again: a control of a block, picked by what it is for. */
  function focusControl(blockId: string, role: string) {
    const target = deps.host.querySelector<HTMLElement>(`[data-block-id="${blockId}"] [data-role="${role}"]`) ?? deps.host.querySelector<HTMLElement>(`[data-block-id="${blockId}"] [data-role="first"]`);
    target?.focus();
  }

  // ---- The parts a block is made of --------------------------------------------------------

  /** A text box with the three marks: bold, italic and a control name, each as a button that works on the selected words, and a preview. */
  function marksField(options: { id: string; label: string; runs: Run[]; rows: number; helpId: string; first?: boolean; onChange(runs: Run[]): void }): HTMLElement {
    const wrap = document.createElement("div");
    const lab = document.createElement("label");
    lab.htmlFor = options.id;
    lab.textContent = options.label;
    const area = document.createElement("textarea");
    area.id = options.id;
    area.rows = options.rows;
    area.value = formatMarks(options.runs);
    if (options.first) area.dataset.role = "first";
    area.setAttribute("aria-describedby", options.helpId);
    const preview = document.createElement("p");
    preview.className = "mark-preview";
    preview.setAttribute("aria-hidden", "true");
    drawRuns(preview, options.runs);
    const changed = () => {
      const runs = parseMarks(area.value);
      options.onChange(runs);
      drawRuns(preview, runs);
      deps.changed();
    };
    area.addEventListener("input", changed);
    const tools = document.createElement("span");
    tools.setAttribute("role", "group");
    tools.setAttribute("aria-label", `Marks for the selected words in ${options.label.toLowerCase()}`);
    for (const mark of MARKS) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = mark.name;
      button.dataset.role = `mark-${mark.id}`;
      button.addEventListener("click", () => {
        const done = applyMark(area.value, area.selectionStart, area.selectionEnd, mark.id as Mark);
        if (!done) return deps.announce("Select some words in the box first, then press the button.");
        area.value = done.text;
        area.setSelectionRange(done.start, done.end);
        area.focus();
        changed();
        deps.announce(`${mark.name} added round the selected words.`);
      });
      tools.append(button, " ");
    }
    const linkButton = document.createElement("button");
    linkButton.type = "button";
    linkButton.textContent = "Link to a topic";
    linkButton.dataset.role = "mark-link";
    linkButton.addEventListener("click", async () => {
      const start = area.selectionStart;
      const end = area.selectionEnd;
      const picked = area.value.slice(start, end).trim();
      const id = await deps.chooseTopic();
      if (!id) { area.focus(); return deps.announce("No link was made."); }
      const made = formatMarks([linkRun(picked || deps.topicTitle(id), id)]);
      area.value = area.value.slice(0, start) + made + area.value.slice(end);
      const after = start + made.length;
      area.setSelectionRange(after, after);
      area.focus();
      changed();
      deps.announce(`Link to ${deps.topicTitle(id)} added${picked ? " round the selected words" : ""}.`);
    });
    tools.append(linkButton, " ");
    wrap.append(lab, document.createElement("br"), area, tools, preview);
    return wrap;
  }

  /** Which picture, from the topic's own, with the picture and its description shown under the list. */
  function pictureField(options: { id: string; label: string; n: TreeNode; chosen: string | undefined; optional: boolean; first?: boolean; onChange(pictureId: string): void }): HTMLElement {
    const { n } = options;
    const wrap = document.createElement("div");
    const lab = document.createElement("label");
    lab.htmlFor = options.id;
    lab.textContent = options.label;
    const select = document.createElement("select");
    select.id = options.id;
    if (options.first) select.dataset.role = "first";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = n.pictures.length ? (options.optional ? "No picture" : "Choose a picture") : "This topic has no pictures yet. Import or capture one below.";
    select.append(none);
    for (const p of n.pictures) {
      const option = document.createElement("option");
      option.value = p.id;
      option.textContent = pictureName(p);
      select.append(option);
    }
    select.value = n.pictures.some((p) => p.id === options.chosen) ? (options.chosen as string) : "";
    select.disabled = n.pictures.length === 0;
    const shown = document.createElement("div");
    const draw = () => {
      shown.replaceChildren();
      const picture = n.pictures.find((p) => p.id === select.value);
      if (!picture) return;
      const bytes = deps.bytes(picture.file);
      if (bytes) {
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: picture.file.endsWith(".png") ? "image/png" : "image/jpeg" }));
        urls.push(url);
        shown.append(deps.show(picture, url, picture.altText || "Picture with no description yet"));
      } else {
        shown.append("This picture file is missing from the project.");
      }
      const words = document.createElement("p");
      words.className = "help";
      words.textContent = picture.altText ? `Description: ${picture.altText}` : "This picture still needs a description. Add one in the Pictures list below.";
      shown.append(words);
      const callouts = deps.entries(picture);
      if (callouts) shown.append(callouts);
    };
    select.addEventListener("change", () => {
      options.onChange(select.value);
      draw();
      deps.changed();
    });
    draw();
    wrap.append(lab, document.createElement("br"), select, shown);
    return wrap;
  }

  function actionRow(label: string, items: { role: string; text: string; run(): void | Promise<void>; disabled?: boolean }[]): HTMLElement {
    const actions = document.createElement("div");
    actions.setAttribute("role", "group");
    actions.setAttribute("aria-label", `Actions for ${label}`);
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.text;
      button.dataset.role = item.role;
      button.disabled = item.disabled ?? false;
      button.setAttribute("aria-label", `${item.text}, ${label}`);
      button.addEventListener("click", () => void item.run());
      actions.append(button, " ");
    }
    return actions;
  }

  // ---- One block per kind ------------------------------------------------------------------

  function headingBody(block: HeadingBlock): HTMLElement {
    const wrap = document.createElement("div");
    const lab = document.createElement("label");
    lab.htmlFor = `box-${block.id}`;
    lab.textContent = "Heading text";
    const input = document.createElement("input");
    input.type = "text";
    input.id = `box-${block.id}`;
    input.size = 50;
    input.value = block.text;
    input.dataset.role = "first";
    // A heading is plain text: the marks for bold, italic and control names are only read in paragraphs, steps and boxes, so typed here they would print as they are.
    const help = document.createElement("span");
    help.className = "help";
    help.id = `box-${block.id}-help`;
    help.textContent = "Plain text only. Bold, italic and control name marks are not used in a heading.";
    input.setAttribute("aria-describedby", help.id);
    input.addEventListener("input", () => { block.text = input.value; deps.changed(); });
    wrap.append(lab, document.createElement("br"), input, document.createElement("br"), help);
    return wrap;
  }

  function procedureBody(block: ProcedureBlock, n: TreeNode, helpId: string): HTMLElement {
    const wrap = document.createElement("div");
    const list = document.createElement("ol");
    list.className = "steps";
    list.setAttribute("aria-label", `Steps of the procedure`);
    block.steps.forEach((step, i) => {
      const li = document.createElement("li");
      li.className = "step";
      li.dataset.stepId = step.id;
      const total = block.steps.length;
      const head = document.createElement("h5");
      head.textContent = `Step ${i + 1} of ${total}`;
      li.append(head);
      li.append(marksField({
        id: `step-${step.id}`, label: `What to do, step ${i + 1}`, runs: step.text, rows: 2, helpId, first: i === 0,
        onChange: (runs) => { step.text = runs; },
      }));
      li.append(pictureField({
        id: `steppic-${step.id}`, label: `Picture for step ${i + 1} (optional)`, n, chosen: step.pictureId, optional: true,
        onChange: (id) => { if (id) step.pictureId = id; else delete step.pictureId; },
      }));
      li.append(marksField({
        id: `stepres-${step.id}`, label: `Result line, step ${i + 1} (optional)`, runs: step.result ?? [], rows: 1, helpId,
        onChange: (runs) => { if (runs.length) step.result = runs; else delete step.result; },
      }));
      li.append(actionRow(`step ${i + 1} of ${total}`, [
        { role: `step-up-${step.id}`, text: "Move step up", disabled: i === 0, run: () => moveStep(block, step, -1) },
        { role: `step-down-${step.id}`, text: "Move step down", disabled: i === total - 1, run: () => moveStep(block, step, 1) },
        { role: `step-delete-${step.id}`, text: "Delete step", run: () => removeStep(block, step) },
      ]));
      list.append(li);
    });
    wrap.append(list);
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "Add step";
    add.dataset.role = "add-step";
    add.setAttribute("aria-label", `Add a step to the end of this procedure`);
    add.addEventListener("click", () => {
      const step = makeStep();
      block.steps.push(step);
      deps.changed();
      draw();
      deps.host.querySelector<HTMLElement>(`#step-${step.id}`)?.focus();
      deps.announce(`Step ${block.steps.length} added.`);
    });
    wrap.append(add);
    return wrap;
  }

  function moveStep(block: ProcedureBlock, step: Step, by: -1 | 1) {
    const index = block.steps.findIndex((s) => s.id === step.id);
    if (!moveItem(block.steps, index, by)) return;
    deps.changed();
    draw();
    const now = block.steps.findIndex((s) => s.id === step.id);
    const role = by === -1 ? (now === 0 ? "step-down" : "step-up") : (now === block.steps.length - 1 ? "step-up" : "step-down");
    deps.host.querySelector<HTMLElement>(`[data-role="${role}-${step.id}"]`)?.focus();
    deps.announce(`Step moved ${by === -1 ? "up" : "down"}. It is now step ${now + 1} of ${block.steps.length}.`);
  }

  async function removeStep(block: ProcedureBlock, step: Step) {
    const used = !emptyRuns(step.text) || !emptyRuns(step.result) || !!step.pictureId;
    if (used && !(await confirmDialog("Delete step", "Delete this step and what is in it?", "Delete"))) return;
    const index = block.steps.findIndex((s) => s.id === step.id);
    block.steps.splice(index, 1);
    deps.changed();
    draw();
    const next = block.steps[Math.min(index, block.steps.length - 1)];
    if (next) deps.host.querySelector<HTMLElement>(`#step-${next.id}`)?.focus();
    else deps.host.querySelector<HTMLElement>(`[data-block-id="${block.id}"] [data-role="add-step"]`)?.focus();
    deps.announce(`Step deleted. ${block.steps.length} ${block.steps.length === 1 ? "step" : "steps"} left.`);
  }

  function calloutBody(block: CalloutBlock, helpId: string): HTMLElement {
    const wrap = document.createElement("div");
    const lab = document.createElement("label");
    lab.htmlFor = `kind-${block.id}`;
    lab.textContent = "Kind of box";
    const select = document.createElement("select");
    select.id = `kind-${block.id}`;
    select.dataset.role = "first";
    for (const kind of CALLOUT_KINDS) {
      const option = document.createElement("option");
      option.value = kind.id;
      option.textContent = kind.label;
      select.append(option);
    }
    select.value = block.kind;
    select.addEventListener("change", () => {
      block.kind = select.value as CalloutKind;
      deps.changed();
      const heading = deps.host.querySelector<HTMLElement>(`#blk-${block.id}`);
      if (heading) heading.textContent = headingText(block, selected()?.position ?? 0, selected()?.total ?? 0);
      deps.selectionChanged();
      deps.announce(`This box is now a ${calloutLabel(block.kind)} box.`);
    });
    wrap.append(lab, document.createElement("br"), select);
    wrap.append(marksField({ id: `box-${block.id}`, label: "Text of the box", runs: block.text, rows: 3, helpId, onChange: (runs) => { block.text = runs; } }));
    return wrap;
  }

  function headingText(block: Block, index: number, total: number): string {
    const what = block.type === "callout" ? `Callout box, ${calloutLabel(block.kind)}` : blockLabel(block.type);
    return `${what}, block ${index} of ${total}`;
  }

  /** A snippet block: which snippet, and its first words so the author sees what will be written here. */
  function snippetBody(block: Block & { type: "snippet" }): HTMLElement {
    const wrap = document.createElement("div");
    const all = deps.snippets();
    const lab = document.createElement("label");
    lab.htmlFor = `box-${block.id}`;
    lab.textContent = "Which snippet";
    const select = document.createElement("select");
    select.id = `box-${block.id}`;
    select.dataset.role = "first";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = all.length ? "Choose a snippet" : "The book has no snippets yet. Choose Reuse in the toolbar to make one.";
    select.append(none);
    for (const s of all) {
      const option = document.createElement("option");
      option.value = s.id;
      option.textContent = s.name;
      select.append(option);
    }
    select.value = block.snippetId;
    const gist = document.createElement("p");
    gist.className = "help";
    const sayGist = () => { gist.textContent = block.snippetId ? `Written here: ${all.find((s) => s.id === block.snippetId)?.gist ?? "This snippet is not in the book."}` : ""; };
    sayGist();
    select.addEventListener("change", () => {
      block.snippetId = select.value;
      sayGist();
      deps.changed();
      deps.announce(select.value ? `Snippet ${all.find((s) => s.id === select.value)?.name ?? ""} chosen.` : "No snippet chosen.");
    });
    wrap.append(lab, document.createElement("br"), select, gist);
    return wrap;
  }

  function drawBlock(block: Block, index: number, total: number, n: TreeNode): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "block" + (block.id === currentId ? " current" : "");
    li.dataset.blockId = block.id;
    const heading = document.createElement("h4");
    heading.id = `blk-${block.id}`;
    heading.textContent = headingText(block, index + 1, total);
    li.setAttribute("aria-labelledby", heading.id);
    li.append(heading);
    const helpId = `help-${block.id}`;
    const addMarksHelp = () => {
      const help = document.createElement("p");
      help.id = helpId;
      help.className = "help";
      help.textContent = "Marks: **bold**, *italic*, [[Control name]], and [words](#topic-id) for a link to another topic. Select words and press a button, or type the marks. Link to a topic asks which topic and types the link for you. A backslash before a star or bracket keeps it as an ordinary letter.";
      return help;
    };
    if (block.type === "paragraph") {
      li.append(marksField({ id: `box-${block.id}`, label: "Paragraph text", runs: block.text, rows: 4, helpId, first: true, onChange: (runs) => { (block as ParagraphBlock).text = runs; } }), addMarksHelp());
    } else if (block.type === "heading") {
      li.append(headingBody(block));
    } else if (block.type === "picture") {
      li.append(pictureField({ id: `box-${block.id}`, label: "Which picture", n, chosen: block.pictureId, optional: false, first: true, onChange: (id) => { (block as PictureBlock).pictureId = id; deps.selectionChanged(); } }));
    } else if (block.type === "procedure") {
      li.append(procedureBody(block, n, helpId), addMarksHelp());
    } else if (block.type === "callout") {
      li.append(calloutBody(block, helpId), addMarksHelp());
    } else if (block.type === "snippet") {
      li.append(snippetBody(block));
    }
    if (block.conditions?.length) {
      const only = document.createElement("p");
      only.className = "help";
      only.textContent = `Conditions: ${deps.conditionNames(block.conditions).join(", ")}. Left out of an output made for a target that hides any of them.`;
      li.append(only);
    }
    const label = `${blockLabel(block.type).toLowerCase()}, block ${index + 1} of ${total}`;
    const totals = commentTotals(n.page, block.id);
    // The comments button says how many are still open, or that there are only resolved ones.
    const commentsText = totals.open > 0 ? `Comments (${totals.open} open)` : totals.resolved > 0 ? `Comments (${totals.resolved} resolved)` : "Comments";
    li.append(actionRow(label, [
      { role: "up", text: "Move up", disabled: index === 0, run: () => move(block, -1) },
      { role: "down", text: "Move down", disabled: index === total - 1, run: () => move(block, 1) },
      { role: "comments", text: commentsText, run: () => deps.comments(block) },
      ...(deps.hasConditions() ? [{ role: "conditions", text: block.conditions?.length ? `Conditions (${block.conditions.length})` : "Conditions", run: async () => {
        const chosen = await deps.chooseConditions(block.conditions ?? [], `block ${index + 1}`);
        if (chosen === null) return focusControl(block.id, "conditions");
        if (chosen.length) block.conditions = chosen; else delete block.conditions;
        deps.changed();
        draw();
        focusControl(block.id, "conditions");
        deps.announce(chosen.length ? `Block ${index + 1} now carries: ${deps.conditionNames(chosen).join(", ")}.` : `Block ${index + 1} carries no conditions now.`);
      } }] : []),
      { role: "delete", text: "Delete", run: () => remove(block) },
    ]));
    li.addEventListener("focusin", () => setCurrent(block.id));
    return li;
  }

  function move(block: Block, by: -1 | 1) {
    const n = node();
    if (!n?.page || !moveBlock(n.page, block.id, by)) return;
    deps.changed();
    draw();
    // The button that was pressed may now be disabled (the block reached an end), so the keyboard goes to the other one.
    const index = n.page.blocks.findIndex((b) => b.id === block.id);
    const last = n.page.blocks.length - 1;
    focusControl(block.id, by === -1 ? (index === 0 ? "down" : "up") : (index === last ? "up" : "down"));
    deps.announce(`${blockLabel(block.type)} moved ${by === -1 ? "up" : "down"}. Now block ${index + 1} of ${n.page.blocks.length}.`);
  }

  function isEmpty(block: Block): boolean {
    switch (block.type) {
      case "paragraph": return emptyRuns(block.text);
      case "heading": return block.text.trim() === "";
      case "picture": return !block.pictureId;
      case "snippet": return !block.snippetId;
      case "callout": return emptyRuns(block.text);
      case "procedure": return block.steps.every((s) => emptyRuns(s.text) && emptyRuns(s.result) && !s.pictureId);
    }
  }

  async function remove(block: Block) {
    const n = node();
    if (!n?.page) return;
    const { open, resolved } = commentTotals(n.page, block.id);
    const noted = open + resolved;
    const withComments = noted > 0 ? ` Its ${noted} ${noted === 1 ? "comment is" : "comments are"} deleted with it.` : "";
    if ((!isEmpty(block) || noted > 0) && !(await confirmDialog("Delete block", `Delete this ${blockLabel(block.type).toLowerCase()} and what is in it?${withComments}`, "Delete"))) return;
    const index = n.page.blocks.findIndex((b) => b.id === block.id);
    removeBlock(n.page, block.id);
    if (currentId === block.id) currentId = null;
    deps.changed();
    draw();
    const next = n.page.blocks[Math.min(index, n.page.blocks.length - 1)];
    if (next) focusControl(next.id, "first");
    else deps.host.querySelector<HTMLElement>("[data-add]")?.focus();
    deps.selectionChanged();
    deps.announce(`${blockLabel(block.type)} deleted. ${n.page.blocks.length} ${n.page.blocks.length === 1 ? "block" : "blocks"} left on the page.`);
  }

  function add(type: BlockType) {
    const n = node();
    if (!n) return;
    const page = ensurePage(n);
    const after = currentId ? page.blocks.findIndex((b) => b.id === currentId) : page.blocks.length - 1;
    const block = makeBlock(type, type === "picture" && n.pictures.length === 1 ? { pictureId: n.pictures[0].id } : {});
    const at = addBlock(page, block, after);
    currentId = block.id;
    deps.changed();
    draw();
    focusControl(block.id, "first");
    deps.selectionChanged();
    deps.announce(`${blockLabel(type)} added as block ${at + 1} of ${page.blocks.length}.`);
  }

  // ---- The whole page ---------------------------------------------------------------------

  function draw() {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
    const n = node();
    renderedKey = keyFor(n);
    deps.host.replaceChildren();
    if (!n) {
      const none = document.createElement("p");
      none.className = "help";
      none.textContent = "Select a chapter or topic to write its page.";
      deps.host.append(none);
      return;
    }
    const intro = document.createElement("div");
    const addBar = document.createElement("div");
    addBar.setAttribute("role", "group");
    addBar.setAttribute("aria-label", "Add to the page");
    addBar.className = "toolbar";
    addBar.append("Add to the page:");
    for (const type of ADDABLE) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.add = type;
      button.textContent = BLOCK_TYPES.find((t) => t.id === type)!.label;
      button.addEventListener("click", () => add(type));
      addBar.append(button);
    }
    intro.append(addBar);
    const blocks = n.page?.blocks ?? [];
    const help = document.createElement("p");
    help.className = "help";
    help.textContent = blocks.length
      ? "A new block goes after the block you were last in, or at the end. Each block has its own Move up, Move down and Delete buttons."
      : `The page of "${n.title}" is empty. Add a paragraph, a heading, a picture, a numbered procedure or a callout box.`;
    intro.append(help);
    deps.host.append(intro);
    if (blocks.length) {
      const list = document.createElement("ol");
      list.className = "blocks";
      list.setAttribute("aria-label", `Blocks on the page of ${n.title}`);
      blocks.forEach((block, i) => list.append(drawBlock(block, i, blocks.length, n)));
      deps.host.append(list);
    }
  }

  return {
    refresh(force = false) {
      const n = node();
      // The page is only drawn again when the topic or its pictures changed: drawing it while someone types would take the keyboard away.
      if (!force && keyFor(n) === renderedKey) return;
      if (!n || !n.page?.blocks.some((b) => b.id === currentId)) currentId = null;
      draw();
      deps.selectionChanged();
    },
    selected,
    focusBlockControl(blockId, role) { focusControl(blockId, role); },
    focus() {
      const first = deps.host.querySelector<HTMLElement>(".block [data-role=first]") ?? deps.host.querySelector<HTMLElement>("[data-add]");
      first?.focus();
    },
  };
}
