import { cleanVariableName, CORE_VARIABLES, type Project } from "./project/model.ts";
import type { Done, ScreenInfo, WindowInfo } from "./capture/outcome.ts";
import { checkRegionInput, screenLabel, screenName, wholeScreen, type Region, type RegionInput } from "./capture/region.ts";
import type { Rect } from "./capture/selection.ts";

// Small accessible dialogs built on the browser's own <dialog>, which traps focus
// while open and closes with Escape. Focus goes back to where it was when they close.

function open(dialog: HTMLDialogElement, focusTarget: HTMLElement): Promise<void> {
  const returnTo = document.activeElement as HTMLElement | null;
  document.body.append(dialog);
  dialog.showModal();
  focusTarget.focus();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      dialog.remove();
      returnTo?.focus();
      resolve();
    });
  });
}

export async function promptText(title: string, label: string, initial = "", allowEmpty = false): Promise<string | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title"></h2>
      <p><label for="dlg-input"></label><br><input id="dlg-input" type="text" size="40"></p>
      <p><button value="ok">OK</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  dialog.querySelector("h2")!.textContent = title;
  dialog.querySelector("label")!.textContent = label;
  const input = dialog.querySelector<HTMLInputElement>("input")!;
  input.value = initial;
  const result = open(dialog, input);
  input.select();
  await result;
  const value = input.value.trim();
  if (dialog.returnValue !== "ok") return null;
  return value || allowEmpty ? value : null;
}

