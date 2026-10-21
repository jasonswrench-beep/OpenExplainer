// Marks drawn on a picture: arrows, text boxes, rectangles and numbered markers. They are stored beside the picture as shapes in the picture's own pixels, in order from
// the bottom one to the top one, and never burned into it, so they stay editable and the capture stays clean. Every mark can carry alternative text, and the words of a
// text box are part of the picture's description. Colours are checked for contrast as they are chosen (src/project/contrast.ts): a warning, never a lock. Everything here
// works without a screen.
import { checkContrast, GRAPHIC_MIN, normalizeHex, TEXT_MIN, type ContrastCheck } from "./contrast.ts";
import { newId } from "./ids.ts";
import { markerRadius } from "./callouts.ts";
import type { Picture } from "./model.ts";
import { moveItem } from "./page.ts";

export interface Pt {
  x: number;
  y: number;
}

export interface Bx {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Base {
  id: string;
  /** What the mark means, for a reader who cannot see it. Empty means none yet. */
  alt: string;
  /** Set when the colours were saved with a contrast below the minimum, so the choice is on record for the accessibility check. */
  keptLowContrast?: true;
}

/** A straight arrow from `from` to `to`, with its head at `to`. */
export interface ArrowShape extends Base {
  kind: "arrow";
  from: Pt;
  to: Pt;
  color: string;
  /** In picture pixels. */
  thickness: number;
}

/** A box with words in it. */
export interface TextShape extends Base {
  kind: "text";
  box: Bx;
  text: string;
  /** The box's fill, or `null` for none. White by default. */
  fill: string | null;
  outline: string;
  textColor: string;
  /** The height of the letters, in picture pixels. */
  size: number;
}

/** An outline round an area, optionally filled. */
export interface RectShape extends Base {
  kind: "rectangle";
  box: Bx;
  outline: string;
  thickness: number;
  fill: string | null;
  /** How much shows through the fill, in percent. */
  seeThrough: number;
}

/** A step number or a letter on a spot. */
export interface MarkerShape extends Base {
  kind: "marker";
  at: Pt;
  /** One to three letters or digits. */
  label: string;
  color: string;
  /** The radius, in picture pixels. */
  size: number;
}

export type Shape = ArrowShape | TextShape | RectShape | MarkerShape;
export type ShapeKind = Shape["kind"];

export const SHAPE_KINDS: { id: ShapeKind; name: string }[] = [
  { id: "arrow", name: "Arrow" },
  { id: "text", name: "Text box" },
  { id: "rectangle", name: "Rectangle" },
  { id: "marker", name: "Numbered marker" },
];

export function kindName(kind: ShapeKind): string {
  return SHAPE_KINDS.find((k) => k.id === kind)!.name;
}

/** The most letters in a text box or in alternative text. */
export const MOST_SHAPE_TEXT = 300;
export const THICKNESS_LIMITS = { min: 1, max: 100 };
export const TEXT_SIZE_LIMITS = { min: 6, max: 400 };
export const MARKER_SIZE_LIMITS = { min: 6, max: 200 };
/** The smallest side of a box, in picture pixels. */
export const MIN_SIDE = 4;

type Size = Pick<Picture, "width" | "height">;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const tidy = (v: unknown, most: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, most) : "");

// ---- Starting looks, by the size of the picture ----------------------------------------------

/** How thick a line or outline starts on a picture this wide, so it looks the same at any size. */
export function defaultThickness(width: number): number {
  return Math.max(3, Math.round(width * 0.003));
}

/** How big the letters of a text box start on a picture this wide. */
export function defaultTextSize(width: number): number {
  return Math.max(14, Math.round(width * 0.012));
}

export const DEFAULT_RED = "#C62828";

