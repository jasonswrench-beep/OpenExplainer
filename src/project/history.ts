// Snapshots: dated copies of the whole book, kept inside the project file so there is a way back from a bad edit. A snapshot holds the same files a saved project is made of (project.json, structure.json,
// drafts.json and one file for each page), so it is read with the same code, and a snapshot made by an older program is upgraded when it is read. Its pictures are not copied: it names the picture files
// of the project, and the project keeps a file for as long as any snapshot names it (src/project/package.ts). This file is the shape and the keeping of them (format version 20); making, comparing and
// restoring are in snapshots.ts. How they are saved is in docs/format-spec.md ("Snapshots"). Nothing here needs a screen.
import type { TreeNode } from "./model.ts";

export interface Snapshot {
  id: string;
  /** What the author called it, or a name made from the date. One line, at most MOST_SNAPSHOT_NAME letters. */
  name: string;
  /** When it was taken, as an ISO date and time. */
  savedAt: string;
  /** True for one the program took by itself (before a restore), so it can be told from the author's own. */
  automatic: boolean;
  /** The project's files as they were, by name: project.json, structure.json, drafts.json and topics/<id>.json. */
  files: Record<string, string>;
}

/** The most snapshots a project keeps, so a mistake cannot fill the file. */
export const MOST_SNAPSHOTS = 20;
export const MOST_SNAPSHOT_NAME = 60;

/** Where the snapshots are in the package: history/index.json lists them, and each one's files are under history/<its id>/. */
export const HISTORY_FOLDER = "history/";
export const HISTORY_INDEX = "history/index.json";

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** The file names a snapshot may hold. Anything else is not read, so a damaged or hand-made package cannot put a strange path in the project. */
const SNAPSHOT_FILE = /^(?:project\.json|structure\.json|drafts\.json|topics\/[A-Za-z0-9_-]{1,64}\.json)$/;

/** A name as it is kept: one line, trimmed and cut. */
export function cleanSnapshotName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MOST_SNAPSHOT_NAME).trim() : "";
}

/** The date and time as a person reads it, in the PC's own time. */
export function whenWords(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

/** The snapshots that are usable: a name, a date, an id of a safe shape that is used once, the two files every project has, and no other file names. At most MOST_SNAPSHOTS, oldest first. */
export function cleanHistory(value: unknown): Snapshot[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: Snapshot[] = [];
  for (const raw of value) {
    const item = (raw ?? {}) as Partial<Snapshot>;
    if (typeof item.id !== "string" || !SAFE_ID.test(item.id) || seen.has(item.id)) continue;
    if (typeof item.files !== "object" || item.files === null) continue;
    const files: Record<string, string> = {};
    for (const [name, text] of Object.entries(item.files)) if (SNAPSHOT_FILE.test(name) && typeof text === "string") files[name] = text;
    if (files["project.json"] === undefined || files["structure.json"] === undefined) continue;
    seen.add(item.id);
    out.push({ id: item.id, name: cleanSnapshotName(item.name) || "Snapshot", savedAt: typeof item.savedAt === "string" ? item.savedAt : "", automatic: item.automatic === true, files });
  }
  return out.slice(-MOST_SNAPSHOTS);
}

/** The files of the history as they go into the package: the list, and the files of each snapshot. Nothing when there are no snapshots. */
export function historyToFiles(history: Snapshot[], version: number): Record<string, string> {
  const snapshots = cleanHistory(history);
  if (snapshots.length === 0) return {};
  const files: Record<string, string> = {
    [HISTORY_INDEX]: JSON.stringify({ version, snapshots: snapshots.map(({ id, name, savedAt, automatic }) => ({ id, name, savedAt, automatic })) }, null, 2) + "\n",
  };
  for (const s of snapshots) for (const [name, text] of Object.entries(s.files)) files[`${HISTORY_FOLDER}${s.id}/${name}`] = text;
  return files;
}

/** Reads the history out of a package's files, if it has one. A damaged list is refused rather than lost. */
export function historyFromFiles(files: Record<string, string>, savedVersion: number): Snapshot[] {
  const text = files[HISTORY_INDEX];
  if (text === undefined) return [];
  let parsed: { version?: unknown; snapshots?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The list of snapshots is damaged, so the project was not opened. Nothing was changed.");
  }
  if (!parsed || parsed.version !== savedVersion || !Array.isArray(parsed.snapshots)) throw new Error("The project files do not match each other. They may be from different saves.");
  const listed = (parsed.snapshots as Partial<Snapshot>[]).map((s) => {
    const prefix = `${HISTORY_FOLDER}${s?.id}/`;
    const own: Record<string, string> = {};
    for (const [path, content] of Object.entries(files)) if (path.startsWith(prefix)) own[path.slice(prefix.length)] = content;
    return { ...s, files: own };
  });
  return cleanHistory(listed);
}

/** Every picture file a snapshot names: the pictures of its topics and its logo. */
export function snapshotPictureFiles(snapshot: Snapshot): string[] {
  const found = new Set<string>();
  const walk = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes as Partial<TreeNode>[]) {
      for (const picture of Array.isArray(node?.pictures) ? node.pictures : []) if (typeof picture?.file === "string") found.add(picture.file);
      walk(node?.children);
    }
  };
  try {
    walk((JSON.parse(snapshot.files["structure.json"] ?? "null") as { tree?: unknown } | null)?.tree);
    const logo = (JSON.parse(snapshot.files["project.json"] ?? "null") as { look?: { logo?: { file?: unknown } } } | null)?.look?.logo?.file;
    if (typeof logo === "string") found.add(logo);
  } catch {
    // A snapshot that cannot be read names no pictures; it is refused when it is used.
  }
  return [...found];
}
