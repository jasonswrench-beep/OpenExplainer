// The Writing style dialog: notes for the whole project about voice and wording, which the AI reads before every draft. They are kept in the project (format version 14), so they travel with the book.
// Everything can be done by keyboard. Nothing is kept unless the author presses Save.
import { open } from "./dialogs.ts";
import { MOST_STYLE, cleanWritingStyle } from "./project/drafts.ts";

/** Shows the notes. Returns the new notes when the author presses Save (possibly empty), or `null` if cancelled. */
export async function styleDialog(current: string): Promise<string | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">Writing style</h2>
      <p class="help" id="style-help">Notes for the AI about how this book should read. It reads them before every draft. Say what you want in your own words: the voice, which words to use for which things, how long a sentence may be. For example: "Speak to the reader as you. Say click for buttons and choose for menu items. Keep sentences short." Leave it empty if you have no notes. The AI only drafts; nothing it writes goes into the book until you accept it.</p>
      <p><label for="style-text">Notes (up to ${MOST_STYLE.toLocaleString("en-US")} letters)</label><br><textarea id="style-text" rows="10" cols="70" maxlength="${MOST_STYLE}" aria-describedby="style-help style-count"></textarea></p>
      <p id="style-count" class="help"></p>
      <p><button value="ok" id="style-save">Save</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const text = dialog.querySelector<HTMLTextAreaElement>("#style-text")!;
  const count = dialog.querySelector<HTMLElement>("#style-count")!;
  text.value = current;
  const show = () => { count.textContent = `${text.value.length.toLocaleString("en-US")} of ${MOST_STYLE.toLocaleString("en-US")} letters.`; };
  show();
  text.addEventListener("input", show);
  dialog.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    dialog.close((event.submitter as HTMLButtonElement | null)?.value === "cancel" ? "cancel" : "ok");
  });
  await open(dialog, text);
  return dialog.returnValue === "ok" ? cleanWritingStyle(text.value) : null;
}
