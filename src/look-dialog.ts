// The Look of the book window (format version 18): the fonts, an accent colour, a logo, whether the book has a title page, the words in the running header and footer, and the paper size. They are kept in
// the project and used by the print preview, the PDF, Word and the help site. Everything can be done by keyboard. Nothing is kept unless the author presses Save. A colour that is too light for text on white
// is warned about in words and a symbol (never by colour alone) and still used: the checker only warns.
import { open } from "./dialogs.ts";
import { accentCheck, FONTS, MOST_LOOK_TEXT, PAGE_SIZES, type Look } from "./project/look.ts";
import { normalizeHex } from "./project/contrast.ts";

/** Ready-made accent colours, all dark enough for text on white. The author can still type any colour. */
export const ACCENT_PRESETS: { name: string; code: string }[] = [
  { name: "Dark blue", code: "#1F4E8C" },
  { name: "Dark green", code: "#1B6B2F" },
  { name: "Dark red", code: "#A31515" },
  { name: "Purple", code: "#5A2A82" },
  { name: "Teal", code: "#00606B" },
  { name: "Dark gray", code: "#424242" },
];

export type LookAction = "save" | "choose-logo" | "remove-logo";

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Shows the look. Returns what the author chose and what to do next: `save` keeps it, `choose-logo` and `remove-logo` ask the caller to change the logo (the caller then shows the window again with the new
 * logo). `null` if cancelled.
 */
