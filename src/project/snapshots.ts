// Snapshots, made and used: take one, compare the book with one, and restore the whole book or a single topic from one. A restore first takes a snapshot of the book as it is, so a restore can itself be undone.
// What a snapshot is and how it is kept is in history.ts; the layout in the package is in docs/format-spec.md ("Snapshots"). Nothing here needs a screen, so the app and the assistant tools share it.
import { fromFiles, toFiles } from "./files.ts";
import { cleanSnapshotName, MOST_SNAPSHOTS, whenWords, type Snapshot } from "./history.ts";
import { newId } from "./ids.ts";
import { findNode, locate, numbering, STATUSES, type Project, type TreeNode } from "./model.ts";

/** The book as it is now, as a snapshot. `automatic` marks one the program took by itself. */
export function takeSnapshot(project: Project, name: string, now: string, automatic = false): Snapshot {
  const { history: _history, ...rest } = project;
  const files = toFiles({ ...rest, history: [] } as Project);
  return { id: newId(), name: cleanSnapshotName(name) || `Snapshot ${whenWords(now)}`, savedAt: now, automatic, files };
}

/**
 * Keeps a snapshot in the project. The author's own snapshots are never dropped to make room: at the limit the author is asked to delete one. A snapshot the program took by itself replaces the
 * oldest such one, or if there is none, the oldest, but never the one named by `keepId` (the snapshot being restored). Returns the one that went, so the person can be told.
 */
export function addSnapshot(project: Project, snapshot: Snapshot, keepId?: string): Snapshot | null {
  let removed: Snapshot | null = null;
  if (project.history.length >= MOST_SNAPSHOTS) {
    if (!snapshot.automatic) throw new Error(`The book already keeps ${MOST_SNAPSHOTS} snapshots, the most it holds. Delete one first.`);
    const others = project.history.map((s, i) => ({ s, i })).filter(({ s }) => s.id !== keepId);
    const at = (others.find(({ s }) => s.automatic) ?? others[0]).i;
    [removed] = project.history.splice(at, 1);
  }
  project.history.push(snapshot);
  return removed;
}

export function deleteSnapshot(project: Project, id: string): Snapshot | null {
  const at = project.history.findIndex((s) => s.id === id);
  return at < 0 ? null : project.history.splice(at, 1)[0];
}

export function renameSnapshot(project: Project, id: string, name: string): boolean {
  const snapshot = project.history.find((s) => s.id === id);
  const clean = cleanSnapshotName(name);
  if (!snapshot || !clean) return false;
  snapshot.name = clean;
  return true;
}

/** A snapshot by its id or by its name (capitals do not matter). Throws, in words, when there is none or the name fits more than one. */
export function findSnapshot(project: Project, key: string): Snapshot {
  const byId = project.history.find((s) => s.id === key);
  if (byId) return byId;
  const wanted = key.trim().toLowerCase();
  const byName = project.history.filter((s) => s.name.toLowerCase() === wanted);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) throw new Error(`More than one snapshot is called "${key}". Use its id: ${byName.map((s) => s.id).join(", ")}.`);
  throw new Error(`There is no snapshot "${key}". The snapshots are: ${project.history.map((s) => `${s.name} (${s.id})`).join(", ") || "none yet"}.`);
}

/** A snapshot in a few words for a list: its name, who took it and when. */
export function snapshotWords(snapshot: Snapshot): string {
  return `${snapshot.name}, ${snapshot.automatic ? "taken by the program" : "taken by hand"} ${whenWords(snapshot.savedAt)}`;
}

// ---- Comparing -------------------------------------------------------------------------------------------

export interface TopicDifference {
  id: string;
  title: string;
  /** Its number in the book now, or in the snapshot when it has gone. */
  number: string;
  kind: "added" | "removed" | "changed";
  /** What differs, in words. */
  what: string[];
}

export interface Comparison {
  topics: TopicDifference[];
  /** Differences in the book's settings, in words. */
  book: string[];
}

