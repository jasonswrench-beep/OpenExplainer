import "./style.css";
import {
  STATUSES, addNode, createProject, findNode, indent, locate, moveDown, moveUp, numbering,
  outdent, removeNode, renameNode, setStatus, visibleNodes, findNodes, replaceInTitles,
  addPicture, removePicture, setAltText, setPictureHighlight, setPictureView, newId, type Picture, type Project, type Status, type TreeNode,
} from "./project/model.ts";
import { chooseExportPath, chooseImages, chooseImportPath, chooseOpenPath, chooseSavePath, chooseWordPath, loadProject, readBytes, saveProject, writeBytes } from "./project/disk.ts";
import { importDocx } from "./import/docx.ts";
import { historyDialog } from "./history-dialog.ts";
import { addReviewComments, readReviewComments } from "./import/review.ts";
import { addImported, importQuestion } from "./import/apply.ts";
import { fileNameFor as projectFileName } from "./project/package.ts";
import { readImageInfo } from "./project/image.ts";
import type { Assets } from "./project/package.ts";
import { calloutsDialog, captureDialog, commentsDialog, confirmDialog, highlightDialog, messageDialog, moveCircleDialog, newProjectDialog, pictureViewDialog, promptText, reviewClicksDialog, unresolvedDialog, variablesDialog, zoomSettingsDialog } from "./dialogs.ts";
import { circleFor, HIGHLIGHT_KINDS, highlightWords, type HighlightKind } from "./project/highlight.ts";
import { describeClick, describeClickDetails } from "./project/clicks.ts";
import { createCaptureClient, type CapturedPicture } from "./capture/client.ts";
import { captureTimeoutMs, tauriShell } from "./capture/tauri.ts";
import { regionName, screenName } from "./capture/region.ts";
import { describeWait } from "./capture/wait.ts";
import { describeEnded, describeLost } from "./capture/clicks.ts";
import { createPageEditor } from "./page-editor.ts";
import { entryList, pictureBox } from "./picture-marks.ts";
import { shownPart, viewWords } from "./project/views.ts";
import { commentsOn, commentsWords, commentTotals, openCount, replaceBlockComments, setResolved } from "./project/comments.ts";
import { blockWords, unresolvedCount, unresolvedIn, type UnresolvedItem } from "./project/comment-list.ts";
import { renderPrintPreview, topicAnchor } from "./render/print.ts";
import { drawingDialog } from "./drawing-dialog.ts";
import { checkDialog } from "./check-dialog.ts";
import { exportDialog, EXPORT_KINDS, GUIDE_KINDS, type ExportChoice } from "./export-dialog.ts";
import { unpackJsonExport } from "./export/json.ts";
import { EXPORT_EXTENSION, makeExport } from "./export/make.ts";
import { flattenPicture } from "./render/flatten.ts";
import { guidesDialog } from "./guides-dialog.ts";
import { indexDialog } from "./index-dialog.ts";
import { mcpDialog } from "./mcp-dialog.ts";
import { aiDialog } from "./ai-dialog.ts";
import { draftsDialog } from "./drafts-dialog.ts";
import { draftBoxesFor, draftCalloutText, draftChapterTextFor } from "./drafting-ui.ts";
import type { ChapterTextRole } from "./ai/chapter-text.ts";
import { styleDialog } from "./style-dialog.ts";
import { lookDialog } from "./look-dialog.ts";
import { conditionsDialog, reuseDialog, reuseStateOf } from "./reuse-dialog.ts";
import { applyReuse, expandOutput, snippetGist, snippetUses } from "./project/snippets.ts";
import { cleanLook, lookWords } from "./project/look.ts";
import { acceptDraft, draftCount, draftRows, rejectDraft, type DraftRow } from "./project/drafts.ts";
import { draftProcedure } from "./project/procedure-draft.ts";
import { aiStatusWords } from "./ai/settings.ts";
import { setWindowTitle, windowTitle } from "./window-title.ts";
import { invoke } from "@tauri-apps/api/core";
import { modelState, watchModel } from "./ai/model-state.ts";
import { buildBookIndex, indexSummary, setTermLines, termLines, updateBookIndex, updateTopicIndex } from "./project/book-index.ts";
import { cleanGuides, guideSummary } from "./project/guides.ts";
import { renderGuide } from "./render/guide.ts";
import { checkProject, type Issue } from "./project/checks.ts";
import { marksSummary, setShapes } from "./project/shapes.ts";
import { renderHelpPage } from "./render/help.ts";
import { addCalloutFromClick, setCallouts } from "./project/callouts.ts";
import { blockLabel, calloutLabel, type Block } from "./project/page.ts";
import { plainText } from "./project/text.ts";
import { chooseSeeAlsoDialog, chooseTopicDialog } from "./links-dialog.ts";
import { countLinksTo, linkLossWords, MOST_SEE_ALSO, setSeeAlso, subtreeIds } from "./project/links.ts";
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
      <button type="button" id="b-export">Export</button>
      <button type="button" id="b-import-export">Import an export</button>
      <button type="button" id="b-import-word">Import from Word</button>
      <button type="button" id="b-review-in">Bring in review comments</button>
      <button type="button" id="b-vars">Project variables</button>
      <button type="button" id="b-style">Writing style</button>
      <button type="button" id="b-look">Look of the book</button>
      <button type="button" id="b-reuse">Reuse</button>
      <button type="button" id="b-history">History</button>
      <button type="button" id="b-drafts">Drafts</button>
      <button type="button" id="b-guides">Guides</button>
      <button type="button" id="b-index">Index</button>
      <button type="button" id="b-ai">AI help</button>
      <button type="button" id="b-mcp">MCP access</button>
      <button type="button" id="b-check">Check the book</button>
    </div>
    <p id="panes-help" class="help">Three panes: the chapters and topics, the page, and the properties. F6 moves to the next pane and Shift+F6 to the one before.</p>
    <div class="panes">
      <section id="pane-tree" class="pane" aria-labelledby="tree-heading" tabindex="-1">
        <h3 id="tree-heading">Chapters and topics</h3>
        <div class="toolbar" role="toolbar" aria-label="Chapters and topics">
          <button type="button" id="b-chapter">Add chapter</button>
          <button type="button" id="b-topic">Add topic under selected</button>
          <button type="button" id="b-rename">Rename (F2)</button>
          <button type="button" id="b-up">Move up</button>
          <button type="button" id="b-down">Move down</button>
          <button type="button" id="b-indent">Indent</button>
          <button type="button" id="b-outdent">Outdent</button>
          <button type="button" id="b-delete">Delete</button>
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
      </section>
      <section id="pane-page" class="pane" aria-labelledby="page-heading" tabindex="-1">
        <h3 id="page-heading">Page</h3>
        <div role="tablist" aria-label="How to see the page" id="view-tabs" class="tabs">
          <button type="button" role="tab" id="tab-edit" aria-selected="true" aria-controls="panel-edit">Edit</button>
          <button type="button" role="tab" id="tab-print" aria-selected="false" aria-controls="panel-preview" tabindex="-1">Print preview</button>
          <button type="button" role="tab" id="tab-help" aria-selected="false" aria-controls="panel-preview" tabindex="-1">Help site preview</button>
          <button type="button" role="tab" id="tab-guide" aria-selected="false" aria-controls="panel-preview" tabindex="-1">Guide preview</button>
        </div>
        <div id="panel-edit" role="tabpanel" aria-labelledby="tab-edit">
        <div class="toolbar"><button type="button" id="b-unresolved">Unresolved comments</button> <button type="button" id="b-opener">Draft an opener for this chapter</button> <button type="button" id="b-summary">Draft a chapter summary here</button> <button type="button" id="b-boxes">Suggest boxed notes for this topic</button></div>
        <div id="page-editor"></div>
        <section id="pictures-section" aria-labelledby="pictures-heading">
          <h3 id="pictures-heading">Pictures</h3>
          <div class="toolbar">
            <button type="button" id="b-import">Import pictures into the selected item</button>
            <button type="button" id="b-capture">Capture into the selected item</button>
            <button type="button" id="b-draft-topic">Draft callout text for this topic</button>
            <button type="button" id="b-procedure">Draft a procedure from the clicks</button>
            <button type="button" id="b-highlight">Click circle settings</button>
            <button type="button" id="b-zoom">Zoom settings</button>
            <label>Show the pictures as in the
              <select id="preview-kind"></select>
            </label>
          </div>
          <p id="pictures-empty" class="help"></p>
          <ul id="pictures" class="pictures" aria-label="Pictures in the selected item"></ul>
        </section>
        </div>
        <div id="panel-preview" role="tabpanel" aria-labelledby="tab-print" hidden>
          <p id="target-pick-row" class="gd-pick" hidden><label for="target-pick">Show the book for</label> <select id="target-pick"></select></p>
          <p id="guide-pick-row" class="gd-pick" hidden><label for="guide-pick">Guide to show</label> <select id="guide-pick"></select></p>
          <p id="preview-help" class="help"></p>
          <details id="preview-notes" hidden>
            <summary id="preview-notes-summary"></summary>
            <ul id="preview-notes-list"></ul>
          </details>
          <div id="preview-content" class="preview-content" role="region" tabindex="0"></div>
        </div>
      </section>
      <section id="pane-props" class="pane" aria-labelledby="props-heading" tabindex="-1">
        <h3 id="props-heading">Properties</h3>
        <div id="props-topic">
          <h4 id="props-topic-heading">Topic</h4>
          <p id="props-topic-line"></p>
          <p id="props-comments-line"></p>
          <p><label>Status of this item <select id="status-select"></select></label></p>
        </div>
        <div id="props-index">
          <h4 id="props-index-heading">Index terms for this topic</h4>
          <p class="help" id="props-index-help">One term on each line. The software proposes terms from the topic's title, control names and callout names. You can change, add or remove any of them. Choose Suggest terms to bring in what is new without undoing your changes.</p>
          <p><label for="index-terms">Index terms, one on each line</label><br><textarea id="index-terms" rows="6" cols="28" aria-describedby="props-index-help index-line"></textarea></p>
          <p><button type="button" id="b-index-suggest">Suggest terms</button></p>
          <p id="index-line" class="help"></p>
        </div>
        <div id="props-seealso">
          <h4 id="props-seealso-heading">See also for this topic</h4>
          <p class="help" id="props-seealso-help">Other topics worth reading next. They are listed under this topic in the book and the help site, each as a link.</p>
          <ul id="seealso-list" aria-labelledby="props-seealso-heading"></ul>
          <p id="seealso-line" class="help" role="status"></p>
          <p><button type="button" id="b-seealso" aria-describedby="props-seealso-help">Choose See also topics</button></p>
        </div>
        <div id="props-conditions">
          <h4 id="props-conditions-heading">Conditions of this topic</h4>
          <p id="conditions-line" class="help" role="status"></p>
          <p><button type="button" id="b-topic-conditions">Choose conditions for this topic</button></p>
        </div>
        <div id="props-block" aria-live="off"></div>
      </section>
    </div>
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

