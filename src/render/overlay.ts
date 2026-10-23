// What is drawn over a picture, as plain data: the click circle and the lettered callouts (a marker with a letter, a leader line to the part it names, and a thin
// outline of that part), in the picture's own pixels. The editor draws these parts onto the screen (src/picture-marks.ts) and the previews and exports write them as
// SVG text (below), so a picture always has the same marks wherever it is shown. Nothing here needs a screen.
import { markerRadius, shapesFor } from "../project/callouts.ts";
import { bestTextColor } from "../project/contrast.ts";
import type { Circle } from "../project/highlight.ts";
import type { Picture } from "../project/model.ts";
import { arrowHead, lineHeight, shapeBounds, textLines, textPadding, type MarkerShape, type Shape } from "../project/shapes.ts";
import { touches, type Rect } from "../project/views.ts";

/** The colour of callout markers, lines and outlines. White letters on it have a contrast of about 5.6 to 1. */
export const CALLOUT_COLOR = "#C62828";

/** The colour of the numbered marker on a guide step's clicked spot (dark blue, so it is not mistaken for a lettered callout). White numbers on it have a contrast of about 8.6 to 1. */
export const STEP_MARKER_COLOR = "#1F4E8C";

/** One shape of the drawing. */
export interface SvgPart {
  tag: "circle" | "rect" | "line" | "polygon" | "text";
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

const FONT = "Segoe UI, system-ui, sans-serif";

/** One mark as drawing parts, in the picture's pixels. Lines and outlines are as thick as the mark says, so they scale with the picture. */
export function shapeParts(shape: Shape): SvgPart[] {
  switch (shape.kind) {
    case "arrow": {
      const [tip, left, right] = arrowHead(shape);
      // The line stops at the base of the head, so it never shows through the point.
      const base = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
      return [
        { tag: "line", attrs: { x1: shape.from.x, y1: shape.from.y, x2: Math.round(base.x * 10) / 10, y2: Math.round(base.y * 10) / 10, stroke: shape.color, "stroke-width": shape.thickness, "stroke-linecap": "round" } },
        { tag: "polygon", attrs: { points: `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`, fill: shape.color } },
      ];
    }
    case "rectangle":
      return [{
        tag: "rect",
        attrs: {
          x: shape.box.x, y: shape.box.y, width: shape.box.width, height: shape.box.height, stroke: shape.outline, "stroke-width": shape.thickness,
          fill: shape.fill ?? "none", ...(shape.fill ? { "fill-opacity": Math.round((1 - shape.seeThrough / 100) * 100) / 100 } : {}),
        },
      }];
    case "text": {
      const pad = textPadding(shape.size);
      const parts: SvgPart[] = [{
        tag: "rect",
        attrs: { x: shape.box.x, y: shape.box.y, width: shape.box.width, height: shape.box.height, fill: shape.fill ?? "none", stroke: shape.outline, "stroke-width": Math.max(2, Math.round(shape.size * 0.1)) },
      }];
      textLines(shape).forEach((line, i) => {
        if (line === "") return;
        parts.push({
          tag: "text",
          attrs: { x: shape.box.x + pad, y: Math.round((shape.box.y + pad + shape.size * 0.85 + i * lineHeight(shape.size)) * 10) / 10, "font-size": shape.size, fill: shape.textColor, "font-family": FONT },
          text: line,
        });
      });
      return parts;
    }
    case "marker":
      return [
        { tag: "circle", attrs: { cx: shape.at.x, cy: shape.at.y, r: shape.size, fill: shape.color, stroke: "#ffffff", "stroke-width": Math.max(1, Math.round(shape.size * 0.08)) } },
        {
          tag: "text",
          attrs: {
            x: shape.at.x, y: shape.at.y, "font-size": Math.round(shape.size * (shape.label.length > 2 ? 0.9 : shape.label.length > 1 ? 1.1 : 1.3) * 10) / 10, "font-weight": 700, fill: bestTextColor(shape.color),
            "text-anchor": "middle", "dominant-baseline": "central", "font-family": FONT,
          },
          text: shape.label,
        },
      ];
  }
}

/**
 * The drawing for a picture: the click circle (if there is one), then the marks drawn on it from the bottom one to the top one, then every callout, each only if it is at
 * least partly in the part shown. `null` when there is nothing to draw. Callout markers and lines are sized by the width of the part shown, so they look the same whether
 * the picture is whole or zoomed; the marks drawn by the author keep the size they were given, so they scale with the picture.
 */
/**
 * Where a step's number goes: just above and to the left of the clicked spot, with its edge clear of the spot, so that the spot and the button or word that was clicked stay readable (the click
 * circle, when it is on, shows the spot itself). When there is no room that way, because the click is near the top or the left edge of the part shown, it goes below or to the right instead.
 * It is the centre of the marker, in picture pixels.
 */
export function stepMarkerAt(click: { x: number; y: number }, part: Rect, radius: number): { x: number; y: number } {
  const away = Math.round(radius * 1.5);
  return {
    x: click.x - away >= part.x + radius ? click.x - away : click.x + away,
    y: click.y - away >= part.y + radius ? click.y - away : click.y + away,
  };
}

export function overlayFor(picture: Pick<Picture, "width" | "height" | "callouts" | "shapes"> & { click?: Pick<NonNullable<Picture["click"]>, "x" | "y"> }, circle: Circle | null, shown?: Rect, step?: number): Overlay | null {
  const part = shown ?? { x: 0, y: 0, width: picture.width, height: picture.height };
  // A callout wholly outside the part that is shown is not drawn: its marker could not be seen.
  const shapes = shapesFor(picture, part.width).filter((_, i) => calloutInView(picture, i, part));
  const marks = (picture.shapes ?? []).filter((m) => touches(shapeBounds(m), part));
  // A guide's step has its number beside the clicked spot (just above it and to its left, see `stepMarkerAt`), if that spot is in the part shown. The marker is worked out from the click, never stored with the picture. It is 2.5 percent of the width shown (at least 12 pixels) in radius, so the number can still be read when the picture is small on the page.
  const click = step !== undefined ? picture.click : undefined;
  const stepSize = Math.max(12, Math.round(part.width * 0.025));
  const stepMarker: MarkerShape | null = click && click.x >= part.x && click.x <= part.x + part.width && click.y >= part.y && click.y <= part.y + part.height
    ? { id: "step", kind: "marker", alt: "", at: stepMarkerAt(click, part, stepSize), label: String(step), color: STEP_MARKER_COLOR, size: stepSize }
    : null;
  if (!circle && shapes.length === 0 && marks.length === 0 && !stepMarker) return null;
  const parts: SvgPart[] = [];
  if (circle) parts.push({ tag: "circle", attrs: { cx: circle.cx, cy: circle.cy, r: circle.r, fill: circle.color, "fill-opacity": circle.opacity } });
  for (const mark of marks) parts.push(...shapeParts(mark));
  if (stepMarker) parts.push(...shapeParts(stepMarker));
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
