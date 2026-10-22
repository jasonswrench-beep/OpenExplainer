// Drafting callout text from the author's side: check that the built-in model is ready, show a small window with a Stop button while the sentences are written one by one, and say at the end,
// in plain words, what was drafted, what was left alone and why. The drafting itself is src/ai/drafting.ts. Nothing here touches a draft after it is made: the author deals with those in AI drafts.
import { invoke } from "@tauri-apps/api/core";
import { messageDialog, open } from "./dialogs.ts";
import { appConnector } from "./ai/app.ts";
import { draftCallouts, reportWords } from "./ai/drafting.ts";
import { modelSource, modelState } from "./ai/model-state.ts";
import { cleanAiSettings } from "./ai/settings.ts";
import { AiError } from "./ai/types.ts";
import type { Project } from "./project/model.ts";

export interface DraftRun {
  /** How many drafts were made. */
  made: number;
  /** The author asked to open the list of drafts at the end. */
  openDrafts: boolean;
}

const TITLE = "Draft callout text";

/**
 * Drafts a sentence for each callout that has none, in a topic or on one picture. If the built-in model is not chosen or not ready it says so and returns `null`, having done nothing.
 * Otherwise it returns what happened once the author has read the report.
 */
export async function draftCalloutText(project: Project, nodeId: string, pictureId?: string): Promise<DraftRun | null> {
  const settings = cleanAiSettings(await invoke("ai_settings_get"));
  if (settings.choice === "none") {
    await messageDialog(TITLE, "AI help is off. Open AI help, choose Built-in model on this PC, and download it if you have not, then try again.");
    return null;
  }
  if (settings.choice === "key") {
    await messageDialog(TITLE, "Using your own key for ChatGPT, Claude or Gemini is not built yet. Choose the built-in model in AI help.");
    return null;
  }
  if ((await modelState()) !== "ready") {
    await messageDialog(TITLE, "The built-in model is not on this PC yet, or has not been checked. Open AI help and download it first.");
    return null;
  }

  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">${TITLE}</h2>
      <p id="draft-progress" role="status">Starting the model. The first time this can take half a minute.</p>
      <div id="draft-report" hidden></div>
      <p><button type="button" id="draft-stop">Stop</button> <button value="drafts" id="draft-open" hidden>Open AI drafts</button> <button value="close" id="draft-close" hidden>Close</button></p>
    </form>`;
  const progress = dialog.querySelector<HTMLElement>("#draft-progress")!;
  const reportEl = dialog.querySelector<HTMLElement>("#draft-report")!;
  const stop = dialog.querySelector<HTMLButtonElement>("#draft-stop")!;
  const openButton = dialog.querySelector<HTMLButtonElement>("#draft-open")!;
  const closeButton = dialog.querySelector<HTMLButtonElement>("#draft-close")!;
  const controller = new AbortController();
  let running = true;
  stop.addEventListener("click", () => {
    stop.disabled = true;
    progress.textContent = "Stopping.";
    controller.abort();
  });
  // Escape stops the drafting while it runs; once it is over, Escape closes the window as usual.
  dialog.addEventListener("cancel", (event) => {
    if (running) {
      event.preventDefault();
      stop.click();
    }
  });
  dialog.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    dialog.close((event.submitter as HTMLButtonElement | null)?.value ?? "close");
  });
  const shown = open(dialog, stop);

  const answerer = appConnector({ choice: "builtin" });
  let made = 0;
  let lines: string[];
  try {
    const report = await draftCallouts({
      project,
      nodeId,
      pictureId,
      ask: (messages, options) => answerer.ask(messages, options),
      model: modelSource().file,
      now: () => new Date().toISOString(),
      signal: controller.signal,
      onProgress: (_done, _total, words) => { progress.textContent = words; },
    });
    made = report.made;
    lines = reportWords(report);
  } catch (error) {
    lines = [`The drafting stopped because of a problem. ${error instanceof AiError || error instanceof Error ? error.message : String(error)}`];
  }
  running = false;
  stop.hidden = true;
  progress.textContent = "Finished.";
  reportEl.replaceChildren(...lines.map((line) => Object.assign(document.createElement("p"), { textContent: line })));
  reportEl.hidden = false;
  closeButton.hidden = false;
  openButton.hidden = made === 0;
  (made > 0 ? openButton : closeButton).focus();
  progress.textContent = `Finished. ${lines[0]}`;
  await shown;
  return { made, openDrafts: dialog.returnValue === "drafts" };
}
