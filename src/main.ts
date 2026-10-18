import "./style.css";
import {
  STATUSES, addNode, createProject, findNode, indent, locate, moveDown, moveUp, numbering,
  outdent, removeNode, renameNode, setStatus, visibleNodes, findNodes, replaceInTitles,
  addPicture, removePicture, setAltText, newId, type Picture, type Project, type Status,
} from "./project/model.ts";
import { chooseImages, chooseOpenPath, chooseSavePath, loadProject, saveProject } from "./project/disk.ts";
import { readImageInfo } from "./project/image.ts";
import type { Assets } from "./project/package.ts";
import { chooseWindowDialog, confirmDialog, messageDialog, newProjectDialog, promptText, variablesDialog } from "./dialogs.ts";
import { createCaptureClient } from "./capture/client.ts";
import { captureTimeoutMs, tauriShell } from "./capture/tauri.ts";
import type { WindowInfo } from "./capture/outcome.ts";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("The app container is missing from index.html.");

// ---- State -------------------------------------------------------------------------------
let project: Project = createProject("Untitled project");
let filePath: string | null = null;
let dirty = false;
let selectedId: string | null = null;
const collapsed = new Set<string>();
let assets: Assets = new Map();

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
      <button type="button" id="b-vars">Project variables</button>
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
    <details id="find-panel">
      <summary>Find and replace in chapter and topic titles</summary>
      <div class="toolbar">
        <label>Find <input id="find-input" type="text"></label>
        <label>Replace with <input id="replace-input" type="text"></label>
        <label><input id="find-case" type="checkbox"> Match case</label>
        <button type="button" id="b-find-next">Find next</button>
        <button type="button" id="b-replace-all">Replace all</button>
      </div>
    </details>
    <p id="tree-help" class="help">
      In the list: Up and Down arrows move, Right opens, Left closes, F2 renames, Delete removes.
      Alt with Up or Down reorders. Alt with Right or Left indents or outdents.
    </p>
    <ul id="tree" role="tree" aria-label="Chapters and topics" aria-describedby="tree-help"></ul>
    <p id="empty" class="help" hidden>This project has no chapters yet. Choose Add chapter to start.</p>
    <section id="pictures-section" aria-labelledby="pictures-heading">
      <h3 id="pictures-heading">Pictures</h3>
      <div class="toolbar">
        <button type="button" id="b-import">Import pictures into the selected item</button>
        <button type="button" id="b-capture">Capture a window into the selected item</button>
      </div>
      <p id="pictures-empty" class="help"></p>
      <ul id="pictures" class="pictures" aria-label="Pictures in the selected item"></ul>
    </section>
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
  treeEl.hidden = rows.length === 0;

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
  renderPictures();
  if (focusSelected) treeEl.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
}

// ---- Pictures ----------------------------------------------------------------------------
let blobUrls: string[] = [];

function renderPictures() {
  blobUrls.forEach((url) => URL.revokeObjectURL(url));
  blobUrls = [];
  const list = $<HTMLUListElement>("pictures");
  list.replaceChildren();
  const node = selected();
  $<HTMLButtonElement>("b-import").disabled = !node;
  $<HTMLButtonElement>("b-capture").disabled = !node;
  $("pictures-empty").textContent = !node
    ? "Select a chapter or topic to see or add its pictures."
    : node.pictures.length ? "" : `"${node.title}" has no pictures yet.`;
  if (!node) return;

  for (const picture of node.pictures) {
    const li = document.createElement("li");
    const bytes = assets.get(picture.file);
    if (bytes) {
      const img = document.createElement("img");
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: picture.file.endsWith(".png") ? "image/png" : "image/jpeg" }));
      blobUrls.push(url);
      img.src = url;
      img.alt = picture.altText || "Picture with no description yet";
      img.className = "thumb";
      li.append(img);
    } else {
      const missing = document.createElement("p");
      missing.textContent = "⚠ This picture file is missing from the project.";
      li.append(missing);
    }
    const info = document.createElement("div");
    const name = picture.source.originalName ?? picture.file;
    const description = document.createElement("p");
    description.textContent = picture.altText ? `Description: ${picture.altText}` : "⚠ Needs a description";
    const size = document.createElement("p");
    size.className = "help";
    size.textContent = `${name}, ${picture.width} by ${picture.height} pixels`;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit description";
    edit.setAttribute("aria-label", `Edit description of ${name}`);
    edit.addEventListener("click", () => void editDescription(node.id, picture));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove picture";
    remove.setAttribute("aria-label", `Remove ${name}`);
    remove.addEventListener("click", () => void removeOnePicture(node.id, picture, name));
    info.append(description, size, edit, " ", remove);
    li.append(info);
    list.append(li);
  }
}

async function editDescription(nodeId: string, picture: Picture) {
  const text = await promptText("Describe the picture", "What does this picture show? A screen reader reads this aloud.", picture.altText);
  if (text === null) return;
  setAltText(project.tree, nodeId, picture.id, text);
  markDirty();
  renderPictures();
  announce("Description saved");
}

async function removeOnePicture(nodeId: string, picture: Picture, name: string) {
  if (!(await confirmDialog("Remove picture", `Remove ${name} from this item?`, "Remove"))) return;
  removePicture(project.tree, nodeId, picture.id);
  markDirty();
  renderPictures();
  announce(`Removed ${name}`);
}

