// A picture with its marks drawn into it, as PNG bytes, for the outputs that cannot lay a drawing over a picture (a Markdown file, a Word file, a help site that should open anywhere).
// Only the part of the picture that is shown is kept (its crop or zoom), at the picture's own resolution, and the click circle, the marks and the callouts are drawn into it from the same
// shapes the editor and the previews use (src/render/overlay.ts). The picture file in the project is never changed. This needs a canvas, so it runs in the window.
import type { Overlay, SvgPart } from "./overlay.ts";
import type { Rect } from "../project/views.ts";

/** What kind of picture a project file is, from its name. */
export function mimeFor(file: string): string {
  return file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

/** The width, in picture pixels, of a line that is meant to look the same size on the screen whatever the picture is scaled to (a callout's outline and leader line). */
export function steadyLine(shownWidth: number): number {
  return Math.max(2, Math.round(shownWidth * 0.002));
}

const num = (part: SvgPart, name: string, otherwise = 0) => {
  const value = Number(part.attrs[name]);
  return Number.isFinite(value) ? value : otherwise;
};
const str = (part: SvgPart, name: string, otherwise = "") => (part.attrs[name] === undefined ? otherwise : String(part.attrs[name]));

/** Draws one shape of the overlay onto a canvas, in picture pixels. Only the shapes the overlay makes are understood: circle, rect, line, polygon and text. */
export function drawPart(context: CanvasRenderingContext2D, part: SvgPart, shownWidth: number): void {
  const fill = str(part, "fill", "none");
  const stroke = str(part, "stroke", "none");
  const steady = part.attrs["vector-effect"] === "non-scaling-stroke";
  const lineWidth = steady ? steadyLine(shownWidth) : num(part, "stroke-width", 1);
  const alpha = part.attrs["fill-opacity"] === undefined ? 1 : num(part, "fill-opacity", 1);
  context.save();
  switch (part.tag) {
    case "circle":
      context.beginPath();
      context.arc(num(part, "cx"), num(part, "cy"), num(part, "r"), 0, Math.PI * 2);
      if (fill !== "none") { context.globalAlpha = alpha; context.fillStyle = fill; context.fill(); context.globalAlpha = 1; }
      if (stroke !== "none") { context.lineWidth = lineWidth; context.strokeStyle = stroke; context.stroke(); }
      break;
    case "rect": {
      const x = num(part, "x"), y = num(part, "y"), width = num(part, "width"), height = num(part, "height");
      if (fill !== "none") { context.globalAlpha = alpha; context.fillStyle = fill; context.fillRect(x, y, width, height); context.globalAlpha = 1; }
      if (stroke !== "none") { context.lineWidth = lineWidth; context.strokeStyle = stroke; context.strokeRect(x, y, width, height); }
      break;
    }
    case "line":
      context.beginPath();
      context.moveTo(num(part, "x1"), num(part, "y1"));
      context.lineTo(num(part, "x2"), num(part, "y2"));
      context.lineWidth = lineWidth;
      context.lineCap = str(part, "stroke-linecap") === "round" ? "round" : "butt";
      context.strokeStyle = stroke;
      context.stroke();
      break;
    case "polygon": {
      const points = str(part, "points").split(/\s+/).map((pair) => pair.split(",").map(Number));
      context.beginPath();
      points.forEach(([x, y], i) => (i === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
      context.closePath();
      context.fillStyle = fill;
      context.fill();
      break;
    }
    case "text": {
      const size = num(part, "font-size", 16);
      const weight = str(part, "font-weight", "400");
      context.font = `${weight} ${size}px ${str(part, "font-family", "Segoe UI, system-ui, sans-serif")}`;
      context.fillStyle = fill;
      context.textAlign = str(part, "text-anchor") === "middle" ? "center" : "left";
      context.textBaseline = str(part, "dominant-baseline") === "central" ? "middle" : "alphabetic";
      context.fillText(part.text ?? "", num(part, "x"), num(part, "y"));
      break;
    }
  }
  context.restore();
}

/**
 * The picture with its marks drawn in, as PNG bytes: only `shown` (the part that is shown), at the picture's own resolution. `overlay` is what overlayFor made for that same part.
 * Rejects when the picture cannot be read.
 */
export async function flattenPicture(bytes: Uint8Array, file: string, shown: Rect, overlay: Overlay | null): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mimeFor(file) }));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(shown.width));
    canvas.height = Math.max(1, Math.round(shown.height));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The picture could not be drawn.");
    context.drawImage(bitmap, shown.x, shown.y, shown.width, shown.height, 0, 0, canvas.width, canvas.height);
    if (overlay) {
      context.translate(-shown.x, -shown.y);
      for (const part of overlay.parts) drawPart(context, part, shown.width);
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("The picture could not be saved as a PNG.");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}
