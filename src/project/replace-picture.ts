// Putting another picture file in the place of a picture, for a book in another language or a program that looks different now. The picture keeps everything that was said about it: its id (so the pages
// that show it still do), its description, its callouts, its marks, its view and its click. Those are placed in picture pixels, so the new file must be the same size; one that is not is refused in
// words, because the callouts and marks would no longer point at the right places. Nothing here needs a screen. See docs/exports.md ("Translation").
import type { Picture } from "./model.ts";
import { newId } from "./ids.ts";
import { readImageInfo } from "./image.ts";
import type { Assets } from "./package.ts";

export type Replaced = { ok: true; oldFile: string; newFile: string } | { ok: false; message: string };

/**
 * Replaces the file of a picture. The old file is left in `assets` (a file nothing uses is not saved, and one a snapshot names is kept). `name` is the new file's name, for the picture's record.
 */
export function replacePictureFile(picture: Picture, assets: Assets, bytes: Uint8Array, name: string): Replaced {
  const info = readImageInfo(bytes);
  if (!info) return { ok: false, message: `${name} is not a PNG or JPEG picture. Only those two kinds can be used.` };
  if (info.width !== picture.width || info.height !== picture.height) {
    return { ok: false, message: `${name} is ${info.width} by ${info.height} pixels, and the picture it would replace is ${picture.width} by ${picture.height}. The callouts and marks are placed in pixels, so the new picture must be the same size to keep them in the right places. Make it the same size, or import it as a new picture and place its callouts again.` };
  }
  const oldFile = picture.file;
  const newFile = `images/${newId()}.${info.extension}`;
  assets.set(newFile, bytes);
  picture.file = newFile;
  picture.source = { ...picture.source, originalName: name };
  return { ok: true, oldFile, newFile };
}
