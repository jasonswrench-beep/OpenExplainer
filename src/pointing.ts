// The rules for pointing at a picture with the mouse and the arrow keys: where a pointer is on the picture, drawing a box, moving it, resizing it by a corner or
// by keys, and what a key press means. Everything is in picture pixels and nothing is ever allowed off the picture. This needs no screen, so it is tested on
// its own; src/pointer-layer.ts puts it on the screen. The number boxes of the dialogs stay the exact record: whatever is done here only fills them in.

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Corner = "nw" | "ne" | "sw" | "se";

/** The smallest box that can be drawn, moved to or resized to, in picture pixels. */
export const MIN_BOX = 4;
/** A drag shorter than this, in picture pixels, is a click and draws nothing. */
export const MIN_DRAG = 3;
/** How far one arrow key press goes, and how far with Shift held. */
export const STEP = 1;
export const BIG_STEP = 10;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Where a pointer is on the picture, in whole picture pixels, from where it is on the screen. It is never outside the picture. */
export function toPicturePoint(client: Point, layer: { left: number; top: number; width: number; height: number }, size: Size): Point {
  if (layer.width <= 0 || layer.height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp(Math.round(((client.x - layer.left) / layer.width) * size.width), 0, size.width),
    y: clamp(Math.round(((client.y - layer.top) / layer.height) * size.height), 0, size.height),
  };
}

/** The box with two corner points, whichever way it was dragged. `null` when it is too small to be more than a click. */
export function boxFromPoints(a: Point, b: Point, size: Size): Box | null {
  const left = clamp(Math.min(a.x, b.x), 0, size.width);
  const top = clamp(Math.min(a.y, b.y), 0, size.height);
  const right = clamp(Math.max(a.x, b.x), 0, size.width);
  const bottom = clamp(Math.max(a.y, b.y), 0, size.height);
  if (right - left < MIN_DRAG || bottom - top < MIN_DRAG) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The box moved by `dx` and `dy`, keeping its size and staying on the picture. */
export function moveBox(box: Box, dx: number, dy: number, size: Size): Box {
  return {
    x: clamp(Math.round(box.x + dx), 0, Math.max(0, size.width - box.width)),
    y: clamp(Math.round(box.y + dy), 0, Math.max(0, size.height - box.height)),
    width: box.width,
    height: box.height,
  };
}

/** The box with one corner dragged to `to`. The opposite corner stays where it is, and the box never gets smaller than `minSize` or leaves the picture. */
export function resizeCorner(box: Box, corner: Corner, to: Point, size: Size, minSize: number = MIN_BOX): Box {
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  let left = box.x, top = box.y, rightEdge = right, bottomEdge = bottom;
  if (corner === "nw" || corner === "sw") left = clamp(Math.round(to.x), 0, right - minSize);
  else rightEdge = clamp(Math.round(to.x), box.x + minSize, size.width);
  if (corner === "nw" || corner === "ne") top = clamp(Math.round(to.y), 0, bottom - minSize);
  else bottomEdge = clamp(Math.round(to.y), box.y + minSize, size.height);
  return { x: left, y: top, width: rightEdge - left, height: bottomEdge - top };
}

/** The box made wider or taller by `dx` and `dy` (less, if negative) with its top left corner fixed: the keyboard's way to resize. */
export function resizeByKey(box: Box, dx: number, dy: number, size: Size, minSize: number = MIN_BOX): Box {
  return {
    x: box.x,
    y: box.y,
    width: clamp(Math.round(box.width + dx), Math.min(minSize, size.width - box.x), size.width - box.x),
    height: clamp(Math.round(box.height + dy), Math.min(minSize, size.height - box.y), size.height - box.y),
  };
}

/** The point moved by `dx` and `dy`, staying on the picture. */
export function movePoint(point: Point, dx: number, dy: number, size: Size): Point {
  return { x: clamp(Math.round(point.x + dx), 0, size.width), y: clamp(Math.round(point.y + dy), 0, size.height) };
}

/** What an arrow key press means: a step in a direction, and whether it resizes (Ctrl) rather than moves. `null` for any other key. */
export interface KeyStep {
  dx: number;
  dy: number;
  resize: boolean;
}

export function keyStep(key: string, mods: { shift: boolean; ctrl: boolean }): KeyStep | null {
  const by = mods.shift ? BIG_STEP : STEP;
  const step = key === "ArrowLeft" ? { dx: -by, dy: 0 } : key === "ArrowRight" ? { dx: by, dy: 0 } : key === "ArrowUp" ? { dx: 0, dy: -by } : key === "ArrowDown" ? { dx: 0, dy: by } : null;
  return step ? { ...step, resize: mods.ctrl } : null;
}

/** A box in words for a screen reader. */
export function boxWords(label: string, box: Box): string {
  return `${label}: starts ${box.x} across and ${box.y} down, ${box.width} wide and ${box.height} high.`;
}

/** A point in words for a screen reader. */
export function pointWords(label: string, point: Point): string {
  return `${label}: ${point.x} across and ${point.y} down.`;
}