export async function lookDialog(current: Look): Promise<{ look: Look; action: LookAction } | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "look-title");
  const fontOptions = (chosen: string) => FONTS.map((f) => `<option value="${f.id}"${f.id === chosen ? " selected" : ""}>${esc(f.name)}</option>`).join("");
  const sizeOptions = PAGE_SIZES.map((p) => `<option value="${p.id}"${p.id === current.pageSize ? " selected" : ""}>${esc(p.name)}</option>`).join("");
  const presetOptions = [`<option value="">No accent colour</option>`, ...ACCENT_PRESETS.map((p) => `<option value="${p.code}">${esc(p.name)} (${p.code})</option>`), `<option value="other">Another colour, typed below</option>`].join("");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="look-title">Look of the book</h2>
      <p class="help" id="look-help">These choices are used by the print preview, the PDF, the Word file and the help site, so the book looks the same everywhere. Until you choose, each keeps the look it always had.</p>
      <p><label for="look-body">Font of the text</label><br><select id="look-body">${fontOptions(current.bodyFont)}</select></p>
      <p><label for="look-heading">Font of the headings, contents and labels</label><br><select id="look-heading">${fontOptions(current.headingFont)}</select></p>
      <p class="help" id="look-fonts-help">Georgia for the text and Segoe UI for the headings is the starting choice: it means Georgia and Segoe UI in the PDF and the help site's own fonts, and Calibri in Word. Choose any other pair to use it everywhere. These are fonts Windows already has; a computer without one shows a similar font.</p>
      <p><label for="look-preset">Accent colour</label><br><select id="look-preset" aria-describedby="look-accent-line">${presetOptions}</select></p>
      <p><label for="look-accent">Accent colour as six hex digits such as #1F4E8C, or empty for none</label><br><input id="look-accent" type="text" size="12" maxlength="7" autocomplete="off" aria-describedby="look-accent-line"></p>
      <p id="look-accent-line" class="help" role="status"></p>
      <p><label><input id="look-cover" type="checkbox"> The book starts with a title page</label></p>
      <p><label for="look-header">Words at the top of every page after the first (empty: the book's title)</label><br><input id="look-header" type="text" size="50" maxlength="${MOST_LOOK_TEXT}" aria-describedby="look-text-help"></p>
      <p><label for="look-footer">Words at the bottom of every page, beside the page number (empty: none)</label><br><input id="look-footer" type="text" size="50" maxlength="${MOST_LOOK_TEXT}" aria-describedby="look-text-help"></p>
      <p class="help" id="look-text-help">Up to ${MOST_LOOK_TEXT} letters. Variables such as {{PRODUCT}} and {{COMPANY}} are filled in.</p>
      <p><label for="look-size">Paper size of the PDF and the Word file</label><br><select id="look-size">${sizeOptions}</select></p>
      <fieldset id="look-logo-box"><legend>Logo</legend>
        <p id="look-logo-line" class="help" role="status"></p>
        <p id="look-alt-row"><label for="look-alt">What the logo shows, for a reader who cannot see it</label><br><input id="look-alt" type="text" size="50" maxlength="300"></p>
        <p><button type="button" id="look-choose">Choose a logo picture</button> <button type="button" id="look-remove">Remove the logo</button></p>
      </fieldset>
      <p><button value="ok" id="look-save">Save</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const q = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const body = q<HTMLSelectElement>("look-body");
  const heading = q<HTMLSelectElement>("look-heading");
  const preset = q<HTMLSelectElement>("look-preset");
  const accent = q<HTMLInputElement>("look-accent");
  const accentLine = q("look-accent-line");
  const cover = q<HTMLInputElement>("look-cover");
  const header = q<HTMLInputElement>("look-header");
  const footer = q<HTMLInputElement>("look-footer");
  const size = q<HTMLSelectElement>("look-size");
  const logoLine = q("look-logo-line");
  const alt = q<HTMLInputElement>("look-alt");
  const logo = current.logo;
  cover.checked = current.cover;
  header.value = current.header;
  footer.value = current.footer;
  accent.value = current.accent;
  alt.value = logo?.alt ?? "";
  q("look-alt-row").hidden = !logo;
  q<HTMLButtonElement>("look-remove").disabled = !logo;
  logoLine.textContent = logo ? `A logo is set (${logo.width} by ${logo.height} pixels). It is on the title page and in the help site's header.` : "No logo. Choose a PNG or JPEG picture to put on the title page and in the help site's header.";
  q<HTMLButtonElement>("look-choose").textContent = logo ? "Choose another logo picture" : "Choose a logo picture";

  const accentWords = () => {
    const typed = accent.value.trim();
    if (typed === "") return "No accent colour: headings stay black and links keep the standard blue.";
    const code = normalizeHex(typed);
    if (!code) return "⚠ That is not a colour. Type six hex digits such as #1F4E8C, or leave it empty.";
    const check = accentCheck(code);
    return `${check?.ok ? "✓" : "⚠"} ${check?.words ?? ""}`;
  };
  const syncPreset = () => {
    const code = normalizeHex(accent.value);
    preset.value = accent.value.trim() === "" ? "" : ACCENT_PRESETS.some((p) => p.code === code) ? code! : "other";
  };
  preset.addEventListener("change", () => {
    if (preset.value === "") accent.value = "";
    else if (preset.value !== "other") accent.value = preset.value;
    accentLine.textContent = accentWords();
  });
  accent.addEventListener("input", () => { syncPreset(); accentLine.textContent = accentWords(); });
  syncPreset();
  accentLine.textContent = accentWords();

  const chosen = (): Look => {
    const code = accent.value.trim() === "" ? "" : normalizeHex(accent.value) ?? current.accent;
    const next: Look = {
      bodyFont: body.value as Look["bodyFont"], headingFont: heading.value as Look["headingFont"], accent: code, cover: cover.checked,
      header: header.value.trim(), footer: footer.value.trim(), pageSize: size.value as Look["pageSize"],
    };
    if (logo) next.logo = { ...logo, alt: alt.value.trim() };
    return next;
  };
  let action: LookAction = "save";
  const done = (kind: LookAction) => { action = kind; dialog.close("ok"); };
  q("look-choose").addEventListener("click", () => done("choose-logo"));
  q("look-remove").addEventListener("click", () => done("remove-logo"));
  dialog.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    if ((event.submitter as HTMLButtonElement | null)?.value === "cancel") return dialog.close("cancel");
    if (accent.value.trim() !== "" && !normalizeHex(accent.value)) {
      accentLine.textContent = accentWords();
      accent.focus();
      return;
    }
    done("save");
  });
  await open(dialog, body);
  return dialog.returnValue === "ok" ? { look: chosen(), action } : null;
}