/** A new mark of a kind, near the middle of the picture (or where `near` says), with the starting colours and sizes. It needs only to be moved and described. */
export function newShape(kind: ShapeKind, size: Size, near?: Pt): Shape {
  const cx = near?.x ?? Math.round(size.width / 2);
  const cy = near?.y ?? Math.round(size.height / 2);
  const id = newId();
  const thickness = defaultThickness(size.width);
  const onPicture = (box: Bx): Bx => {
    const width = Math.min(box.width, size.width), height = Math.min(box.height, size.height);
    return { x: clamp(Math.round(box.x), 0, size.width - width), y: clamp(Math.round(box.y), 0, size.height - height), width, height };
  };
  switch (kind) {
    case "arrow": {
      const length = Math.round(size.width * 0.08);
      return { id, kind, alt: "", from: { x: clamp(cx - length, 0, size.width), y: clamp(cy + Math.round(length / 2), 0, size.height) }, to: { x: clamp(cx, 0, size.width), y: clamp(cy, 0, size.height) }, color: DEFAULT_RED, thickness };
    }
    case "text": {
      const box = onPicture({ x: cx - Math.round(size.width * 0.1), y: cy - Math.round(size.height * 0.04), width: Math.round(size.width * 0.2), height: Math.round(size.height * 0.08) });
      return { id, kind, alt: "", box, text: "", fill: "#FFFFFF", outline: DEFAULT_RED, textColor: "#000000", size: defaultTextSize(size.width) };
    }
    case "rectangle": {
      const box = onPicture({ x: cx - Math.round(size.width * 0.08), y: cy - Math.round(size.height * 0.05), width: Math.round(size.width * 0.16), height: Math.round(size.height * 0.1) });
      return { id, kind, alt: "", box, outline: DEFAULT_RED, thickness, fill: null, seeThrough: 70 };
    }
    case "marker":
      return { id, kind, alt: "", at: { x: clamp(cx, 0, size.width), y: clamp(cy, 0, size.height) }, label: "1", color: DEFAULT_RED, size: markerRadius(size.width) };
  }
}

// ---- Geometry -----------------------------------------------------------------------------------

/** The head of an arrow: the three corners of a triangle at `to`, pointing away from `from`. */
export function arrowHead(shape: ArrowShape): [Pt, Pt, Pt] {
  const dx = shape.to.x - shape.from.x, dy = shape.to.y - shape.from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length, uy = dy / length;
  const size = Math.max(shape.thickness * 4, 12);
  const wing = size * 0.5;
  const base = { x: shape.to.x - ux * size, y: shape.to.y - uy * size };
  const round = (n: number) => Math.round(n * 10) / 10;
  return [
    { x: round(shape.to.x), y: round(shape.to.y) },
    { x: round(base.x - uy * wing), y: round(base.y + ux * wing) },
    { x: round(base.x + uy * wing), y: round(base.y - ux * wing) },
  ];
}

/** The smallest box that holds a mark, for deciding whether it is in the part of the picture that is shown and for the colour behind it. */
export function shapeBounds(shape: Shape): Bx {
  switch (shape.kind) {
    case "arrow": {
      const pad = Math.max(shape.thickness * 4, 12);
      const x = Math.min(shape.from.x, shape.to.x) - pad / 2, y = Math.min(shape.from.y, shape.to.y) - pad / 2;
      return { x, y, width: Math.abs(shape.to.x - shape.from.x) + pad, height: Math.abs(shape.to.y - shape.from.y) + pad };
    }
    case "text":
    case "rectangle": return { ...shape.box };
    case "marker": return { x: shape.at.x - shape.size, y: shape.at.y - shape.size, width: shape.size * 2, height: shape.size * 2 };
  }
}

/** The letters of a text box split into lines that fit across `width` pixels, by an estimate of how wide letters are (about half the letters' height). */
export function wrapText(text: string, width: number, size: number): string[] {
  const perLine = Math.max(1, Math.floor(width / (size * 0.55)));
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let rest = word;
      // A word longer than a line is broken, so it never runs out of the box.
      while (rest.length > perLine) {
        if (line) { lines.push(line); line = ""; }
        lines.push(rest.slice(0, perLine));
        rest = rest.slice(perLine);
      }
      if (!line) line = rest;
      else if (line.length + 1 + rest.length <= perLine) line += ` ${rest}`;
      else { lines.push(line); line = rest; }
    }
    lines.push(line);
  }
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** The space round the words inside a text box, in picture pixels. */
export function textPadding(size: number): number {
  return Math.round(size * 0.4);
}

/** The line height of a text box, in picture pixels. */
export function lineHeight(size: number): number {
  return Math.round(size * 1.25);
}

/** The words of a text box as lines that fit its width. */
export function textLines(shape: TextShape): string[] {
  return wrapText(shape.text, shape.box.width - 2 * textPadding(shape.size), shape.size);
}

/** How tall a text box must be to hold its words, in picture pixels. */
export function fitHeight(shape: TextShape): number {
  return textLines(shape).length * lineHeight(shape.size) + 2 * textPadding(shape.size);
}

/** Do the words fit the box? */
export function wordsFit(shape: TextShape): boolean {
  return shape.text.trim() === "" || fitHeight(shape) <= shape.box.height;
}

// ---- What a mark says, for a reader who cannot see it -----------------------------------------------

