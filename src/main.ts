import "./style.css";
import {
  STATUSES, addNode, createProject, findNode, indent, locate, moveDown, moveUp, numbering,
  outdent, removeNode, renameNode, setStatus, visibleNodes, findNodes, replaceInTitles,
  addPicture, removePicture, setAltText, setPictureHighlight, newId, type Picture, type Project, type Status, type TreeNode,
} from "./project/model.ts";
import { chooseImages, chooseOpenPath, chooseSavePath, loadProject, saveProject } from "./project/disk.ts";
import { readImageInfo } from "./project/image.ts";
import type { Assets } from "./project/package.ts";
import { captureDialog, confirmDialog, highlightDialog, messageDialog, moveCircleDialog, newProjectDialog, promptText, reviewClicksDialog, variablesDialog } from "./dialogs.ts";
import { circleFor, HIGHLIGHT_KINDS, highlightWords, type Circle, type HighlightKind } from "./project/highlight.ts";
import { describeClick, describeClickDetails } from "./project/clicks.ts";
import { createCaptureClient, type CapturedPicture } from "./capture/client.ts";
import { captureTimeoutMs, tauriShell } from "./capture/tauri.ts";
import { regionName, screenName } from "./capture/region.ts";
import { describeWait } from "./capture/wait.ts";
import { describeEnded, describeLost } from "./capture/clicks.ts";
import { addedWords, picturesFromReview } from "./capture/review.ts";

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
        <button type="button" id="b-capture">Capture into the selected item</button>
        <button type="button" id="b-highlight">Click circle settings</button>
        <label>Show the click circle as in the
          <select id="preview-kind"></select>
        </label>
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
/** Which place the pictures are previewed for: the click circle shows or not as that place's setting (and each picture's own choice) says. */
let previewKind: HighlightKind = "book";

const previewSelect = $<HTMLSelectElement>("preview-kind");
HIGHLIGHT_KINDS.forEach((kind) => {
  const option = document.createElement("option");
  option.value = kind.id;
  option.textContent = kind.name;
  previewSelect.append(option);
});
previewSelect.addEventListener("change", () => {
  previewKind = previewSelect.value as HighlightKind;
  renderPictures();
  announce(`Showing the pictures as in the ${HIGHLIGHT_KINDS.find((k) => k.id === previewKind)!.name.toLowerCase()}.`);
});

/** The circle drawn over a thumbnail. It is in the picture's own pixels, so it lines up at any thumbnail size. */
function circleOverlay(picture: Picture, circle: Circle): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${picture.width} ${picture.height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "circle-overlay");
  const shape = document.createElementNS(NS, "circle");
  shape.setAttribute("cx", String(circle.cx));
  shape.setAttribute("cy", String(circle.cy));
  shape.setAttribute("r", String(circle.r));
  shape.setAttribute("fill", circle.color);
  shape.setAttribute("fill-opacity", String(circle.opacity));
  svg.append(shape);
  return svg;
}

const CIRCLE_MODES = [
  { value: "follow", label: "Follow the project setting" },
  { value: "on", label: "Always show" },
  { value: "off", label: "Never show" },
];

/** Changes one picture's own choice of whether its circle shows. The place is kept if the circle was moved. */
function setCircleMode(nodeId: string, picture: Picture, mode: string) {
  const next = { ...(picture.highlight ?? {}) };
  if (mode === "follow") delete next.show; else next.show = mode === "on";
  setPictureHighlight(project.tree, nodeId, picture.id, next);
  markDirty();
  renderPictures();
  document.querySelector<HTMLElement>(`[data-circle-mode="${picture.id}"]`)?.focus();
  announce(mode === "follow" ? "The click circle now follows the project setting." : mode === "on" ? "The click circle will always show." : "The click circle will never show.");
}

