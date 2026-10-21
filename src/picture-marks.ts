// What is drawn over a picture in the editor, never into it: the click circle and the lettered callouts (a marker with a letter, a leader line to the
// part it names, and a thin outline of that part), and the list of entries that goes under the picture. The rules are in src/project/highlight.ts and
// src/project/callouts.ts; this file only draws them. Everything is in the picture's own pixels, so it lines up at any size.
import { entries, entryWords, markerRadius, shapesFor } from "./project/callouts.ts";
import type { Circle } from "./project/highlight.ts";
import type { Picture } from "./project/model.ts";
import { isWhole, touches, type Rect } from "./project/views.ts";

const NS = "http://www.w3.org/2000/svg";

/** The colour of callout markers, lines and outlines. White letters on it have a contrast of about 5.6 to 1. */
export const CALLOUT_COLOR = "#C62828";

function svgEl<K extends keyof SVGElementTagNameMap>(name: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, String(value));
  return el;
}

/**
 * The drawing to lay over a picture: the click circle (if there is one) and every callout. `null` when there is nothing to draw. It is hidden from
 * a screen reader, because the entries under the picture say the same in words.
 */
export function marksOverlay(picture: Pick<Picture, "width" | "height" | "callouts">, circle: Circle | null, shown?: Rect): SVGSVGElement | null {
  const part = shown ?? { x: 0, y: 0, width: picture.width, height: picture.height };
  // A callout wholly outside the part that is shown is not drawn: its marker could not be seen, and its entry says it is outside.
  const shapes = shapesFor(picture, part.width).filter((_, i) => calloutInView(picture, i, part));
  if (!circle && shapes.length === 0) return null;
  // The drawing is in the whole picture's pixels. Its window onto them is the part that is shown, so it lines up in every view.
  const svg = svgEl("svg", {
    viewBox: `${part.x} ${part.y} ${part.width} ${part.height}`, preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false", class: "circle-overlay",
  });
  if (circle) svg.append(svgEl("circle", { cx: circle.cx, cy: circle.cy, r: circle.r, fill: circle.color, "fill-opacity": circle.opacity }));
  for (const shape of shapes) {
    // Lines keep the same width on the screen whatever the picture is scaled to, so they can be seen on a small thumbnail too.
    const line = { stroke: CALLOUT_COLOR, "stroke-width": 1.5, "vector-effect": "non-scaling-stroke", fill: "none" };
    svg.append(svgEl("rect", { x: shape.rect.x, y: shape.rect.y, width: shape.rect.width, height: shape.rect.height, ...line }));
    if (shape.line) svg.append(svgEl("line", { x1: shape.line.x1, y1: shape.line.y1, x2: shape.line.x2, y2: shape.line.y2, ...line }));
    svg.append(svgEl("circle", { cx: shape.marker.cx, cy: shape.marker.cy, r: shape.marker.r, fill: CALLOUT_COLOR, stroke: "#ffffff", "stroke-width": 1, "vector-effect": "non-scaling-stroke" }));
    const letter = svgEl("text", {
      x: shape.marker.cx, y: shape.marker.cy, "font-size": shape.marker.r * 1.3, "font-weight": 700, fill: "#ffffff", "text-anchor": "middle",
      "dominant-baseline": "central", "font-family": "Segoe UI, system-ui, sans-serif",
    });
    letter.textContent = shape.letter;
    svg.append(letter);
  }
  return svg;
}

/** Is this callout (its item or its marker) anywhere in the part of the picture that is shown? */
export function calloutInView(picture: Pick<Picture, "width" | "callouts">, index: number, shown: Rect): boolean {
  const callout = picture.callouts![index];
  const r = markerRadius(shown.width);
  return touches(callout.target, shown) || touches({ x: callout.marker.x - r, y: callout.marker.y - r, width: 2 * r, height: 2 * r }, shown);
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
