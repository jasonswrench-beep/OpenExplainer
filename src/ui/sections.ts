// The Properties pane as sections that open and close (the OpenStage suite's look, as in OpenStage Author's Properties panel): each
// group's heading is a button with an icon, its name and an arrow, that says whether it is expanded. The first starts open, the rest
// closed, and what the author opens or closes stays so while the program is open (it is not saved). Everything stays in the page,
// only hidden, so the program can still fill in a closed section, and opening it shows what is there now.

import { el, uiIcon } from "./menubar.ts";
import type { UiIconName } from "./uiicons.gen.ts";

/** Whether a section is open, by its id, for the time the program is open. */
const openNow = new Map<string, boolean>();

/** Whether a section shows: as the author left it, or as it starts. */
export function sectionOpen(id: string, startsOpen: boolean, remembered: ReadonlyMap<string, boolean> = openNow): boolean {
  return remembered.get(id) ?? startsOpen;
}

export interface SectionParts {
  /** The group: its heading (an h4, which keeps its id) and the rest of what is in it. */
  group: HTMLElement;
  icon: UiIconName;
  startsOpen: boolean;
}

/**
 * Turn a group of the Properties pane into a section: its h4's words go into a button that opens and closes the rest, which goes into
 * a body under the heading. Returns a function that opens it (for a jump to something inside).
 */
export function makeSection(doc: Document, parts: SectionParts): () => void {
  const { group, icon, startsOpen } = parts;
  const heading = group.querySelector<HTMLElement>(":scope > h4");
  if (!heading) throw new Error(`The group ${group.id} has no heading.`);
  const bodyId = `${group.id}-body`;
  const body = el(doc, "div", { class: "props-section-body", id: bodyId });
  for (const kid of [...group.childNodes]) if (kid !== heading) body.append(kid);
  const toggle = el(doc, "button", { type: "button", class: "props-section-toggle", "aria-controls": bodyId },
    uiIcon(doc, icon), el(doc, "span", { class: "props-section-name", text: heading.textContent ?? "" }), uiIcon(doc, "chevron-down"));
  toggle.lastElementChild?.classList.add("props-chevron");
  heading.replaceChildren(toggle);
  heading.classList.add("props-section-heading");
  group.classList.add("props-section");
  group.append(body);
  const show = (open: boolean) => {
    toggle.setAttribute("aria-expanded", String(open));
    body.hidden = !open;
    openNow.set(group.id, open);
  };
  show(sectionOpen(group.id, startsOpen));
  toggle.addEventListener("click", () => show(body.hidden));
  return () => show(true);
}
