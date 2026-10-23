// The Writing style dialog: notes for the whole project about voice and wording, which the AI reads before every draft (format version 14), and the list of words to avoid, which the book check looks for (format version 16).
// They are kept in the project, so they travel with the book. Everything can be done by keyboard. Nothing is kept unless the author presses Save.
import { open } from "./dialogs.ts";
import { MOST_AVOID_WORDS, MOST_WORD, avoidCountWords, avoidWordsFromLines, avoidWordsToLines, type AvoidWord } from "./project/avoid-words.ts";
import { MOST_STYLE, cleanWritingStyle } from "./project/drafts.ts";

export interface StyleChoices {
  style: string;
  avoid: AvoidWord[];
}

/** Shows the notes and the words to avoid. Returns what the author chose when they press Save (either may be empty), or `null` if cancelled. */
export async function styleDialog(current: StyleChoices): Promise<StyleChoices | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">Writing style</h2>
      <p class="help" id="style-help">Notes for the AI about how this book should read. It reads them before every draft. Say what you want in your own words: the voice, which words to use for which things, how long a sentence may be. For example: "Speak to the reader as you. Say click for buttons and choose for menu items. Keep sentences short." Leave it empty if you have no notes. The AI only drafts; nothing it writes goes into the book until you accept it.</p>
      <p><label for="style-text">Notes (up to ${MOST_STYLE.toLocaleString("en-US")} letters)</label><br><textarea id="style-text" rows="8" cols="70" maxlength="${MOST_STYLE}" aria-describedby="style-help style-count"></textarea></p>
      <p id="style-count" class="help"></p>
      <p class="help" id="avoid-help">Words to avoid: words or phrases the book should not use, one on each line, with what to say instead after an arrow. For example: file => document. Check the book then lists every place the book uses one (but not inside a control name written between double square brackets). This is a plain list, not something the AI works out, and it works with AI help off. Up to ${MOST_AVOID_WORDS} lines of ${MOST_WORD} letters.</p>
      <p><label for="avoid-text">Words to avoid, one on each line (word => use instead)</label><br><textarea id="avoid-text" rows="6" cols="70" aria-describedby="avoid-help avoid-count"></textarea></p>
      <p id="avoid-count" class="help"></p>
      <p><button value="ok" id="style-save">Save</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const text = dialog.querySelector<HTMLTextAreaElement>("#style-text")!;
  const count = dialog.querySelector<HTMLElement>("#style-count")!;
  const avoid = dialog.querySelector<HTMLTextAreaElement>("#avoid-text")!;
  const avoidCount = dialog.querySelector<HTMLElement>("#avoid-count")!;
  text.value = current.style;
  avoid.value = avoidWordsToLines(current.avoid);
  const show = () => { count.textContent = `${text.value.length.toLocaleString("en-US")} of ${MOST_STYLE.toLocaleString("en-US")} letters.`; };
  const showAvoid = () => { avoidCount.textContent = avoidCountWords(avoid.value); };
  show();
  showAvoid();
  text.addEventListener("input", show);
  avoid.addEventListener("input", showAvoid);
  dialog.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    dialog.close((event.submitter as HTMLButtonElement | null)?.value === "cancel" ? "cancel" : "ok");
  });
  await open(dialog, text);
  return dialog.returnValue === "ok" ? { style: cleanWritingStyle(text.value), avoid: avoidWordsFromLines(avoid.value) } : null;
}