/** A mark in words. A text box says what it holds (and its own description after it); a marker says its label; an arrow or a rectangle says its description, if it has one. */
export function shapeWords(shape: Shape): string {
  const alt = shape.alt.trim();
  switch (shape.kind) {
    case "text": return shape.text.trim() ? `Text box: "${shape.text.trim()}"${alt ? ` ${alt}` : ""}` : alt ? `Text box: ${alt}` : "";
    case "marker": return `Marker ${shape.label}${alt ? `: ${alt}` : ""}`;
    case "arrow": return alt ? `Arrow: ${alt}` : "";
    case "rectangle": return alt ? `Rectangle: ${alt}` : "";
  }
}

/** The marks on a picture as one description that is added to what the author wrote, or an empty text when there is nothing to say. */
export function shapesDescription(picture: Pick<Picture, "shapes">): string {
  const said = (picture.shapes ?? []).map(shapeWords).filter(Boolean);
  return said.length ? `Marks: ${said.map((s) => (/[.!?]$/.test(s) ? s : `${s}.`)).join(" ")}` : "";
}

/** Does this mark still need alternative text? An arrow or a rectangle does; a text box has its words and a marker its label. */
export function needsAlt(shape: Shape): boolean {
  return (shape.kind === "arrow" || shape.kind === "rectangle") && shape.alt.trim() === "";
}

/** How many marks on a picture still need alternative text. */
export function missingAlt(picture: Pick<Picture, "shapes">): number {
  return (picture.shapes ?? []).filter(needsAlt).length;
}

/** A mark as a short line for a list: its kind, what it says and its place. */
export function shapeLine(shape: Shape): string {
  const base = kindName(shape.kind);
  switch (shape.kind) {
    case "text": return `${base}: ${shape.text.trim() ? shape.text.trim() : "no words yet"}`;
    case "marker": return `${base} ${shape.label}`;
    default: return shape.alt.trim() ? `${base}: ${shape.alt.trim()}` : `${base}, no description yet`;
  }
}

// ---- Contrast ---------------------------------------------------------------------------------------------

/**
 * The contrast checks for a mark. Text is compared with its fill (4.5 to 1); an arrow, an outline and a marker are compared with the colour behind them when it is known
 * (3 to 1, an average of the picture under the mark, so "about"). A marker's letter is always black or white, whichever reads better, so it needs no check.
 */
export function shapeChecks(shape: Shape, behind: string | null = null): ContrastCheck[] {
  const out: (ContrastCheck | null)[] = [];
  switch (shape.kind) {
    case "text":
      if (shape.fill) out.push(checkContrast("Text on its fill", shape.textColor, shape.fill, TEXT_MIN));
      else if (behind) out.push(checkContrast("Text on the picture behind it", shape.textColor, behind, TEXT_MIN, true));
      break;
    case "arrow":
      if (behind) out.push(checkContrast("Arrow against the picture behind it", shape.color, behind, GRAPHIC_MIN, true));
      break;
    case "rectangle":
      if (behind) out.push(checkContrast("Outline against the picture behind it", shape.outline, behind, GRAPHIC_MIN, true));
      break;
    case "marker":
      if (behind) out.push(checkContrast("Marker against the picture behind it", shape.color, behind, GRAPHIC_MIN, true));
      break;
  }
  return out.filter((c): c is ContrastCheck => c !== null);
}

/** The checks that fail. */
export function failing(checks: ContrastCheck[]): ContrastCheck[] {
  return checks.filter((c) => !c.ok);
}

// ---- Changing a picture's marks ---------------------------------------------------------------------------

export function addShape(picture: Picture, shape: Shape): void {
  (picture.shapes ??= []).push(shape);
}

export function removeShape(picture: Picture, id: string): boolean {
  const at = (picture.shapes ?? []).findIndex((s) => s.id === id);
  if (at < 0) return false;
  picture.shapes!.splice(at, 1);
  if (picture.shapes!.length === 0) delete picture.shapes;
  return true;
}

/** Moves a mark one place towards the top (later in the list) or the bottom. False at the ends. */
export function moveShape(picture: Picture, id: string, by: -1 | 1): boolean {
  const list = picture.shapes ?? [];
  return moveItem(list, list.findIndex((s) => s.id === id), by);
}

/** Replaces a picture's marks with a new list (an empty list leaves it with none). */
export function setShapes(picture: Picture, list: Shape[]): void {
  if (list.length > 0) picture.shapes = list;
  else delete picture.shapes;
}

// ---- Cleaning what is read from or written to a file ---------------------------------------------

