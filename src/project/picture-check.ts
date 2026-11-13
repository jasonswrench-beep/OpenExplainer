// What a project file may say about its pictures and variables, checked every time a project is opened (the security review of 2026-11-13).
// A project can come from someone else, so nothing in it is trusted as it is:
// - A picture's id names its file in exports (images/<id>.png), its size goes into the HTML of the help site and the previews, and its file is looked
//   up in the package. A picture whose id, size or file is not usable is left out, and the author is told how many (see `cleanTreePictures`).
// - A variable's name goes into the Project variables dialog and into {{NAME}} in the text, so names are cleaned the way the dialog cleans a new one,
//   and a name that cleans to nothing is left out.
import { cleanVariableName, type Picture, type TreeNode } from "./model.ts";

/** The same rule as topic and page ids: letters, digits, _ and -, 1 to 64 of them. */
export const SAFE_PICTURE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A picture's file in the package, as the app names it: images/<a plain name>.png or .jpg. Nothing above or beside the images folder. */
export const SAFE_PICTURE_FILE = /^images\/[A-Za-z0-9_-]{1,64}\.(png|jpg|jpeg)$/i;

/** The largest side a picture may say it has, in pixels. A screen capture of several large screens is far smaller. */
export const MAX_PICTURE_SIDE = 100_000;

/** A side as a whole number of pixels from 1 to MAX_PICTURE_SIDE, or null when it is not a usable number at all. */
export function pictureSide(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.min(MAX_PICTURE_SIDE, Math.max(1, Math.round(value)));
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * One picture as a project file gave it, made safe: its id and file must follow the app's own rules and its size must be a number of pixels (a
 * fraction is rounded, a side larger than MAX_PICTURE_SIDE is cut down to it). Anything else in it is left for the other cleaners. Null when the
 * picture cannot be used.
 */
export function cleanPicture(value: unknown): Picture | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !SAFE_PICTURE_ID.test(value.id)) return null;
  if (typeof value.file !== "string" || !SAFE_PICTURE_FILE.test(value.file)) return null;
  const width = pictureSide(value.width);
  const height = pictureSide(value.height);
  if (width === null || height === null) return null;
  const source = isRecord(value.source) ? value.source : {};
  const kind = ["import", "window", "region", "click"].includes(source.kind as string) ? (source.kind as Picture["source"]["kind"]) : "import";
  const cleaned: Picture["source"] = { kind, capturedAt: typeof source.capturedAt === "string" ? source.capturedAt.slice(0, 64) : "" };
  if (typeof source.originalName === "string" && source.originalName.trim()) cleaned.originalName = source.originalName.slice(0, 300);
  return { ...(value as unknown as Picture), width, height, altText: typeof value.altText === "string" ? value.altText : "", source: cleaned };
}

/**
 * Every picture in the tree checked with `cleanPicture`. A picture that cannot be used, or whose id another picture already has (two pictures with one
 * id would write over each other's file in an export), is left out. Returns the tree and how many were left out, so the author can be told.
 */
export function cleanTreePictures(tree: TreeNode[]): { tree: TreeNode[]; dropped: number } {
  const seen = new Set<string>();
  let dropped = 0;
  const walk = (nodes: TreeNode[]): TreeNode[] =>
    nodes.map((node) => {
      const kept: Picture[] = [];
      for (const raw of Array.isArray(node.pictures) ? node.pictures : []) {
        const picture = cleanPicture(raw);
        if (!picture || seen.has(picture.id)) {
          dropped += 1;
          continue;
        }
        seen.add(picture.id);
        kept.push(picture);
      }
      return { ...node, pictures: kept, children: walk(Array.isArray(node.children) ? node.children : []) };
    });
  return { tree: walk(tree), dropped };
}

/**
 * The project's variables as a project file gave them, made safe: each name cleaned with `cleanVariableName` (a name that cleans to nothing is left
 * out, and when two names clean to the same one the first is kept), and each value text (anything else is left out).
 */
export function cleanVariables(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(value)) return out;
  for (const [name, text] of Object.entries(value)) {
    const clean = cleanVariableName(name);
    if (!clean || Object.hasOwn(out, clean) || typeof text !== "string") continue;
    out[clean] = text.slice(0, 2000);
  }
  return out;
}

// ---- Names that leave the project ---------------------------------------------------------------------------------
// A window's title often holds a full path with the Windows user name, a document's name or an e-mail's subject, so it is never kept as a picture's
// name. A window capture is called "Window capture <n>" instead (the title is still shown to the author while capturing, and never saved).

/** The name for the next window capture in this tree: "Window capture 1", "Window capture 2" and so on. */
export function windowCaptureName(tree: TreeNode[]): string {
  let count = 0;
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      count += node.pictures.filter((p) => p.source.kind === "window").length;
      walk(node.children ?? []);
    }
  };
  walk(tree);
  return `Window capture ${count + 1}`;
}

/**
 * What an export calls a picture it could not include: its description, or the name of the file it was imported from, or its file in the package.
 * A capture's own name is left out, because an older project may hold a window's title there.
 */
export function exportLabel(picture: Picture): string {
  return picture.altText.trim() || (picture.source.kind === "import" ? picture.source.originalName?.trim() : "") || picture.file;
}

/**
 * A picture as a JSON export gives it without capture details (the author did not tick "Include capture details"): when it was taken, the name it
 * was captured under, and what was clicked are left out. Where the click was stays, because the click circle and the zoom are drawn from it.
 */
export function withoutCaptureDetails(picture: Picture): Picture {
  const { click, source, ...rest } = picture;
  const plain: Picture = { ...rest, source: { kind: source.kind, capturedAt: "" } };
  if (click) {
    const { target: _target, ...where } = click;
    plain.click = where;
  }
  return plain;
}

/** How many pictures were left out of each project when it was opened, so the app can say so once. Kept beside the project, never saved. */
const leftOut = new WeakMap<object, number>();

export function notePicturesLeftOut(project: object, count: number): void {
  if (count > 0) leftOut.set(project, count);
}

/** How many pictures `migrate` left out of this project because they could not be used safely (0 for most projects). */
export function picturesLeftOut(project: object): number {
  return leftOut.get(project) ?? 0;
}
