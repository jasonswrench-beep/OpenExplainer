// Pictures for the outputs that need each picture as a file of its own with its marks drawn in: the part that is shown, with the click circle, the marks and the callouts. Only the
// pictures that are on a page are made. The project's own picture files are never changed. The drawing is done by a function that is passed in (src/render/flatten.ts in the window), so the
// rest can be tested without a screen.
import { circleFor, type HighlightKind } from "../project/highlight.ts";
import type { Picture, Project, TreeNode } from "../project/model.ts";
import { placedPictureIds } from "../project/page.ts";
import type { Assets } from "../project/package.ts";
import { shownPart, type Rect } from "../project/views.ts";
import { overlayFor, type Overlay } from "../render/overlay.ts";

/** Draws a picture with its marks into PNG bytes: the file's bytes, its name (for its kind), the part to keep, and what to draw over it. */
export type Flattener = (bytes: Uint8Array, file: string, shown: Rect, overlay: Overlay | null) => Promise<Uint8Array>;

export interface FlatPicture {
  /** Where the PNG goes in the output, such as images/abc123.png. */
  path: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface FlatResult {
  /** By the picture's id. */
  flat: Map<string, FlatPicture>;
  /** Pictures on a page whose file is not in the project, named for the writer. */
  missing: string[];
  /** Pictures that could not be drawn, named for the writer. */
  failed: string[];
}

const label = (picture: Picture) => picture.altText.trim() || picture.source.originalName || picture.file;

/** Every picture on a page anywhere in the book, once. */
export function placedPictures(project: Project): Picture[] {
  const out: Picture[] = [];
  const seen = new Set<string>();
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      const placed = placedPictureIds(node.page);
      for (const picture of node.pictures) if (placed.has(picture.id) && !seen.has(picture.id)) { seen.add(picture.id); out.push(picture); }
      walk(node.children);
    }
  };
  walk(project.tree);
  return out;
}

/** Makes the picture files for an output: each placed picture cut to the part that is shown for `place`, with its marks drawn in, as a PNG. */
export async function flattenPlaced(project: Project, assets: Assets, place: HighlightKind, flatten: Flattener): Promise<FlatResult> {
  const result: FlatResult = { flat: new Map(), missing: [], failed: [] };
  for (const picture of placedPictures(project)) {
    const bytes = assets.get(picture.file);
    if (!bytes) { result.missing.push(label(picture)); continue; }
    const shown = shownPart(picture, project.zoom, place);
    try {
      const png = await flatten(bytes, picture.file, shown, overlayFor(picture, circleFor(picture, project.highlight, place), shown));
      result.flat.set(picture.id, { path: `images/${picture.id}.png`, bytes: png, width: shown.width, height: shown.height });
    } catch {
      result.failed.push(label(picture));
    }
  }
  return result;
}

/** The files of the flat pictures, by path, ready to go into an output. */
export function flatFiles(flat: Map<string, FlatPicture>): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const f of flat.values()) out[f.path] = f.bytes;
  return out;
}