async function moveCircle(nodeId: string, picture: Picture, name: string) {
  const at = picture.highlight && picture.highlight.x !== undefined && picture.highlight.y !== undefined
    ? { x: picture.highlight.x, y: picture.highlight.y, moved: true }
    : { x: picture.click?.x ?? 0, y: picture.click?.y ?? 0, moved: false };
  const choice = await moveCircleDialog({ ...at, width: picture.width, height: picture.height, clickWords: picture.click ? describeClick(picture.click) : "" });
  if (!choice) return;
  const next = { ...(picture.highlight ?? {}) };
  if (choice.kind === "reset") { delete next.x; delete next.y; } else { next.x = choice.x; next.y = choice.y; }
  setPictureHighlight(project.tree, nodeId, picture.id, next);
  markDirty();
  renderPictures();
  document.querySelector<HTMLElement>(`[data-circle-move="${picture.id}"]`)?.focus();
  announce(choice.kind === "reset" ? `The click circle of ${name} is back on the click.` : `The click circle of ${name} was moved to ${choice.x} across and ${choice.y} down.`);
}

$("b-highlight").addEventListener("click", async () => {
  const next = await highlightDialog(project.highlight);
  if (!next) return;
  project.highlight = next;
  markDirty();
  renderPictures();
  announce("Click circle settings saved.");
});

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
      const box = document.createElement("span");
      box.className = "thumbbox";
      box.append(img);
      const circle = circleFor(picture, project.highlight, previewKind);
      if (circle) box.append(circleOverlay(picture, circle));
      li.append(box);
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
    info.append(description, size);
    // A click picture says where the click was, what Windows said about the item, and what its circle is doing, and has its own circle choices.
    if (picture.click) {
      for (const line of describeClickDetails(picture.click)) {
        const detail = document.createElement("p");
        detail.className = "help";
        detail.textContent = line;
        info.append(detail);
      }
    }
    const circleWords = highlightWords(picture, project.highlight, previewKind);
    if (circleWords) {
      const state = document.createElement("p");
      state.className = "help";
      state.textContent = circleWords;
      info.append(state);
    }
    if (picture.click) {
      const mode = document.createElement("select");
      mode.dataset.circleMode = picture.id;
      mode.setAttribute("aria-label", `Click circle for ${name}`);
      for (const m of CIRCLE_MODES) {
        const option = document.createElement("option");
        option.value = m.value;
        option.textContent = m.label;
        mode.append(option);
      }
      mode.value = picture.highlight?.show === true ? "on" : picture.highlight?.show === false ? "off" : "follow";
      mode.addEventListener("change", () => setCircleMode(node.id, picture, mode.value));
      const move = document.createElement("button");
      move.type = "button";
      move.textContent = "Move the circle";
      move.dataset.circleMove = picture.id;
      move.setAttribute("aria-label", `Move the click circle of ${name}`);
      move.addEventListener("click", () => void moveCircle(node.id, picture, name));
      const row = document.createElement("p");
      row.append("Click circle: ", mode, " ", move);
      info.append(row);
    }
    info.append(edit, " ", remove);
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

// ---- Capturing a window or a rectangle of the screen -------------------------------------
// The helper (capture-helper/) takes the picture. OpenExplainer hides while it does, a Cancel window shows, and the
// wait ends by itself after 20 seconds. If anything goes wrong the project is left exactly as it was: the picture is
// only added after a capture has fully worked.
const captureClient = createCaptureClient(tauriShell, captureTimeoutMs);
let capturing = false;

/** " after waiting 5 seconds", or nothing if there is no wait. */
function waitWords(seconds: number): string {
  return seconds > 0 ? `, after waiting ${describeWait(seconds)}` : "";
}

/**
 * Click by click: every click until the author presses Stop, then a review list. Nothing is added to the project unless the author
 * presses OK in that list, and what they leave out or throw away is gone.
 */
async function captureClicks(node: TreeNode) {
  announce("Capturing clicks. OpenExplainer is hidden until you press Stop in the small Stop window.");
  const done = await captureClient.watchClicks();
  if (!done.ok) return void (await messageDialog("The capture did not work", done.message));
  const { shots, skipped, unusable, ended } = done.value;
  const notices = [describeEnded(ended), describeLost(skipped, unusable)].filter((text): text is string => text !== null);
  if (shots.length === 0) {
    return void (await messageDialog("No clicks were captured", [...notices, "Nothing was added. Your project was not changed."].join(" ")));
  }
  const answers = await reviewClicksDialog(shots, notices);
  if (!answers) {
    const count = shots.length === 1 ? "The click you captured was" : `The ${shots.length} clicks you captured were`;
    return void announce(`${count} thrown away. Your project was not changed.`);
  }
  const { pictures, files } = picturesFromReview(shots, answers, newId, new Date().toISOString());
  for (const picture of pictures) {
    assets.set(picture.file, files.get(picture.file)!);
    addPicture(project.tree, node.id, picture);
  }
  if (pictures.length) {
    markDirty();
    renderPictures();
  }
  announce(addedWords(pictures.length, shots.length));
}

