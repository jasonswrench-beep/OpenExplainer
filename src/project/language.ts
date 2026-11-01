// The language the book is written in (format version 21), as a language tag such as `en`, `fr` or `pt-BR`. It is put in the pages of the outputs (the help site, the e-book, the PDF and Word), because a screen
// reader chooses its voice from it: a French book that says it is English is read badly. A translated copy of a book (src/translate/) has the language it was translated into. Nothing here needs a screen.

export const DEFAULT_LANGUAGE = "en";

/** The most letters in a language tag we keep. */
const MOST_LANGUAGE = 35;

/**
 * A language tag as it is kept, or `null` when it is not one. Letters and digits in parts of 1 to 8 divided by hyphens, the first part 2 or 3 letters (the language): `en`, `fr-CA`, `zh-Hant`, `pt-br` becomes
 * `pt-BR`. The tag is not looked up: a person may need a rare language, and a wrong code only makes the screen reader guess.
 */
export function tidyLanguage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parts = value.trim().replace(/_/g, "-").split("-");
  if (value.trim().length === 0 || value.trim().length > MOST_LANGUAGE) return null;
  if (!/^[A-Za-z]{2,3}$/.test(parts[0]) || parts.slice(1).some((p) => !/^[A-Za-z0-9]{1,8}$/.test(p))) return null;
  return parts.map((p, i) => (i === 0 ? p.toLowerCase() : p.length === 4 && /^[A-Za-z]+$/.test(p) ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p.length === 2 || /^[0-9]{3}$/.test(p) ? p.toUpperCase() : p.toLowerCase())).join("-");
}

/** The language of a project as it is kept: a tidy tag, or English. */
export function cleanLanguage(value: unknown): string {
  return tidyLanguage(value) ?? DEFAULT_LANGUAGE;
}

/** The language in English words, such as "French (Canada)", or the tag itself when the program does not know the name. */
export function languageWords(tag: string): string {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(tag);
    return name && name !== tag ? name : tag;
  } catch {
    return tag;
  }
}