// ---- The page, in the middle pane, and the properties on the right -----------------------------
const pageEditor = createPageEditor({
  host: $("page-editor"),
  node: () => selected(),
  bytes: (file) => assets.get(file),
  show: (picture, url, alt) => pictureBox({
    picture, url, alt, className: "thumb page-picture", circle: circleFor(picture, project.highlight, previewKind), shown: shownPart(picture, project.zoom, previewKind),
  }),
  entries: (picture) => entryList(picture, shownPart(picture, project.zoom, previewKind)),
  marksKey: () => `${previewKind}|${JSON.stringify(project.highlight)}|${JSON.stringify(project.zoom)}`,
  comments: (block) => editBlockComments(block),
  changed: () => { markDirty(); renderProperties(); },
  announce: (text) => announce(text),
  selectionChanged: () => renderProperties(),
  chooseTopic: () => chooseTopicDialog(project, { heading: "Link to a topic", help: "Choose the topic the words should go to. The link keeps the topic itself, so it still goes to the right place if chapters move. In the printed book it also says the topic's number, and in a PDF its page." }),
  topicTitle: (id) => findNode(project.tree, id)?.title ?? "",
  snippets: () => project.snippets.map((s) => ({ id: s.id, name: s.name, gist: snippetGist(s) })),
  chooseConditions: (current, what) => conditionsDialog(project.conditions, current, what),
  conditionNames: (ids) => ids.map((id) => project.conditions.find((c) => c.id === id)?.name).filter((n): n is string => !!n),
  hasConditions: () => project.conditions.length > 0,
});

// ---- The print preview and the help site preview ------------------------------------------------
type ViewMode = "edit" | "print" | "help" | "guide";
let viewMode: ViewMode = "edit";
/** Which target the previews are made for (`null` shows everything). */
let previewTargetId: string | null = null;
/** Which guide the Guide preview shows (`null` means the first). */
let previewGuideId: string | null = null;
let previewUrls: string[] = [];
const VIEW_TABS: { mode: ViewMode; id: string; label: string }[] = [
  { mode: "edit", id: "tab-edit", label: "Edit" },
  { mode: "print", id: "tab-print", label: "Print preview" },
  { mode: "help", id: "tab-help", label: "Help site preview" },
  { mode: "guide", id: "tab-guide", label: "Guide preview" },
];

/** Shows the page for editing, or the book as it will print, or a page of the help site. */
function setViewMode(mode: ViewMode, options: { focusTab?: boolean; announce?: boolean } = {}) {
  viewMode = mode;
  for (const tab of VIEW_TABS) {
    const el = $(tab.id);
    el.setAttribute("aria-selected", String(tab.mode === mode));
    el.tabIndex = tab.mode === mode ? 0 : -1;
  }
  $("panel-edit").hidden = mode !== "edit";
  $("panel-preview").hidden = mode === "edit";
  $("panel-preview").setAttribute("aria-labelledby", VIEW_TABS.find((t) => t.mode === mode && mode !== "edit")?.id ?? "tab-print");
  if (options.focusTab) $(VIEW_TABS.find((t) => t.mode === mode)!.id).focus();
  renderPreview(true);
  if (options.announce !== false) announce(mode === "edit" ? "Editing the page." : mode === "print" ? "Print preview. The book as it will print, approximately." : mode === "guide" ? "Guide preview. A short step-by-step guide, approximately as it will print." : "Help site preview. One topic as a help site page.");
}

for (const tab of VIEW_TABS) $(tab.id).addEventListener("click", () => setViewMode(tab.mode));
$("view-tabs").addEventListener("keydown", (event) => {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (!keys.includes((event as KeyboardEvent).key)) return;
  const e = event as KeyboardEvent;
  const at = VIEW_TABS.findIndex((t) => t.mode === viewMode);
  const next = e.key === "Home" ? 0 : e.key === "End" ? VIEW_TABS.length - 1 : (at + (e.key === "ArrowRight" ? 1 : -1) + VIEW_TABS.length) % VIEW_TABS.length;
  e.preventDefault();
  setViewMode(VIEW_TABS[next].mode, { focusTab: true });
});

