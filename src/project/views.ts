// Picture views: which part of a picture is shown where it is used. A picture can be shown whole, cropped to a region the author chose, or zoomed in on the
// click. The picture file is never cut: the view is kept beside it, so it can be changed or taken off at any time. Callouts and the click circle keep their
// places in the whole picture's pixels, so they line up in every view. Everything here needs no screen.
import type { HighlightKind } from "./highlight.ts";
import type { Picture } from "./model.ts";

/** A part of a picture, in picture pixels from the top left corner. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How much a zoomed picture shows, for one place a picture is used. */
export interface ZoomStyle {
  /** The width of the part shown, as a percent of the picture's width. The height keeps the picture's shape. 100 shows the whole picture. */
  size: number;
}

export interface ZoomSettings {
  book: ZoomStyle;
  guide: ZoomStyle;
}

export const ZOOM_LIMITS = { min: 10, max: 100 };

/** A quarter-screen detail in the book (half the width), a tighter one in a quick guide (40 percent), where pictures are smaller. */
export function defaultZoom(): ZoomSettings {
  return { book: { size: 50 }, guide: { size: 40 } };
}

/** What one picture says about the part of it that is shown. A picture with none is shown whole. */
export type PictureView = ({ kind: "crop" } & Rect) | { kind: "zoom" };

type Size = Pick<Picture, "width" | "height">;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The zoom settings with every missing or wrong part replaced by the starting size, and every number kept in its range. */
export function cleanZoom(raw: unknown): ZoomSettings {
  const input = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const start = defaultZoom();
  const style = (value: unknown, fallback: ZoomStyle): ZoomStyle => {
    const size = typeof value === "object" && value !== null ? (value as Record<string, unknown>).size : undefined;
    return { size: finite(size) ? clamp(Math.round(size * 10) / 10, ZOOM_LIMITS.min, ZOOM_LIMITS.max) : fallback.size };
  };
  return { book: style(input.book, start.book), guide: style(input.guide, start.guide) };
}

/** The part of a rectangle that is on the picture, or `null` if none of it is. */
function clip(rect: Rect, size: Size): Rect | null {
  const left = clamp(Math.round(rect.x), 0, size.width);
  const top = clamp(Math.round(rect.y), 0, size.height);
  const right = clamp(Math.round(rect.x + rect.width), 0, size.width);
  const bottom = clamp(Math.round(rect.y + rect.height), 0, size.height);
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

/** A picture's own view, cleaned and cut to the picture, or `null` when it has none (so it is shown whole). */
export function cleanPictureView(raw: unknown, size: Size): PictureView | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;
  if (input.kind === "zoom") return { kind: "zoom" };
  if (input.kind === "crop" && finite(input.x) && finite(input.y) && finite(input.width) && finite(input.height)) {
    const part = clip({ x: input.x, y: input.y, width: input.width, height: input.height }, size);
    return part ? { kind: "crop", ...part } : null;
  }
  return null;
}

type WithPictures = { pictures?: Picture[]; children?: WithPictures[] };

/** A copy of the tree in which every picture's view is cleaned, and dropped when it has none. */
export function cleanTreeViews<T extends WithPictures>(tree: T[]): T[] {
  return tree.map((node) => ({
    ...node,
    pictures: (node.pictures ?? []).map((picture) => {
      const { view, ...rest } = picture;
      const clean = view === undefined ? null : cleanPictureView(view, picture);
      return clean ? { ...rest, view: clean } : rest;
    }),
    children: cleanTreeViews((node.children ?? []) as T[]),
  }));
}

type ViewSubject = Pick<Picture, "width" | "height" | "click" | "view">;

/** The part a zoom shows: centred on the click, as wide as the setting says, and kept on the picture (it slides in rather than shrinking). */
function zoomRect(picture: ViewSubject, style: ZoomStyle): Rect | null {
  if (!picture.click) return null;
  const width = clamp(Math.round((picture.width * style.size) / 100), 1, picture.width);
  const height = clamp(Math.round((picture.height * style.size) / 100), 1, picture.height);
  return {
    x: clamp(Math.round(picture.click.x - width / 2), 0, picture.width - width),
    y: clamp(Math.round(picture.click.y - height / 2), 0, picture.height - height),
    width,
    height,
  };
}

/**
 * The part of the picture that is shown where it is used, in picture pixels: the whole picture when it has no view, and also when it is set to zoom but
 * has no click to zoom on. This is the ONE place that decides it, so the editor and every export agree.
 */
export function shownPart(picture: ViewSubject, zoom: ZoomSettings, place: HighlightKind): Rect {
  const whole = { x: 0, y: 0, width: picture.width, height: picture.height };
  const view = picture.view;
  if (!view) return whole;
  if (view.kind === "crop") return clip(view, picture) ?? whole;
  return zoomRect(picture, zoom[place]) ?? whole;
}

/** Is it the whole picture? */
export function isWhole(part: Rect, picture: Size): boolean {
  return part.x === 0 && part.y === 0 && part.width === picture.width && part.height === picture.height;
}