function point(v: unknown, size: Size): Pt | null {
  if (typeof v !== "object" || v === null) return null;
  const input = v as Record<string, unknown>;
  if (!finite(input.x) || !finite(input.y)) return null;
  return { x: clamp(Math.round(input.x), 0, size.width), y: clamp(Math.round(input.y), 0, size.height) };
}

function box(v: unknown, size: Size): Bx | null {
  if (typeof v !== "object" || v === null) return null;
  const input = v as Record<string, unknown>;
  if (![input.x, input.y, input.width, input.height].every(finite)) return null;
  const left = clamp(Math.round(input.x as number), 0, size.width);
  const top = clamp(Math.round(input.y as number), 0, size.height);
  const right = clamp(Math.round((input.x as number) + (input.width as number)), 0, size.width);
  const bottom = clamp(Math.round((input.y as number) + (input.height as number)), 0, size.height);
  return right - left >= 1 && bottom - top >= 1 ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

const colorOr = (v: unknown, otherwise: string) => normalizeHex(v) ?? otherwise;
const numberIn = (v: unknown, limits: { min: number; max: number }, otherwise: number) => (finite(v) ? clamp(Math.round(v), limits.min, limits.max) : otherwise);

function cleanShape(raw: unknown, size: Size): Shape | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const base = { id: typeof input.id === "string" && input.id.length > 0 ? input.id : newId(), alt: tidy(input.alt, MOST_SHAPE_TEXT) };
  const kept = input.keptLowContrast === true ? ({ keptLowContrast: true } as const) : {};
  switch (input.kind) {
    case "arrow": {
      const from = point(input.from, size), to = point(input.to, size);
      if (!from || !to || (from.x === to.x && from.y === to.y)) return null;
      return { ...base, kind: "arrow", from, to, color: colorOr(input.color, DEFAULT_RED), thickness: numberIn(input.thickness, THICKNESS_LIMITS, defaultThickness(size.width)), ...kept };
    }
    case "text": {
      const b = box(input.box, size);
      if (!b || b.width < MIN_SIDE || b.height < MIN_SIDE) return null;
      const fill = input.fill === null ? null : normalizeHex(input.fill) ?? "#FFFFFF";
      return {
        ...base, kind: "text", box: b, text: tidy(input.text, MOST_SHAPE_TEXT), fill, outline: colorOr(input.outline, DEFAULT_RED), textColor: colorOr(input.textColor, "#000000"),
        size: numberIn(input.size, TEXT_SIZE_LIMITS, defaultTextSize(size.width)), ...kept,
      };
    }
    case "rectangle": {
      const b = box(input.box, size);
      if (!b || b.width < MIN_SIDE || b.height < MIN_SIDE) return null;
      return {
        ...base, kind: "rectangle", box: b, outline: colorOr(input.outline, DEFAULT_RED), thickness: numberIn(input.thickness, THICKNESS_LIMITS, defaultThickness(size.width)),
        fill: input.fill === null || input.fill === undefined ? null : normalizeHex(input.fill), seeThrough: numberIn(input.seeThrough, { min: 0, max: 100 }, 70), ...kept,
      };
    }
    case "marker": {
      const at = point(input.at, size);
      if (!at) return null;
      const label = typeof input.label === "string" ? input.label.replace(/[^A-Za-z0-9]/g, "").slice(0, 3) : "";
      return { ...base, kind: "marker", at, label: label || "1", color: colorOr(input.color, DEFAULT_RED), size: numberIn(input.size, MARKER_SIZE_LIMITS, markerRadius(size.width)), ...kept };
    }
    default: return null;
  }
}

/** The marks a picture can keep: each of a known kind with its numbers cut to the picture and its colours real colours. Anything else is dropped, and a repeated id gets a new one. */
export function cleanShapes(raw: unknown, size: Size): Shape[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Shape[] = [];
  for (const item of raw) {
    const shape = cleanShape(item, size);
    if (!shape) continue;
    if (seen.has(shape.id)) shape.id = newId();
    seen.add(shape.id);
    out.push(shape);
  }
  return out;
}

type WithPictures = { pictures?: Picture[]; children?: WithPictures[] };

/** A copy of the tree in which every picture's marks are cleaned, and dropped when there are none. */
export function cleanTreeShapes<T extends WithPictures>(tree: T[]): T[] {
  return tree.map((node) => ({
    ...node,
    pictures: (node.pictures ?? []).map((picture) => {
      const { shapes, ...rest } = picture;
      const clean = shapes === undefined ? [] : cleanShapes(shapes, picture);
      return clean.length > 0 ? { ...rest, shapes: clean } : rest;
    }),
    children: cleanTreeShapes((node.children ?? []) as T[]),
  }));
}
