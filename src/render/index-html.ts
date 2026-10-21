// The index of the book as HTML: a heading for each letter, then each term with where it is. The print preview, the PDF and the help site all write it with this, so the index reads the same
// in each; what differs is only how a place is written (a topic number in the preview and the help site, a page number in the PDF) and where it links. Everything from the project is escaped.
import type { BookIndex, IndexEntry, IndexLocator } from "../project/book-index.ts";
import { esc, fillVariables } from "./html.ts";

/** How the places of one entry are written: the HTML of the links, in order. */
export type LocatorsFor = (entry: IndexEntry) => string[];

/** Writes the index. `locators` says how the places of each entry are written. `variables` fill in any variable in a term. */
export function indexHtml(index: BookIndex, locators: LocatorsFor, variables: Record<string, string>): string {
  const groups = index.groups
    .map((group) => {
      const items = group.entries
        .map((entry) => `<li><span class="pv-index-term">${esc(fillVariables(entry.text, variables))}</span> <span class="pv-index-places">${locators(entry).join(", ")}</span></li>`)
        .join("");
      // The letter is a heading, so a screen reader can jump from letter to letter.
      const label = group.heading;
      return `<section class="pv-index-group" aria-labelledby="pv-index-${esc(label.replace(/\W+/g, "-").toLowerCase())}"><h2 class="pv-index-letter" id="pv-index-${esc(label.replace(/\W+/g, "-").toLowerCase())}">${esc(label)}</h2><ul class="pv-index-list">${items}</ul></section>`;
    })
    .join("");
  return `<div class="pv-index-groups">${groups}</div>`;
}

/** A topic as it is written in an index that names topics: its number and title. */
export const topicWords = (topic: IndexLocator, variables: Record<string, string>) => `${topic.number} ${fillVariables(topic.title, variables)}`;
