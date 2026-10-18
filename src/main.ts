import "./style.css";
import {
  STATUSES, addNode, createProject, findNode, indent, locate, moveDown, moveUp, numbering,
  outdent, removeNode, renameNode, setStatus, visibleNodes, type Project, type Status,
} from "./project/model.ts";
import { chooseOpenPath, chooseSavePath, loadProject, saveProject } from "./project/disk.ts";
import { confirmDialog, messageDialog, promptText } from "./dialogs.ts";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("The app container is missing from index.html.");

// ---- State -------------------------------------------------------------------------------
let project: Project = createProject("Untitled project");
let filePath: string | null = null;
let dirty = false;
let selectedId: string | null = null;
const collapsed = new Set<string>();

// ---- Page skeleton -----------------------------------------------------------------------
app.innerHTML = `
  <header class="top"><h1>OpenExplainer</h1></header>
  <main id="main" tabindex="-1">
    <h2 id="project-heading"></h2>
    <p id="folder-line" class="help"></p>
    <div class="toolbar" role="toolbar" aria-label="Project">
      <button type="button" id="b-new">New project</button>
      <button type="button" id="b-open">Open project</button>
      <button type="button" id="b-save">Save (Ctrl+S)</button>
      <button type="button" id="b-saveas">Save as</button>
    </div>
    <div class="toolbar" role="toolbar" aria-label="Chapters and topics">
      <button type="button" id="b-chapter">Add chapter</button>
      <button type="button" id="b-topic">Add topic under selected</button>
      <button type="button" id="b-rename">Rename (F2)</button>
      <button type="button" id="b-up">Move up</button>
      <button type="button" id="b-down">Move down</button>
      <button type="button" id="b-indent">Indent</button>
      <button type="button" id="b-outdent">Outdent</button>
      <button type="button" id="b-delete">Delete</button>
      <label>Status of selected item
        <select id="status-select"></select>
      </label>
    </div>
    <p id="tree-help" class="help">
      In the list: Up and Down arrows move, Right opens, Left closes, F2 renames, Delete removes.
      Alt with Up or Down reorders. Alt with Right or Left indents or outdents.
    </p>
    <ul id="tree" role="tree" aria-label="Chapters and topics" aria-describedby="tree-help"></ul>
    <p id="empty" class="help" hidden>This project has no chapters yet. Choose Add chapter to start.</p>
    <div id="announce" class="visually-hidden" role="status" aria-live="polite"></div>
  </main>
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const treeEl = $<HTMLUListElement>("tree");
const statusSelect = $<HTMLSelectElement>("status-select");

STATUSES.forEach((s) => {
  const option = document.createElement("option");
  option.value = s.id;
  option.textContent = `${s.symbol} ${s.word}`;
  statusSelect.append(option);
});

function announce(text: string) {
  const el = $("announce");
  el.textContent = "";
  // A short delay makes screen readers announce a repeated message again.
  setTimeout(() => (el.textContent = text), 30);
}

function markDirty() {
  dirty = true;
  renderHeading();
}

function renderHeading() {
  $("project-heading").textContent = `${project.name}${dirty ? " (unsaved changes)" : ""}`;
  document.title = `${dirty ? "* " : ""}${project.name} - OpenExplainer`;
  $("folder-line").textContent = filePath ? `Saved file: ${filePath}` : "Not saved to a file yet.";
}

// ---- Drawing the tree --------------------------------------------------------------------
function render(focusSelected = false) {
  const numbers = numbering(project.tree);
  const rows = visibleNodes(project.tree, collapsed);
  if (!selectedId || !rows.some((r) => r.node.id === selectedId)) selectedId = rows[0]?.node.id ?? null;

  treeEl.replaceChildren();
  $("empty").hidden = rows.length > 0;

  for (const { node, level } of rows) {
    const status = STATUSES.find((s) => s.id === node.status)!;
    const li = document.createElement("li");
    li.setAttribute("role", "treeitem");
    li.setAttribute("aria-level", String(level));
    li.setAttribute("aria-selected", String(node.id === selectedId));
    if (node.children.length) li.setAttribute("aria-expanded", String(!collapsed.has(node.id)));
    li.tabIndex = node.id === selectedId ? 0 : -1;
    li.dataset.id = node.id;
    li.style.paddingLeft = `${(level - 1) * 1.5 + 0.5}rem`;
    li.className = "node" + (node.id === selectedId ? " selected" : "");

    const twisty = node.children.length ? (collapsed.has(node.id) ? "▸ " : "▾ ") : "  ";
    const label = document.createElement("span");
    label.textContent = `${twisty}${numbers.get(node.id)}  ${node.title}`;
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.style.color = status.color;
    badge.style.borderColor = status.color;
    badge.textContent = `${status.symbol} ${status.word}`;
    li.append(label, " ", badge);
    // The spoken name is the whole line: number, title and status in words.
    li.setAttribute("aria-label", `${numbers.get(node.id)} ${node.title}, ${status.word}`);
    li.addEventListener("click", () => select(node.id));
    treeEl.append(li);
  }

  const current = selectedId ? findNode(project.tree, selectedId) : null;
  statusSelect.value = current?.status ?? "not-started";
  statusSelect.disabled = !current;
  renderHeading();
  if (focusSelected) treeEl.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
}

function select(id: string) {
  selectedId = id;
  render(true);
}

function selected() {
  return selectedId ? findNode(project.tree, selectedId) : null;
}

// ---- Actions -----------------------------------------------------------------------------
async function addChapter() {
  const title = await promptText("Add chapter", "Chapter title");
  if (!title) return;
  selectedId = addNode(project.tree, null, title).id;
  markDirty();
  render(true);
  announce(`Added chapter ${title}`);
}

async function addTopic() {
  const parent = selected();
  if (!parent) return void announce("Select a chapter or topic first.");
  const title = await promptText("Add topic", `Topic title (inside ${parent.title})`);
  if (!title) return;
  collapsed.delete(parent.id);
  selectedId = addNode(project.tree, parent.id, title).id;
  markDirty();
  render(true);
  announce(`Added topic ${title}`);
}

async function rename() {
  const node = selected();
  if (!node) return;
  const title = await promptText("Rename", "New title", node.title);
  if (!title) return;
  renameNode(project.tree, node.id, title);
  markDirty();
  render(true);
}

async function remove() {
  const node = selected();
  if (!node) return;
  const extra = node.children.length ? ` It also contains ${node.children.length} item(s) that will be deleted with it.` : "";
  if (!(await confirmDialog("Delete", `Delete "${node.title}"?${extra}`, "Delete"))) return;
  const where = locate(project.tree, node.id);
  const neighbour = where ? (where.siblings[where.index + 1] ?? where.siblings[where.index - 1] ?? where.parent) : null;
  removeNode(project.tree, node.id);
  selectedId = neighbour?.id ?? null;
  markDirty();
  render(true);
  announce(`Deleted ${node.title}`);
}

function reorder(change: (tree: Project["tree"], id: string) => boolean, said: string) {
  if (!selectedId) return;
  if (change(project.tree, selectedId)) {
    markDirty();
    render(true);
    announce(`${said}. Now ${numbering(project.tree).get(selectedId)}`);
  } else {
    announce("That move is not possible.");
  }
}

async function guardUnsaved(): Promise<boolean> {
  if (!dirty) return true;
  return confirmDialog("Unsaved changes", "This project has changes that are not saved. Continue and lose them?", "Continue without saving");
}

async function newProject() {
  if (!(await guardUnsaved())) return;
  const name = await promptText("New project", "Project name");
  if (!name) return;
  project = createProject(name);
  filePath = null;
  dirty = true;
  selectedId = null;
  collapsed.clear();
  render(true);
  announce(`New project ${name}`);
}

async function openProject() {
  if (!(await guardUnsaved())) return;
  const picked = await chooseOpenPath();
  if (!picked) return;
  try {
    project = await loadProject(picked);
    filePath = picked;
    dirty = false;
    selectedId = null;
    collapsed.clear();
    render(true);
    announce(`Opened ${project.name}`);
  } catch (error) {
    await messageDialog("Could not open the project", error instanceof Error ? error.message : String(error));
  }
}

async function save(asNew = false) {
  try {
    let target = filePath;
    if (!target || asNew) {
      const picked = await chooseSavePath(project.name);
      if (!picked) return;
      target = picked;
    }
    await saveProject(target, project);
    filePath = target;
    dirty = false;
    renderHeading();
    announce(`Project saved to ${target}`);
  } catch (error) {
    await messageDialog("Could not save the project", error instanceof Error ? error.message : String(error));
  }
}

// ---- Keyboard ----------------------------------------------------------------------------
treeEl.addEventListener("keydown", (event) => {
  const rows = visibleNodes(project.tree, collapsed);
  const at = rows.findIndex((r) => r.node.id === selectedId);
  const node = selected();
  if (!node) return;
  const go = (i: number) => {
    const target = rows[Math.max(0, Math.min(rows.length - 1, i))];
    if (target) select(target.node.id);
  };

  if (event.altKey) {
    const handled = {
      ArrowUp: () => reorder(moveUp, "Moved up"),
      ArrowDown: () => reorder(moveDown, "Moved down"),
      ArrowRight: () => reorder(indent, "Indented"),
      ArrowLeft: () => reorder(outdent, "Outdented"),
    }[event.key];
    if (handled) { event.preventDefault(); handled(); }
    return;
  }

  switch (event.key) {
    case "ArrowDown": event.preventDefault(); go(at + 1); break;
    case "ArrowUp": event.preventDefault(); go(at - 1); break;
    case "Home": event.preventDefault(); go(0); break;
    case "End": event.preventDefault(); go(rows.length - 1); break;
    case "ArrowRight":
      event.preventDefault();
      if (node.children.length && collapsed.has(node.id)) { collapsed.delete(node.id); render(true); }
      else if (node.children.length) select(node.children[0].id);
      break;
    case "ArrowLeft": {
      event.preventDefault();
      if (node.children.length && !collapsed.has(node.id)) { collapsed.add(node.id); render(true); }
      else { const where = locate(project.tree, node.id); if (where?.parent) select(where.parent.id); }
      break;
    }
    case "F2": event.preventDefault(); void rename(); break;
    case "Delete": event.preventDefault(); void remove(); break;
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void save();
  }
});

// ---- Buttons -----------------------------------------------------------------------------
$("b-new").addEventListener("click", () => void newProject());
$("b-open").addEventListener("click", () => void openProject());
$("b-save").addEventListener("click", () => void save());
$("b-saveas").addEventListener("click", () => void save(true));
$("b-chapter").addEventListener("click", () => void addChapter());
$("b-topic").addEventListener("click", () => void addTopic());
$("b-rename").addEventListener("click", () => void rename());
$("b-up").addEventListener("click", () => reorder(moveUp, "Moved up"));
$("b-down").addEventListener("click", () => reorder(moveDown, "Moved down"));
$("b-indent").addEventListener("click", () => reorder(indent, "Indented"));
$("b-outdent").addEventListener("click", () => reorder(outdent, "Outdented"));
$("b-delete").addEventListener("click", () => void remove());
statusSelect.addEventListener("change", () => {
  if (!selectedId) return;
  setStatus(project.tree, selectedId, statusSelect.value as Status);
  markDirty();
  render();
  announce(`Status set to ${STATUSES.find((s) => s.id === statusSelect.value)!.word}`);
});

render();
