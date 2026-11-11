// The Keyboard keys window (Help > Keyboard keys, or Ctrl+/): every key OpenExplainer has, in tables, each named by its heading.
// The look follows Author's window of the same name (see NOTICE).

import { open } from "../dialogs.ts";
import { keyGroupsFirst } from "./keys.ts";
import { el } from "./menubar.ts";

export interface KeysOptions {
  /** The group to list first, for the part of the window the author was in. */
  first?: string;
  /** Called after the window has closed and given focus back. */
  back?: () => void;
}

export async function openKeysDialog(doc: Document, opts: KeysOptions = {}): Promise<void> {
  const dialog = el(doc, "dialog", { class: "keys-dialog", "aria-labelledby": "ky-title", "aria-describedby": "ky-intro" }) as HTMLDialogElement;
  const close = el(doc, "button", { type: "button", text: "Close" });
  close.addEventListener("click", () => dialog.close());
  dialog.append(
    el(doc, "h2", { id: "ky-title", text: "Keyboard keys" }),
    el(doc, "p", { id: "ky-intro", class: "help", text: "Every key OpenExplainer has. The menus show each command's keys beside it, and Ctrl+K finds a command by its name." }),
    ...keyGroupsFirst(opts.first).map((g) =>
      el(doc, "section", { class: "keys-group", "aria-labelledby": `ky-${g.id}` },
        el(doc, "h3", { id: `ky-${g.id}`, text: g.title }),
        el(doc, "table", { class: "keys-table", "aria-labelledby": `ky-${g.id}` },
          el(doc, "thead", {}, el(doc, "tr", {}, el(doc, "th", { scope: "col", text: "Keys" }), el(doc, "th", { scope: "col", text: "What they do" }))),
          el(doc, "tbody", {}, ...g.rows.map((r) => el(doc, "tr", {}, el(doc, "th", { scope: "row", text: r.keys }), el(doc, "td", { text: r.does }))))))),
    el(doc, "p", { class: "dialog-actions" }, close));
  await open(dialog, close);
  opts.back?.();
}
