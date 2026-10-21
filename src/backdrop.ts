// The colour behind a mark on a picture, so the contrast checker can compare a mark with what it sits on. The picture is read once into a small canvas; the colour behind a mark
// is the average of the picture under it (along the line of an arrow, round the edge of a rectangle). The rules are in src/project/contrast.ts and src/project/shapes.ts;
// this file only reads pixels, which needs a screen.
import { averageColor, fromRgb, toRgb } from "./project/contrast.ts";
import type { Bx, Shape } from "./project/shapes.ts";

export interface Backdrop {
  /** The average colour of the picture under a mark, or `null` when it cannot be told. */
  behind(shape: Shape): string | null;
}

/** The longest side of the small copy of the picture that is read. */
const MOST = 480;

/** Reads a picture (by its address) into a small canvas. `null` when it cannot be read. */
export async function loadBackdrop(url: string, width: number, height: number): Promise<Backdrop | null> {
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, MOST / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, w, h);
    const pixels = context.getImageData(0, 0, w, h).data;
    const around = (box: Bx) => averageColor(pixels, w, h, { x: box.x * scale, y: box.y * scale, width: Math.max(1, box.width * scale), height: Math.max(1, box.height * scale) });
    /** The average of several colours, each counted once. */
    const mix = (colours: (string | null)[]): string | null => {
      const rgbs = colours.map((c) => (c ? toRgb(c) : null)).filter((c): c is [number, number, number] => c !== null);
      if (rgbs.length === 0) return null;
      return fromRgb([0, 1, 2].map((i) => rgbs.reduce((sum, c) => sum + c[i], 0) / rgbs.length) as [number, number, number]);
    };
    return {
      behind(shape) {
        switch (shape.kind) {
          case "arrow": {
            // Along the line from tail to head, in small steps.
            const reach = Math.max(shape.thickness * 2, 6);
            const samples: (string | null)[] = [];
            for (let i = 0; i <= 12; i++) {
              const t = i / 12;
              samples.push(around({ x: shape.from.x + (shape.to.x - shape.from.x) * t - reach / 2, y: shape.from.y + (shape.to.y - shape.from.y) * t - reach / 2, width: reach, height: reach }));
            }
            return mix(samples);
          }
          case "rectangle": {
            // Round the edge, where the outline is.
            const t = Math.max(shape.thickness * 2, 6);
            const b = shape.box;
            return mix([
              around({ x: b.x - t / 2, y: b.y - t / 2, width: b.width + t, height: t }),
              around({ x: b.x - t / 2, y: b.y + b.height - t / 2, width: b.width + t, height: t }),
              around({ x: b.x - t / 2, y: b.y, width: t, height: b.height }),
              around({ x: b.x + b.width - t / 2, y: b.y, width: t, height: b.height }),
            ]);
          }
          case "text": return around(shape.box);
          case "marker": return around({ x: shape.at.x - shape.size, y: shape.at.y - shape.size, width: shape.size * 2, height: shape.size * 2 });
        }
      },
    };
  } catch {
    return null;
  }
}