export async function confirmDialog(title: string, message: string, yesLabel: string): Promise<boolean> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.setAttribute("aria-describedby", "dlg-message");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title"></h2>
      <p id="dlg-message"></p>
      <p><button value="cancel">Cancel</button> <button value="yes"></button></p>
    </form>`;
  dialog.querySelector("h2")!.textContent = title;
  dialog.querySelector("#dlg-message")!.textContent = message;
  const yes = dialog.querySelector<HTMLButtonElement>('button[value="yes"]')!;
  yes.textContent = yesLabel;
  // Focus starts on Cancel so a stray Enter never deletes anything.
  await open(dialog, dialog.querySelector<HTMLButtonElement>('button[value="cancel"]')!);
  return dialog.returnValue === "yes";
}

export async function messageDialog(title: string, message: string): Promise<void> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.setAttribute("aria-describedby", "dlg-message");
  dialog.innerHTML = `<form method="dialog"><h2 id="dlg-title"></h2><p id="dlg-message"></p><p><button value="ok">OK</button></p></form>`;
  dialog.querySelector("h2")!.textContent = title;
  dialog.querySelector("#dlg-message")!.textContent = message;
  await open(dialog, dialog.querySelector("button")!);
}

export async function newProjectDialog(): Promise<{ name: string; template: Project["template"] } | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">New project</h2>
      <p><label for="np-name">Project name</label><br><input id="np-name" type="text" size="40" required></p>
      <p><label for="np-template">Start from</label><br>
        <select id="np-template">
          <option value="openstage-how-to-book">OpenStage how-to book (a few starter chapters)</option>
          <option value="software-user-guide">Software user guide (overview, installation, using, troubleshooting)</option>
          <option value="empty">Empty project</option>
        </select></p>
      <p><button value="ok">Create</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const input = dialog.querySelector<HTMLInputElement>("#np-name")!;
  const select = dialog.querySelector<HTMLSelectElement>("#np-template")!;
  await open(dialog, input);
  const name = input.value.trim();
  return dialog.returnValue === "ok" && name ? { name, template: select.value as Project["template"] } : null;
}

/** The spoken and written name of one open window: title first, then what and how big it is. */
export function windowLabel(w: WindowInfo): string {
  const notes = [`${w.process}`, `${w.width} by ${w.height} pixels`];
  if (w.minimized) notes.push("minimized, restore it first");
  if (w.not_responding) notes.push("not responding");
  return `${w.title} (${notes.join(", ")})`;
}

/** What the author chose in the Capture dialog. */
export type CaptureChoice =
  | { kind: "window"; window: WindowInfo; bringToFront: boolean }
  | { kind: "region"; screen: ScreenInfo; region: Region; left: number; top: number }
  /** The author wants to drag out a rectangle on a snapshot of the screen. `initial` is where the rectangle starts, counted from the screen's corner. */
  | { kind: "select"; screen: ScreenInfo; initial: Rect };

export interface CaptureDialogOptions {
  windows: WindowInfo[];
  /** Empty if the list of screens could not be read: then only a window can be captured. */
  screens: ScreenInfo[];
  /** Asks for the list of windows again, for the Refresh button. */
  refresh: () => Promise<Done<WindowInfo[]>>;
}

const REGION_BOXES: { id: string; field: keyof RegionInput; label: string }[] = [
  { id: "cr-left", field: "left", label: "Distance from the left edge, in pixels" },
  { id: "cr-top", field: "top", label: "Distance from the top edge, in pixels" },
  { id: "cr-width", field: "width", label: "Width, in pixels" },
  { id: "cr-height", field: "height", label: "Height, in pixels" },
];

/**
 * One dialog for both kinds of capture: a window from a list (a real list box, so arrow keys, typing a letter and a
 * screen reader all work), or a rectangle of a chosen screen typed as four numbers. A mistake is shown in the dialog,
 * next to the boxes, in plain words, and the dialog stays open so nothing typed is lost.
 */
export async function captureDialog(options: CaptureDialogOptions): Promise<CaptureChoice | null> {
  const { screens } = options;
  let windows = options.windows;
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">Capture</h2>
      <fieldset>
        <legend>What do you want to capture?</legend>
        <p><label><input type="radio" name="cap-what" value="window" id="cap-what-window"> A window</label></p>
        <p><label><input type="radio" name="cap-what" value="region" id="cap-what-region"> A rectangle of the screen</label></p>
      </fieldset>
      <div id="cap-window">
        <p id="cw-help" class="help">Choose the window to capture. OpenExplainer hides while it captures, so it is never in the picture,
          and a window that other windows cover can still be captured. A minimized window has to be restored first.</p>
        <p><label for="cw-list">Open windows</label><br>
          <select id="cw-list" size="10" aria-describedby="cw-help"></select></p>
        <p id="cw-none" class="help" hidden>No open windows were found.</p>
        <p><button type="button" id="cw-refresh">Refresh the list</button></p>
        <p><label><input type="checkbox" id="cw-front" aria-describedby="cw-front-help"> Bring the window to the front first</label><br>
          <span id="cw-front-help" class="help">A window that is not the active one is drawn with a grey title bar. Bringing it to the front first
            draws it as the active window, but it changes which window is on top. A capture is normally over in a fraction of a second.
            If one is taking longer, press the Cancel button in the small Cancel window, because the keyboard is then with the other window.</span></p>
      </div>
      <div id="cap-region" hidden>
        <p id="cr-help" class="help">Pick the screen, then the rectangle, counted in pixels from the top left corner of that screen.</p>
        <p><label for="cr-screen">Screen</label><br><select id="cr-screen" aria-describedby="cr-help"></select></p>
        ${REGION_BOXES.map((b) => `<p><label for="${b.id}">${b.label}</label><br><input id="${b.id}" type="text" inputmode="numeric" size="8" autocomplete="off" aria-describedby="cap-error"></p>`).join("")}
        <p><button type="button" id="cr-whole">Use the whole screen</button></p>
        <p><button type="button" id="cr-select" aria-describedby="cr-select-help">Select on the screen</button><br>
          <span id="cr-select-help" class="help">Takes a snapshot of the screen you chose and shows it full screen. Drag out the rectangle with the mouse,
            or use the arrow keys or the four number boxes there. The picture is cut from that snapshot.</span></p>
      </div>
      <p id="cap-status" class="visually-hidden" role="status"></p>
      <p id="cap-error" class="error" role="alert"></p>
      <p><button value="capture" id="cw-capture">Capture</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const $ = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const radioWindow = $<HTMLInputElement>("#cap-what-window");
  const radioRegion = $<HTMLInputElement>("#cap-what-region");
  const list = $<HTMLSelectElement>("#cw-list");
  const front = $<HTMLInputElement>("#cw-front");
  const screenSelect = $<HTMLSelectElement>("#cr-screen");
  const boxes = REGION_BOXES.map((b) => ({ ...b, input: $<HTMLInputElement>(`#${b.id}`) }));
  let chosen: CaptureChoice | null = null;
  const errorEl = $<HTMLElement>("#cap-error");
  const statusEl = $<HTMLElement>("#cap-status");

  const say = (text: string) => { statusEl.textContent = ""; setTimeout(() => (statusEl.textContent = text), 30); };
  const clearError = () => {
    errorEl.textContent = "";
    boxes.forEach((b) => b.input.removeAttribute("aria-invalid"));
  };
  const problem = (message: string, focus: HTMLElement) => {
    errorEl.textContent = `Problem: ${message}`;
    focus.focus();
  };

  function fillWindows() {
    list.replaceChildren();
    windows.forEach((w, i) => {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = windowLabel(w);
      list.append(option);
    });
    list.disabled = windows.length === 0;
    $<HTMLElement>("#cw-none").hidden = windows.length > 0;
    if (windows.length) list.selectedIndex = 0;
  }
  fillWindows();

  screens.forEach((s, i) => {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = screenLabel(s);
    screenSelect.append(option);
  });
  const chosenScreen = () => screens[screenSelect.selectedIndex] ?? screens[0];
  if (screens.length) {
    const s = chosenScreen();
    const start: RegionInput = { left: "0", top: "0", width: String(Math.min(800, s.width)), height: String(Math.min(600, s.height)) };
    boxes.forEach((b) => (b.input.value = start[b.field]));
  } else {
    radioRegion.disabled = true;
    radioRegion.setAttribute("aria-describedby", "cap-error");
  }

  function showMode() {
    const region = radioRegion.checked;
    $<HTMLElement>("#cap-window").hidden = region;
    $<HTMLElement>("#cap-region").hidden = !region;
    clearError();
  }
  const startWithWindow = windows.length > 0 || screens.length === 0;
  (startWithWindow ? radioWindow : radioRegion).checked = true;
  showMode();
  radioWindow.addEventListener("change", showMode);
  radioRegion.addEventListener("change", showMode);

  $<HTMLButtonElement>("#cr-whole").addEventListener("click", () => {
    const s = chosenScreen();
    const whole = wholeScreen(s);
    boxes.forEach((b) => (b.input.value = whole[b.field]));
    clearError();
    say(`The whole of ${screenName(s)} is filled in: ${s.width} by ${s.height} pixels.`);
  });
  boxes.forEach((b) => b.input.addEventListener("input", clearError));

  // Choosing on a snapshot starts from the numbers in the boxes if they make a good rectangle, and from a sensible one if not.
  $<HTMLButtonElement>("#cr-select").addEventListener("click", () => {
    const screen = chosenScreen();
    const typed = checkRegionInput(screen, Object.fromEntries(boxes.map((b) => [b.field, b.input.value])) as unknown as RegionInput);
    const initial: Rect = typed.ok
      ? { left: typed.region.x - screen.x, top: typed.region.y - screen.y, width: typed.region.width, height: typed.region.height }
      : { left: Math.round(screen.width * 0.3), top: Math.round(screen.height * 0.3), width: Math.round(screen.width * 0.4), height: Math.round(screen.height * 0.4) }; // a smaller one in the middle, so a new one is easy to drag outside it
    chosen = { kind: "select", screen, initial };
    dialog.close("select");
  });

  const refresh = $<HTMLButtonElement>("#cw-refresh");
  refresh.addEventListener("click", async () => {
    clearError();
    refresh.disabled = true;
    say("Looking for open windows.");
    const answer = await options.refresh();
    refresh.disabled = false;
    if (!answer.ok) return problem(answer.message, refresh);
    windows = answer.value;
    fillWindows();
    say(`The list was refreshed: ${windows.length} open ${windows.length === 1 ? "window" : "windows"}.`);
  });

  const form = $<HTMLFormElement>("form");
  form.addEventListener("submit", (event) => {
    // The dialog only closes when the choice is complete, so a mistake never costs the author what they typed.
    event.preventDefault();
    const pressed = (event.submitter as HTMLButtonElement | null)?.value;
    if (pressed === "cancel") return dialog.close("cancel");
    clearError();
    if (radioWindow.checked) {
      const window = windows[list.selectedIndex];
      if (!window) return problem("Choose a window from the list first.", list.disabled ? refresh : list);
      chosen = { kind: "window", window, bringToFront: front.checked };
      return dialog.close("capture");
    }
    const screen = chosenScreen();
    const checked = checkRegionInput(screen, Object.fromEntries(boxes.map((b) => [b.field, b.input.value])) as unknown as RegionInput);
    if (!checked.ok) {
      const box = boxes.find((b) => b.field === checked.field)!;
      box.input.setAttribute("aria-invalid", "true");
      return problem(checked.message, box.input);
    }
    chosen = {
      kind: "region", screen, region: checked.region,
      left: checked.region.x - screen.x, top: checked.region.y - screen.y,
    };
    dialog.close("capture");
  });

  await open(dialog, startWithWindow ? radioWindow : radioRegion);
  return dialog.returnValue === "capture" || dialog.returnValue === "select" ? chosen : null;
}

