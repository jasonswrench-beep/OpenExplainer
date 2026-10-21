// Lettered callouts: a small lettered marker with a leader line to the part of a picture it names, and an entry under the picture with its
// letter, its name and a sentence about it. They belong to the picture (not to a page), are stored beside it in picture pixels and are never
// burned into it. The letters are never stored: they follow the order, so moving or deleting a callout re-letters the rest.
// Letters, not numbers, because numbers belong to the steps of a procedure. Everything here works without a screen.
import { newId } from "./ids.ts";
import { moveItem } from "./page.ts";
import type { Picture } from "./model.ts";

export interface CalloutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Callout {
  id: string;
  /** What the callout names, such as "Save". Empty means it still needs a name. */
  name: string;
  /** A sentence about it. Empty means it still needs one. */
  description: string;
  /** The part of the picture it names, in picture pixels from the top left corner. */
  target: CalloutRect;
  /** Where the middle of the lettered marker sits, in picture pixels. */
  marker: { x: number; y: number };
}

/** The most text kept in a name or a sentence, so a mistake cannot fill a project. */
export const MOST_TEXT = 300;

type Size = Pick<Picture, "width" | "height">;

/** A, B, C ... Z, then AA, AB ... */
export function letterFor(index: number): string {
  let n = Math.max(0, Math.floor(index));
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}

