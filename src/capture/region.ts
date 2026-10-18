// Checking the four numbers an author types for a rectangle of the screen, and the words used for screens and rectangles.
// The numbers are counted in pixels from the top left corner of the chosen screen; the helper wants them on the whole
// desktop, so the check also adds the screen's own position.
import type { ScreenInfo } from "./outcome.ts";

/** What was typed into the four boxes, as text. */
export interface RegionInput {
  left: string;
  top: string;
  width: string;
  height: string;
}

/** A rectangle in real screen pixels on the whole desktop, as the helper wants it. */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Field = keyof RegionInput;
export type RegionCheck = { ok: true; region: Region } | { ok: false; field: Field; message: string };

/** How each box is named in a message. */
const WORDS: Record<Field, string> = {
  left: "the distance from the left edge",
  top: "the distance from the top edge",
  width: "the width",
  height: "the height",
};

export function screenName(screen: ScreenInfo): string {
  return `Screen ${screen.number}`;
}

/** The spoken and written name of one screen in the list. */
export function screenLabel(screen: ScreenInfo): string {
  return `${screenName(screen)}${screen.primary ? " (the main screen)" : ""}, ${screen.width} by ${screen.height} pixels`;
}

/** The boxes filled in for the whole of a screen. */
export function wholeScreen(screen: ScreenInfo): RegionInput {
  return { left: "0", top: "0", width: String(screen.width), height: String(screen.height) };
}

/** What a picture of a rectangle is called in the picture list. */
export function regionName(screen: ScreenInfo, left: number, top: number, width: number, height: number): string {
  return `${screenName(screen)}, ${width} by ${height} pixels, ${left} from the left and ${top} from the top`;
}

/** Turns what was typed into a rectangle, or says in plain words which box is wrong and why. */
export function checkRegionInput(screen: ScreenInfo, input: RegionInput): RegionCheck {
  const numbers: Partial<Record<Field, number>> = {};
  for (const field of ["left", "top", "width", "height"] as Field[]) {
    const text = input[field].trim();
    if (!text) return { ok: false, field, message: `Type ${WORDS[field]} in pixels.` };
    if (!/^\d+$/.test(text)) {
      return { ok: false, field, message: `Type ${WORDS[field]} as a whole number of pixels, such as 100. "${text}" is not one.` };
    }
    if (text.length > 6) return { ok: false, field, message: `${WORDS[field][0].toUpperCase()}${WORDS[field].slice(1)} is too large to fit on any screen.` };
    numbers[field] = Number(text);
  }
  const { left, top, width, height } = numbers as Record<Field, number>;
  if (width < 1) return { ok: false, field: "width", message: "The width must be at least 1 pixel." };
  if (height < 1) return { ok: false, field: "height", message: "The height must be at least 1 pixel." };
  if (left >= screen.width) {
    return { ok: false, field: "left", message: `The distance from the left edge must be less than ${screen.width}, the width of ${screenName(screen)}.` };
  }
  if (top >= screen.height) {
    return { ok: false, field: "top", message: `The distance from the top edge must be less than ${screen.height}, the height of ${screenName(screen)}.` };
  }
  if (left + width > screen.width) {
    return {
      ok: false,
      field: "width",
      message: `The rectangle reaches past the right edge of ${screenName(screen)}, which is ${screen.width} pixels wide. Make the width ${screen.width - left} or less, or the distance from the left edge smaller.`,
    };
  }
  if (top + height > screen.height) {
    return {
      ok: false,
      field: "height",
      message: `The rectangle reaches past the bottom edge of ${screenName(screen)}, which is ${screen.height} pixels tall. Make the height ${screen.height - top} or less, or the distance from the top edge smaller.`,
    };
  }
  return { ok: true, region: { x: screen.x + left, y: screen.y + top, width, height } };
}
