// The look of the outputs (format version 18): the fonts, an accent colour, a logo, whether the book has a cover, the words in the running header and footer, and the paper size. It is kept in the
// project and used by the print preview, the PDF, Word and the help site, so one choice looks the same everywhere. It never stops anyone: a colour that is too light for text on white is warned about
// (the book check says so, in words) and still used. The fonts are ones Windows already has, because an output is read on a computer the author does not control, and a font that is not there is
// replaced by the next one in its list. Everything here works without a screen.
import { contrastRatio, normalizeHex, ratioWords, TEXT_MIN } from "./contrast.ts";

export type FontId = "georgia" | "times" | "cambria" | "segoe" | "calibri" | "arial" | "verdana";

export interface FontChoice {
  id: FontId;
  name: string;
  /** The CSS list: this font, then what to use if it is not there. */
  css: string;
  /** The name Word is told. */
  word: string;
  kind: "serif" | "sans";
}

export const FONTS: FontChoice[] = [
  { id: "georgia", name: "Georgia (serif)", css: 'Georgia, "Times New Roman", serif', word: "Georgia", kind: "serif" },
  { id: "times", name: "Times New Roman (serif)", css: '"Times New Roman", Times, serif', word: "Times New Roman", kind: "serif" },
  { id: "cambria", name: "Cambria (serif)", css: 'Cambria, Georgia, "Times New Roman", serif', word: "Cambria", kind: "serif" },
  { id: "segoe", name: "Segoe UI (sans serif)", css: '"Segoe UI", Calibri, Arial, sans-serif', word: "Segoe UI", kind: "sans" },
  { id: "calibri", name: "Calibri (sans serif)", css: 'Calibri, "Segoe UI", Arial, sans-serif', word: "Calibri", kind: "sans" },
  { id: "arial", name: "Arial (sans serif)", css: 'Arial, Helvetica, sans-serif', word: "Arial", kind: "sans" },
  { id: "verdana", name: "Verdana (sans serif)", css: 'Verdana, "Segoe UI", Arial, sans-serif', word: "Verdana", kind: "sans" },
];

export const fontById = (id: string): FontChoice => FONTS.find((f) => f.id === id) ?? FONTS[0];

export type PageSize = "letter" | "a4";

export const PAGE_SIZES: { id: PageSize; name: string; css: string; wordWidth: number; wordHeight: number }[] = [
  { id: "letter", name: "Letter (8.5 by 11 inches)", css: "Letter", wordWidth: 12240, wordHeight: 15840 },
  { id: "a4", name: "A4 (210 by 297 millimetres)", css: "A4", wordWidth: 11906, wordHeight: 16838 },
];

export const pageSizeById = (id: string) => PAGE_SIZES.find((p) => p.id === id) ?? PAGE_SIZES[0];

/** A logo: a picture file in the project (images/<id>.png or .jpg), its size, and what it shows for a reader who cannot see it. */
export interface Logo {
  file: string;
  width: number;
  height: number;
  alt: string;
}

export interface Look {
  /** The font of the text. */
  bodyFont: FontId;
  /** The font of the headings, the contents and the labels. */
  headingFont: FontId;
  /** The colour of headings and links as #RRGGBB, or empty for the plain black and the standard link colour. */
  accent: string;
  logo?: Logo;
  /** Does the book start with a title page? */
  cover: boolean;
  /** The words at the top of every page of a PDF or Word book after the first. Variables such as {{PRODUCT}} are filled in. Empty means the book's title. */
  header: string;
  /** The words at the bottom of every page, beside the page number. Empty means none. */
  footer: string;
  pageSize: PageSize;
}

/** The most letters in the header or the footer, so a mistake cannot fill a page. */
export const MOST_LOOK_TEXT = 120;

/** The look a new project has: the one the outputs had before this setting existed, so nothing changes until the author chooses. */
export function defaultLook(): Look {
  return { bodyFont: "georgia", headingFont: "segoe", accent: "", cover: true, header: "", footer: "", pageSize: "letter" };
}

const oneLine = (text: unknown): string => (typeof text === "string" ? text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MOST_LOOK_TEXT) : "");

