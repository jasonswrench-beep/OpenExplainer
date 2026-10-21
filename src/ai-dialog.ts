// The AI help dialog: who drafts text for the author (nobody, the built-in model on this PC, or later the author's own key with ChatGPT, Claude or Gemini), the facts about the built-in model in
// words, and its download: Download, Pause, Resume, Cancel, Check the file, Delete the model, and the licence text. The choice is kept by the shell (src-tauri/src/ai.rs). The download belongs
// to the app, not to this dialog (src/ai/model-state.ts), so it carries on when the dialog is closed and the dialog shows where it has got to when it is opened again.
//
// Everything can be done by keyboard. What is true is said in words, never by colour alone. Progress is shown on screen as it moves but announced to a screen reader only at every tenth
// part and when something changes, so it does not talk all the time. When the button the keyboard is on goes away (Download once it is pressed), the keyboard moves to the one that took its place.
import { invoke } from "@tauri-apps/api/core";
import { confirmDialog, messageDialog, open } from "./dialogs.ts";
import { getDownloader, modelSource } from "./ai/model-state.ts";
import { modelStateOf, type DownloadState, type DownloadStatus } from "./ai/download.ts";
import { sizeInWords } from "./ai/model-info.ts";
import { aiStatusWords, cleanAiSettings, type AiChoice, type AiSettings } from "./ai/settings.ts";

const STATUS_WORDS: Record<DownloadStatus, string> = {
  absent: "Not downloaded.",
  partial: "Partly downloaded.",
  downloading: "Downloading.",
  paused: "Paused.",
  verifying: "Being checked.",
  unchecked: "On this PC, but not checked yet.",
  ready: "Ready.",
  damaged: "Damaged. It needs to be downloaded again.",
  failed: "The last download stopped.",
};

/** Which buttons make sense for a state. */
export function buttonsFor(state: DownloadState): { download: boolean; resume: boolean; pause: boolean; cancel: boolean; check: boolean; remove: boolean } {
  const s = state.status;
  const keeps = state.canResume && state.doneBytes > 0;
  return {
    download: s === "absent" || s === "damaged" || (s === "failed" && !keeps),
    resume: s === "partial" || s === "paused" || (s === "failed" && keeps),
    pause: s === "downloading",
    cancel: s === "downloading" || s === "paused" || s === "partial" || (s === "failed" && keeps),
    check: s === "unchecked" || s === "ready",
    remove: s === "ready" || s === "unchecked" || s === "damaged",
  };
}

