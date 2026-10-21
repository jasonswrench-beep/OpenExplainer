// Colours and contrast. A colour is six hex digits with a leading #, such as #C62828. Contrast is worked out the way WCAG 2.2 says: the lighter colour's relative luminance
// plus 0.05, over the darker one's plus 0.05. The minimums are 4.5 to 1 for text and 3 to 1 for the parts of a graphic (an arrow, an outline) against what is behind them.
// The checker only ever warns; it never stops anyone using a colour. Everything here works without a screen.

export type Rgb = [number, number, number];

/** The least contrast for text (WCAG 2.2 AA, normal size). */
export const TEXT_MIN = 4.5;
/** The least contrast for the parts of a graphic against what is behind them (WCAG 2.2 AA, non-text). */
export const GRAPHIC_MIN = 3;

/** A short list of colours to choose from. Each can still be changed by typing a code. */
export const SWATCHES: { name: string; code: string }[] = [
  { name: "Red", code: "#C62828" },
  { name: "Orange", code: "#E65100" },
  { name: "Yellow", code: "#FFD600" },
  { name: "Green", code: "#2E7D32" },
  { name: "Blue", code: "#1565C0" },
  { name: "Purple", code: "#6A1B9A" },
  { name: "Black", code: "#000000" },
  { name: "White", code: "#FFFFFF" },
  { name: "Dark gray", code: "#424242" },
  { name: "Light gray", code: "#E0E0E0" },
];

/** A colour as #RRGGBB in capital letters, from FFD600, #ffd600 or #fd0, or `null` if it is not a colour. */
export function normalizeHex(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const hex = text.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(hex)) return `#${[...hex].map((c) => c + c).join("").toUpperCase()}`;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex.toUpperCase()}`;
  return null;
}

/** The red, green and blue (0 to 255) of a colour, or `null` when it is not one. */
export function toRgb(code: string): Rgb | null {
  const hex = normalizeHex(code);
  if (!hex) return null;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export function fromRgb([r, g, b]: Rgb): string {
  const part = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0").toUpperCase();
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** How bright a colour is to the eye, from 0 (black) to 1 (white), as WCAG defines it. */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast between two colours, from 1 (the same) to 21 (black on white). `null` when either is not a colour. */
export function contrastRatio(a: string, b: string): number | null {
  const first = toRgb(a), second = toRgb(b);
  if (!first || !second) return null;
  const la = relativeLuminance(first), lb = relativeLuminance(second);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** A ratio in words, to one decimal place: "4.6 to 1". It is rounded down, so 4.49 never reads as 4.5. */
export function ratioWords(ratio: number): string {
  return `${(Math.floor(ratio * 10) / 10).toFixed(1)} to 1`;
}

/** Black or white, whichever reads better on a colour. The better of the two is always at least 4.5 to 1 or close to it. */
export function bestTextColor(background: string): string {
  const black = contrastRatio("#000000", background) ?? 0;
  const white = contrastRatio("#FFFFFF", background) ?? 0;
  return black >= white ? "#000000" : "#FFFFFF";
}

/** A colour laid over another with some of the one underneath showing through (`opacity` 0 to 1 is how solid the top one is). */
export function blend(top: string, under: string, opacity: number): string | null {
  const a = toRgb(top), b = toRgb(under);
  if (!a || !b) return null;
  const k = Math.max(0, Math.min(1, opacity));
  return fromRgb([a[0] * k + b[0] * (1 - k), a[1] * k + b[1] * (1 - k), a[2] * k + b[2] * (1 - k)]);
}

/**
 * The average colour of a part of a picture, from its pixels (four numbers each: red, green, blue, alpha, as a canvas gives them). It is the colour a mark is seen against,
 * so the checker can compare. The part is in pixels of `width` by `height`; pixels with no opacity are left out. `null` when the part holds none.
 */
export function averageColor(pixels: ArrayLike<number>, width: number, height: number, part: { x: number; y: number; width: number; height: number }): string | null {
  const left = Math.max(0, Math.floor(part.x)), top = Math.max(0, Math.floor(part.y));
  const right = Math.min(width, Math.ceil(part.x + part.width)), bottom = Math.min(height, Math.ceil(part.y + part.height));
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const at = (y * width + x) * 4;
      if (pixels[at + 3] === 0) continue;
      r += pixels[at]; g += pixels[at + 1]; b += pixels[at + 2];
      n++;
    }
  }
  return n === 0 ? null : fromRgb([r / n, g / n, b / n]);
}

/** One contrast check: what was compared, the two colours, the ratio, the least allowed, and the result in plain words. */
export interface ContrastCheck {
  /** What is compared, such as "Text on its fill". */
  what: string;
  foreground: string;
  background: string;
  ratio: number;
  min: number;
  ok: boolean;
  /** For a screen reader and the list: "Text on its fill: 5.2 to 1, which meets the 4.5 to 1 minimum." or what is wrong and what to do. */
  words: string;
}

/** Compares two colours against a minimum. `null` when either is not a colour. `approximate` says the second colour is an average of what is behind the mark. */
export function checkContrast(what: string, foreground: string, background: string, min: number, approximate = false): ContrastCheck | null {
  const ratio = contrastRatio(foreground, background);
  if (ratio === null) return null;
  const ok = ratio >= min;
  const about = approximate ? "about " : "";
  const words = ok
    ? `${what}: ${about}${ratioWords(ratio)}, which meets the ${ratioWords(min)} minimum.`
    : `${what}: ${about}${ratioWords(ratio)}, which is below the ${ratioWords(min)} minimum (WCAG 2.2 AA). Choose colours that are further apart, or keep these if you mean to.`;
  return { what, foreground: normalizeHex(foreground)!, background: normalizeHex(background)!, ratio, min, ok, words };
}