/** Draws the preview that is showing. `scroll` also brings the selected topic into view (when the tab is shown, or the selection changes). */
function renderPreview(scroll = false) {
  if (viewMode === "edit") return;
  if (viewMode !== "guide") $("guide-pick-row").hidden = true;
  drawTargetPicker();
  const content = $("preview-content");
  const urls = new Map<string, string>();
  const ctx = {
    // The book as an output sees it: snippets written out and, for a target, what it hides left out.
    project: expandOutput(project, previewTargetId && project.targets.some((t) => t.id === previewTargetId) ? previewTargetId : null),
    place: "book" as const,
    // Only the print preview shows pictures as they will print; the help site and guide previews are not for paper.
    paper: viewMode === "print",
    notes: true,
    imageSrc: (picture: Picture) => {
      const bytes = assets.get(picture.file);
      if (!bytes) return null;
      if (!urls.has(picture.file)) urls.set(picture.file, URL.createObjectURL(new Blob([bytes as BlobPart], { type: picture.file.endsWith(".png") ? "image/png" : "image/jpeg" })));
      return urls.get(picture.file)!;
    },
  };
  const notes: string[] = [];
  const keepScroll = content.scrollTop;
  if (viewMode === "print") {
    const built = renderPrintPreview({ ...ctx, onNote: (words) => notes.push(words) });
    content.innerHTML = built.html;
    content.setAttribute("aria-label", "Print preview of the book");
    $("preview-help").textContent = "The book as it will print, drawn as sheets. This is an approximation: real page breaks, running headers and page numbers are made when the PDF is exported, so the contents list has no page numbers. Pictures use the book's circle and zoom settings. Comments are never printed.";
  } else if (viewMode === "guide") {
    const guide = project.guides.find((g) => g.id === previewGuideId) ?? project.guides[0] ?? null;
    drawGuidePicker(guide?.id ?? null);
    if (guide) {
      const built = renderGuide({ ...ctx, onNote: (words) => notes.push(words) }, guide);
      content.innerHTML = built.html;
      content.setAttribute("aria-label", `Preview of the guide ${guide.name}`);
      $("preview-help").textContent = "A short step-by-step guide drawn as sheets, approximately: real page breaks are made when a guide is exported. Each step has its number beside the clicked spot, and the pictures use the quick-guide click circle and zoom settings. The words come from the book's own topics. Comments are never printed.";
    } else {
      content.innerHTML = '<p class="help">There are no guides yet. Choose Guides to make one from a chapter, or from topics that have numbered steps.</p>';
      content.setAttribute("aria-label", "Guide preview");
      $("preview-help").textContent = "";
    }
  } else {
    const picked = selectedId;
    content.innerHTML = renderHelpPage({ ...ctx, notes: false }, picked);
    content.setAttribute("aria-label", "Help site preview of the selected topic");
    $("preview-help").textContent = "One topic as a page of the help site, with the contents tree, breadcrumbs and links to the previous and next topic. Search, the index and the collapsible FAQ come with the export. Pictures use the book's settings. Comments are never shown.";
  }
  const box = $<HTMLDetailsElement>("preview-notes");
  box.hidden = notes.length === 0;
  $("preview-notes-summary").textContent = `${notes.length} ${notes.length === 1 ? "note" : "notes"} for the writer (these are not part of the book)`;
  $("preview-notes-list").replaceChildren(...notes.map((n) => { const li = document.createElement("li"); li.textContent = n; return li; }));
  previewUrls.forEach((u) => URL.revokeObjectURL(u));
  previewUrls = [...urls.values()];
  if (scroll && viewMode === "print" && selectedId) document.getElementById(topicAnchor(selectedId))?.scrollIntoView({ block: "start" });
  else content.scrollTop = keepScroll;
}

/** Fills the Guide preview's picker, and shows it only for the Guide preview. */
/** The "Show the book for" choice: every target, or everything. Only there when the book has targets. */
function drawTargetPicker() {
  const select = $<HTMLSelectElement>("target-pick");
  $("target-pick-row").hidden = project.targets.length === 0;
  select.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "Everything (no target)";
  select.append(all);
  for (const t of project.targets) {
    const option = document.createElement("option");
    option.value = t.id;
    option.textContent = t.name;
    select.append(option);
  }
  select.value = previewTargetId ?? "";
}
$("target-pick").addEventListener("change", () => {
  previewTargetId = $<HTMLSelectElement>("target-pick").value || null;
  renderPreview();
  announce(previewTargetId ? `Showing the book for ${project.targets.find((t) => t.id === previewTargetId)?.name ?? "the target"}.` : "Showing everything.");
});

function drawGuidePicker(selected: string | null) {
  const select = $<HTMLSelectElement>("guide-pick");
  $("guide-pick-row").hidden = viewMode !== "guide" || project.guides.length === 0;
  select.replaceChildren();
  for (const guide of project.guides) {
    const option = document.createElement("option");
    option.value = guide.id;
    option.textContent = `${guide.name} (${guideSummary(project, guide)})`;
    select.append(option);
  }
  if (selected) select.value = selected;
}

$("guide-pick").addEventListener("change", () => {
  previewGuideId = $<HTMLSelectElement>("guide-pick").value;
  renderPreview();
  announce(`Showing the guide ${project.guides.find((g) => g.id === previewGuideId)?.name ?? ""}.`);
});

/** The Guides dialog: make, change and delete guides. Nothing changes unless the author presses Save. */
async function manageGuides() {
  const choice = await guidesDialog({ guides: project.guides, tree: project.tree, start: previewGuideId ?? undefined });
  if (!choice) return $("b-guides").focus();
  project.guides = cleanGuides(choice, project.tree);
  markDirty();
  if (!project.guides.some((g) => g.id === previewGuideId)) previewGuideId = null;
  if (viewMode === "guide") renderPreview();
  announce(`Guides saved: ${project.guides.length === 0 ? "there are none" : `${project.guides.length} ${project.guides.length === 1 ? "guide" : "guides"}`}.`);
  $("b-guides").focus();
}
$("b-guides").addEventListener("click", () => void manageGuides());

// ---- The index ---------------------------------------------------------------------------------------------
const indexBox = $<HTMLTextAreaElement>("index-terms");

/** The author finished editing the terms of a topic: they are kept for it, and the box shows what was kept. */
indexBox.addEventListener("change", () => {
  const node = indexNodeId ? findNode(project.tree, indexNodeId) : null;
  if (!node) return;
  const asked = indexBox.value.split(/\r?\n/).filter((line) => line.trim() !== "").length;
  const before = termLines(node).join("\n");
  setTermLines(node, indexBox.value.split(/\r?\n/), project.variables);
  const kept = termLines(node);
  indexBox.value = kept.join("\n");
  if (kept.join("\n") !== before) markDirty();
  const skipped = asked - kept.length;
  $("index-line").textContent = indexLineFor(node);
  announce(`Index terms kept for ${node.title}: ${kept.length}.${skipped > 0 ? ` ${skipped} ${skipped === 1 ? "line was" : "lines were"} left out: a term needs a letter, at least 2 characters, at most 60, and each term is listed once.` : ""}`);
});

// ---- Snippets, conditions and targets ----------------------------------------------------------------------
async function editReuse() {
  const answer = await reuseDialog(reuseStateOf(project), (id) => snippetUses(project.tree, id).reduce((n, u) => n + u.count, 0));
  if (!answer) { $("b-reuse").focus(); return; }
  const before = JSON.stringify([project.snippets, project.conditions, project.targets]);
  const places = applyReuse(project, answer);
  if (JSON.stringify([project.snippets, project.conditions, project.targets]) !== before || places > 0) markDirty();
  if (previewTargetId && !project.targets.some((t) => t.id === previewTargetId)) previewTargetId = null;
  render(false);
  renderPreview();
  announce(`Reuse kept: ${project.snippets.length} ${project.snippets.length === 1 ? "snippet" : "snippets"}, ${project.conditions.length} ${project.conditions.length === 1 ? "condition" : "conditions"}, ${project.targets.length} ${project.targets.length === 1 ? "target" : "targets"}.${places ? ` ${places} ${places === 1 ? "place" : "places"} that used a deleted snippet now hold ordinary blocks.` : ""}`);
  $("b-reuse").focus();
}
$("b-reuse").addEventListener("click", () => void editReuse());

