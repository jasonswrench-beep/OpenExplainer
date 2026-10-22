// Drafting from the author's side: check that the built-in model is ready, show a small window with a Stop button while the AI writes, and say at the end, in plain words, what was drafted, what was left alone and why.
// The drafting itself is src/ai/drafting.ts (a sentence for each callout without one) and src/ai/chapter-text.ts (the opener or summary of a chapter), and src/ai/boxes.ts (suggested boxes). Nothing here touches a draft after
// it is made: the author deals with those in Drafts.
import { invoke } from "@tauri-apps/api/core";
import { messageDialog, open } from "./dialogs.ts";
import { appConnector } from "./ai/app.ts";
import { chapterReportWords, chapterTextPossible, draftChapterText, type ChapterTextRole } from "./ai/chapter-text.ts";
import { draftCallouts, reportWords } from "./ai/drafting.ts";
import { modelSource, modelState } from "./ai/model-state.ts";
import { cleanAiSettings } from "./ai/settings.ts";
import { AiError, type Answer, type AskOptions, type ChatMessage } from "./ai/types.ts";
import type { Project } from "./project/model.ts";

export interface DraftRun {
  /** How many drafts were made. */
  made: number;
  /** The author asked to open the list of drafts at the end. */
  openDrafts: boolean;
}

/** Is AI help on with the built-in model, and is the model there? If not, says so and answers `false`. */
async function aiReady(title: string): Promise<boolean> {
  const settings = cleanAiSettings(await invoke("ai_settings_get"));
  if (settings.choice === "none") {
    await messageDialog(title, "AI help is off. Open AI help, choose Built-in model on this PC, and download it if you have not, then try again.");
    return false;
  }
  if (settings.choice === "key") {
    await messageDialog(title, "Using your own key for ChatGPT, Claude or Gemini is not built yet. Choose the built-in model in AI help.");
    return false;
  }
  if ((await modelState()) !== "ready") {
    await messageDialog(title, "The built-in model is not on this PC yet, or has not been checked. Open AI help and download it first.");
    return false;
  }
  return true;
}

/** What a job is given to work with. */
export interface JobTools {
  ask(messages: ChatMessage[], options: AskOptions): Promise<Answer>;
  model: string;
  signal: AbortSignal;
  progress(words: string): void;
}

/**
 * Shows the small drafting window (progress, Stop), runs `work` in it, and shows its report. Escape stops the work while it runs. Returns how many drafts were made and whether the author asked to open Drafts.
 */
export async function runDraftWindow(title: string, work: (tools: JobTools) => Promise<{ made: number; lines: string[] }>): Promise<DraftRun> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">${title}</h2>
      <p id="draft-progress" role="status">Starting the model. The first time this can take half a minute.</p>
      <div id="draft-report" hidden></div>
      <p><button type="button" id="draft-stop">Stop</button> <button value="drafts" id="draft-open" hidden>Open Drafts</button> <button value="close" id="draft-close" hidden>Close</button></p>
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
    const result = await work({ ask: (messages, options) => answerer.ask(messages, options), model: modelSource().file, signal: controller.signal, progress: (words) => { progress.textContent = words; } });
    made = result.made;
    lines = result.lines;
  } catch (error) {
    lines = [`The drafting stopped because of a problem. ${error instanceof AiError || error instanceof Error ? error.message : String(error)}`];
  }
  running = false;
  stop.hidden = true;
  reportEl.replaceChildren(...lines.map((line) => Object.assign(document.createElement("p"), { textContent: line })));
  reportEl.hidden = false;
  closeButton.hidden = false;
  openButton.hidden = made === 0;
  (made > 0 ? openButton : closeButton).focus();
  progress.textContent = `Finished. ${lines[0]}`;
  await shown;
  return { made, openDrafts: dialog.returnValue === "drafts" };
}

/**
 * Drafts a sentence for each callout that has none, in a topic or on one picture. If the built-in model is not chosen or not ready it says so and returns `null`, having done nothing.
 * Otherwise it returns what happened once the author has read the report.
 */
export async function draftCalloutText(project: Project, nodeId: string, pictureId?: string): Promise<DraftRun | null> {
  const title = "Draft callout text";
  if (!(await aiReady(title))) return null;
  return runDraftWindow(title, async (tools) => {
    const report = await draftCallouts({
      project,
      nodeId,
      pictureId,
      ask: tools.ask,
      model: tools.model,
      now: () => new Date().toISOString(),
      signal: tools.signal,
      onProgress: (_done, _total, words) => tools.progress(words),
    });
    return { made: report.made, lines: reportWords(report) };
  });
}

/** Drafts the opener of a chapter (`role` "opener", `nodeId` the chapter) or the summary of its topics (`role` "summary", `nodeId` the topic that is to hold it). Says why not, and returns `null`, if it cannot be done here. */
export async function draftChapterTextFor(project: Project, nodeId: string, role: ChapterTextRole): Promise<DraftRun | null> {
  const title = role === "opener" ? "Draft an opener" : "Draft a chapter summary";
  const possible = chapterTextPossible(project, nodeId, role);
  if (!possible.ok) {
    await messageDialog(title, possible.words);
    return null;
  }
  if (!(await aiReady(title))) return null;
  return runDraftWindow(title, async (tools) => {
    const report = await draftChapterText({ project, nodeId, role, ask: tools.ask, model: tools.model, now: () => new Date().toISOString(), signal: tools.signal, onProgress: tools.progress });
    return { made: report.made ? 1 : 0, lines: chapterReportWords(report, role) };
  });
}