/** Does any of `rect` fall inside the part that is shown? */
export function touches(rect: Rect, shown: Rect): boolean {
  return rect.x < shown.x + shown.width && rect.x + rect.width > shown.x && rect.y < shown.y + shown.height && rect.y + rect.height > shown.y;
}

/** What a picture's view is doing, in plain words, for the picture list and a screen reader. `null` for a picture shown whole with nothing to say. */
export function viewWords(picture: ViewSubject, zoom: ZoomSettings, place: HighlightKind): string | null {
  const view = picture.view;
  if (!view) return null;
  if (view.kind === "crop") {
    const part = shownPart(picture, zoom, place);
    return `Picture view: cropped to ${part.width} by ${part.height} pixels, starting ${part.x} across and ${part.y} down.`;
  }
  const part = zoomRect(picture, zoom[place]);
  if (!part) return "Picture view: zoomed in on the click, but this picture has no click, so the whole picture is shown.";
  const name = place === "book" ? "book" : "quick guide";
  return `Picture view: zoomed in on the click, showing ${part.width} by ${part.height} pixels (${zoom[place].size} percent of the width, as set for the ${name}).`;
}

// ---- Checking what the author types ---------------------------------------------------------------------

export type ZoomField = "book" | "guide";

export type ZoomCheck = { ok: true; zoom: ZoomSettings } | { ok: false; field: ZoomField; message: string };

const decimal = /^\d+(\.\d+)?$/;

/** Checks the two zoom size boxes. A mistake is explained in plain words and says which box it is in. */
export function checkZoomInput(input: { book: string; guide: string }): ZoomCheck {
  const got: Partial<Record<ZoomField, number>> = {};
  for (const [field, name] of [["book", "the book"], ["guide", "a quick guide"]] as const) {
    const text = input[field].trim();
    if (!decimal.test(text)) return { ok: false, field, message: `Type the zoom size for ${name} as a number from ${ZOOM_LIMITS.min} to ${ZOOM_LIMITS.max}, such as 50.${text ? ` "${text}" is not one.` : ""}` };
    const value = Number(text);
    if (value < ZOOM_LIMITS.min || value > ZOOM_LIMITS.max) {
      return { ok: false, field, message: `The zoom size for ${name} must be from ${ZOOM_LIMITS.min} to ${ZOOM_LIMITS.max} percent of the picture's width. Type a number in that range.` };
    }
    got[field] = Math.round(value * 10) / 10;
  }
  return { ok: true, zoom: { book: { size: got.book! }, guide: { size: got.guide! } } };
}

export type CropField = "left" | "top" | "width" | "height";

export interface CropInput {
  left: string;
  top: string;
  width: string;
  height: string;
}

export type CropCheck = { ok: true; view: PictureView } | { ok: false; field: CropField; message: string };

const whole = /^\d+$/;

/** Checks the four boxes of a crop: whole numbers, counted in picture pixels from the top left corner, with the region on the picture. */
export function checkCropInput(input: CropInput, size: Size): CropCheck {
  const numbers: [CropField, string, string, number, number][] = [
    ["left", input.left, "how far across the region starts", 0, size.width - 1],
    ["top", input.top, "how far down the region starts", 0, size.height - 1],
    ["width", input.width, "the region's width", 1, size.width],
    ["height", input.height, "the region's height", 1, size.height],
  ];
  const got: Record<string, number> = {};
  for (const [field, text, words, least, most] of numbers) {
    const trimmed = text.trim();
    if (!whole.test(trimmed)) return { ok: false, field, message: `Type ${words} as a whole number from ${least} to ${most}, such as ${Math.max(least, Math.round(most / 2))}.${trimmed ? ` "${trimmed}" is not one.` : ""}` };
    const value = Number(trimmed);
    if (value < least || value > most) return { ok: false, field, message: `The picture is ${size.width} by ${size.height} pixels. Type ${words} as a number from ${least} to ${most}.` };
    got[field] = value;
  }
  if (got.left + got.width > size.width) return { ok: false, field: "width", message: `The region reaches past the right edge of the picture, which is ${size.width} pixels wide. Make the width ${size.width - got.left} or less, or start it further left.` };
  if (got.top + got.height > size.height) return { ok: false, field: "height", message: `The region reaches past the bottom of the picture, which is ${size.height} pixels high. Make the height ${size.height - got.top} or less, or start it higher.` };
  return { ok: true, view: { kind: "crop", x: got.left, y: got.top, width: got.width, height: got.height } };
}

/** The width of the text on a printed page, in pixels at 96 to the inch (6.5 inches). */
export const PRINT_TEXT_WIDTH = 624;
/** Below this share of its size on screen, the writing in a picture is too small to read on paper. */
export const MIN_PRINT_SCALE = 0.5;

/** How big a picture's writing is on paper compared with the screen it came from, when the part shown is set across the text width (never bigger than life). */
export function printScale(shownWidth: number): number {
  return Math.min(1, PRINT_TEXT_WIDTH / Math.max(1, shownWidth));
}