// ---- The look of the book ----------------------------------------------------------------------------------
/** The Look of the book window, shown again after a logo is chosen or removed, until the author saves or cancels. */
async function editLook() {
  let look = project.look;
  for (;;) {
    const answer = await lookDialog(look);
    if (!answer) { $("b-look").focus(); return; }
    look = answer.look;
    if (answer.action === "save") break;
    if (answer.action === "remove-logo") { delete look.logo; continue; }
    try {
      const first = (await chooseImages())[0];
      if (!first) continue;
      const info = readImageInfo(first.bytes);
      if (!info) { await messageDialog("That is not a picture", `${first.name} is not a PNG or JPEG picture.`); continue; }
      const alt = await promptText("Describe the logo", `What does ${first.name} show? A screen reader reads this aloud on the title page. Leave it empty to add it later.`, look.logo?.alt ?? "", true);
      const file = `images/${newId()}.${info.extension}`;
      assets.set(file, first.bytes);
      look = { ...look, logo: { file, width: info.width, height: info.height, alt: alt ?? "" } };
    } catch (error) {
      await messageDialog("Could not use the logo", error instanceof Error ? error.message : String(error));
    }
  }
  const kept = cleanLook(look);
  if (JSON.stringify(kept) !== JSON.stringify(project.look)) { project.look = kept; markDirty(); }
  renderPreview();
  announce(`Look kept: ${lookWords(project.look)}.`);
  $("b-look").focus();
}
$("b-look").addEventListener("click", () => void editLook());

$("b-index-suggest").addEventListener("click", () => {
  const node = selected();
  if (!node) return;
  const result = updateTopicIndex(node, project.variables);
  indexNodeId = null;
  renderIndexTerms();
  if (result.added.length || result.dropped.length) markDirty();
  const some = (list: string[]) => `${list.slice(0, 5).join(", ")}${list.length > 5 ? `, and ${list.length - 5} more` : ""}`;
  announce(
    result.added.length || result.dropped.length
      ? `${result.added.length ? `Added ${result.added.length}: ${some(result.added)}. ` : ""}${result.dropped.length ? `Took out ${result.dropped.length} the book no longer supports: ${some(result.dropped)}.` : ""}`.trim()
      : "Nothing new to suggest for this topic.",
  );
  indexBox.focus();
});

async function manageIndex() {
  const goTo = await indexDialog({
    build: () => buildBookIndex(project, numbering(project.tree)),
    summary: () => indexSummary(project.tree),
    update: () => {
      const result = updateBookIndex(project.tree, project.variables);
      if (result.added || result.dropped) markDirty();
      indexNodeId = null;
      renderIndexTerms();
      return result.added || result.dropped
        ? `Updated: ${result.added} ${result.added === 1 ? "term" : "terms"} added and ${result.dropped} taken out, in ${result.topics} ${result.topics === 1 ? "topic" : "topics"}.`
        : "Nothing new: the index is up to date.";
    },
  });
  if (goTo) {
    if (viewMode !== "edit") setViewMode("edit", { announce: false });
    select(goTo);
    announce(`Showing ${findNode(project.tree, goTo)?.title ?? "the topic"}.`);
  } else $("b-index").focus();
}
$("b-index").addEventListener("click", () => void manageIndex());

// ---- AI help: who drafts text for the author ---------------------------------------------------------------------
// The model's download belongs to the app, so it can finish while the AI help dialog is closed: the author is told when it ends, by words in the announce area.
{
  let before = "absent";
  watchModel((state) => {
    if (state.status === before) return;
    before = state.status;
    if (state.status === "ready" || state.status === "failed" || state.status === "damaged") announce(state.status === "ready" ? "The built-in AI model has been downloaded and checked." : state.message);
  });
}
$("b-ai").addEventListener("click", async () => {
  try {
    const saved = await aiDialog();
    if (saved) announce(aiStatusWords(saved, await modelState()));
  } catch (error) {
    await messageDialog("AI help", `The AI help choices could not be shown. ${error instanceof Error ? error.message : String(error)}`);
  }
  $("b-ai").focus();
});

// ---- MCP access: whether an AI assistant may use the app --------------------------------------------------------
$("b-mcp").addEventListener("click", async () => {
  try {
    const saved = await mcpDialog();
    if (saved) announce(saved.enabled ? `MCP access is on. An assistant can use the folder ${saved.folder}${saved.allowFullScreen ? " and capture a whole screen" : ", one window at a time"}.` : "MCP access is off.");
  } catch (error) {
    await messageDialog("MCP access", `The settings could not be shown. ${error instanceof Error ? error.message : String(error)}`);
  }
  $("b-mcp").focus();
});

// A link inside a preview works inside it: the help site's links open that topic, and the book's contents jump to that place.
$("preview-content").addEventListener("click", (event) => {
  const link = (event.target as HTMLElement).closest<HTMLElement>("a[data-topic], a[data-anchor]");
  if (!link) return;
  event.preventDefault();
  if (link.dataset.topic) {
    select(link.dataset.topic);
    // select() puts the keyboard in the tree; in a preview it belongs in the page that was opened.
    $("preview-content").focus();
    announce(`Showing ${findNode(project.tree, link.dataset.topic)?.title ?? "the topic"}.`);
  } else if (link.dataset.anchor) {
    const target = document.getElementById(link.dataset.anchor);
    if (target) {
      target.tabIndex = -1;
      target.scrollIntoView({ block: "start" });
      target.focus();
    }
  }
});

/** The Comments dialog for one block. Nothing changes unless the author presses Save. */
async function editBlockComments(block: Block) {
  const node = selected();
  if (!node?.page) return;
  const list = await commentsDialog({ blockWords: blockWords(block), comments: commentsOn(node.page, block.id), now: () => new Date().toISOString() });
  if (list) {
    replaceBlockComments(node.page, block.id, list);
    markDirty();
    pageEditor.refresh(true);
    renderProperties();
    const totals = commentTotals(node.page, block.id);
    announce(`Comments saved. ${commentsWords(totals.open, totals.resolved)} on this block.`);
  }
  pageEditor.focusBlockControl(block.id, "comments");
}

$("b-unresolved").addEventListener("click", async () => {
  const pick = await unresolvedDialog({
    items: () => unresolvedIn(project.tree),
    resolve: (item) => {
      const where = findNode(project.tree, item.nodeId);
      if (where?.page && setResolved(where.page, item.comment.id, true, new Date().toISOString())) markDirty();
    },
  });
  pageEditor.refresh();
  renderProperties();
  if (pick) goToComment(pick);
  else $("b-unresolved").focus();
});

/** Takes the author to the block a comment is on. */
function goToComment(item: UnresolvedItem) {
  // The comment is on the page being edited, so the page is shown for editing if a preview was showing.
  if (viewMode !== "edit") setViewMode("edit", { announce: false });
  select(item.nodeId);
  pageEditor.focusBlockControl(item.blockId, "comments");
  announce(`Went to block ${item.blockPosition} of ${item.nodeTitle}.`);
}

/** The properties of the topic and of the block that has the keyboard. */
/** Which topic the index terms box is showing, so a change is kept for that topic even if the selection has moved by then. */
let indexNodeId: string | null = null;

/** Puts the selected topic's index terms in the box, unless the author is in the middle of typing in it. */
function renderIndexTerms() {
  const node = selected();
  const box = $<HTMLTextAreaElement>("index-terms");
  if (document.activeElement === box && indexNodeId === node?.id) return;
  indexNodeId = node?.id ?? null;
  box.value = node ? termLines(node).join("\n") : "";
  box.disabled = !node;
  $<HTMLButtonElement>("b-index-suggest").disabled = !node;
  $("index-line").textContent = node ? indexLineFor(node) : "";
}

