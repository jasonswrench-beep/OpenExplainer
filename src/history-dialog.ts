// The History window (format version 20): snapshots of the whole book, kept in the project file. The author can take one, see in words what is different between the book now and a snapshot, put the whole
// book or a single topic back as a snapshot had it, rename and delete. A restore first keeps the book as it is as a new snapshot, so it can be undone. Everything is done by keyboard; the list is a
// list box, every change is said in a status line, and nothing is replaced without a question that says what will happen. The rules are in src/project/snapshots.ts.
import { confirmDialog, open, promptText } from "./dialogs.ts";
import { whenWords, MOST_SNAPSHOTS, type Snapshot } from "./project/history.ts";
import type { Project } from "./project/model.ts";
import { addSnapshot, compareWithSnapshot, comparisonLines, deleteSnapshot, renameSnapshot, restoreTopic, restoreWhole, snapshotWords, takeSnapshot, type Comparison } from "./project/snapshots.ts";

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Shows the History window on the open project. The project is changed in place when the author takes, renames, deletes or restores. Returns whether the book itself (not just the list of snapshots) changed, so the caller can draw it again. */
export async function historyDialog(project: Project, onChange: (what: { book: boolean }) => void): Promise<{ bookChanged: boolean }> {
  let bookChanged = false;
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "hist-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="hist-title">History: snapshots of the book</h2>
      <p class="help" id="hist-help">A snapshot is a dated copy of the whole book, kept inside this project file. Take one before a big change. If a change goes wrong, put the whole book, or just one topic, back as it was. Putting something back first keeps the book as it is now as a new snapshot, so that can be undone too. The book keeps up to ${MOST_SNAPSHOTS} snapshots.</p>
      <p><label for="hist-list">Snapshots, oldest first</label><br><select id="hist-list" size="8" aria-describedby="hist-help hist-status"></select></p>
      <p><button type="button" id="hist-take">Take a snapshot now</button> <button type="button" id="hist-compare">Compare with the book now</button> <button type="button" id="hist-whole">Restore the whole book</button> <button type="button" id="hist-rename">Rename</button> <button type="button" id="hist-delete">Delete</button></p>
      <p id="hist-status" class="help" role="status" aria-live="polite"></p>
      <div id="hist-diff-box" hidden>
        <p><label for="hist-diff">What is different from the chosen snapshot</label><br><select id="hist-diff" size="8" aria-describedby="hist-diff-help"></select></p>
        <p class="help" id="hist-diff-help">A topic that was changed or removed can be put back as the snapshot had it. A topic that was added since is not in the snapshot, so it cannot be put back.</p>
        <p><button type="button" id="hist-topic">Restore the chosen topic</button></p>
        <p id="hist-book-diff" class="help"></p>
      </div>
      <p><button value="close" id="hist-close">Close</button></p>
    </form>`;
  const q = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const list = q<HTMLSelectElement>("hist-list");
  const status = q("hist-status");
  const diffBox = q("hist-diff-box");
  const diff = q<HTMLSelectElement>("hist-diff");
  const say = (words: string) => { status.textContent = ""; setTimeout(() => (status.textContent = words), 30); };
  let comparison: { snapshot: Snapshot; result: Comparison } | null = null;

  const chosen = (): Snapshot | null => project.history.find((s) => s.id === list.value) ?? null;
  const drawList = (select?: string) => {
    list.innerHTML = project.history.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}, ${s.automatic ? "taken by the program" : "taken by hand"} ${esc(whenWords(s.savedAt))}</option>`).join("");
    if (project.history.length === 0) list.innerHTML = `<option value="" disabled>No snapshots yet</option>`;
    const at = select && project.history.some((s) => s.id === select) ? select : project.history.at(-1)?.id;
    if (at) list.value = at;
    sync();
  };
  const sync = () => {
    const have = chosen() !== null;
    for (const id of ["hist-compare", "hist-whole", "hist-rename", "hist-delete"]) q<HTMLButtonElement>(id).disabled = !have;
    q<HTMLButtonElement>("hist-take").disabled = project.history.length >= MOST_SNAPSHOTS;
  };
  list.addEventListener("change", () => { comparison = null; diffBox.hidden = true; sync(); });

  q("hist-take").addEventListener("click", async () => {
    const name = await promptText("Take a snapshot", `What should it be called? Leave it empty to name it from the date. The book keeps up to ${MOST_SNAPSHOTS} snapshots.`, "", true);
    if (name === null) return;
    const snapshot = takeSnapshot(project, name, new Date().toISOString());
    addSnapshot(project, snapshot);
    onChange({ book: false });
    drawList(snapshot.id);
    say(`Took the snapshot "${snapshot.name}". The book has ${project.history.length} of ${MOST_SNAPSHOTS}.`);
    list.focus();
  });

  q("hist-compare").addEventListener("click", () => {
    const snapshot = chosen();
    if (!snapshot) return;
    const result = compareWithSnapshot(project, snapshot);
    comparison = { snapshot, result };
    diffBox.hidden = false;
    const lines = comparisonLines(result, snapshot);
    diff.innerHTML = result.topics.length
      ? result.topics.map((t) => `<option value="${esc(t.id)}" data-kind="${t.kind}">${t.kind === "removed" ? "Removed" : t.kind === "added" ? "Added" : "Changed"}: ${t.kind === "removed" ? esc(t.title) : esc(`${t.number} ${t.title}`)}${t.kind === "changed" ? esc(`: ${t.what.join("; ")}`) : t.kind === "removed" ? esc(` (it was ${t.number})`) : ""}</option>`).join("")
      : `<option value="" disabled>No topic is different</option>`;
    q("hist-book-diff").textContent = result.book.join(" ");
    q<HTMLButtonElement>("hist-topic").disabled = result.topics.every((t) => t.kind === "added");
    say(result.topics.length || result.book.length ? `${lines.length - 1} ${lines.length - 1 === 1 ? "difference" : "differences"} from "${snapshot.name}". They are listed below.` : lines[0]);
    if (result.topics.length) diff.focus();
  });

  q("hist-whole").addEventListener("click", async () => {
    const snapshot = chosen();
    if (!snapshot) return;
    const yes = await confirmDialog("Restore the whole book?", `This puts the whole book back as it was in "${snapshot.name}" (${snapshotWords(snapshot)}). Everything done since is replaced: words, pictures, settings and the order of topics. The book as it is now is kept first as a new snapshot called "Before restoring "${snapshot.name}"", so you can undo this by restoring that one.`, "Restore the book");
    if (!yes) return;
    const done = restoreWhole(project, snapshot, new Date().toISOString());
    bookChanged = true;
    onChange({ book: true });
    comparison = null;
    diffBox.hidden = true;
    drawList(snapshot.id);
    say(`The whole book is back as it was in "${snapshot.name}". The book as it was just before is kept as "${done.safety.name}".${done.removed ? ` The older snapshot "${done.removed.name}" was removed to make room.` : ""}`);
    list.focus();
  });

  q("hist-topic").addEventListener("click", async () => {
    if (!comparison) return;
    const topic = comparison.result.topics.find((t) => t.id === diff.value);
    if (!topic || topic.kind === "added") { say("Choose a topic that was changed or removed."); diff.focus(); return; }
    const snapshot = comparison.snapshot;
    const yes = await confirmDialog("Restore this topic?", `This puts "${topic.title}" back as it was in "${snapshot.name}": its title, status, words, pictures and links.${topic.kind === "removed" ? " It was deleted since, so it is put back where it was." : " What it has now is replaced."} Other topics are not touched. The book as it is now is kept first as a new snapshot, so you can undo this.`, "Restore the topic");
    if (!yes) return;
    const done = restoreTopic(project, snapshot, topic.id, new Date().toISOString());
    bookChanged = true;
    onChange({ book: true });
    drawList(snapshot.id);
    comparison = null;
    diffBox.hidden = true;
    say(`"${done.title}" is back as it was in "${snapshot.name}". The book as it was just before is kept as "${done.safety.name}".${done.removed ? ` The older snapshot "${done.removed.name}" was removed to make room.` : ""}`);
    list.focus();
  });

  q("hist-rename").addEventListener("click", async () => {
    const snapshot = chosen();
    if (!snapshot) return;
    const name = await promptText("Rename the snapshot", "What should it be called?", snapshot.name);
    if (name === null || !renameSnapshot(project, snapshot.id, name)) return;
    onChange({ book: false });
    drawList(snapshot.id);
    say(`The snapshot is now called "${snapshot.name}".`);
    list.focus();
  });

  q("hist-delete").addEventListener("click", async () => {
    const snapshot = chosen();
    if (!snapshot) return;
    const yes = await confirmDialog("Delete this snapshot?", `"${snapshot.name}" (${snapshotWords(snapshot)}) will be deleted from the project file. The book itself is not changed. This cannot be undone.`, "Delete the snapshot");
    if (!yes) return;
    deleteSnapshot(project, snapshot.id);
    onChange({ book: false });
    comparison = null;
    diffBox.hidden = true;
    drawList();
    say(`Deleted "${snapshot.name}". The book has ${project.history.length} of ${MOST_SNAPSHOTS}.`);
    list.focus();
  });

  drawList();
  await open(dialog, project.history.length ? list : q("hist-take"));
  return { bookChanged };
}
