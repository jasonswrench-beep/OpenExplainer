// The rules for choosing a rectangle on a snapshot of a screen: how a mouse drag becomes a rectangle, how the keys move
// and resize it, and how it is described in words. Everything here is plain arithmetic in snapshot pixels, counted from
// the snapshot's top left corner, so it can be tested without a screen. The page that uses it is src/selection.ts.

/** A rectangle in snapshot pixels. `width` and `height` are at least 1 and the rectangle is always inside the snapshot. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/** Keeps a rectangle inside the snapshot: at least 1 pixel each way, never bigger than the snapshot, never off an edge. */
export function clampRect(rect: Rect, bounds: Size): Rect {
  const width = clamp(Math.round(rect.width), 1, bounds.width);
  const height = clamp(Math.round(rect.height), 1, bounds.height);
  return {
    left: clamp(Math.round(rect.left), 0, bounds.width - width),
    top: clamp(Math.round(rect.top), 0, bounds.height - height),
    width,
    height,
  };
}

/** The rectangle between two corners, whichever way it was dragged. A click with no drag is 1 pixel by 1 pixel. */
export function rectFromCorners(a: Point, b: Point, bounds: Size): Rect {
  const x0 = clamp(Math.round(a.x), 0, bounds.width);
  const y0 = clamp(Math.round(a.y), 0, bounds.height);
  const x1 = clamp(Math.round(b.x), 0, bounds.width);
  const y1 = clamp(Math.round(b.y), 0, bounds.height);
  return clampRect({ left: Math.min(x0, x1), top: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) }, bounds);
}

/** Moves the rectangle without changing its size, stopping at the edges of the snapshot. */
export function moveRect(rect: Rect, dx: number, dy: number, bounds: Size): Rect {
  return clampRect({ ...rect, left: rect.left + dx, top: rect.top + dy }, bounds);
}

/** Makes the rectangle wider or taller (or narrower or shorter) while its top left corner stays where it is. */
export function resizeRect(rect: Rect, dw: number, dh: number, bounds: Size): Rect {
  const width = clamp(rect.width + dw, 1, bounds.width - rect.left);
  const height = clamp(rect.height + dh, 1, bounds.height - rect.top);
  return { ...rect, width, height };
}

/** Drags one corner to a new place while the opposite corner stays fixed. */
export function resizeFromCorner(rect: Rect, corner: Corner, to: Point, bounds: Size): Rect {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const fixed: Point = {
    x: corner.endsWith("left") ? right : rect.left,
    y: corner.startsWith("top") ? bottom : rect.top,
  };
  return rectFromCorners(fixed, to, bounds);
}

export function contains(rect: Rect, point: Point): boolean {
  return point.x >= rect.left && point.x < rect.left + rect.width && point.y >= rect.top && point.y < rect.top + rect.height;
}

/** What a key press does to the rectangle, or `null` if it is not one of the rectangle keys. */
export type KeyAction = { kind: "move"; dx: number; dy: number } | { kind: "resize"; dw: number; dh: number };

/**
 * The arrow keys move the rectangle by 1 pixel; with Shift they make it wider, narrower, taller or shorter instead;
 * with Control the step is 10 pixels. (Right and Down grow, Left and Up shrink.)
 */
export function keyAction(event: { key: string; shiftKey: boolean; ctrlKey: boolean }): KeyAction | null {
  const step = event.ctrlKey ? 10 : 1;
  const direction = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
  if (!direction) return null;
  const [x, y] = direction;
  return event.shiftKey ? { kind: "resize", dw: x, dh: y } : { kind: "move", dx: x, dy: y };
}

export function applyKey(rect: Rect, action: KeyAction, bounds: Size): Rect {
  return action.kind === "move" ? moveRect(rect, action.dx, action.dy, bounds) : resizeRect(rect, action.dw, action.dh, bounds);
}

/** The rectangle in words, for a screen reader and for the picture's name. */
export function describeRect(rect: Rect): string {
  return `${rect.width} by ${rect.height} pixels, ${rect.left} from the left and ${rect.top} from the top`;
}

/** Which side of the screen the panel of controls should sit on so it is not over the rectangle: the top, unless the rectangle is there. */
export function panelSide(rectCss: { top: number; height: number }, panelHeightCss: number, stageHeightCss: number): "top" | "bottom" {
  const margin = 12;
  const topZoneEnds = panelHeightCss + margin * 2;
  const rectBottom = rectCss.top + rectCss.height;
  const bottomZoneStarts = stageHeightCss - topZoneEnds;
  const overlapsTop = rectCss.top < topZoneEnds;
  const overlapsBottom = rectBottom > bottomZoneStarts;
  // If the rectangle touches the top zone, use the bottom; if it touches both, the top is as good as any.
  return overlapsTop && !overlapsBottom ? "bottom" : "top";
}

/** A mouse position in page pixels is a snapshot pixel count: a page pixel may be several screen pixels on a scaled display. */
export function cssToSnapshot(value: number, devicePixelRatio: number): number {
  return Math.round(value * devicePixelRatio);
}

export function snapshotToCss(value: number, devicePixelRatio: number): number {
  return value / devicePixelRatio;
}