function indexLineFor(node: TreeNode): string {
  const terms = node.index?.terms ?? [];
  const own = terms.filter((t) => t.by === "author").length;
  return terms.length === 0
    ? "This topic has no index terms yet."
    : `${terms.length} ${terms.length === 1 ? "term" : "terms"}: ${terms.length - own} proposed by the software and ${own} written or changed by you.`;
}

/** The See also list of the selected topic, as a list and a line in words, and the button that changes it. */
function renderSeeAlso() {
  const node = selected();
  const list = $<HTMLUListElement>("seealso-list");
  list.replaceChildren();
  const numbers = numbering(project.tree);
  for (const id of node?.seeAlso ?? []) {
    const target = findNode(project.tree, id);
    if (!target) continue;
    const li = document.createElement("li");
    li.textContent = `${numbers.get(id) ?? ""} ${target.title}`.trim();
    list.append(li);
  }
  const count = list.children.length;
  $("seealso-line").textContent = !node ? "" : count === 0 ? "This topic has no See also list." : `${count} ${count === 1 ? "topic" : "topics"} in the list.`;
  $<HTMLButtonElement>("b-seealso").disabled = !node;
}

$("b-seealso").addEventListener("click", async () => {
  const node = selected();
  if (!node) return;
  const chosen = await chooseSeeAlsoDialog(project, { heading: `See also for "${node.title}"`, help: `Tick the topics worth reading next, up to ${MOST_SEE_ALSO}. Nothing changes until you choose Keep these topics.`, leave: node.id, chosen: node.seeAlso ?? [] });
  if (chosen === null) { $("b-seealso").focus(); return; }
  setSeeAlso(project.tree, node.id, chosen);
  markDirty();
  renderProperties();
  render(false);
  announce(chosen.length === 0 ? `The See also list of ${node.title} is now empty.` : `See also for ${node.title}: ${chosen.length} ${chosen.length === 1 ? "topic" : "topics"}.`);
  $("b-seealso").focus();
});

/** The conditions of the selected topic, in words, and the button that changes them. */
function renderTopicConditions() {
  const node = selected();
  const names = (node?.conditions ?? []).map((id) => project.conditions.find((c) => c.id === id)?.name).filter((n): n is string => !!n);
  $("conditions-line").textContent = !node ? "" : project.conditions.length === 0 ? "The book has no conditions yet. Choose Reuse in the toolbar to make some." : names.length === 0 ? "This topic is in every output." : `Carries: ${names.join(", ")}. Left out of an output made for a target that hides any of them, with the topics under it.`;
  $<HTMLButtonElement>("b-topic-conditions").disabled = !node || project.conditions.length === 0;
}

$("b-topic-conditions").addEventListener("click", async () => {
  const node = selected();
  if (!node) return;
  const chosen = await conditionsDialog(project.conditions, node.conditions ?? [], `"${node.title}"`);
  if (chosen === null) { $("b-topic-conditions").focus(); return; }
  if (chosen.length) node.conditions = chosen; else delete node.conditions;
  markDirty();
  renderProperties();
  announce(chosen.length ? `${node.title} now carries: ${chosen.map((id) => project.conditions.find((c) => c.id === id)?.name).join(", ")}.` : `${node.title} carries no conditions now.`);
  $("b-topic-conditions").focus();
});

function renderProperties() {
  renderIndexTerms();
  renderSeeAlso();
  renderTopicConditions();
  const node = selected();
  const numbers = numbering(project.tree);
  const inBook = unresolvedCount(project.tree);
  $("b-unresolved").textContent = `Unresolved comments (${inBook})`;
  $("props-comments-line").textContent = node
    ? `Open comments: ${openCount(node.page)} in this topic, ${inBook} in the whole book.`
    : `Open comments: ${inBook} in the whole book.`;
  $("props-topic-line").textContent = node
    ? `${numbers.get(node.id)} ${node.title}. ${node.pictures.length} ${node.pictures.length === 1 ? "picture" : "pictures"}, ${node.page?.blocks.length ?? 0} ${(node.page?.blocks.length ?? 0) === 1 ? "block" : "blocks"} on the page.`
    : "Nothing is selected.";
  const host = $("props-block");
  host.replaceChildren();
  const chosen = pageEditor.selected();
  const heading = document.createElement("h4");
  heading.textContent = "Selected block";
  host.append(heading);
  if (!chosen) {
    const none = document.createElement("p");
    none.className = "help";
    none.textContent = "No block is selected. Move into a block on the page to see its properties.";
    host.append(none);
    return;
  }
  const { block, position, total } = chosen;
  const lines = [`Kind: ${blockLabel(block.type)}.`, `Position: block ${position} of ${total}.`];
  if (block.type === "paragraph") {
    const words = plainText(block.text).trim().split(/\s+/).filter(Boolean).length;
    lines.push(`${words} ${words === 1 ? "word" : "words"}.`);
  } else if (block.type === "heading") {
    lines.push(block.text.trim() ? `Heading: ${block.text.trim()}.` : "The heading is empty.");
  } else if (block.type === "picture") {
    const picture = node?.pictures.find((p) => p.id === block.pictureId);
    lines.push(picture ? `Picture: ${picture.altText.trim() || picture.source.originalName || picture.file}, ${picture.width} by ${picture.height} pixels.` : "No picture is chosen yet.");
  } else if (block.type === "callout") {
    lines.push(`Box: ${calloutLabel(block.kind)}.`);
  }
  for (const line of lines) {
    const p = document.createElement("p");
    p.textContent = line;
    host.append(p);
  }
}

function renderHeading() {
  $("project-heading").textContent = `${project.name}${dirty ? " (unsaved changes)" : ""}`;
  document.title = `${dirty ? "* " : ""}${project.name} - OpenExplainer`;
  // The window's own title (title bar, taskbar, Alt+Tab, and what a screen reader says) names the project too.
  void setWindowTitle(windowTitle(project.name, dirty));
  $("folder-line").textContent = filePath ? `Saved file: ${filePath}` : "Not saved to a file yet.";
  const waiting = draftCount(project);
  $("b-drafts").textContent = waiting > 0 ? `Drafts (${waiting} waiting)` : "Drafts";
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
  announce(`Showing the pictures as in the ${HIGHLIGHT_KINDS.find((k) => k.id === previewKind)!.name.toLowerCase()}: the click circle and the zoom follow that place's settings.`);
});

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

/** The Drawing dialog for one picture: its arrows, text boxes, rectangles and markers, and the project's named styles. Nothing changes unless the author presses Save. */
async function editDrawing(picture: Picture, name: string) {
  const bytes = assets.get(picture.file);
  const url = bytes ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: picture.file.endsWith(".png") ? "image/png" : "image/jpeg" })) : null;
  let result;
  try {
    result = await drawingDialog({ picture, imageUrl: url, styles: project.styles });
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
  if (!result) return;
  setShapes(picture, result.shapes);
  project.styles = result.styles;
  markDirty();
  renderPictures();
  document.querySelector<HTMLElement>(`[data-drawing="${picture.id}"]`)?.focus();
  const n = result.shapes.length;
  announce(n ? `Drawing saved on ${name}: ${n} ${n === 1 ? "mark" : "marks"}.` : `All marks removed from ${name}.`);
}

