// What is drawn over a picture in the editor, never into it: the click circle and the lettered callouts (a marker with a letter, a leader line to the
// part it names, and a thin outline of that part), and the list of entries that goes under the picture. The rules are in src/project/highlight.ts and
// src/project/callouts.ts; this file only draws them. Everything is in the picture's own pixels, so it lines up at any size.
import { entries, entryWords } from "./project/callouts.ts";
import type { Circle } from "./project/highlight.ts";
import type { Picture } from "./project/model.ts";
import { calloutInView, overlayFor } from "./render/overlay.ts";
import { isWhole, type Rect } from "./project/views.ts";

export { CALLOUT_COLOR } from "./render/overlay.ts";

const NS = "http://www.w3.org/2000/svg";

function svgEl<K extends keyof SVGElementTagNameMap>(name: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, String(value));
  return el;
}

/**
 * The drawing to lay over a picture: the click circle (if there is one) and every callout in the part shown. `null` when there is nothing to draw. The shapes come
 * from src/render/overlay.ts, the same ones the previews and exports write as SVG text. It is hidden from a screen reader, because the entries under the picture
 * say the same in words.
 */
export function marksOverlay(picture: Pick<Picture, "width" | "height" | "callouts" | "shapes">, circle: Circle | null, shown?: Rect): SVGSVGElement | null {
  const overlay = overlayFor(picture, circle, shown);
  if (!overlay) return null;
  // The drawing is in the whole picture's pixels. Its window onto them is the part that is shown, so it lines up in every view.
  const svg = svgEl("svg", { viewBox: overlay.viewBox, preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false", class: "circle-overlay" });
  for (const part of overlay.parts) {
    const el = svgEl(part.tag, part.attrs);
    if (part.text !== undefined) el.textContent = part.text;
    svg.append(el);
  }
  return svg;
}

/**
 * The entries under a picture, one line each: letter, name and sentence, and what is still missing. When the picture is shown cropped or zoomed, a callout
 * that is wholly outside the part shown says so, because its marker cannot be seen. `null` when the picture has no callouts.
 */
export function entryList(picture: Pick<Picture, "width" | "height" | "callouts">, shown?: Rect): HTMLElement | null {
  const list = entries(picture);
  if (list.length === 0) return null;
  const ul = document.createElement("ul");
  ul.className = "callout-entries";
  ul.setAttribute("aria-label", "Callouts on this picture");
  const partial = shown && !isWhole(shown, picture);
  list.forEach((entry, i) => {
    const li = document.createElement("li");
    li.textContent = entryWords(entry) + (partial && !calloutInView(picture, i, shown) ? " (Outside the part of the picture that is shown.)" : "");
    ul.append(li);
  });
  return ul;
}

export interface PictureBoxOptions {
  picture: Picture;
  /** Where the picture's bytes can be read from. */
  url: string;
  alt: string;
  /** `thumb`, `thumb page-picture` and so on. */
  className: string;
  circle: Circle | null;
  /** The part of the picture to show. */
  shown: Rect;
}

/**
 * A picture as it is shown where it is used: only the part that is `shown` (the file itself is never cut), with the click circle and the callouts laid
 * over it. This is the one drawing used by the picture list, the page and the previews.
 */
export function pictureBox(options: PictureBoxOptions): HTMLElement {
  const { picture, shown } = options;
  const box = document.createElement("span");
  box.className = "thumbbox";
  const img = document.createElement("img");
  img.src = options.url;
  img.alt = options.alt;
  img.className = options.className;
  // object-view-box shows part of the image as if it were the whole of it, so the size on the page follows the part.
  if (!isWhole(shown, picture)) img.style.setProperty("object-view-box", `xywh(${shown.x}px ${shown.y}px ${shown.width}px ${shown.height}px)`);
  box.append(img);
  const marks = marksOverlay(picture, options.circle, shown);
  if (marks) box.append(marks);
  return box;
}
