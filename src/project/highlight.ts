// The click highlight: a transparent circle drawn on the spot of a click, so the reader sees where to click.
// It is never burned into a picture. The project keeps the look of the circle for each place a picture is used (the book, a quick
// guide), and a picture may differ from that (always show, never show, or move the circle). Everything here needs no screen.
import type { Picture } from "./model.ts";

/** Where a picture is used. The look of the circle is set for each. */
export type HighlightKind = "book" | "guide";

export const HIGHLIGHT_KINDS: { id: HighlightKind; name: string }[] = [
  { id: "book", name: "Book" },
  { id: "guide", name: "Quick guide" },
];

export interface HighlightStyle {
  /** Whether the circle is drawn on click pictures here. */
  show: boolean;
  /** The circle's width across, as a percent of the picture's width, so it scales with the picture. */
  size: number;
  /** Six hex digits with a leading #, such as #FFD600. */
  color: string;
  /** How much shows through, in percent: 0 is a solid circle and 100 cannot be seen. */
  seeThrough: number;
}

export interface HighlightSettings {
  book: HighlightStyle;
  guide: HighlightStyle;
}

/** What one picture says about its own circle. A picture with none follows the project. */
export interface PictureHighlight {
  /** `true` always shows the circle, `false` never does, and nothing follows the project's setting for where the picture is used. */
  show?: boolean;
  /** Where to draw the circle instead of on the click, in picture pixels from the top left. Both or neither. */
  x?: number;
  y?: number;
}

export const SIZE_LIMITS = { min: 1, max: 20 };
export const SEE_THROUGH_LIMITS = { min: 0, max: 100 };

/** Yellow, 40 percent see-through, 3 percent of the picture's width across: off for the book, on for a quick guide. */
export function defaultHighlight(): HighlightSettings {
  const style = (show: boolean): HighlightStyle => ({ show, size: 3, color: "#FFD600", seeThrough: 40 });
  return { book: style(false), guide: style(true) };
}