/** The Picture view dialog for one picture. Nothing changes unless the author presses Save. */
async function editView(nodeId: string, picture: Picture, name: string) {
  const bytes = assets.get(picture.file);
  const url = bytes ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: picture.file.endsWith(".png") ? "image/png" : "image/jpeg" })) : null;
  let choice;
  try {
    choice = await pictureViewDialog(picture, url, project.zoom, previewKind);
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
  if (!choice) return;
  setPictureView(project.tree, nodeId, picture.id, choice.view);
  markDirty();
  renderPictures();
  document.querySelector<HTMLElement>(`[data-view="${picture.id}"]`)?.focus();
  const view = picture.view;
  announce(!view ? `${name} is shown whole.` : view.kind === "crop" ? `${name} is cropped to ${view.width} by ${view.height} pixels.` : `${name} is zoomed in on the click.`);
}

/** The Callouts dialog for one picture. Nothing changes unless the author presses Save. */
async function editCallouts(picture: Picture, name: string) {
  const bytes = assets.get(picture.file);
  const url = bytes ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: picture.file.endsWith(".png") ? "image/png" : "image/jpeg" })) : null;
  let list;
  try {
    list = await calloutsDialog(picture, url);
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
  if (!list) return;
  setCallouts(picture, list);
  markDirty();
  renderPictures();
  document.querySelector<HTMLElement>(`[data-callouts="${picture.id}"]`)?.focus();
  announce(list.length ? `${list.length} ${list.length === 1 ? "callout" : "callouts"} saved on ${name}.` : `Callouts removed from ${name}.`);
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

$("b-zoom").addEventListener("click", async () => {
  const next = await zoomSettingsDialog(project.zoom, project.paper);
  if (!next) return;
  project.zoom = next.zoom;
  project.paper = next.paper;
  markDirty();
  renderPictures();
  if (viewMode !== "edit") renderPreview();
  announce(`Zoom settings saved. The automatic zoom for print is ${next.paper.autoZoom ? "on" : "off"}.`);
});

$("b-highlight").addEventListener("click", async () => {
  const next = await highlightDialog(project.highlight);
  if (!next) return;
  project.highlight = next;
  markDirty();
  renderPictures();
  announce("Click circle settings saved.");
});

function renderPictures() {
  pageEditor.refresh();
  renderProperties();
  renderPreview();
  blobUrls.forEach((url) => URL.revokeObjectURL(url));
  blobUrls = [];
  const list = $<HTMLUListElement>("pictures");
  list.replaceChildren();
  const node = selected();
  $<HTMLButtonElement>("b-import").disabled = !node;
  $<HTMLButtonElement>("b-capture").disabled = !node;
  $<HTMLButtonElement>("b-draft-topic").disabled = !node || !node.pictures.some((p) => (p.callouts ?? []).length > 0);
  $<HTMLButtonElement>("b-procedure").disabled = !node || !node.pictures.some((p) => p.click);
  $<HTMLButtonElement>("b-opener").disabled = !node;
  $<HTMLButtonElement>("b-summary").disabled = !node;
  $<HTMLButtonElement>("b-boxes").disabled = !node;
  $("page-heading").textContent = node ? `Page of ${node.title}` : "Page";
  $("pictures-empty").textContent = !node
    ? "Select a chapter or topic to see or add its pictures."
    : node.pictures.length ? "" : `"${node.title}" has no pictures yet.`;
  if (!node) return;

  for (const picture of node.pictures) {
    const li = document.createElement("li");
    const bytes = assets.get(picture.file);
    if (bytes) {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: picture.file.endsWith(".png") ? "image/png" : "image/jpeg" }));
      blobUrls.push(url);
      li.append(pictureBox({
        picture, url, alt: picture.altText || "Picture with no description yet", className: "thumb",
        circle: circleFor(picture, project.highlight, previewKind), shown: shownPart(picture, project.zoom, previewKind),
      }));
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
    edit.dataset.edit = picture.id;
    edit.setAttribute("aria-label", `Edit description of ${name}`);
    edit.addEventListener("click", () => void editDescription(node.id, picture));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove picture";
    remove.dataset.remove = picture.id;
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
    const viewLine = viewWords(picture, project.zoom, previewKind);
    if (viewLine) {
      const viewState = document.createElement("p");
      viewState.className = "help";
      viewState.textContent = viewLine;
      info.append(viewState);
    }
    const callouts = entryList(picture, shownPart(picture, project.zoom, previewKind));
    if (callouts) info.append(callouts);
    const marks = marksSummary(picture);
    if (marks) {
      const markLine = document.createElement("p");
      markLine.className = "help";
      markLine.textContent = `Drawing: ${marks}`;
      info.append(markLine);
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
    const calloutsButton = document.createElement("button");
    calloutsButton.type = "button";
    calloutsButton.textContent = "Callouts";
    calloutsButton.dataset.callouts = picture.id;
    calloutsButton.setAttribute("aria-label", `Callouts of ${name}`);
    calloutsButton.addEventListener("click", () => void editCallouts(picture, name));
    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.textContent = "Picture view";
    viewButton.dataset.view = picture.id;
    viewButton.setAttribute("aria-label", `Picture view of ${name}`);
    viewButton.addEventListener("click", () => void editView(node.id, picture, name));
    const drawingButton = document.createElement("button");
    drawingButton.type = "button";
    drawingButton.textContent = "Drawing";
    drawingButton.dataset.drawing = picture.id;
    drawingButton.setAttribute("aria-label", `Drawing on ${name}`);
    drawingButton.addEventListener("click", () => void editDrawing(picture, name));
    const draftButton = document.createElement("button");
    draftButton.type = "button";
    draftButton.textContent = "Draft callout text";
    draftButton.dataset.draft = picture.id;
    draftButton.setAttribute("aria-label", `Draft callout text for ${name} with AI`);
    draftButton.addEventListener("click", () => void draftFor(node.id, picture.id, () => document.querySelector<HTMLElement>(`[data-draft="${picture.id}"]`)?.focus()));
    info.append(edit, " ", viewButton, " ", calloutsButton, ...((picture.callouts ?? []).length > 0 ? [" ", draftButton] : []), " ", drawingButton, " ", remove);
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
  let calloutsMade = 0;
  for (const picture of pictures) {
    assets.set(picture.file, files.get(picture.file)!);
    addPicture(project.tree, node.id, picture);
    // The clicked item's outline and name become the picture's first callout, with a sentence still to write.
    if (addCalloutFromClick(picture)) calloutsMade++;
  }
  if (pictures.length) {
    markDirty();
    renderPictures();
  }
  const made = calloutsMade > 0 ? ` ${calloutsMade} ${calloutsMade === 1 ? "callout was" : "callouts were"} made from the clicked items; each needs a sentence.` : "";
  announce(`${addedWords(pictures.length, shots.length)}${made}`);
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
  const loss = linkLossWords(countLinksTo(project.tree, subtreeIds(node)));
  if (!(await confirmDialog("Delete", `Delete "${node.title}"?${extra}${loss ? ` Elsewhere in the book, ${loss}` : ""}`, "Delete"))) return;
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
  await openProjectAt(picked);
}

/** Opens the project file at this path (chosen in the Open window, or named when the program was started by double-clicking a project). */
async function openProjectAt(picked: string) {
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

// Started by double-clicking a project file (or "Open with"): that project is opened at once. Nothing has been changed yet, so there is nothing to lose.
void (async () => {
  try {
    const launched = await invoke<string | null>("launch_file");
    if (launched) await openProjectAt(launched);
  } catch {
    // not running inside the program (a test or a browser), or nothing to open
  }
})();

// For tests in a development build only (a real build leaves this out): lets a test put a made-up project, with its pictures, into the window, and read it back.
if (import.meta.env?.DEV) {
  (globalThis as unknown as Record<string, unknown>).__oe_test = {
    adopt(next: Project, nextAssets: Assets) {
      project = next;
      assets = nextAssets;
      filePath = null;
      dirty = false;
      selectedId = null;
      collapsed.clear();
      render(true);
    },
    select: (id: string) => select(id),
    project: () => project,
  };
}

/** A safe file name for an export, such as "My Book help site.zip" (or "My Book.docx" for Word). */
function exportFileName(kind: string, extension = "zip"): string {
  const base = projectFileName(project.name).replace(/\.openexplainer$/, "");
  return extension === "zip" ? `${base} ${kind}.zip` : `${base}.${extension}`;
}

/** Makes an export of the whole book as one zip file the author chooses where to save. Nothing in the project changes. */
async function exportBook() {
  const choice: ExportChoice | null = await exportDialog({
    checkFirst: () => void $("b-check").click(),
    unresolved: unresolvedCount(project.tree),
    guides: project.guides.map((g) => ({ id: g.id, name: g.name })),
    targets: project.targets.map((t) => ({ id: t.id, name: t.name })),
  });
  if (!choice) return $("b-export").focus();
  const name = EXPORT_KINDS.find((k) => k.id === choice.kind)!.name;
  try {
    const guide = GUIDE_KINDS.includes(choice.kind) ? project.guides.find((g) => g.id === choice.guideId) : undefined;
    if (GUIDE_KINDS.includes(choice.kind) && !guide) throw new Error("There is no guide to export. Choose Guides to make one.");
    const extension = EXPORT_EXTENSION[choice.kind];
    const path = await chooseExportPath(
      guide ? `${projectFileName(guide.name).replace(/\.openexplainer$/, "")}.${extension}` : exportFileName(choice.kind === "help-site" ? "help site" : choice.kind === "json" ? "JSON export" : "Markdown", extension),
      extension,
    );
    if (!path) return $("b-export").focus();
    announce(`Making the ${name} export. This can take a moment.`);
    const made = await makeExport(project, assets, choice.kind, { guideId: choice.guideId, comments: choice.comments, targetId: choice.targetId, flatten: flattenPicture, now: new Date().toISOString() });
    const bytes = made.bytes;
    const left = made.notes;
    await writeBytes(path, bytes);
    announce(`${name} export saved to ${path}.`);
    await messageDialog("Export saved", `The ${name} export was saved to ${path}.${left.length ? `\n\nPlease note:\n${left.join("\n")}` : ""}`);
  } catch (error) {
    await messageDialog("Could not make the export", `${error instanceof Error ? error.message : String(error)} Your project was not changed.`);
  } finally {
    $("b-export").focus();
  }
}

/** Reads a JSON export (a zip) into a new project, replacing the one that is open once the author agrees. */
async function importExport() {
  if (!(await guardUnsaved())) return;
  const picked = await chooseImportPath();
  if (!picked) return;
  try {
    const loaded = await unpackJsonExport(await readBytes(picked));
    project = loaded.project;
    assets = loaded.assets;
    filePath = null;
    // It has not been saved as a project yet, so it counts as unsaved.
    dirty = true;
    selectedId = null;
    collapsed.clear();
    render(true);
    renderHeading();
    announce(`Imported ${project.name}. Save it to keep it.`);
    if (loaded.missing.length) await messageDialog("Some picture files are missing", `${loaded.missing.length} picture file(s) listed in this export were not in it. They show as missing, and you can remove or re-import them.`);
  } catch (error) {
    await messageDialog("Could not import the export", `${error instanceof Error ? error.message : String(error)} Your project was not changed.`);
  }
}

/** Reads a Word document (.docx) into chapters and topics added at the end of this book, after the author has read what will and will not come in. */
async function importWord() {
  const picked = await chooseWordPath();
  if (!picked) return $("b-import-word").focus();
  try {
    const name = picked.split(/[\\/]/).pop() ?? picked;
    announce(`Reading ${name}. This can take a moment.`);
    const imported = await importDocx(await readBytes(picked), { name: name.replace(/\.docx$/i, ""), now: new Date().toISOString() });
    if (imported.chapters.length === 0) { await messageDialog("Nothing to import", `${imported.report.join("\n")}\nYour book was not changed.`); return; }
    if (!(await confirmDialog("Import from Word", importQuestion(name, imported), "Add them to the book"))) { announce("Nothing was imported."); return; }
    const added = addImported(project, assets, imported);
    selectedId = added.chapters[0]?.id ?? selectedId;
    markDirty();
    render(true);
    announce(`Added ${added.chapters.length} ${added.chapters.length === 1 ? "chapter" : "chapters"} and ${added.topics} ${added.topics === 1 ? "topic" : "topics"} from ${name}. Each is marked Drafted.`);
  } catch (error) {
    await messageDialog("Could not import the Word file", `${error instanceof Error ? error.message : String(error)}\nYour book was not changed.`);
  } finally {
    $("b-import-word").focus();
  }
}

/** Reads the comments reviewers made in a review copy (Export, Word review copy) and adds each to the block it was made on, after the author has read how many will come in. */
async function importReview() {
  const picked = await chooseWordPath("Bring in review comments");
  if (!picked) return $("b-review-in").focus();
  try {
    const name = picked.split(/[\\/]/).pop() ?? picked;
    announce(`Reading the comments in ${name}. This can take a moment.`);
    const read = await readReviewComments(await readBytes(picked), project);
    if (read.comments.length === 0) { await messageDialog("No comments to bring in", `${read.report.join("\n")}\nYour book was not changed.`); return; }
    if (!(await confirmDialog("Bring in review comments", `${name}\n\n${read.report.join("\n")}\n\nThey are added as open comments, each starting with the reviewer's name, and no words of the book change. A comment already in the book is not added again.`, "Add the comments"))) { announce("No comments were added."); return; }
    const done = addReviewComments(project, read.comments, new Date().toISOString());
    if (done.added) markDirty();
    render(false);
    renderPreview();
    announce(`Added ${done.added} ${done.added === 1 ? "comment" : "comments"}${done.already ? ` (${done.already} already in the book)` : ""}. See them under Comments.`);
  } catch (error) {
    await messageDialog("Could not bring in the comments", `${error instanceof Error ? error.message : String(error)}\nYour book was not changed.`);
  } finally {
    $("b-review-in").focus();
  }
}

// ---- History: snapshots of the book --------------------------------------------------------------------------
async function editHistory() {
  const { bookChanged } = await historyDialog(project, () => markDirty());
  if (bookChanged) {
    // The book was put back (in place), so everything that shows it is drawn again; a topic that was selected may be gone.
    if (previewTargetId && !project.targets.some((t) => t.id === previewTargetId)) previewTargetId = null;
    drawTargetPicker();
    render(true);
    renderHeading();
    renderPreview();
    announce("The book was put back from a snapshot.");
  }
  $("b-history").focus();
}
$("b-history").addEventListener("click", () => void editHistory());

$("b-export").addEventListener("click", () => void exportBook());
$("b-review-in").addEventListener("click", () => void importReview());
$("b-import-word").addEventListener("click", () => void importWord());
$("b-import-export").addEventListener("click", () => void importExport());

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
/** F6 and Shift+F6 move between the three panes, as in most desktop programs. */
const PANES = [
  { id: "pane-tree", name: "Chapters and topics" },
  { id: "pane-page", name: "Page" },
  { id: "pane-props", name: "Properties" },
];
function focusPane(id: string) {
  const pane = $(id);
  if (id === "pane-tree") (treeEl.querySelector<HTMLElement>('[tabindex="0"]') ?? pane).focus();
  else if (id === "pane-page") pageEditor.focus();
  else (pane.querySelector<HTMLElement>("select:not([disabled]), button:not([disabled]), input:not([disabled])") ?? pane).focus();
  // Some panes have nothing to focus: the pane itself takes it.
  if (!pane.contains(document.activeElement)) pane.focus();
  announce(`${PANES.find((p) => p.id === id)!.name} pane`);
}
document.addEventListener("keydown", (event) => {
  if (event.key !== "F6" || document.querySelector("dialog[open]")) return;
  event.preventDefault();
  const here = PANES.findIndex((p) => $(p.id).contains(document.activeElement));
  const step = event.shiftKey ? PANES.length - 1 : 1;
  focusPane(PANES[here < 0 ? (event.shiftKey ? PANES.length - 1 : 0) : (here + step) % PANES.length].id);
});

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

/** The book check: optional, advises only. What the author ignores is saved with the project. */
$("b-check").addEventListener("click", async () => {
  const go = await checkDialog({
    issues: () => checkProject(project, { hasFile: (file) => assets.has(file) }),
    settings: () => project.checks,
    setSettings: (next) => { project.checks = next; markDirty(); },
  });
  if (go) goToIssue(go);
  else $("b-check").focus();
});

/** Takes the author to the thing the check found: the topic, and the button or block where it is put right. */
function goToIssue(issue: Issue) {
  if (issue.kind === "variable-empty" || issue.kind === "variable-unused") {
    announce("Opening the project variables.");
    $("b-vars").click();
    return;
  }
  if (viewMode !== "edit") setViewMode("edit", { announce: false });
  if (issue.nodeId) select(issue.nodeId);
  const pick = (attribute: string) => document.querySelector<HTMLElement>(`[data-${attribute}="${issue.pictureId}"]`)?.focus();
  switch (issue.kind) {
    case "picture-alt": pick("edit"); break;
    case "mark-alt": case "mark-contrast": pick("drawing"); break;
    case "callout-name": case "callout-description": pick("callouts"); break;
    case "print-small": pick("view"); break;
    case "missing-file": case "picture-unplaced": pick("remove"); break;
    case "empty-block": case "control-name": case "step-verb": if (issue.blockId) pageEditor.focusBlockControl(issue.blockId, "first"); break;
    case "avoid-word":
      if (issue.blockId) pageEditor.focusBlockControl(issue.blockId, "first");
      else if (issue.pictureId) pick(issue.key.includes(":alt:") ? "edit" : "callouts");
      else $("b-rename").focus();
      break;
    case "empty-topic": pageEditor.focus(); break;
    case "ai-draft": announce("Opening Drafts."); void openDrafts(); return;
  }
  announce(`Went to ${issue.where}.`);
}

$("b-vars").addEventListener("click", async () => {
  const result = await variablesDialog(project.variables);
  if (!result) return;
  project.variables = result;
  markDirty();
  announce("Variables updated");
});

// ---- Writing style and drafts ------------------------------------------------------------------------------
$("b-style").addEventListener("click", async () => {
  const result = await styleDialog({ style: project.writingStyle, avoid: project.avoidWords });
  if (result !== null) {
    const styleChanged = result.style !== project.writingStyle;
    const avoidChanged = JSON.stringify(result.avoid) !== JSON.stringify(project.avoidWords);
    if (styleChanged) project.writingStyle = result.style;
    if (avoidChanged) project.avoidWords = result.avoid;
    if (styleChanged || avoidChanged) {
      markDirty();
      const said: string[] = [];
      if (styleChanged) said.push(result.style ? "Writing style notes saved." : "Writing style notes cleared.");
      if (avoidChanged) said.push(result.avoid.length === 0 ? "Words to avoid cleared." : `Words to avoid saved: ${result.avoid.length} ${result.avoid.length === 1 ? "word or phrase" : "words and phrases"}.`);
      announce(said.join(" "));
    }
  }
  $("b-style").focus();
});

/** Drafts a sentence for each callout without one, in a topic or on one picture, then lets the author look at the drafts. */
async function draftFor(nodeId: string, pictureId: string | undefined, back: () => void) {
  const run = await draftCalloutText(project, nodeId, pictureId);
  if (run && run.made > 0) {
    markDirty();
    announce(`${run.made} ${run.made === 1 ? "draft is" : "drafts are"} waiting in Drafts.`);
  }
  renderHeading();
  if (run?.openDrafts) await openDrafts();
  else back();
}

/** Makes a numbered procedure draft from a topic's click pictures (by rules, no AI), then lets the author look at it. */
async function draftProcedureFor(nodeId: string) {
  const made = draftProcedure(project, nodeId, new Date().toISOString());
  if (!made.ok) {
    await messageDialog("Draft a procedure", made.words);
    $("b-procedure").focus();
    return;
  }
  markDirty();
  renderHeading();
  const n = made.draft.steps.length;
  announce(`A numbered procedure of ${n} ${n === 1 ? "step" : "steps"} is waiting in Drafts.${made.flagged > 0 ? ` ${made.flagged} ${made.flagged === 1 ? "step has" : "steps have"} no name and need your attention.` : ""}`);
  await openDrafts(made.draft.id);
}

/** The list of drafts waiting. The author accepts or rejects each one; an accepted sentence becomes the callout's sentence, and an accepted procedure is added to the end of the topic's page. */
async function openDrafts(focus?: string) {
  const go = await draftsDialog({
    focus,
    rows: () => draftRows(project),
    accept: (id, texts, extra) => {
      const before = project.drafts.length;
      const result = acceptDraft(project, id, texts, extra);
      if (result.ok) {
        markDirty();
        renderPictures();
      } else if (project.drafts.length < before) markDirty();
      return result;
    },
    reject: (id) => {
      const done = rejectDraft(project, id);
      if (done) markDirty();
      return done;
    },
  });
  renderHeading();
  if (go) goToDraft(go);
  else $("b-drafts").focus();
}

function goToDraft(row: DraftRow) {
  if (viewMode !== "edit") setViewMode("edit", { announce: false });
  select(row.nodeId);
  if (row.draft.kind === "callout-sentence") document.querySelector<HTMLElement>(`[data-callouts="${row.draft.pictureId}"]`)?.focus();
  else if (row.draft.kind === "chapter-text") $(row.draft.role === "opener" ? "b-opener" : "b-summary").focus();
  else if (row.draft.kind === "box") $("b-boxes").focus();
  else $("b-procedure").focus();
  announce(`Went to ${row.where}.`);
}

$("b-drafts").addEventListener("click", () => void openDrafts());
$("b-draft-topic").addEventListener("click", () => {
  if (selectedId) void draftFor(selectedId, undefined, () => $("b-draft-topic").focus());
});
$("b-procedure").addEventListener("click", () => {
  if (selectedId) void draftProcedureFor(selectedId);
});

/** Drafts the opener of the selected chapter, or the summary to go on the selected topic, then lets the author look at it. */
async function draftChapterFor(role: ChapterTextRole) {
  if (!selectedId) return;
  const run = await draftChapterTextFor(project, selectedId, role);
  if (run && run.made > 0) {
    markDirty();
    announce(`The ${role} is waiting in Drafts.`);
  }
  renderHeading();
  if (run?.openDrafts) await openDrafts();
  else $(role === "opener" ? "b-opener" : "b-summary").focus();
}
$("b-opener").addEventListener("click", () => void draftChapterFor("opener"));
$("b-summary").addEventListener("click", () => void draftChapterFor("summary"));

/** Suggests boxed notes for the selected topic, then lets the author look at them. */
async function suggestBoxesFor() {
  if (!selectedId) return;
  const run = await draftBoxesFor(project, selectedId);
  if (run && run.made > 0) {
    markDirty();
    announce(`${run.made} suggested ${run.made === 1 ? "box is" : "boxes are"} waiting in Drafts.`);
  }
  renderHeading();
  if (run?.openDrafts) await openDrafts();
  else $("b-boxes").focus();
}
$("b-boxes").addEventListener("click", () => void suggestBoxesFor());

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