/** What is read from a file or an assistant: only choices that are known, a colour that is a colour, a logo that is a picture file of the project, short single-line words. Anything else is the default. */
export function cleanLook(raw: unknown): Look {
  const base = defaultLook();
  if (typeof raw !== "object" || raw === null) return base;
  const r = raw as Record<string, unknown>;
  const font = (value: unknown, fallback: FontId): FontId => (FONTS.some((f) => f.id === value) ? (value as FontId) : fallback);
  const accent = r.accent === "" || r.accent === undefined ? "" : normalizeHex(r.accent) ?? "";
  const look: Look = {
    bodyFont: font(r.bodyFont, base.bodyFont),
    headingFont: font(r.headingFont, base.headingFont),
    accent,
    cover: r.cover === false ? false : true,
    header: oneLine(r.header),
    footer: oneLine(r.footer),
    pageSize: PAGE_SIZES.some((p) => p.id === r.pageSize) ? (r.pageSize as PageSize) : base.pageSize,
  };
  const logo = r.logo as Record<string, unknown> | undefined;
  if (logo && typeof logo === "object" && typeof logo.file === "string" && /^images\/[A-Za-z0-9_-]{1,64}\.(png|jpg)$/.test(logo.file)
    && Number.isInteger(logo.width) && Number.isInteger(logo.height) && (logo.width as number) > 0 && (logo.height as number) > 0 && (logo.width as number) <= 20000 && (logo.height as number) <= 20000) {
    look.logo = { file: logo.file, width: logo.width as number, height: logo.height as number, alt: typeof logo.alt === "string" ? logo.alt.trim().slice(0, 300) : "" };
  }
  return look;
}

/**
 * The name Word is told for the text (`role` body) or the headings. The starting pair, Georgia and Segoe UI, is the PDF's and the help site's choice and means "automatic" for Word, which has always used
 * Calibri, so an existing book's Word file does not change until the author chooses fonts.
 */
export function wordFont(look: Look, role: "body" | "heading"): string {
  return automaticFonts(look) ? "Calibri" : fontById(role === "body" ? look.bodyFont : look.headingFont).word;
}

/** Has the author not chosen fonts (the starting pair)? Then each output keeps the fonts it always had. */
export function automaticFonts(look: Look): boolean {
  return look.bodyFont === "georgia" && look.headingFont === "segoe";
}

/** The files a look needs from the package besides the pictures of the topics. */
export const lookFiles = (look: Look): string[] => (look.logo ? [look.logo.file] : []);

/** How readable the accent is as text on white: its ratio, whether it meets the minimum for text, and a sentence about it. `null` when there is no accent. */
export function accentCheck(accent: string): { ratio: number; ok: boolean; words: string } | null {
  if (!accent) return null;
  const ratio = contrastRatio(accent, "#FFFFFF");
  if (ratio === null) return null;
  const ok = ratio >= TEXT_MIN;
  return { ratio, ok, words: `The accent colour ${accent} on white is ${ratioWords(ratio)}. ${ok ? "That is enough for text." : `Text needs at least ${TEXT_MIN} to 1, so headings and links in this colour may be hard to read.`}` };
}

/** CSS custom properties for the look, to put on the wrapper of a preview or a page: the fonts and the accent. */
export function lookCssVariables(look: Look): string {
  const accent = look.accent || "";
  return `--look-body: ${fontById(look.bodyFont).css}; --look-heading: ${fontById(look.headingFont).css};${accent ? ` --look-accent: ${accent};` : ""}`;
}

/** The look in words, for a line in a dialog or an announcement. */
export function lookWords(look: Look): string {
  const fonts = automaticFonts(look) ? ["the starting fonts"] : [`text in ${fontById(look.bodyFont).word}`, `headings in ${fontById(look.headingFont).word}`];
  const parts = [...fonts, look.accent ? `accent ${look.accent}` : "no accent colour", look.logo ? "a logo" : "no logo", look.cover ? "a title page" : "no title page", pageSizeById(look.pageSize).css];
  if (look.header) parts.push(`header "${look.header}"`);
  if (look.footer) parts.push(`footer "${look.footer}"`);
  return parts.join(", ");
}

/** Is this the look a new project has? */
export function isDefaultLook(look: Look): boolean {
  return JSON.stringify(cleanLook(look)) === JSON.stringify(defaultLook());
}