async function importPictures() {
  const node = selected();
  if (!node) return;
  try {
    const chosen = await chooseImages();
    const problems: string[] = [];
    let added = 0;
    for (const { name, bytes } of chosen) {
      const info = readImageInfo(bytes);
      if (!info) { problems.push(`${name} is not a PNG or JPEG picture.`); continue; }
      const id = newId();
      const file = `images/${id}.${info.extension}`;
      // The description is asked for, never filled in silently. An empty one is flagged until it is written.
      const altText = await promptText("Describe the picture", `What does ${name} show? A screen reader reads this aloud. Leave it empty to add it later.`, "", true);
      assets.set(file, bytes);
      addPicture(project.tree, node.id, {
        id, file, width: info.width, height: info.height, altText: altText ?? "",
        source: { kind: "import", capturedAt: new Date().toISOString(), originalName: name },
      });
      added++;
    }
    if (added) { markDirty(); renderPictures(); announce(`Imported ${added} picture(s).`); }
    if (problems.length) await messageDialog("Some pictures were not imported", problems.join("\n"));
  } catch (error) {
    await messageDialog("Could not import the pictures", error instanceof Error ? error.message : String(error));
  }
}

$("b-import").addEventListener("click", () => void importPictures());

// ---- Capturing a window ------------------------------------------------------------------
// The helper (capture-helper/) takes the picture. OpenExplainer hides while it does, a Cancel window shows, and the
// wait ends by itself after 20 seconds. If anything goes wrong the project is left exactly as it was: the picture is
// only added after a capture has fully worked.
const captureClient = createCaptureClient(tauriShell, captureTimeoutMs);
let capturing = false;

async function captureAWindow() {
  const node = selected();
  if (!node || capturing) return;
  capturing = true;
  try {
    announce("Looking for open windows.");
    let listed = await captureClient.listWindows();
    let chosen: WindowInfo | null = null;
    while (listed.ok && !chosen) {
      const answer = await chooseWindowDialog(listed.value);
      if (!answer) return;
      if (answer.kind === "refresh") { listed = await captureClient.listWindows(); continue; }
      chosen = answer.window;
    }
    if (!listed.ok) return void (await messageDialog("Could not list the open windows", listed.message));
    if (!chosen) return;

    announce(`Capturing ${chosen.title}.`);
    const taken = await captureClient.captureWindow(chosen);
    if (!taken.ok) return void (await messageDialog("The capture did not work", taken.message));

    const { bytes, width, height, extension, result } = taken.value;
    const id = newId();
    const file = `images/${id}.${extension}`;
    // The description is asked for, never filled in silently. An empty one is flagged until it is written.
    const altText = await promptText("Describe the picture", `What does the capture of "${chosen.title}" show? A screen reader reads this aloud. Leave it empty to add it later.`, "", true);
    assets.set(file, bytes);
    addPicture(project.tree, node.id, {
      id, file, width, height, altText: altText ?? "",
      source: { kind: "window", capturedAt: new Date().toISOString(), originalName: chosen.title },
    });
    markDirty();
    renderPictures();
    announce(`Captured ${chosen.title}, ${width} by ${height} pixels.${result.method === "screen-copy" ? ` ${result.note}` : ""}`);
  } catch (error) {
    await messageDialog("The capture did not work", `${error instanceof Error ? error.message : String(error)} Your project was not changed.`);
  } finally {
    capturing = false;
    $<HTMLButtonElement>("b-capture").focus();
  }
}

$("b-capture").addEventListener("click", () => void captureAWindow());

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
  const choice = await newProjectDialog();
  if (!choice) return;
  const name = choice.name;
  project = createProject(name, choice.template);
  assets = new Map();
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
    const loaded = await loadProject(picked);
    project = loaded.project;
    assets = loaded.assets;
    filePath = picked;
    dirty = false;
    selectedId = null;
    collapsed.clear();
    render(true);
    announce(`Opened ${project.name}`);
    if (loaded.missing.length) await messageDialog("Some picture files are missing", `${loaded.missing.length} picture file(s) listed in this project were not found inside it. They show as missing, and you can remove or re-import them.`);
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
    await saveProject(target, project, assets);
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

$("b-vars").addEventListener("click", async () => {
  const result = await variablesDialog(project.variables);
  if (!result) return;
  project.variables = result;
  markDirty();
  announce("Variables updated");
});

// ---- Find and replace --------------------------------------------------------------------
const findInput = $<HTMLInputElement>("find-input");
const replaceInput = $<HTMLInputElement>("replace-input");
const findCase = $<HTMLInputElement>("find-case");

function findNext() {
  const matches = findNodes(project.tree, findInput.value, findCase.checked);
  if (!matches.length) return void announce(findInput.value ? "No matches." : "Type something to find.");
  const order = visibleNodes(project.tree, new Set()).map((r) => r.node.id);
  const from = selectedId ? order.indexOf(selectedId) : -1;
  const next = matches.find((n) => order.indexOf(n.id) > from) ?? matches[0];
  // Open any closed parents so the match can be seen.
  for (let where = locate(project.tree, next.id); where?.parent; where = locate(project.tree, where.parent.id)) {
    collapsed.delete(where.parent.id);
  }
  selectedId = next.id;
  render(false);
  announce(`Match ${matches.indexOf(next) + 1} of ${matches.length}: ${next.title}`);
}

async function replaceAll() {
  const find = findInput.value;
  const matches = findNodes(project.tree, find, findCase.checked);
  if (!matches.length) return void announce(find ? "No matches." : "Type something to find.");
  const ok = await confirmDialog("Replace all", `Replace "${find}" with "${replaceInput.value}" in ${matches.length} title(s)? This cannot be undone.`, "Replace all");
  if (!ok) return;
  const count = replaceInTitles(project.tree, find, replaceInput.value, findCase.checked);
  markDirty();
  render(false);
  announce(`Replaced ${count} in ${matches.length} title(s).`);
}

$("b-find-next").addEventListener("click", findNext);
$("b-replace-all").addEventListener("click", () => void replaceAll());
findInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); findNext(); } });

render();
