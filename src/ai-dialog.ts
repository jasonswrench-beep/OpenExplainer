// The AI help dialog: who drafts text for the author (nobody, the built-in model on this PC, or later the author's own key with ChatGPT, Claude or Gemini), with the facts about the built-in
// model in words. The choice is kept by the shell (src-tauri/src/ai.rs) in the app's config folder. Everything can be done by keyboard, and what is true is said in words, never by colour alone.
// Drafting itself, the model download and the program that runs the model come in later parts (docs/local-ai-plan.md); until then choosing the built-in model says plainly that it is not on this PC.
import { invoke } from "@tauri-apps/api/core";
import { open } from "./dialogs.ts";
import { BUILTIN_MODEL, sizeInWords } from "./ai/model-info.ts";
import { modelState } from "./ai/model-state.ts";
import { aiStatusWords, cleanAiSettings, type AiChoice, type AiSettings, type ModelState } from "./ai/settings.ts";

const MODEL_STATE_WORDS: Record<ModelState, string> = {
  absent: "Not downloaded.",
  partial: "Partly downloaded.",
  ready: "Ready.",
  damaged: "Damaged. It needs to be downloaded again.",
};

/** Shows the choice. Keeps it (through the shell) when the author presses Save, and returns it, or returns `null` if cancelled or it could not be kept. */
export async function aiDialog(): Promise<AiSettings | null> {
  const current = cleanAiSettings(await invoke("ai_settings_get"));
  const state = await modelState();
  const m = BUILTIN_MODEL;
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">AI help</h2>
      <p class="help" id="ai-intro">AI help can draft text for you to review: names and sentences for callouts, and numbered procedures. It is optional. Everything in OpenExplainer works by hand, and nothing an AI writes goes into your book until you accept it. Drafting itself is not built yet; this is where you choose what will do it.</p>
      <fieldset>
        <legend>Who drafts</legend>
        <p><label><input type="radio" name="ai-choice" value="none" id="ai-none" aria-describedby="ai-none-help"> No AI</label><br><span class="help" id="ai-none-help">Nothing is drafted and nothing is sent anywhere. This is how OpenExplainer starts.</span></p>
        <p><label><input type="radio" name="ai-choice" value="builtin" id="ai-builtin" aria-describedby="ai-builtin-help"> Built-in model on this PC</label><br><span class="help" id="ai-builtin-help">A small AI model that runs on this PC. It needs no account and no internet once it has been downloaded, and nothing you write or capture leaves this PC.</span></p>
        <p><label><input type="radio" name="ai-choice" value="key" id="ai-key" disabled aria-describedby="ai-key-help"> My own key (ChatGPT, Claude or Gemini)</label><br><span class="help" id="ai-key-help">Not built yet.</span></p>
      </fieldset>
      <h3 id="ai-model-heading">The built-in model</h3>
      <dl aria-labelledby="ai-model-heading" id="ai-model-info">
        <dt>Name</dt><dd id="ai-model-name"></dd>
        <dt>What it is</dt><dd id="ai-model-summary"></dd>
        <dt>Size to download</dt><dd id="ai-model-size"></dd>
        <dt>Comes from</dt><dd id="ai-model-from"></dd>
        <dt>Licence</dt><dd id="ai-model-licence"></dd>
        <dt>On this PC</dt><dd id="ai-model-state"></dd>
      </dl>
      <p id="ai-status" role="status"></p>
      <p id="ai-error" role="alert" class="error"></p>
      <p><button value="ok" id="ai-save">Save</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const $ = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  $("ai-model-name").textContent = m.title;
  $("ai-model-summary").textContent = m.summary.charAt(0).toUpperCase() + m.summary.slice(1) + ".";
  $("ai-model-size").textContent = `About ${sizeInWords(m.bytes)}`;
  $("ai-model-from").textContent = `huggingface.co/${m.repo}, a copy of ${m.originalRepo}`;
  $("ai-model-licence").textContent = `${m.licenceName}, copyright ${m.licenceHolder}. It lets anyone use the model, including in other products, and asks only that the licence and credit stay with it.`;
  $("ai-model-state").textContent = MODEL_STATE_WORDS[state];

  const radios = Array.from(dialog.querySelectorAll<HTMLInputElement>('input[name="ai-choice"]'));
  const chosen = (): AiChoice => (radios.find((r) => r.checked)?.value as AiChoice | undefined) ?? "none";
  const show = () => { $("ai-status").textContent = aiStatusWords({ choice: chosen() }, state); };
  const start = radios.find((r) => r.value === current.choice && !r.disabled) ?? $<HTMLInputElement>("ai-none");
  start.checked = true;
  show();
  for (const radio of radios) radio.addEventListener("change", show);

  let result: AiSettings | null = null;
  dialog.querySelector<HTMLFormElement>("form")!.addEventListener("submit", async (event) => {
    event.preventDefault();
    if ((event.submitter as HTMLButtonElement | null)?.value === "cancel") return dialog.close("cancel");
    const next: AiSettings = { choice: chosen() };
    try {
      await invoke("ai_settings_set", { settings: next });
    } catch (error) {
      $("ai-error").textContent = typeof error === "string" ? error : error instanceof Error ? error.message : "The choice could not be saved.";
      start.focus();
      return;
    }
    result = next;
    dialog.close("ok");
  });
  await open(dialog, start);
  return dialog.returnValue === "ok" ? result : null;
}