export async function variablesDialog(variables: Record<string, string>): Promise<Record<string, string> | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  const rows = Object.keys(variables)
    .map((name, i) => {
      const core = CORE_VARIABLES.includes(name);
      return `<p><label for="v-${i}">${name}</label><br>
        <input id="v-${i}" data-name="${name}" type="text" size="40">
        ${core ? "" : `<label><input type="checkbox" data-remove="${name}"> Remove ${name}</label>`}</p>`;
    })
    .join("");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">Project variables</h2>
      <p>Write {{NAME}} in your text. It is replaced with the value when you export.</p>
      ${rows}
      <p><label for="v-new-name">New variable name (optional)</label><br><input id="v-new-name" type="text" size="24"></p>
      <p><label for="v-new-value">Its value</label><br><input id="v-new-value" type="text" size="40"></p>
      <p><button value="ok">OK</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  dialog.querySelectorAll<HTMLInputElement>("input[data-name]").forEach((el) => (el.value = variables[el.dataset.name!]));
  await open(dialog, dialog.querySelector<HTMLInputElement>("input[data-name]")!);
  if (dialog.returnValue !== "ok") return null;
  const result: Record<string, string> = {};
  dialog.querySelectorAll<HTMLInputElement>("input[data-name]").forEach((el) => {
    const name = el.dataset.name!;
    if (!dialog.querySelector<HTMLInputElement>(`input[data-remove="${name}"]`)?.checked) result[name] = el.value;
  });
  const newName = cleanVariableName(dialog.querySelector<HTMLInputElement>("#v-new-name")!.value);
  if (newName) result[newName] = dialog.querySelector<HTMLInputElement>("#v-new-value")!.value;
  return result;
}
