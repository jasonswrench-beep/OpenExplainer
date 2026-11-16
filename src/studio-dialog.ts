// The window for sending a guide to OpenStage Studio as a script: which guide, and the four things only the author knows (the program, its version,
// the demo project the video starts from, and the goal). Nothing is made up for them. What is written is in `src/export/studio-script.ts`.
import { open } from "./dialogs.ts";
import { checkStudioOptions, type StudioOptions } from "./export/studio-script.ts";

export interface StudioChoice {
  guideId: string;
  options: StudioOptions;
}

export async function studioDialog(guides: { id: string; name: string }[], remembered: Partial<StudioOptions> = {}): Promise<StudioChoice | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "st-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="st-title">Send a guide to Studio</h2>
      <p>This makes a script file for OpenStage Studio: each numbered step becomes a step Studio performs in the program and narrates, found by the name of what was clicked.
        Open the file in Studio to check it, record it and make the video.</p>
      <p><label for="st-guide">Guide</label><br><select id="st-guide"></select></p>
      <p><label for="st-program">Program the guide is about (as it should be on the video's title card)</label><br><input id="st-program" type="text" size="40"></p>
      <p><label for="st-version">Program version (optional)</label><br><input id="st-version" type="text" size="12"></p>
      <p><label for="st-demo">Demo project the video starts from (a name in the program's demo library, not a file)</label><br><input id="st-demo" type="text" size="40"></p>
      <p><label for="st-goal">Goal: one line saying what a viewer can do after watching</label><br><input id="st-goal" type="text" size="60"></p>
      <p id="st-problem" role="alert"></p>
      <p><button value="cancel" formnovalidate>Cancel</button> <button value="ok" id="st-ok">Make the script...</button></p>
    </form>`;
  const $ = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const select = $<HTMLSelectElement>("st-guide");
  select.replaceChildren(...guides.map((g) => Object.assign(document.createElement("option"), { value: g.id, textContent: g.name })));
  $<HTMLInputElement>("st-program").value = remembered.programName ?? "";
  $<HTMLInputElement>("st-version").value = remembered.programVersion ?? "";
  $<HTMLInputElement>("st-demo").value = remembered.demoProject ?? "";
  $<HTMLInputElement>("st-goal").value = remembered.goal ?? "";
  const read = (): StudioOptions => ({
    programName: $<HTMLInputElement>("st-program").value,
    programVersion: $<HTMLInputElement>("st-version").value,
    demoProject: $<HTMLInputElement>("st-demo").value,
    goal: $<HTMLInputElement>("st-goal").value,
  });
  $<HTMLButtonElement>("st-ok").addEventListener("click", (event) => {
    const problem = checkStudioOptions(read());
    if (!problem) return;
    // The dialog stays open and says what is missing, then puts the keyboard in the box it is about.
    event.preventDefault();
    $("st-problem").textContent = problem;
    const box = /goal/i.test(problem) ? "st-goal" : /demo project/i.test(problem) ? "st-demo" : "st-program";
    $<HTMLInputElement>(box).focus();
  });
  await open(dialog, $<HTMLInputElement>("st-program"));
  if (dialog.returnValue !== "ok") return null;
  return { guideId: select.value, options: read() };
}