async function captureIntoTopic() {
  const node = selected();
  if (!node || capturing) return;
  capturing = true;
  try {
    announce("Looking for open windows and screens.");
    const windows = await captureClient.listWindows();
    const screens = await captureClient.listScreens();
    if (!windows.ok && !screens.ok) return void (await messageDialog("Could not start a capture", windows.message));
    if (!windows.ok) {
      await messageDialog("The list of open windows could not be read", `${windows.message} You can still capture a rectangle of the screen.`);
    }
    const choice = await captureDialog({
      windows: windows.ok ? windows.value : [],
      screens: screens.ok ? screens.value : [],
      refresh: () => captureClient.listWindows(),
    });
    if (!choice) return;
    if (choice.kind === "clicks") return void (await captureClicks(node));

    // What was captured, in words; the question asked about it; and the picture itself.
    let what: string;
    let question: string;
    let picture: CapturedPicture;
    if (choice.kind === "window") {
      announce(`Capturing ${choice.window.title}${waitWords(choice.waitSeconds)}.`);
      const taken = await captureClient.captureWindow(choice.window, { bringToFront: choice.bringToFront, waitSeconds: choice.waitSeconds });
      if (!taken.ok) return void (await messageDialog("The capture did not work", taken.message));
      picture = taken.value;
      what = choice.window.title;
      question = `What does the capture of "${choice.window.title}" show?`;
    } else if (choice.kind === "region") {
      what = regionName(choice.screen, choice.left, choice.top, choice.region.width, choice.region.height);
      announce(`Capturing ${what}${waitWords(choice.waitSeconds)}.`);
      const taken = await captureClient.captureRegion(choice.region, { waitSeconds: choice.waitSeconds });
      if (!taken.ok) return void (await messageDialog("The capture did not work", taken.message));
      picture = taken.value;
      question = `What does this part of ${screenName(choice.screen)} show?`;
    } else {
      announce(`Taking a snapshot of ${screenName(choice.screen)} to choose from${waitWords(choice.waitSeconds)}.`);
      const chosen = await captureClient.selectOnScreen(choice.screen, choice.initial, { waitSeconds: choice.waitSeconds });
      if (!chosen.ok) {
        // Changing your mind is not an error: no message box, just the words, and focus stays on the Capture button.
        if (chosen.code === "cancelled") return void announce("The selection was cancelled. Your project was not changed.");
        return void (await messageDialog("The capture did not work", chosen.message));
      }
      picture = chosen.value.picture;
      const { rect } = chosen.value;
      what = regionName(choice.screen, rect.left, rect.top, rect.width, rect.height);
      question = `What does this part of ${screenName(choice.screen)} show?`;
    }

    const { bytes, width, height, extension, result } = picture;
    const id = newId();
    const file = `images/${id}.${extension}`;
    // The description is asked for, never filled in silently. An empty one is flagged until it is written.
    const altText = await promptText("Describe the picture", `${question} A screen reader reads this aloud. Leave it empty to add it later.`, "", true);
    assets.set(file, bytes);
    addPicture(project.tree, node.id, {
      id, file, width, height, altText: altText ?? "",
      source: { kind: choice.kind === "window" ? "window" : "region", capturedAt: new Date().toISOString(), originalName: what },
    });
    markDirty();
    renderPictures();
    // Said only when something about how the picture was made is worth knowing: a copy of the screen instead of the window's own
    // picture (a program that was not responding), or a window that could not be brought to the front when that was asked for.
    const worthKnowing = (choice.kind === "window" && result.method === "screen-copy") || result.activated === false;
    announce(`Captured ${what}, ${width} by ${height} pixels.${worthKnowing ? ` ${result.note}` : ""}`);
  } catch (error) {
    await messageDialog("The capture did not work", `${error instanceof Error ? error.message : String(error)} Your project was not changed.`);
  } finally {
    capturing = false;
    $<HTMLButtonElement>("b-capture").focus();
  }
}

$("b-capture").addEventListener("click", () => void captureIntoTopic());

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