/** A colour as #RRGGBB in capital letters, from FFD600, #ffd600 or #fd0, or `null` if it is not a colour. */
export function normalizeColor(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const hex = text.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(hex)) return `#${[...hex].map((c) => c + c).join("").toUpperCase()}`;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex.toUpperCase()}`;
  return null;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function cleanStyle(raw: unknown, fallback: HighlightStyle): HighlightStyle {
  const input = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const number = (value: unknown, limits: { min: number; max: number }, otherwise: number) =>
    typeof value === "number" && Number.isFinite(value) ? clamp(Math.round(value * 10) / 10, limits.min, limits.max) : otherwise;
  return {
    show: typeof input.show === "boolean" ? input.show : fallback.show,
    size: number(input.size, SIZE_LIMITS, fallback.size),
    color: normalizeColor(input.color) ?? fallback.color,
    seeThrough: number(input.seeThrough, SEE_THROUGH_LIMITS, fallback.seeThrough),
  };
}

/** The settings with every missing or wrong part replaced by the starting look, and every number kept in its range. */
export function cleanHighlight(raw: unknown): HighlightSettings {
  const input = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const start = defaultHighlight();
  return { book: cleanStyle(input.book, start.book), guide: cleanStyle(input.guide, start.guide) };
}

/** A picture's own circle choices, cleaned, or `null` when it has none (so it follows the project). */
export function cleanPictureHighlight(raw: unknown): PictureHighlight | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const result: PictureHighlight = {};
  if (typeof input.show === "boolean") result.show = input.show;
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (finite(input.x) && finite(input.y)) {
    result.x = Math.round(input.x);
    result.y = Math.round(input.y);
  }
  return Object.keys(result).length > 0 ? result : null;
}

type WithPictures = { pictures?: Picture[]; children?: WithPictures[] };

/** A copy of the tree in which every picture's circle choices are cleaned, and dropped when there are none. */
export function cleanTreeHighlights<T extends WithPictures>(tree: T[]): T[] {
  return tree.map((node) => ({
    ...node,
    pictures: (node.pictures ?? []).map((picture) => {
      const { highlight, ...rest } = picture;
      const clean = highlight === undefined ? null : cleanPictureHighlight(highlight);
      return clean ? { ...rest, highlight: clean } : rest;
    }),
    children: cleanTreeHighlights((node.children ?? []) as T[]),
  }));
}

/** A circle, in picture pixels: ready to draw. */
export interface Circle {
  cx: number;
  cy: number;
  /** The radius. */
  r: number;
  color: string;
  /** 0 to 1: how solid it is. */
  opacity: number;
}

/** The size of the circle on a picture `width` pixels wide, for a look. The editor's sample uses this too, so it matches the real one. */
export function circleSize(style: HighlightStyle, width: number): { r: number } {
  return { r: Math.round(((style.size / 100) * width / 2) * 10) / 10 };
}

type CircleSubject = Pick<Picture, "width" | "height" | "click" | "highlight">;

/** Does this picture get a circle where it is used, and where? `null` when it is off, or has no position to draw it at. */
export function circleFor(picture: CircleSubject, settings: HighlightSettings, kind: HighlightKind): Circle | null {
  const style = settings[kind];
  if (!(picture.highlight?.show ?? style.show)) return null;
  const own = picture.highlight;
  const at = own && own.x !== undefined && own.y !== undefined ? { x: own.x, y: own.y } : picture.click ? { x: picture.click.x, y: picture.click.y } : null;
  if (!at) return null;
  return {
    cx: clamp(at.x, 0, picture.width),
    cy: clamp(at.y, 0, picture.height),
    r: circleSize(style, picture.width).r,
    color: style.color,
    opacity: Math.round((1 - style.seeThrough / 100) * 100) / 100, // two decimals: 75 percent see-through is 0.25, not 0.3
  };
}

/** What a picture's circle is doing, in plain words, for the picture list and a screen reader. `null` for a picture with nothing to say. */
export function highlightWords(picture: CircleSubject, settings: HighlightSettings, kind: HighlightKind): string | null {
  const place = HIGHLIGHT_KINDS.find((k) => k.id === kind)!.name.toLowerCase();
  const own = picture.highlight;
  const moved = own && own.x !== undefined && own.y !== undefined;
  if (!picture.click && !moved) return own?.show === undefined ? null : `Click circle: ${own.show ? "always shown" : "never shown"}, but there is no position to draw it at.`;
  const rule = own?.show === true ? "always shown" : own?.show === false ? "never shown" : `follows the project (${settings[kind].show ? "shown" : "not shown"} in the ${place})`;
  return `Click circle: ${rule}${moved ? `, moved to ${own!.x} across and ${own!.y} down` : ""}.`;
}

// ---- Checking what the author types in the settings and the move dialogs ---------------------------

/** Ready-made colours the settings dialog offers, beside typing a code. */
export const COLOR_PRESETS: { name: string; code: string }[] = [
  { name: "Yellow", code: "#FFD600" },
  { name: "Orange", code: "#FF9800" },
  { name: "Green", code: "#4CAF50" },
  { name: "Blue", code: "#2196F3" },
  { name: "Pink", code: "#E91E63" },
  { name: "Red", code: "#F44336" },
  { name: "White", code: "#FFFFFF" },
];

/** What is in the boxes of the settings dialog for one place a picture is used. */
export interface StyleInput {
  show: boolean;
  size: string;
  color: string;
  seeThrough: string;
}

export type StyleCheck =
  | { ok: true; style: HighlightStyle }
  | { ok: false; field: "size" | "color" | "seeThrough"; message: string };

const decimal = /^\d+(\.\d+)?$/;

/** Checks the boxes of the settings dialog. A mistake is explained in plain words and says which box it is in. */
export function checkStyleInput(input: StyleInput): StyleCheck {
  const size = input.size.trim();
  if (!decimal.test(size)) return { ok: false, field: "size", message: `Type the size as a number from ${SIZE_LIMITS.min} to ${SIZE_LIMITS.max}, such as 3.${size ? ` "${size}" is not one.` : ""}` };
  const sizeNumber = Number(size);
  if (sizeNumber < SIZE_LIMITS.min || sizeNumber > SIZE_LIMITS.max) {
    return { ok: false, field: "size", message: `The size must be from ${SIZE_LIMITS.min} to ${SIZE_LIMITS.max} percent of the picture's width. Type a number in that range.` };
  }
  const color = normalizeColor(input.color);
  if (!color) return { ok: false, field: "color", message: `Type the colour as six hex digits, such as FFD600.${input.color.trim() ? ` "${input.color.trim()}" is not one.` : ""}` };
  const see = input.seeThrough.trim();
  if (!decimal.test(see)) return { ok: false, field: "seeThrough", message: `Type the see-through level as a number from ${SEE_THROUGH_LIMITS.min} to ${SEE_THROUGH_LIMITS.max}, such as 40.${see ? ` "${see}" is not one.` : ""}` };
  const seeNumber = Number(see);
  if (seeNumber < SEE_THROUGH_LIMITS.min || seeNumber > SEE_THROUGH_LIMITS.max) {
    return { ok: false, field: "seeThrough", message: `The see-through level must be from ${SEE_THROUGH_LIMITS.min} to ${SEE_THROUGH_LIMITS.max} percent. Type a number in that range.` };
  }
  return { ok: true, style: { show: input.show, size: Math.round(sizeNumber * 10) / 10, color, seeThrough: Math.round(seeNumber * 10) / 10 } };
}

export type PositionCheck = { ok: true; x: number; y: number } | { ok: false; field: "x" | "y"; message: string };

/** Checks where the author wants the circle: whole numbers counted in picture pixels from the top left corner, inside the picture. */
export function checkPosition(input: { x: string; y: string }, width: number, height: number): PositionCheck {
  const one = (text: string, field: "x" | "y", most: number, words: string): { ok: true; value: number } | { ok: false; field: "x" | "y"; message: string } => {
    const trimmed = text.trim();
    if (!/^\d+$/.test(trimmed)) return { ok: false, field, message: `Type how far ${words} as a whole number from 0 to ${most}, such as ${Math.round(most / 2)}.${trimmed ? ` "${trimmed}" is not one.` : ""}` };
    const value = Number(trimmed);
    if (value > most) return { ok: false, field, message: `The picture is ${most} pixels ${field === "x" ? "wide" : "high"}. Type how far ${words} as a number from 0 to ${most}.` };
    return { ok: true, value };
  };
  const x = one(input.x, "x", width, "across");
  if (!x.ok) return x;
  const y = one(input.y, "y", height, "down");
  if (!y.ok) return y;
  return { ok: true, x: x.value, y: y.value };
}
