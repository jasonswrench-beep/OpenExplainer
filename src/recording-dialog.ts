// The window for bringing in a recording made by OpenStage Recorder or OpenStage Author (the shared capture format).
// It shows what the recording holds in words, lets the author choose a take when there are several, and how many clicks to bring in.
// Everything it decides is in `src/capture/recording.ts`; this file only draws it. Escape and Cancel close it, and nothing happens until OK.
import { open } from "./dialogs.ts";
import type { Done } from "./capture/outcome.ts";
import { MOST_STEPS, describeLeftOut, describeRecording, stepLimit, takeWords, type RecordingInfo } from "./capture/recording.ts";

export interface RecordingChoice {
  /** The recording as read for the take that was chosen (its clicks are the ones to bring in). */
  info: RecordingInfo;
  /** The most clicks to bring in. */
  limit: number;
}

/**
 * `first` is the recording as first read (its newest usable take). `reread` reads it again for another take. Returns the author's choice,
 * or null when they cancel.
 */
export async function recordingDialog(first: RecordingInfo, reread: (take: number) => Promise<Done<RecordingInfo>>): Promise<RecordingChoice | null> {
  let info = first;
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "rec-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="rec-title">Bring in a recording</h2>
      <p id="rec-name"></p>
      <p id="rec-takes-row"><label for="rec-take">Take to bring in</label><br><select id="rec-take"></select></p>
      <p id="rec-summary" role="status" aria-live="polite"></p>
      <p id="rec-left-out"></p>
      <p id="rec-limit-row"><label for="rec-limit">Bring in the first this many clicks (1 to <span id="rec-most"></span>)</label><br>
        <input id="rec-limit" type="text" inputmode="numeric" size="6"></p>
      <p id="rec-limit-problem" role="alert"></p>
      <p>Each click becomes a picture of the screen a moment before the click, with a note of what was clicked. You can look at every one and leave some out before anything is added.</p>
      <p><button value="cancel">Cancel</button> <button value="ok" id="rec-ok">Bring in the pictures</button></p>
    </form>`;
  const $ = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const select = $<HTMLSelectElement>("rec-take");
  const limit = $<HTMLInputElement>("rec-limit");
  const ok = $<HTMLButtonElement>("rec-ok");

  const draw = () => {
    $("rec-name").textContent = info.title ? `Recording: ${info.title}` : "Recording";
    $("rec-summary").textContent = describeRecording(info);
    $("rec-left-out").textContent = describeLeftOut(info) ?? "";
    $("rec-most").textContent = String(Math.min(info.clicks.length, MOST_STEPS));
    const canBring = info.take !== null && info.clicks.length > 0;
    ok.disabled = !canBring;
    $("rec-limit-row").hidden = !canBring;
    limit.value = canBring ? String(stepLimit(info, null)) : "";
    $("rec-limit-problem").textContent = "";
  };

  // Only a take that can be used is offered; the others are still named in words so the author knows they were seen.
  const usable = info.takes.filter((t) => t.usable);
  select.replaceChildren(...info.takes.map((t) => {
    const option = document.createElement("option");
    option.value = String(t.id);
    option.textContent = takeWords(t);
    option.disabled = !t.usable;
    option.selected = t.id === info.take;
    return option;
  }));
  $("rec-takes-row").hidden = usable.length < 2 && info.takes.length < 2;
  select.addEventListener("change", async () => {
    const take = Number(select.value);
    $("rec-summary").textContent = "Reading take " + take + ".";
    const again = await reread(take);
    if (again.ok) info = again.value;
    else $("rec-summary").textContent = again.message;
    if (again.ok) draw();
  });

  const problem = (): { limit: number } | string => {
    const text = limit.value.trim();
    if (!/^\d+$/.test(text)) return `"${text}" is not a number. Type how many clicks to bring in, from 1 to ${Math.min(info.clicks.length, MOST_STEPS)}.`;
    const asked = Number(text);
    if (asked < 1 || asked > Math.min(info.clicks.length, MOST_STEPS)) return `${asked} is not from 1 to ${Math.min(info.clicks.length, MOST_STEPS)}.`;
    return { limit: asked };
  };
  ok.addEventListener("click", (event) => {
    const checked = problem();
    if (typeof checked === "string") {
      event.preventDefault();
      $("rec-limit-problem").textContent = checked;
      limit.focus();
    }
  });

  draw();
  await open(dialog, info.take !== null && info.clicks.length > 0 ? ok : dialog.querySelector<HTMLButtonElement>('button[value="cancel"]')!);
  if (dialog.returnValue !== "ok") return null;
  const checked = problem();
  return typeof checked === "string" ? null : { info, limit: checked.limit };
}
