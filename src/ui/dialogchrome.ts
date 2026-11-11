// The parts every dialog has in the OpenStage suite's look, added as a dialog opens (dialogs.ts, open()), so no dialog needed a change of
// its own: a Close button in the top corner, the last row of buttons kept in sight at the bottom while the rest scrolls, and the main
// button of that row filled in OpenExplainer's gold. Adapted from OpenStage Author's editor/src/dialogchrome.ts (see NOTICE).
//
// The Close button does exactly what Escape does: it asks the dialog to close the way Escape asks (a "cancel" event the dialog can
// answer), and closes it if the dialog does not stop that. It comes last in the dialog, so focus starts where each dialog puts it, and
// Tab reaches it after the buttons at the bottom.

import { el, uiIcon } from "./menubar.ts";

/** Words that leave a dialog rather than do what it is for: a button with one of these is never the main one. */
const LEAVING = ["cancel", "close", "done", "back", "no", "not now", "skip", "keep editing", "keep it", "throw away"];

/** Whether a button's words say it leaves the dialog rather than does what the dialog is for. */
export function leavesDialog(label: string): boolean {
  const w = label.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!]+$/, "");
  return LEAVING.includes(w);
}

/** Which button of a row is the main one: the first that does something (not Cancel or Close); -1 for none. */
export function mainButtonOf(labels: readonly string[]): number {
  return labels.findIndex((l) => !leavesDialog(l));
}

/** Whether an element is a row of buttons and nothing else (spaces between them aside): a dialog's row of actions. */
export function isButtonRow(kids: readonly { tag: string; text: string }[]): boolean {
  return kids.length > 0 && kids.every((k) => k.tag === "BUTTON" || (k.tag === "#text" && k.text.trim() === ""));
}

/** Close a dialog the way Escape does. */
export function closeLikeEscape(dialog: HTMLDialogElement): void {
  const asked = new Event("cancel", { cancelable: true });
  if (dialog.dispatchEvent(asked) && dialog.open) dialog.close();
}

/** Give a dialog the Close button, its foot and its main button. Safe to call again on the same dialog. */
export function dressDialog(dialog: HTMLDialogElement): void {
  const doc = dialog.ownerDocument;
  if (!dialog.querySelector(".dlg-close, .cs-close") && !dialog.classList.contains("no-close")) {
    const close = el(doc, "button", { type: "button", class: "dlg-close", "aria-label": "Close", title: "Close (Escape)" });
    close.append(uiIcon(doc, "x"));
    close.addEventListener("click", () => closeLikeEscape(dialog));
    dialog.append(close);
  }
  // The foot: the last row in the dialog that holds only buttons.
  const rows = [...dialog.querySelectorAll<HTMLElement>("p, div")].filter((row) =>
    isButtonRow([...row.childNodes].map((n) => ({ tag: n.nodeType === 3 ? "#text" : (n as Element).tagName, text: n.textContent ?? "" }))));
  const foot = rows[rows.length - 1];
  if (foot && !foot.classList.contains("dlg-foot")) {
    foot.classList.add("dlg-foot");
    const buttons = [...foot.querySelectorAll<HTMLButtonElement>(":scope > button")];
    const main = mainButtonOf(buttons.map((b) => b.textContent ?? ""));
    if (main >= 0 && buttons.length > 1) buttons[main]!.dataset.main = "";
  }
}