/** How big a marker is on a picture this wide, in picture pixels, so it looks the same at any picture size. */
export function markerRadius(pictureWidth: number): number {
  return Math.max(10, Math.round(pictureWidth * 0.012));
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** The part of a rectangle that is on the picture, or `null` if none of it is. */
export function clipToPicture(rect: CalloutRect, size: Size): CalloutRect | null {
  const left = clamp(Math.round(rect.x), 0, size.width);
  const top = clamp(Math.round(rect.y), 0, size.height);
  const right = clamp(Math.round(rect.x + rect.width), 0, size.width);
  const bottom = clamp(Math.round(rect.y + rect.height), 0, size.height);
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

/**
 * Where to put a marker for an item so it sits just outside it, on the picture, and not on another marker. It tries above and to the left
 * first (where a reader looks first), then round the item. `others` are the centres of markers already there.
 */
export function placeMarker(target: CalloutRect, size: Size, others: { x: number; y: number }[] = []): { x: number; y: number } {
  const r = markerRadius(size.width);
  const gap = r + 6;
  const left = target.x - gap;
  const right = target.x + target.width + gap;
  const top = target.y - gap;
  const bottom = target.y + target.height + gap;
  const midX = target.x + target.width / 2;
  const midY = target.y + target.height / 2;
  const candidates = [
    { x: left, y: top }, { x: midX, y: top }, { x: right, y: top }, { x: left, y: midY }, { x: right, y: midY },
    { x: left, y: bottom }, { x: midX, y: bottom }, { x: right, y: bottom },
  ];
  const inside = (p: { x: number; y: number }) => p.x - r >= 0 && p.y - r >= 0 && p.x + r <= size.width && p.y + r <= size.height;
  const free = (p: { x: number; y: number }) => others.every((o) => Math.hypot(o.x - p.x, o.y - p.y) >= 2 * r + 4);
  const best = candidates.find((p) => inside(p) && free(p));
  const chosen = best ?? candidates.find(inside) ?? candidates[0];
  return { x: Math.round(clamp(chosen.x, r, Math.max(r, size.width - r))), y: Math.round(clamp(chosen.y, r, Math.max(r, size.height - r))) };
}

// ---- Making and changing callouts ---------------------------------------------------------

/** A callout for the item a click was on, from the click note's outline and, when it is kept, the item's name. `null` when the click has no outline. */
export function calloutFromClick(picture: Pick<Picture, "width" | "height" | "click" | "callouts">): Callout | null {
  const target = picture.click?.target;
  if (!target || target.password || !target.bounds) return null;
  const rect = clipToPicture(target.bounds, picture);
  if (!rect) return null;
  const others = (picture.callouts ?? []).map((c) => c.marker);
  return { id: newId(), name: target.name ?? "", description: "", target: rect, marker: placeMarker(rect, picture, others) };
}

/** The callout for the clicked item, unless the picture already has a callout with that same outline. `null` when there is nothing new to make. */
export function newCalloutFromClick(picture: Pick<Picture, "width" | "height" | "click" | "callouts">): Callout | null {
  const made = calloutFromClick(picture);
  if (!made) return null;
  const same = (picture.callouts ?? []).some((c) => c.target.x === made.target.x && c.target.y === made.target.y && c.target.width === made.target.width && c.target.height === made.target.height);
  return same ? null : made;
}

/** Gives a click picture its callout, if it has an outline and has no callout for that item yet. Returns it, or `null` if nothing was added. */
export function addCalloutFromClick(picture: Picture): Callout | null {
  const made = newCalloutFromClick(picture);
  if (!made) return null;
  (picture.callouts ??= []).push(made);
  return made;
}

export function addCallout(picture: Picture, callout: Callout): void {
  (picture.callouts ??= []).push(callout);
}

/** Replaces a picture's callouts with a new list (an empty list leaves it with none). */
export function setCallouts(picture: Picture, list: Callout[]): void {
  if (list.length > 0) picture.callouts = list;
  else delete picture.callouts;
}

export function removeCallout(picture: Picture, id: string): boolean {
  const at = (picture.callouts ?? []).findIndex((c) => c.id === id);
  if (at < 0) return false;
  picture.callouts!.splice(at, 1);
  if (picture.callouts!.length === 0) delete picture.callouts;
  return true;
}

/** Moves a callout up or down the list, which re-letters it and its neighbours. False at the ends. */
export function moveCallout(picture: Picture, id: string, by: -1 | 1): boolean {
  const list = picture.callouts ?? [];
  return moveItem(list, list.findIndex((c) => c.id === id), by);
}

// ---- What is said and what is drawn -------------------------------------------------------

export interface Entry {
  letter: string;
  name: string;
  description: string;
  needsName: boolean;
  needsDescription: boolean;
}

/** The entries listed under a picture, in order. */
export function entries(picture: Pick<Picture, "callouts">): Entry[] {
  return (picture.callouts ?? []).map((c, i) => ({
    letter: letterFor(i),
    name: c.name.trim(),
    description: c.description.trim(),
    needsName: c.name.trim() === "",
    needsDescription: c.description.trim() === "",
  }));
}

/** One entry as a line of words: its letter, its name and its sentence, and what is still missing. */
export function entryWords(entry: Entry): string {
  const name = entry.needsName ? "needs a name" : entry.name;
  const sentence = entry.needsDescription ? "needs a description." : entry.description;
  return `${entry.letter}. ${name}: ${sentence}`;
}

export interface Shape {
  letter: string;
  marker: { cx: number; cy: number; r: number };
  /** The leader line, from the edge of the marker to the item; `null` when the marker is on the item or touching it. */
  line: { x1: number; y1: number; x2: number; y2: number } | null;
  /** The item's outline. */
  rect: CalloutRect;
  /** A line width that looks the same at any picture size. */
  stroke: number;
}

/** The nearest point of a rectangle to a point outside it. */
function nearestOn(rect: CalloutRect, p: { x: number; y: number }): { x: number; y: number } {
  return { x: clamp(p.x, rect.x, rect.x + rect.width), y: clamp(p.y, rect.y, rect.y + rect.height) };
}

/**
 * Everything needed to draw a picture's callouts. Markers and lines are sized by the width of the part of the picture that is shown (the whole
 * picture by default), so they look the same size on the screen whether the picture is shown whole or zoomed in.
 */
export function shapesFor(picture: Pick<Picture, "width" | "height" | "callouts">, shownWidth: number = picture.width): Shape[] {
  const r = markerRadius(shownWidth);
  const round = (n: number) => Math.round(n * 10) / 10;
  return (picture.callouts ?? []).map((c, i) => {
    // A marker that sits on the item it names needs no line.
    const onItem = c.marker.x >= c.target.x && c.marker.x <= c.target.x + c.target.width && c.marker.y >= c.target.y && c.marker.y <= c.target.y + c.target.height;
    const end = nearestOn(c.target, c.marker);
    const dx = end.x - c.marker.x, dy = end.y - c.marker.y;
    const length = Math.hypot(dx, dy);
    const line = !onItem && length > r + 1 ? { x1: round(c.marker.x + (dx / length) * r), y1: round(c.marker.y + (dy / length) * r), x2: round(end.x), y2: round(end.y) } : null;
    return { letter: letterFor(i), marker: { cx: c.marker.x, cy: c.marker.y, r }, line, rect: c.target, stroke: Math.max(2, round(shownWidth * 0.0015)) };
  });
}

// ---- Checking what is typed in the Callouts dialog -----------------------------------------

export interface CalloutInput {
  name: string;
  description: string;
  left: string;
  top: string;
  width: string;
  height: string;
  markerX: string;
  markerY: string;
}

export type CalloutField = keyof CalloutInput;

export type CalloutCheck = { ok: true; callout: Omit<Callout, "id"> } | { ok: false; field: CalloutField; message: string };

const whole = /^\d+$/;

/** Checks one callout's boxes. A mistake is explained in plain words and says which box it is in. */
export function checkCalloutInput(input: CalloutInput, size: Size): CalloutCheck {
  if (input.name.length > MOST_TEXT) return { ok: false, field: "name", message: `A name can be at most ${MOST_TEXT} letters. This one has ${input.name.length}.` };
  if (input.description.length > MOST_TEXT) return { ok: false, field: "description", message: `A sentence can be at most ${MOST_TEXT} letters. This one has ${input.description.length}.` };
  const numbers: [CalloutField, string, string, number, number][] = [
    ["left", input.left, "how far across the item starts", 0, size.width - 1],
    ["top", input.top, "how far down the item starts", 0, size.height - 1],
    ["width", input.width, "the item's width", 1, size.width],
    ["height", input.height, "the item's height", 1, size.height],
    ["markerX", input.markerX, "how far across the marker is", 0, size.width],
    ["markerY", input.markerY, "how far down the marker is", 0, size.height],
  ];
  const got: Record<string, number> = {};
  for (const [field, text, words, least, most] of numbers) {
    const trimmed = text.trim();
    if (!whole.test(trimmed)) return { ok: false, field, message: `Type ${words} as a whole number from ${least} to ${most}, such as ${Math.max(least, Math.round(most / 2))}.${trimmed ? ` "${trimmed}" is not one.` : ""}` };
    const value = Number(trimmed);
    if (value < least || value > most) return { ok: false, field, message: `The picture is ${size.width} by ${size.height} pixels. Type ${words} as a number from ${least} to ${most}.` };
    got[field] = value;
  }
  if (got.left + got.width > size.width) return { ok: false, field: "width", message: `The item reaches past the right edge of the picture, which is ${size.width} pixels wide. Make the width ${size.width - got.left} or less, or start it further left.` };
  if (got.top + got.height > size.height) return { ok: false, field: "height", message: `The item reaches past the bottom of the picture, which is ${size.height} pixels high. Make the height ${size.height - got.top} or less, or start it higher.` };
  return {
    ok: true,
    callout: {
      name: input.name.trim(),
      description: input.description.trim(),
      target: { x: got.left, y: got.top, width: got.width, height: got.height },
      marker: { x: got.markerX, y: got.markerY },
    },
  };
}

// ---- Cleaning what is read from or written to a file ---------------------------------------

const text = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MOST_TEXT) : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

/** The callouts a picture can keep: each with its outline on the picture and its marker kept on the picture. Anything else is dropped. */
export function cleanCallouts(raw: unknown, size: Size): Callout[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Callout[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const input = item as Record<string, unknown>;
    const t = (input.target ?? {}) as Record<string, unknown>;
    const m = (input.marker ?? {}) as Record<string, unknown>;
    const [x, y, width, height, mx, my] = [num(t.x), num(t.y), num(t.width), num(t.height), num(m.x), num(m.y)];
    if (x === null || y === null || width === null || height === null || mx === null || my === null) continue;
    const rect = clipToPicture({ x, y, width, height }, size);
    if (!rect) continue;
    let id = typeof input.id === "string" && input.id ? input.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    out.push({ id, name: text(input.name), description: text(input.description), target: rect, marker: { x: clamp(mx, 0, size.width), y: clamp(my, 0, size.height) } });
  }
  return out;
}

type WithPictures = { pictures?: Picture[]; children?: WithPictures[] };

/** A copy of the tree in which every picture's callouts are cleaned, and dropped when there are none. */
export function cleanTreeCallouts<T extends WithPictures>(tree: T[]): T[] {
  return tree.map((node) => ({
    ...node,
    pictures: (node.pictures ?? []).map((picture) => {
      const { callouts, ...rest } = picture;
      const clean = callouts === undefined ? [] : cleanCallouts(callouts, picture);
      return clean.length > 0 ? { ...rest, callouts: clean } : rest;
    }),
    children: cleanTreeCallouts((node.children ?? []) as T[]),
  }));
}