const BOOK_PARTS: [keyof Project, string][] = [
  ["name", "the book's name"], ["variables", "the variables"], ["look", "the look of the book"], ["styles", "the named styles"], ["highlight", "the click circle settings"], ["zoom", "the zoom settings"],
  ["paper", "the print choices"], ["guides", "the guides"], ["snippets", "the snippets"], ["conditions", "the conditions"], ["targets", "the targets"], ["writingStyle", "the writing style notes"], ["avoidWords", "the words to avoid"],
];

function flatten(tree: TreeNode[], parent: string | null = null, into = new Map<string, { node: TreeNode; parent: string | null }>()): Map<string, { node: TreeNode; parent: string | null }> {
  for (const node of tree) {
    into.set(node.id, { node, parent });
    flatten(node.children, node.id, into);
  }
  return into;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What is different between the book now and a snapshot: topics added, removed and changed (words, pictures, title, status, place, links and conditions), and the book's settings. */
export function compareWithSnapshot(project: Project, snapshot: Snapshot): Comparison {
  const then = fromFiles(snapshot.files);
  // Both are read the same way, so a difference is a real one and not only a matter of tidying.
  const now = fromFiles(toFiles({ ...project, history: [] }));
  const before = flatten(then.tree);
  const after = flatten(now.tree);
  const numbersNow = numbering(now.tree);
  const numbersThen = numbering(then.tree);
  const topics: TopicDifference[] = [];
  for (const [id, { node, parent }] of after) {
    const old = before.get(id);
    if (!old) { topics.push({ id, title: node.title, number: numbersNow.get(id) ?? "", kind: "added", what: ["added since the snapshot"] }); continue; }
    const what: string[] = [];
    if (node.title !== old.node.title) what.push(`renamed (it was "${old.node.title}")`);
    if (node.status !== old.node.status) what.push(`status is ${STATUSES.find((s) => s.id === node.status)?.word ?? node.status} (it was ${STATUSES.find((s) => s.id === old.node.status)?.word ?? old.node.status})`);
    if (parent !== old.parent) what.push("moved to another place in the book");
    const blocksNow = new Map((node.page?.blocks ?? []).map((b) => [b.id, JSON.stringify(b)]));
    const blocksThen = new Map((old.node.page?.blocks ?? []).map((b) => [b.id, JSON.stringify(b)]));
    const added = [...blocksNow.keys()].filter((b) => !blocksThen.has(b)).length;
    const removed = [...blocksThen.keys()].filter((b) => !blocksNow.has(b)).length;
    const changed = [...blocksNow].filter(([b, json]) => blocksThen.has(b) && blocksThen.get(b) !== json).length;
    if (changed) what.push(`${count(changed, "block")} changed`);
    if (added) what.push(`${count(added, "block")} added`);
    if (removed) what.push(`${count(removed, "block")} removed`);
    if (!added && !removed && !changed && !same([...blocksNow.keys()], [...blocksThen.keys()])) what.push("blocks put in a different order");
    const picturesNow = new Map(node.pictures.map((p) => [p.id, JSON.stringify(p)]));
    const picturesThen = new Map(old.node.pictures.map((p) => [p.id, JSON.stringify(p)]));
    const pa = [...picturesNow.keys()].filter((p) => !picturesThen.has(p)).length;
    const pr = [...picturesThen.keys()].filter((p) => !picturesNow.has(p)).length;
    const pc = [...picturesNow].filter(([p, json]) => picturesThen.has(p) && picturesThen.get(p) !== json).length;
    if (pa) what.push(`${count(pa, "picture")} added`);
    if (pr) what.push(`${count(pr, "picture")} removed`);
    if (pc) what.push(`${count(pc, "picture")} changed (description, callouts or marks)`);
    if (!same(node.seeAlso ?? [], old.node.seeAlso ?? []) || !same(node.conditions ?? [], old.node.conditions ?? []) || !same(node.index ?? null, old.node.index ?? null)) what.push("See also links, conditions or index terms changed");
    if (what.length) topics.push({ id, title: node.title, number: numbersNow.get(id) ?? "", kind: "changed", what });
  }
  for (const [id, { node }] of before) if (!after.has(id)) topics.push({ id, title: node.title, number: numbersThen.get(id) ?? "", kind: "removed", what: ["removed since the snapshot"] });
  const book = BOOK_PARTS.filter(([key]) => !same(now[key], then[key])).map(([, words]) => `${words[0].toUpperCase()}${words.slice(1)} changed.`);
  return { topics, book };
}

/** The comparison as lines to read. */
export function comparisonLines(comparison: Comparison, snapshot: Snapshot): string[] {
  if (comparison.topics.length === 0 && comparison.book.length === 0) return [`The book is the same as "${snapshot.name}".`];
  const lines = [`Compared with "${snapshot.name}" (${whenWords(snapshot.savedAt)}):`];
  for (const t of comparison.topics) {
    if (t.kind === "removed") lines.push(`Removed: ${t.title} (it was ${t.number}).`);
    else lines.push(`${t.kind === "added" ? "Added" : "Changed"}: ${t.number} ${t.title}${t.kind === "changed" ? `: ${t.what.join("; ")}` : ""}.`);
  }
  lines.push(...comparison.book);
  return lines;
}

// ---- Restoring -------------------------------------------------------------------------------------------

/** What a restore did, to tell the person. */
export interface Restored {
  /** The snapshot of the book as it was just before, so the restore can be undone. */
  safety: Snapshot;
  /** A snapshot that went to make room for it, if any. */
  removed: Snapshot | null;
}

/** Empties an object and fills it again, so everything that holds the project sees the restored book. */
function replace(target: object, source: object): void {
  for (const key of Object.keys(target)) delete (target as Record<string, unknown>)[key];
  Object.assign(target, source);
}

/** Puts the whole book back as the snapshot had it, keeping the snapshots (and adding one of the book as it was). The project is changed in place. */
export function restoreWhole(project: Project, snapshot: Snapshot, now: string): Restored {
  const restored = fromFiles(snapshot.files);
  const safety = takeSnapshot(project, `Before restoring "${snapshot.name}"`, now, true);
  const removed = addSnapshot(project, safety, snapshot.id);
  replace(project, { ...restored, history: [...project.history] });
  return { safety, removed };
}

function withoutIds(node: TreeNode, taken: Set<string>): TreeNode {
  return { ...node, children: node.children.filter((c) => !taken.has(c.id)).map((c) => withoutIds(c, taken)) };
}

const allIds = (nodes: TreeNode[], into = new Set<string>()): Set<string> => { for (const n of nodes) { into.add(n.id); allIds(n.children, into); } return into; };

/**
 * Puts one topic back as the snapshot had it: its title, status, page, pictures, links and conditions. A topic that has been deleted since is put back where it was (or at the end of the chapter,
 * or of the book, if its place has gone). Its topics under it that are still in the book are left where they are. Returns what it did, or throws, in words, when the snapshot has no such topic.
 */
export function restoreTopic(project: Project, snapshot: Snapshot, topicId: string, now: string): Restored & { title: string; putBack: boolean } {
  const then = fromFiles(snapshot.files);
  const old = findNode(then.tree, topicId);
  if (!old) throw new Error(`The snapshot "${snapshot.name}" does not have that topic.`);
  const safety = takeSnapshot(project, `Before restoring "${old.title}"`, now, true);
  const removed = addSnapshot(project, safety, snapshot.id);
  const here = findNode(project.tree, topicId);
  if (here) {
    const kids = here.children;
    replace(here, { ...structuredClone(old), children: kids });
    return { safety, removed, title: old.title, putBack: false };
  }
  const copy = structuredClone(withoutIds(old, allIds(project.tree)));
  const place = locate(then.tree, topicId)!;
  const parent = place.parent ? findNode(project.tree, place.parent.id) : null;
  const list = parent ? parent.children : project.tree;
  list.splice(Math.min(place.index, list.length), 0, copy);
  return { safety, removed, title: old.title, putBack: true };
}