/** Shows the choice and the download. Keeps the choice (through the shell) when the author presses Save, and returns it, or returns `null` if cancelled or it could not be kept. */
export async function aiDialog(): Promise<AiSettings | null> {
  const current = cleanAiSettings(await invoke("ai_settings_get"));
  const downloader = getDownloader();
  await downloader.refresh();
  const m = modelSource();
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">AI help</h2>
      <p class="help" id="ai-intro">AI help can draft text for you to review: names and sentences for callouts, and numbered procedures. It is optional. Everything in OpenExplainer works by hand, and nothing an AI writes goes into your book until you accept it. Drafting itself is not built yet; this is where you choose what will do it and get the built-in model ready.</p>
      <fieldset>
        <legend>Who drafts</legend>
        <p><label><input type="radio" name="ai-choice" value="none" id="ai-none" aria-describedby="ai-none-help"> No AI</label><br><span class="help" id="ai-none-help">Nothing is drafted and nothing is sent anywhere. This is how OpenExplainer starts.</span></p>
        <p><label><input type="radio" name="ai-choice" value="builtin" id="ai-builtin" aria-describedby="ai-builtin-help"> Built-in model on this PC</label><br><span class="help" id="ai-builtin-help">A small AI model that runs on this PC. It needs no account and no internet once it has been downloaded, and nothing you write or capture leaves this PC.</span></p>
        <p><label><input type="radio" name="ai-choice" value="key" id="ai-key" disabled aria-describedby="ai-key-help"> My own key (ChatGPT, Claude or Gemini)</label><br><span class="help" id="ai-key-help">Not built yet.</span></p>
      </fieldset>
      <p id="ai-status" role="status"></p>
      <h3 id="ai-model-heading">The built-in model</h3>
      <dl aria-labelledby="ai-model-heading" id="ai-model-info">
        <dt>Name</dt><dd id="ai-model-name"></dd>
        <dt>What it is</dt><dd id="ai-model-summary"></dd>
        <dt>Size to download</dt><dd id="ai-model-size"></dd>
        <dt>Comes from</dt><dd id="ai-model-from"></dd>
        <dt>Licence</dt><dd id="ai-model-licence"></dd>
        <dt>On this PC</dt><dd id="ai-model-state"></dd>
      </dl>
      <ul id="ai-machine" class="help"></ul>
      <p id="ai-progress-box"><progress id="ai-progress" max="100" value="0" aria-labelledby="ai-progress-words"></progress> <span id="ai-progress-words"></span></p>
      <p id="ai-buttons">
        <button type="button" id="ai-download">Download the model</button>
        <button type="button" id="ai-resume">Resume</button>
        <button type="button" id="ai-pause">Pause</button>
        <button type="button" id="ai-cancel">Cancel and delete the partial download</button>
        <button type="button" id="ai-check">Check the file</button>
        <button type="button" id="ai-delete">Delete the model</button>
        <button type="button" id="ai-licence">Show the licence text</button>
      </p>
      <p id="ai-announce" class="visually-hidden" role="status"></p>
      <p id="ai-error" role="alert" class="error"></p>
      <p><button value="ok" id="ai-save">Save</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const $ = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  $("ai-model-name").textContent = m.title;
  $("ai-model-summary").textContent = m.summary.charAt(0).toUpperCase() + m.summary.slice(1) + ".";
  $("ai-model-size").textContent = `About ${sizeInWords(m.bytes)}`;
  $("ai-model-from").textContent = `huggingface.co/${m.repo}, a copy of ${m.originalRepo}`;
  $("ai-model-licence").textContent = `${m.licenceName}, copyright ${m.licenceHolder}. It lets anyone use the model, including in other products, and asks only that the licence and credit stay with it.`;
  $<HTMLButtonElement>("ai-download").textContent = `Download the model (${sizeInWords(m.bytes)})`;

  const radios = Array.from(dialog.querySelectorAll<HTMLInputElement>('input[name="ai-choice"]'));
  const chosen = (): AiChoice => (radios.find((r) => r.checked)?.value as AiChoice | undefined) ?? "none";
  const say = (words: string) => { $("ai-announce").textContent = ""; setTimeout(() => ($("ai-announce").textContent = words), 30); };
  const start = radios.find((r) => r.value === current.choice && !r.disabled) ?? $<HTMLInputElement>("ai-none");
  start.checked = true;

  let lastStatus: DownloadStatus | null = null;
  let lastTenth = -1;
  /** True while the dialog is first being filled in, so opening it does not announce anything. */
  let quiet = true;
  const buttonIds = { download: "ai-download", resume: "ai-resume", pause: "ai-pause", cancel: "ai-cancel", check: "ai-check", remove: "ai-delete" } as const;
  const render = (state: DownloadState) => {
    // Noted first: the browser takes the keyboard off a button the moment it is hidden, so afterwards it can no longer be seen where it was.
    const focusedBefore = dialog.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
    $("ai-status").textContent = aiStatusWords({ choice: chosen() }, modelStateOf(state));
    $("ai-model-state").textContent = STATUS_WORDS[state.status];
    const showBar = (state.doneBytes > 0 && ["downloading", "paused", "partial", "failed"].includes(state.status)) || state.status === "verifying";
    $<HTMLProgressElement>("ai-progress").hidden = !showBar;
    $<HTMLProgressElement>("ai-progress").value = state.totalBytes > 0 ? Math.floor((state.doneBytes / state.totalBytes) * 100) : 0;
    $("ai-progress-words").textContent = state.status === "absent" && state.message === "Not downloaded." ? "" : state.message;
    const wanted = buttonsFor(state);
    const verifying = state.status === "verifying";
    for (const [key, id] of Object.entries(buttonIds)) $(id).hidden = verifying || !wanted[key as keyof typeof wanted];
    // The keyboard never stays on a button that has just gone away.
    if (focusedBefore && focusedBefore !== dialog && (focusedBefore.hidden || focusedBefore.closest("[hidden]"))) {
      const next = ["ai-pause", "ai-resume", "ai-download", "ai-check", "ai-licence"].map((id) => $(id)).find((b) => !b.hidden) ?? $("ai-save");
      next.focus();
    }
    // Said aloud when something changes, and at every tenth part while it downloads.
    if (state.status !== lastStatus) {
      lastStatus = state.status;
      lastTenth = -1;
      if (!quiet) say(state.message);
    } else if (state.status === "downloading") {
      const tenth = Math.floor((state.doneBytes / state.totalBytes) * 10);
      if (tenth !== lastTenth && tenth > 0) {
        lastTenth = tenth;
        say(`Downloading: ${tenth * 10}%.`);
      }
    }
  };
  const unsubscribe = downloader.subscribe(render);
  render(downloader.getState());
  quiet = false;
  for (const radio of radios) radio.addEventListener("change", () => render(downloader.getState()));

  const showMachine = async () => {
    const list = $("ai-machine");
    list.textContent = "";
    try {
      for (const line of (await downloader.machine()).lines) {
        const item = document.createElement("li");
        item.textContent = line;
        list.append(item);
      }
    } catch {
      /* Without these facts the download still works; it just has no words about the disk. */
    }
  };
  void showMachine();

  $("ai-download").addEventListener("click", () => { $("ai-error").textContent = ""; void downloader.start(); });
  $("ai-resume").addEventListener("click", () => { $("ai-error").textContent = ""; void downloader.start(); });
  $("ai-pause").addEventListener("click", () => downloader.pause());
  $("ai-cancel").addEventListener("click", async () => {
    const state = downloader.getState();
    const yes = await confirmDialog("Cancel the download", `This deletes the ${sizeInWords(state.doneBytes)} downloaded so far. To keep it and carry on later, choose Pause instead.`, "Delete it");
    if (yes) await downloader.cancel();
    else $("ai-cancel").focus();
  });
  $("ai-check").addEventListener("click", () => void downloader.verify());
  $("ai-delete").addEventListener("click", async () => {
    const yes = await confirmDialog("Delete the model", `This deletes the downloaded model (${sizeInWords(m.bytes)}) from this PC. You can download it again later.`, "Delete the model");
    if (yes) await downloader.remove();
    else $("ai-delete").focus();
  });
  $("ai-licence").addEventListener("click", async () => {
    try {
      const text = await downloader.licenceText();
      const licence = document.createElement("dialog");
      licence.setAttribute("aria-labelledby", "dlg-title");
      licence.innerHTML = `<form method="dialog"><h2 id="dlg-title"></h2><pre id="licence-text" tabindex="0" style="max-height:60vh;overflow:auto;white-space:pre-wrap"></pre><p><button value="ok" id="licence-close">Close</button></p></form>`;
      licence.querySelector("h2")!.textContent = `${m.licenceName} (copyright ${m.licenceHolder})`;
      licence.querySelector("pre")!.textContent = text;
      await open(licence, licence.querySelector<HTMLElement>("#licence-text")!);
    } catch (error) {
      await messageDialog("Licence text", `The licence text could not be shown. ${error instanceof Error ? error.message : String(error)}`);
    }
    $("ai-licence").focus();
  });

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
  dialog.addEventListener("close", unsubscribe);
  await open(dialog, start);
  return dialog.returnValue === "ok" ? result : null;
}
