// What is drawn over a picture, as plain data: the click circle and the lettered callouts (a marker with a letter, a leader line to the part it names, and a thin
// outline of that part), in the picture's own pixels. The editor draws these parts onto the screen (src/picture-marks.ts) and the previews and exports write them as
// SVG text (below), so a picture always has the same marks wherever it is shown. Nothing here needs a screen.
import { markerRadius, shapesFor } from "../project/callouts.ts";
import type { Circle } from "../project/highlight.ts";
import type { Picture } from "../project/model.ts";
import { touches, type Rect } from "../project/views.ts";

/** The colour of callout markers, lines and outlines. White letters on it have a contrast of about 5.6 to 1. */
export const CALLOUT_COLOR = "#C62828";

/** One shape of the drawing. */
export interface SvgPart {
  tag: "circle" | "rect" | "line" | "text";
  attrs: Record<string, string | number>;
  /** The letters of a `text` part. */
  text?: string;
}

/** The whole drawing: its window onto the picture's pixels, and its shapes in order (the click circle first, then each callout). */
export interface Overlay {
  viewBox: string;
  parts: SvgPart[];
}

/** Is this callout (its item or its marker) anywhere in the part of the picture that is shown? */
export function calloutInView(picture: Pick<Picture, "width" | "callouts">, index: number, shown: Rect): boolean {
  const callout = picture.callouts![index];
  const r = markerRadius(shown.width);
  return touches(callout.target, shown) || touches({ x: callout.marker.x - r, y: callout.marker.y - r, width: 2 * r, height: 2 * r }, shown);
}

/**
 * The drawing for a picture: the click circle (if there is one) and every callout that is at least partly in the part shown. `null` when there is nothing to draw.
 * Markers and lines are sized by the width of the part shown, so they look the same whether the picture is whole or zoomed.
 */
export function overlayFor(picture: Pick<Picture, "width" | "height" | "callouts">, circle: Circle | null, shown?: Rect): Overlay | null {
  const part = shown ?? { x: 0, y: 0, width: picture.width, height: picture.height };
  // A callout wholly outside the part that is shown is not drawn: its marker could not be seen.
  const shapes = shapesFor(picture, part.width).filter((_, i) => calloutInView(picture, i, part));
  if (!circle && shapes.length === 0) return null;
  const parts: SvgPart[] = [];
  if (circle) parts.push({ tag: "circle", attrs: { cx: circle.cx, cy: circle.cy, r: circle.r, fill: circle.color, "fill-opacity": circle.opacity } });
  for (const shape of shapes) {
    // Lines keep the same width on the screen whatever the picture is scaled to, so they can be seen on a small thumbnail too.
    const line = { stroke: CALLOUT_COLOR, "stroke-width": 1.5, "vector-effect": "non-scaling-stroke", fill: "none" };
    parts.push({ tag: "rect", attrs: { x: shape.rect.x, y: shape.rect.y, width: shape.rect.width, height: shape.rect.height, ...line } });
    if (shape.line) parts.push({ tag: "line", attrs: { x1: shape.line.x1, y1: shape.line.y1, x2: shape.line.x2, y2: shape.line.y2, ...line } });
    parts.push({ tag: "circle", attrs: { cx: shape.marker.cx, cy: shape.marker.cy, r: shape.marker.r, fill: CALLOUT_COLOR, stroke: "#ffffff", "stroke-width": 1, "vector-effect": "non-scaling-stroke" } });
    parts.push({
      tag: "text",
      attrs: {
        x: shape.marker.cx, y: shape.marker.cy, "font-size": shape.marker.r * 1.3, "font-weight": 700, fill: "#ffffff", "text-anchor": "middle",
        "dominant-baseline": "central", "font-family": "Segoe UI, system-ui, sans-serif",
      },
      text: shape.letter,
    });
  }
  return { viewBox: `${part.x} ${part.y} ${part.width} ${part.height}`, parts };
}

const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (value: string | number) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The drawing as SVG text, hidden from a screen reader (the entries under the picture say the same in words). */
export function overlaySvg(overlay: Overlay, className: string): string {
  const body = overlay.parts
    .map((part) => {
      const attrs = Object.entries(part.attrs).map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join("");
      return part.tag === "text" ? `<text${attrs}>${escapeText(part.text ?? "")}</text>` : `<${part.tag}${attrs}/>`;
    })
    .join("");
  return `<svg class="${escapeAttr(className)}" viewBox="${escapeAttr(overlay.viewBox)}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${body}</svg>`;
}
