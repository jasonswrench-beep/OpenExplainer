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

/** The marks on a picture counted in words for the picture list: "3 marks: 1 arrow, 1 text box and 1 numbered marker." with how many still need alternative text. `null` when none. */
export function marksSummary(picture: Pick<Picture, "shapes">): string | null {
  const list = picture.shapes ?? [];
  if (list.length === 0) return null;
  const plural: Record<ShapeKind, [string, string]> = { arrow: ["arrow", "arrows"], text: ["text box", "text boxes"], rectangle: ["rectangle", "rectangles"], marker: ["numbered marker", "numbered markers"] };
  const parts = SHAPE_KINDS.map((k) => ({ n: list.filter((s) => s.kind === k.id).length, k: k.id })).filter((p) => p.n > 0).map((p) => `${p.n} ${plural[p.k][p.n === 1 ? 0 : 1]}`);
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  const missing = missingAlt(picture);
  return `${list.length} ${list.length === 1 ? "mark" : "marks"}: ${joined}.${missing > 0 ? ` ${missing} still ${missing === 1 ? "needs" : "need"} alternative text.` : ""}`;
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

// ---- Checking what is typed in the Drawing dialog -----------------------------------------------------

/** One box of the Drawing dialog for a kind of mark. */
export interface FieldSpec {
  field: string;
  label: string;
  /** `color` is a colour, `optionalColor` a colour or none, `number` a whole number, `text` any words, `label` one to three letters or digits. */
  type: "number" | "text" | "color" | "optionalColor" | "label";
  size: number;
}

const FIELD_ALT: FieldSpec = { field: "alt", label: "Alternative text (what the mark means, for a reader who cannot see it)", type: "text", size: 60 };

/** The boxes for each kind, in the order they are shown. The shape's own alternative text box comes last. */
export const SHAPE_FIELDS: Record<ShapeKind, FieldSpec[]> = {
  arrow: [
    { field: "fromX", label: "Tail: how far across", type: "number", size: 6 },
    { field: "fromY", label: "Tail: how far down", type: "number", size: 6 },
    { field: "toX", label: "Head: how far across", type: "number", size: 6 },
    { field: "toY", label: "Head: how far down", type: "number", size: 6 },
    { field: "color", label: "Color", type: "color", size: 8 },
    { field: "thickness", label: "Thickness, in pixels", type: "number", size: 5 },
    FIELD_ALT,
  ],
  text: [
    { field: "text", label: "Words in the box", type: "text", size: 60 },
    { field: "left", label: "Box: how far across it starts", type: "number", size: 6 },
    { field: "top", label: "Box: how far down it starts", type: "number", size: 6 },
    { field: "width", label: "Box: width", type: "number", size: 6 },
    { field: "height", label: "Box: height", type: "number", size: 6 },
    { field: "size", label: "Height of the letters, in pixels", type: "number", size: 5 },
    { field: "fill", label: "Fill", type: "optionalColor", size: 8 },
    { field: "outline", label: "Outline color", type: "color", size: 8 },
    { field: "textColor", label: "Text color", type: "color", size: 8 },
    FIELD_ALT,
  ],
  rectangle: [
    { field: "left", label: "How far across it starts", type: "number", size: 6 },
    { field: "top", label: "How far down it starts", type: "number", size: 6 },
    { field: "width", label: "Width", type: "number", size: 6 },
    { field: "height", label: "Height", type: "number", size: 6 },
    { field: "outline", label: "Outline color", type: "color", size: 8 },
    { field: "thickness", label: "Outline thickness, in pixels", type: "number", size: 5 },
    { field: "fill", label: "Fill", type: "optionalColor", size: 8 },
    { field: "seeThrough", label: "How much shows through the fill, in percent", type: "number", size: 5 },
    FIELD_ALT,
  ],
  marker: [
    { field: "x", label: "How far across", type: "number", size: 6 },
    { field: "y", label: "How far down", type: "number", size: 6 },
    { field: "label", label: "Label, one to three letters or digits", type: "label", size: 4 },
    { field: "color", label: "Color", type: "color", size: 8 },
    { field: "size", label: "Radius, in pixels", type: "number", size: 5 },
    FIELD_ALT,
  ],
};

/** What is in the boxes of the dialog for one mark. */
export type ShapeInput = Record<string, string>;

/** A mark's values as the text that goes in its boxes. A fill of none is the word "none". */
export function inputFromShape(shape: Shape): ShapeInput {
  const n = (v: number) => String(v);
  const colour = (v: string | null) => (v === null ? "none" : v);
  switch (shape.kind) {
    case "arrow": return { fromX: n(shape.from.x), fromY: n(shape.from.y), toX: n(shape.to.x), toY: n(shape.to.y), color: shape.color, thickness: n(shape.thickness), alt: shape.alt };
    case "text": return { text: shape.text, left: n(shape.box.x), top: n(shape.box.y), width: n(shape.box.width), height: n(shape.box.height), size: n(shape.size), fill: colour(shape.fill), outline: shape.outline, textColor: shape.textColor, alt: shape.alt };
    case "rectangle": return { left: n(shape.box.x), top: n(shape.box.y), width: n(shape.box.width), height: n(shape.box.height), outline: shape.outline, thickness: n(shape.thickness), fill: colour(shape.fill), seeThrough: n(shape.seeThrough), alt: shape.alt };
    case "marker": return { x: n(shape.at.x), y: n(shape.at.y), label: shape.label, color: shape.color, size: n(shape.size), alt: shape.alt };
  }
}

export type ShapeCheck = { ok: true; shape: Shape } | { ok: false; field: string; message: string };

const wholeNumber = /^\d+$/;

/**
 * Checks the boxes of the dialog for one mark and makes the mark from them (keeping its id and its kept-colours record). A mistake is explained in plain words and says which
 * box it is in. Alternative text and words are checked for length only.
 */
export function checkShapeInput(previous: Shape, input: ShapeInput, size: Size): ShapeCheck {
  type Fail = { ok: false; field: string; message: string };
  const fail = (field: string, message: string): Fail => ({ ok: false, field, message });
  const alt = (input.alt ?? "").replace(/\s+/g, " ").trim();
  if (alt.length > MOST_SHAPE_TEXT) return fail("alt", `Alternative text can be at most ${MOST_SHAPE_TEXT} letters. This has ${alt.length}.`);
  const num = (field: string, words: string, least: number, most: number): { ok: true; value: number } | Fail => {
    const text = (input[field] ?? "").trim();
    if (!wholeNumber.test(text)) return fail(field, `Type ${words} as a whole number from ${least} to ${most}, such as ${Math.max(least, Math.round(most / 2))}.${text ? ` "${text}" is not one.` : ""}`);
    const value = Number(text);
    if (value < least || value > most) return fail(field, `The picture is ${size.width} by ${size.height} pixels. Type ${words} as a number from ${least} to ${most}.`);
    return { ok: true, value };
  };
  const colour = (field: string, words: string, optional = false): { ok: true; value: string | null } | Fail => {
    const text = (input[field] ?? "").trim();
    if (optional && (text === "" || text.toLowerCase() === "none")) return { ok: true, value: null };
    const code = normalizeHex(text);
    if (!code) return fail(field, `Type ${words} as six hex digits, such as C62828${optional ? ", or the word none" : ""}.${text ? ` "${text}" is not one.` : ""}`);
    return { ok: true, value: code };
  };
  const keep = previous.keptLowContrast ? ({ keptLowContrast: true } as const) : {};
  const base = { id: previous.id, alt, ...keep };
  switch (previous.kind) {
    case "arrow": {
      const fromX = num("fromX", "how far across the tail is", 0, size.width); if (!fromX.ok) return fromX;
      const fromY = num("fromY", "how far down the tail is", 0, size.height); if (!fromY.ok) return fromY;
      const toX = num("toX", "how far across the head is", 0, size.width); if (!toX.ok) return toX;
      const toY = num("toY", "how far down the head is", 0, size.height); if (!toY.ok) return toY;
      const thickness = num("thickness", "the thickness", THICKNESS_LIMITS.min, THICKNESS_LIMITS.max); if (!thickness.ok) return thickness;
      const color = colour("color", "the color"); if (!color.ok) return color;
      if (fromX.value === toX.value && fromY.value === toY.value) return fail("toX", "The head of the arrow is on its tail, so there is no arrow to see. Move the head away from the tail.");
      return { ok: true, shape: { ...base, kind: "arrow", from: { x: fromX.value, y: fromY.value }, to: { x: toX.value, y: toY.value }, color: color.value!, thickness: thickness.value } };
    }
    case "text":
    case "rectangle": {
      const text = previous.kind === "text" ? input.text ?? "" : "";
      if (previous.kind === "text" && text.replace(/\s+/g, " ").trim().length > MOST_SHAPE_TEXT) return fail("text", `The words can be at most ${MOST_SHAPE_TEXT} letters. These have ${text.replace(/\s+/g, " ").trim().length}.`);
      const noun = previous.kind === "text" ? "the box" : "the rectangle";
      const left = num("left", `how far across ${noun} starts`, 0, size.width - 1); if (!left.ok) return left;
      const top = num("top", `how far down ${noun} starts`, 0, size.height - 1); if (!top.ok) return top;
      const width = num("width", `the width of ${noun}`, MIN_SIDE, size.width); if (!width.ok) return width;
      const height = num("height", `the height of ${noun}`, MIN_SIDE, size.height); if (!height.ok) return height;
      if (left.value + width.value > size.width) return fail("width", `${noun[0].toUpperCase()}${noun.slice(1)} reaches past the right edge of the picture, which is ${size.width} pixels wide. Make the width ${size.width - left.value} or less, or start it further left.`);
      if (top.value + height.value > size.height) return fail("height", `${noun[0].toUpperCase()}${noun.slice(1)} reaches past the bottom of the picture, which is ${size.height} pixels high. Make the height ${size.height - top.value} or less, or start it higher.`);
      const outline = colour("outline", "the outline color"); if (!outline.ok) return outline;
      const fill = colour("fill", "the fill", true); if (!fill.ok) return fill;
      const boxValue = { x: left.value, y: top.value, width: width.value, height: height.value };
      if (previous.kind === "text") {
        const letters = num("size", "the height of the letters", TEXT_SIZE_LIMITS.min, TEXT_SIZE_LIMITS.max); if (!letters.ok) return letters;
        const textColor = colour("textColor", "the text color"); if (!textColor.ok) return textColor;
        return { ok: true, shape: { ...base, kind: "text", box: boxValue, text: text.replace(/\s+/g, " ").trim(), fill: fill.value, outline: outline.value!, textColor: textColor.value!, size: letters.value } };
      }
      const thickness = num("thickness", "the thickness", THICKNESS_LIMITS.min, THICKNESS_LIMITS.max); if (!thickness.ok) return thickness;
      const seeThrough = num("seeThrough", "how much shows through", 0, 100); if (!seeThrough.ok) return seeThrough;
      return { ok: true, shape: { ...base, kind: "rectangle", box: boxValue, outline: outline.value!, thickness: thickness.value, fill: fill.value, seeThrough: seeThrough.value } };
    }
    case "marker": {
      const x = num("x", "how far across the marker is", 0, size.width); if (!x.ok) return x;
      const y = num("y", "how far down the marker is", 0, size.height); if (!y.ok) return y;
      const label = (input.label ?? "").trim();
      if (!/^[A-Za-z0-9]{1,3}$/.test(label)) return fail("label", `Type one to three letters or digits for the label, such as 1 or A.${label ? ` "${label}" is not allowed.` : ""}`);
      const radius = num("size", "the radius", MARKER_SIZE_LIMITS.min, MARKER_SIZE_LIMITS.max); if (!radius.ok) return radius;
      const color = colour("color", "the color"); if (!color.ok) return color;
      return { ok: true, shape: { ...base, kind: "marker", at: { x: x.value, y: y.value }, label, color: color.value!, size: radius.value } };
    }
  }
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
