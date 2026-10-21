import { cleanVariableName, CORE_VARIABLES, type Project } from "./project/model.ts";
import type { Done, ScreenInfo, WindowInfo } from "./capture/outcome.ts";
import { checkRegionInput, screenLabel, screenName, wholeScreen, type Region, type RegionInput } from "./capture/region.ts";
import type { Rect } from "./capture/selection.ts";
import { checkWait } from "./capture/wait.ts";
import { describeShot, type ClickShot } from "./capture/clicks.ts";
import { discardQuestion, type ReviewAnswer } from "./capture/review.ts";
import { marksOverlay } from "./picture-marks.ts";
import { checkCropInput, checkZoomInput, shownPart, ZOOM_LIMITS, type PictureView, type Rect as ShownRect, type ZoomSettings } from "./project/views.ts";
import {
  calloutFromClick, checkCalloutInput, clipToPicture, letterFor, newCalloutFromClick, placeMarker, type Callout, type CalloutField, type CalloutInput,
} from "./project/callouts.ts";
import { newId } from "./project/ids.ts";
import type { Picture } from "./project/model.ts";
import {
  checkPosition, checkStyleInput, circleSize, COLOR_PRESETS, HIGHLIGHT_KINDS, normalizeColor, type HighlightSettings, type HighlightKind,
} from "./project/highlight.ts";

// Small accessible dialogs built on the browser's own <dialog>, which traps focus
// while open and closes with Escape. Focus goes back to where it was when they close.

/**
 * The controls a person can reach with Tab inside a dialog, in order. A group of radio buttons is one stop (the chosen one), as the browser
 * does it. Hidden and disabled controls are left out.
 */
function tabStops(dialog: HTMLDialogElement): HTMLElement[] {
  const stops = [...dialog.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")].filter((el) => {
    if ((el as HTMLButtonElement).disabled || el.getAttribute("tabindex") === "-1" || (el as HTMLInputElement).type === "hidden") return false;
    return !el.closest("[hidden]") && el.getClientRects().length > 0;
  });
  return stops.filter((el) => {
    const radio = el as HTMLInputElement;
    if (radio.type !== "radio") return true;
    const group = stops.filter((other) => (other as HTMLInputElement).type === "radio" && (other as HTMLInputElement).name === radio.name) as HTMLInputElement[];
    const chosen = group.find((r) => r.checked);
    return chosen ? chosen === radio : group[0] === radio;
  });
}

/**
 * Tab from the last control goes to the first, and Shift+Tab from the first goes to the last. Without this, a dialog in the app's window has
 * one stop on nothing at all between the end and the start, where a screen reader has no control to read.
 */
function wrapTab(dialog: HTMLDialogElement) {
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || event.ctrlKey || event.altKey || event.metaKey) return;
    const stops = tabStops(dialog);
    if (stops.length === 0) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  });
}

function open(dialog: HTMLDialogElement, focusTarget: HTMLElement): Promise<void> {
  const returnTo = document.activeElement as HTMLElement | null;
  document.body.append(dialog);
  wrapTab(dialog);
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
  | { kind: "window"; window: WindowInfo; bringToFront: boolean; waitSeconds: number }
  | { kind: "region"; screen: ScreenInfo; region: Region; left: number; top: number; waitSeconds: number }
  /** The author wants to drag out a rectangle on a snapshot of the screen. `initial` is where the rectangle starts, counted from the screen's corner. */
  | { kind: "select"; screen: ScreenInfo; initial: Rect; waitSeconds: number }
  /** The author wants every click captured, with a picture of the whole screen for each, until they press Stop. */
  | { kind: "clicks" };

export interface CaptureDialogOptions {
  windows: WindowInfo[];
  /** Empty if the list of screens could not be read: then only a window can be captured. */
  screens: ScreenInfo[];
  /** Asks for the list of windows again, for the Refresh button. */
  refresh: () => Promise<Done<WindowInfo[]>>;
}

/** The wait the author used last, offered again the next time the dialog opens in this session. */
let lastWait = "0";

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
        <p><label><input type="radio" name="cap-what" value="clicks" id="cap-what-clicks"> Click by click</label></p>
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
      <div id="cap-clicks" hidden>
        <p id="cc-help" class="help">OpenExplainer hides and a small Stop window shows. Then click through your steps in the other program.
          Every click is captured as a picture of the whole screen, taken just before the program reacts, with a note of what was clicked.
          Press Stop when you are finished. You then review the clicks, keep the ones you want and describe each picture.</p>
        <ul class="help" aria-label="What is and is not recorded">
          <li>Only mouse clicks are recorded. The keyboard is never watched, and what you type is never recorded.</li>
          <li>A click on a password box is noted only as "a password box".</li>
          <li>The name of what you clicked is kept for buttons, menus and similar controls, but not for list items, text boxes,
            documents, tabs or links, because those names can be private.</li>
          <li>The pictures show everything on your screen. They are only kept in the project if you keep them.</li>
          <li>It stops by itself after 10 minutes with no click, or at 200 clicks. You keep the clicks it has captured.</li>
        </ul>
      </div>
      <p id="cap-wait-box"><label for="cap-wait">Wait before capturing, in seconds</label><br>
        <input id="cap-wait" type="text" inputmode="numeric" size="4" autocomplete="off" aria-describedby="cap-wait-help"><br>
        <span id="cap-wait-help" class="help">0 captures straight away. A wait lets you get another program ready, for example to open a menu:
          OpenExplainer hides, a small Cancel window counts down, and the capture happens when it reaches 0. A menu is a window of its own,
          so capture it as a rectangle, or with Select on the screen. A capture of a window leaves a menu out.</span></p>
      <p id="cap-status" class="visually-hidden" role="status"></p>
      <p id="cap-error" class="error" role="alert"></p>
      <p><button value="capture" id="cw-capture">Capture</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const $ = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const radioWindow = $<HTMLInputElement>("#cap-what-window");
  const radioRegion = $<HTMLInputElement>("#cap-what-region");
  const radioClicks = $<HTMLInputElement>("#cap-what-clicks");
  const list = $<HTMLSelectElement>("#cw-list");
  const front = $<HTMLInputElement>("#cw-front");
  const screenSelect = $<HTMLSelectElement>("#cr-screen");
  const boxes = REGION_BOXES.map((b) => ({ ...b, input: $<HTMLInputElement>(`#${b.id}`) }));
  let chosen: CaptureChoice | null = null;
  const waitBox = $<HTMLInputElement>("#cap-wait");
  waitBox.value = lastWait;
  const errorEl = $<HTMLElement>("#cap-error");
  const statusEl = $<HTMLElement>("#cap-status");

  const say = (text: string) => { statusEl.textContent = ""; setTimeout(() => (statusEl.textContent = text), 30); };
  const clearError = () => {
    errorEl.textContent = "";
    boxes.forEach((b) => b.input.removeAttribute("aria-invalid"));
    waitBox.removeAttribute("aria-invalid");
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
    const clicks = radioClicks.checked;
    $<HTMLElement>("#cap-window").hidden = region || clicks;
    $<HTMLElement>("#cap-region").hidden = !region;
    $<HTMLElement>("#cap-clicks").hidden = !clicks;
    // Watching starts at once, so there is nothing to wait for.
    $<HTMLElement>("#cap-wait-box").hidden = clicks;
    $<HTMLButtonElement>("#cw-capture").textContent = clicks ? "Start capturing clicks" : "Capture";
    clearError();
  }
  const startWithWindow = windows.length > 0 || screens.length === 0;
  (startWithWindow ? radioWindow : radioRegion).checked = true;
  showMode();
  radioWindow.addEventListener("change", showMode);
  radioRegion.addEventListener("change", showMode);
  radioClicks.addEventListener("change", showMode);

  $<HTMLButtonElement>("#cr-whole").addEventListener("click", () => {
    const s = chosenScreen();
    const whole = wholeScreen(s);
    boxes.forEach((b) => (b.input.value = whole[b.field]));
    clearError();
    say(`The whole of ${screenName(s)} is filled in: ${s.width} by ${s.height} pixels.`);
  });
  boxes.forEach((b) => b.input.addEventListener("input", clearError));
  waitBox.addEventListener("input", clearError);

  /** The wait, or `null` (after explaining what is wrong and moving to the box) if what was typed is not a good wait. */
  function readWait(): number | null {
    const checked = checkWait(waitBox.value);
    if (checked.ok) {
      lastWait = String(checked.seconds);
      return checked.seconds;
    }
    waitBox.setAttribute("aria-invalid", "true");
    problem(checked.message, waitBox);
    return null;
  }

  // Choosing on a snapshot starts from the numbers in the boxes if they make a good rectangle, and from a sensible one if not.
  $<HTMLButtonElement>("#cr-select").addEventListener("click", () => {
    clearError();
    const waitSeconds = readWait();
    if (waitSeconds === null) return;
    const screen = chosenScreen();
    const typed = checkRegionInput(screen, Object.fromEntries(boxes.map((b) => [b.field, b.input.value])) as unknown as RegionInput);
    const initial: Rect = typed.ok
      ? { left: typed.region.x - screen.x, top: typed.region.y - screen.y, width: typed.region.width, height: typed.region.height }
      : { left: Math.round(screen.width * 0.3), top: Math.round(screen.height * 0.3), width: Math.round(screen.width * 0.4), height: Math.round(screen.height * 0.4) }; // a smaller one in the middle, so a new one is easy to drag outside it
    chosen = { kind: "select", screen, initial, waitSeconds };
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
    if (radioClicks.checked) {
      chosen = { kind: "clicks" };
      return dialog.close("capture");
    }
    if (radioWindow.checked) {
      const window = windows[list.selectedIndex];
      if (!window) return problem("Choose a window from the list first.", list.disabled ? refresh : list);
      const waitSeconds = readWait();
      if (waitSeconds === null) return;
      chosen = { kind: "window", window, bringToFront: front.checked, waitSeconds };
      return dialog.close("capture");
    }
    const screen = chosenScreen();
    const checked = checkRegionInput(screen, Object.fromEntries(boxes.map((b) => [b.field, b.input.value])) as unknown as RegionInput);
    if (!checked.ok) {
      const box = boxes.find((b) => b.field === checked.field)!;
      box.input.setAttribute("aria-invalid", "true");
      return problem(checked.message, box.input);
    }
    const waitSeconds = readWait();
    if (waitSeconds === null) return;
    chosen = {
      kind: "region", screen, region: checked.region,
      left: checked.region.x - screen.x, top: checked.region.y - screen.y, waitSeconds,
    };
    dialog.close("capture");
  });

  await open(dialog, startWithWindow ? radioWindow : radioRegion);
  return dialog.returnValue === "capture" || dialog.returnValue === "select" ? chosen : null;
}

/**
 * The review list after a click-by-click capture: every click in order, with its picture, the click in words, a "Keep" tick (ticked) and a
 * description box that starts EMPTY. The button beside the box fills it with the click's words, but only when the author presses it.
 * Returns one answer per click, in the same order, or `null` if the author threw them all away (asked once more first, because the clicks
 * only exist in memory). `notices` are plain-words facts to read first, such as why the session ended early.
 */
export async function reviewClicksDialog(shots: ClickShot[], notices: string[]): Promise<ReviewAnswer[] | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">Review your clicks</h2>
      <p id="rv-intro" class="help"></p>
      <p id="rv-notices" class="help" hidden></p>
      <p id="rv-status" class="visually-hidden" role="status"></p>
      <ol id="rv-list" class="click-review"></ol>
      <p><button value="ok" id="rv-ok">Add the kept pictures</button> <button value="cancel" id="rv-cancel" formnovalidate>Throw them all away</button></p>
    </form>`;
  const total = shots.length;
  dialog.querySelector("#rv-intro")!.textContent = `${total} click${total === 1 ? " was" : "s were"} captured. Keep the ones you want and describe each picture. ` +
    "A description is read aloud by a screen reader. Leave it empty to add it later; it is never filled in for you.";
  if (notices.length) {
    const el = dialog.querySelector<HTMLElement>("#rv-notices")!;
    el.hidden = false;
    el.textContent = notices.join(" ");
  }
  const status = dialog.querySelector<HTMLElement>("#rv-status")!;
  const say = (text: string) => { status.textContent = ""; setTimeout(() => (status.textContent = text), 30); };
  const urls: string[] = [];
  const rows = shots.map((shot, i) => {
    const n = i + 1;
    const words = describeShot(shot);
    const url = URL.createObjectURL(new Blob([shot.bytes as BlobPart], { type: shot.extension === "png" ? "image/png" : "image/jpeg" }));
    urls.push(url);
    const li = document.createElement("li");
    li.innerHTML = `
      <h3 id="rv-h-${n}"></h3>
      <p><img id="rv-img-${n}" alt="" width="${Math.min(shot.width, 352)}"></p>
      <p><label><input type="checkbox" id="rv-keep-${n}" checked> Keep click ${n}</label></p>
      <p><label for="rv-desc-${n}">Description of the picture for click ${n}</label><br>
        <input id="rv-desc-${n}" type="text" size="55" autocomplete="off" aria-describedby="rv-h-${n}">
        <button type="button" id="rv-use-${n}" aria-label="Use the click's words as the description for click ${n}">Use the click's words</button></p>
      <p id="rv-note-${n}" class="help" hidden></p>`;
    li.querySelector(`#rv-h-${n}`)!.textContent = `Click ${n}: ${words}`;
    const img = li.querySelector<HTMLImageElement>(`#rv-img-${n}`)!;
    img.src = url;
    img.alt = `The screen just before click ${n}`;
    if (shot.note) {
      const note = li.querySelector<HTMLElement>(`#rv-note-${n}`)!;
      note.hidden = false;
      note.textContent = `Note: ${shot.note}`;
    }
    const keep = li.querySelector<HTMLInputElement>(`#rv-keep-${n}`)!;
    const description = li.querySelector<HTMLInputElement>(`#rv-desc-${n}`)!;
    keep.addEventListener("change", () => {
      li.classList.toggle("left-out", !keep.checked);
      say(keep.checked ? `Click ${n} will be kept.` : `Click ${n} will be left out.`);
    });
    // Enter in a description moves on to the next one (and finally to the OK button). It must not press OK, which would add everything.
    description.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      (dialog.querySelector<HTMLElement>(`#rv-desc-${n + 1}`) ?? dialog.querySelector<HTMLElement>("#rv-ok")!).focus();
    });
    li.querySelector<HTMLButtonElement>(`#rv-use-${n}`)!.addEventListener("click", () => {
      description.value = words;
      description.focus();
      description.select();
      say(`The description for click ${n} was filled in with the click's words. You can change it.`);
    });
    dialog.querySelector("#rv-list")!.append(li);
    return { keep, description };
  });

  // The clicks only exist in memory, so throwing them away is asked about once more. Escape and the button both ask.
  let asking = false;
  async function askToDiscard() {
    if (asking) return;
    asking = true;
    const yes = await confirmDialog("Throw away the clicks?", discardQuestion(total), "Throw them away");
    asking = false;
    if (yes) dialog.close("cancel");
  }
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); void askToDiscard(); });
  dialog.querySelector<HTMLFormElement>("form")!.addEventListener("submit", (event) => {
    if ((event.submitter as HTMLButtonElement | null)?.value === "cancel") {
      event.preventDefault();
      void askToDiscard();
    }
  });

  try {
    await open(dialog, dialog.querySelector<HTMLElement>("#rv-desc-1") ?? dialog.querySelector<HTMLElement>("#rv-ok")!);
    return dialog.returnValue === "ok" ? rows.map((r) => ({ keep: r.keep.checked, description: r.description.value })) : null;
  } finally {
    urls.forEach((u) => URL.revokeObjectURL(u));
  }
}

const SVG = "http://www.w3.org/2000/svg";

/**
 * The settings for the click circle: for each place a picture is used (the book, a quick guide), whether the circle is drawn, how big,
 * what colour and how see-through. A mistake is explained in plain words next to the boxes and the dialog stays open. Returns the new
 * settings, or `null` if the author cancelled.
 */
export async function highlightDialog(settings: HighlightSettings): Promise<HighlightSettings | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">Click circle settings</h2>
      <p class="help">A transparent circle can be drawn on the spot of every click, so the reader sees where to click. It is drawn from the
        click's position, never into the picture, so it can be turned on, off or moved later. These settings are kept in the project, one set
        for each place a picture is used. One picture can also be set to always or never show its circle.</p>
      <div id="hl-groups"></div>
      <p id="hl-status" class="visually-hidden" role="status"></p>
      <p id="hl-error" class="error" role="alert"></p>
      <p><button value="ok">Save the settings</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const errorEl = dialog.querySelector<HTMLElement>("#hl-error")!;
  const statusEl = dialog.querySelector<HTMLElement>("#hl-status")!;
  const say = (text: string) => { statusEl.textContent = ""; setTimeout(() => (statusEl.textContent = text), 30); };
  const OTHER = "other";
  const groups = HIGHLIGHT_KINDS.map(({ id, name }) => {
    const style = settings[id];
    const fieldset = document.createElement("fieldset");
    fieldset.innerHTML = `
      <legend>${name}</legend>
      <p><label><input type="checkbox" id="hl-${id}-show"> Show the click circle in the ${name.toLowerCase()}</label></p>
      <p><label for="hl-${id}-size">Size, as a percent of the picture's width (1 to 20)</label><br>
        <input type="text" id="hl-${id}-size" size="6" inputmode="decimal" autocomplete="off" aria-describedby="hl-error"></p>
      <p><label for="hl-${id}-color">Colour, as six hex digits such as FFD600</label><br>
        <input type="text" id="hl-${id}-color" size="10" autocomplete="off" aria-describedby="hl-error">
        <label for="hl-${id}-preset">or choose a ready-made colour</label>
        <select id="hl-${id}-preset"></select></p>
      <p><label for="hl-${id}-see">See-through level, in percent (0 is solid, 100 cannot be seen)</label><br>
        <input type="text" id="hl-${id}-see" size="6" inputmode="decimal" autocomplete="off" aria-describedby="hl-error"></p>
      <p class="help">A sample (the picture here is only a drawing):<br>
        <svg id="hl-${id}-sample" viewBox="0 0 240 135" width="240" height="135" role="img" aria-label="A sample of the circle on a picture" focusable="false"></svg></p>`;
    const q = <T extends HTMLElement>(suffix: string) => fieldset.querySelector<T>(`#hl-${id}-${suffix}`)!;
    const show = q<HTMLInputElement>("show");
    const size = q<HTMLInputElement>("size");
    const color = q<HTMLInputElement>("color");
    const preset = q<HTMLSelectElement>("preset");
    const see = q<HTMLInputElement>("see");
    const sample = q<HTMLElement>("sample");
    show.checked = style.show;
    size.value = String(style.size);
    color.value = style.color.slice(1);
    see.value = String(style.seeThrough);
    for (const p of COLOR_PRESETS) {
      const option = document.createElement("option");
      option.value = p.code;
      option.textContent = p.name;
      preset.append(option);
    }
    const other = document.createElement("option");
    other.value = OTHER;
    other.textContent = "Other (type the code)";
    preset.append(other);
    const syncPreset = () => { const code = normalizeColor(color.value); preset.value = code && COLOR_PRESETS.some((p) => p.code === code) ? code : OTHER; };
    syncPreset();
    // The sample draws the circle as it is typed, using the same rules as the real one: a size in percent of the width, a level of see-through.
    const drawSample = () => {
      sample.replaceChildren();
      const picture = document.createElementNS(SVG, "rect");
      for (const [k, v] of Object.entries({ x: "0", y: "0", width: "240", height: "135", fill: "#dde5ee" })) picture.setAttribute(k, v);
      sample.append(picture);
      for (const [y, w] of [[30, 150], [50, 110], [95, 130]]) {
        const line = document.createElementNS(SVG, "rect");
        for (const [k, v] of Object.entries({ x: "30", y: String(y), width: String(w), height: "10", fill: "#9fb0c4" })) line.setAttribute(k, v);
        sample.append(line);
      }
      const checked = checkStyleInput({ show: show.checked, size: size.value, color: color.value, seeThrough: see.value });
      const look = checked.ok ? checked.style : settings[id];
      const circle = document.createElementNS(SVG, "circle");
      const { r } = circleSize(look, 240);
      for (const [k, v] of Object.entries({ cx: "105", cy: "55", r: String(r), fill: look.color, "fill-opacity": String(1 - look.seeThrough / 100) })) circle.setAttribute(k, v);
      sample.append(circle);
    };
    drawSample();
    preset.addEventListener("change", () => { if (preset.value !== OTHER) color.value = preset.value.slice(1); drawSample(); });
    for (const input of [show, size, color, see]) {
      input.addEventListener("input", () => {
        errorEl.textContent = "";
        [size, color, see].forEach((el) => el.removeAttribute("aria-invalid"));
        if (input === color) syncPreset();
        drawSample();
      });
    }
    dialog.querySelector("#hl-groups")!.append(fieldset);
    return { id, name, show, size, color, see };
  });

  let result: HighlightSettings | null = null;
  dialog.querySelector<HTMLFormElement>("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    if ((event.submitter as HTMLButtonElement | null)?.value === "cancel") return dialog.close("cancel");
    const next: Partial<Record<HighlightKind, HighlightSettings[HighlightKind]>> = {};
    for (const g of groups) {
      const checked = checkStyleInput({ show: g.show.checked, size: g.size.value, color: g.color.value, seeThrough: g.see.value });
      if (!checked.ok) {
        const box = checked.field === "size" ? g.size : checked.field === "color" ? g.color : g.see;
        box.setAttribute("aria-invalid", "true");
        errorEl.textContent = `Problem in the ${g.name.toLowerCase()} settings: ${checked.message}`;
        box.focus();
        return;
      }
      next[g.id] = checked.style;
    }
    result = { book: next.book!, guide: next.guide! };
    say("The settings were saved.");
    dialog.close("ok");
  });
  await open(dialog, dialog.querySelector<HTMLElement>("#hl-book-show")!);
  return dialog.returnValue === "ok" ? result : null;
}

/** What the author chose in the dialog for moving one picture's circle. */
export type MoveCircleChoice = { kind: "move"; x: number; y: number } | { kind: "reset" };

/**
 * Moves the click circle of one picture: two numbers, counted in pixels from the picture's top left corner. The click itself stays recorded
 * where it was. The author can also put the circle back on the click. Returns `null` if they cancelled.
 */
export async function moveCircleDialog(options: { width: number; height: number; x: number; y: number; moved: boolean; clickWords: string }): Promise<MoveCircleChoice | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">Move the click circle</h2>
      <p class="help" id="mc-help"></p>
      <p><label for="mc-x">How far across, in pixels</label><br><input type="text" id="mc-x" size="8" inputmode="numeric" autocomplete="off" aria-describedby="mc-error"></p>
      <p><label for="mc-y">How far down, in pixels</label><br><input type="text" id="mc-y" size="8" inputmode="numeric" autocomplete="off" aria-describedby="mc-error"></p>
      <p id="mc-error" class="error" role="alert"></p>
      <p><button value="ok">Move the circle</button> <button value="reset" formnovalidate>Put it back on the click</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  dialog.querySelector("#mc-help")!.textContent =
    `${options.clickWords} The click stays recorded where it was; only the circle moves. Numbers count from the top left corner of the picture, which is ${options.width} by ${options.height} pixels.`;
  const x = dialog.querySelector<HTMLInputElement>("#mc-x")!;
  const y = dialog.querySelector<HTMLInputElement>("#mc-y")!;
  const errorEl = dialog.querySelector<HTMLElement>("#mc-error")!;
  x.value = String(options.x);
  y.value = String(options.y);
  for (const box of [x, y]) box.addEventListener("input", () => { errorEl.textContent = ""; x.removeAttribute("aria-invalid"); y.removeAttribute("aria-invalid"); });
  let choice: MoveCircleChoice | null = null;
  dialog.querySelector<HTMLFormElement>("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    const pressed = (event.submitter as HTMLButtonElement | null)?.value;
    if (pressed === "cancel") return dialog.close("cancel");
    if (pressed === "reset") { choice = { kind: "reset" }; return dialog.close("reset"); }
    const checked = checkPosition({ x: x.value, y: y.value }, options.width, options.height);
    if (!checked.ok) {
      const box = checked.field === "x" ? x : y;
      box.setAttribute("aria-invalid", "true");
      errorEl.textContent = `Problem: ${checked.message}`;
      return box.focus();
    }
    choice = { kind: "move", x: checked.x, y: checked.y };
    dialog.close("ok");
  });
  await open(dialog, x);
  return dialog.returnValue === "ok" || dialog.returnValue === "reset" ? choice : null;
}

const CALLOUT_BOXES: { field: CalloutField; label: string; size: number }[] = [
  { field: "left", label: "Item: how far across it starts", size: 6 },
  { field: "top", label: "Item: how far down it starts", size: 6 },
  { field: "width", label: "Item: width", size: 6 },
  { field: "height", label: "Item: height", size: 6 },
  { field: "markerX", label: "Marker: how far across", size: 6 },
  { field: "markerY", label: "Marker: how far down", size: 6 },
];

/**
 * The lettered callouts of one picture. Each is a marker with a leader line to the part of the picture it names, and an entry under the picture
 * (its letter, its name and a sentence). Everything is typed, in pixels from the picture's top left corner, and a sample of the picture with the
 * callouts on it follows what is typed. A mistake is explained next to the box in plain words and the dialog stays open. Nothing changes until
 * the author presses Save; Cancel leaves the callouts as they were. Returns the new list, or `null` if cancelled.
 */
export async function calloutsDialog(picture: Picture, imageUrl: string | null): Promise<Callout[] | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">Callouts</h2>
      <p class="help" id="co-help"></p>
      <div id="co-preview"></div>
      <p id="co-status" class="visually-hidden" role="status"></p>
      <div id="co-rows"></div>
      <p><button type="button" id="co-add">Add a callout</button> <button type="button" id="co-click">Make a callout from the click</button></p>
      <p id="co-error" class="error" role="alert"></p>
      <p><button value="ok">Save the callouts</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const size = { width: picture.width, height: picture.height };
  dialog.querySelector("#co-help")!.textContent =
    "A callout is a lettered marker with a line to the part of the picture it names. Under the picture it gets an entry: its letter, its name and a sentence. " +
    `Numbers count in pixels from the top left corner of the picture, which is ${picture.width} by ${picture.height} pixels. Moving or deleting a callout re-letters the others.`;
  const working: Callout[] = (picture.callouts ?? []).map((c) => ({ ...c, target: { ...c.target }, marker: { ...c.marker } }));
  const errorEl = dialog.querySelector<HTMLElement>("#co-error")!;
  const statusEl = dialog.querySelector<HTMLElement>("#co-status")!;
  const say = (text: string) => { statusEl.textContent = ""; setTimeout(() => (statusEl.textContent = text), 30); };
  const rowsEl = dialog.querySelector<HTMLElement>("#co-rows")!;
  const previewEl = dialog.querySelector<HTMLElement>("#co-preview")!;
  const clearErrors = () => { errorEl.textContent = ""; rowsEl.querySelectorAll("[aria-invalid]").forEach((e) => e.removeAttribute("aria-invalid")); };

  function drawPreview() {
    previewEl.replaceChildren();
    if (!imageUrl) return;
    const box = document.createElement("span");
    box.className = "thumbbox";
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = picture.altText || "The picture the callouts are on";
    img.className = "thumb callout-preview";
    box.append(img);
    const marks = marksOverlay({ ...size, callouts: working }, null);
    if (marks) box.append(marks);
    previewEl.append(box);
  }

  const inputOf = (index: number): CalloutInput => {
    const get = (field: string) => rowsEl.querySelector<HTMLInputElement>(`#co-${index}-${field}`)?.value ?? "";
    return { name: get("name"), description: get("description"), left: get("left"), top: get("top"), width: get("width"), height: get("height"), markerX: get("markerX"), markerY: get("markerY") };
  };

  /** Takes what is typed in one row into the working list, as far as it is good; the rest keeps its last good value. */
  function takeRow(index: number) {
    const input = inputOf(index);
    working[index].name = input.name.trim().slice(0, 300);
    working[index].description = input.description.trim().slice(0, 300);
    const checked = checkCalloutInput(input, size);
    if (checked.ok) {
      working[index].target = checked.callout.target;
      working[index].marker = checked.callout.marker;
    }
    drawPreview();
  }

  function drawRows(focus?: { index: number; part: string }) {
    rowsEl.replaceChildren();
    working.forEach((callout, i) => {
      const fieldset = document.createElement("fieldset");
      const letter = letterFor(i);
      fieldset.innerHTML = `<legend></legend>
        <p><label for="co-${i}-name">Name</label><br><input type="text" id="co-${i}-name" size="30" autocomplete="off" aria-describedby="co-error"></p>
        <p><label for="co-${i}-description">Sentence about it</label><br><input type="text" id="co-${i}-description" size="60" autocomplete="off" aria-describedby="co-error"></p>
        <div class="co-numbers"></div>
        <p></p>`;
      fieldset.querySelector("legend")!.textContent = `Callout ${letter}`;
      (fieldset.querySelector<HTMLInputElement>(`#co-${i}-name`)!).value = callout.name;
      (fieldset.querySelector<HTMLInputElement>(`#co-${i}-description`)!).value = callout.description;
      const values: Record<string, string> = {
        left: String(callout.target.x), top: String(callout.target.y), width: String(callout.target.width), height: String(callout.target.height),
        markerX: String(callout.marker.x), markerY: String(callout.marker.y),
      };
      const numbers = fieldset.querySelector<HTMLElement>(".co-numbers")!;
      for (const box of CALLOUT_BOXES) {
        const label = document.createElement("label");
        label.htmlFor = `co-${i}-${box.field}`;
        label.textContent = `${box.label}, callout ${letter}`;
        const input = document.createElement("input");
        input.type = "text";
        input.id = `co-${i}-${box.field}`;
        input.size = box.size;
        input.inputMode = "numeric";
        input.autocomplete = "off";
        input.value = values[box.field];
        input.setAttribute("aria-describedby", "co-error");
        const p = document.createElement("p");
        p.className = "co-number";
        p.append(label, document.createElement("br"), input);
        numbers.append(p);
      }
      const actions = fieldset.querySelector("p:last-child")!;
      const button = (part: string, text: string, run: () => void, disabled = false) => {
        const b = document.createElement("button");
        b.type = "button";
        b.id = `co-${i}-${part}`;
        b.textContent = text;
        b.disabled = disabled;
        b.setAttribute("aria-label", `${text}, callout ${letter}`);
        b.addEventListener("click", run);
        actions.append(b, " ");
      };
      button("place", "Place the marker for me", () => {
        clearErrors();
        takeRow(i);
        const others = working.filter((_, j) => j !== i).map((c) => c.marker);
        working[i].marker = placeMarker(working[i].target, size, others);
        drawRows({ index: i, part: "place" });
        say(`The marker of callout ${letter} was placed next to its item.`);
      });
      button("up", "Move up", () => {
        clearErrors();
        working.forEach((_, j) => takeRow(j));
        if (i === 0) return;
        [working[i - 1], working[i]] = [working[i], working[i - 1]];
        drawRows({ index: i - 1, part: i - 1 === 0 ? "down" : "up" });
        say(`Callout ${letter} moved up and is now callout ${letterFor(i - 1)}.`);
      }, i === 0);
      button("down", "Move down", () => {
        clearErrors();
        working.forEach((_, j) => takeRow(j));
        if (i === working.length - 1) return;
        [working[i + 1], working[i]] = [working[i], working[i + 1]];
        drawRows({ index: i + 1, part: i + 1 === working.length - 1 ? "up" : "down" });
        say(`Callout ${letter} moved down and is now callout ${letterFor(i + 1)}.`);
      }, i === working.length - 1);
      button("delete", "Delete", () => {
        clearErrors();
        working.forEach((_, j) => takeRow(j));
        working.splice(i, 1);
        drawRows(working.length ? { index: Math.min(i, working.length - 1), part: "name" } : undefined);
        if (!working.length) dialog.querySelector<HTMLElement>("#co-add")!.focus();
        say(`Callout ${letter} deleted. ${working.length} ${working.length === 1 ? "callout" : "callouts"} left.`);
      });
      fieldset.addEventListener("input", () => { clearErrors(); takeRow(i); });
      rowsEl.append(fieldset);
    });
    if (focus) rowsEl.querySelector<HTMLElement>(`#co-${focus.index}-${focus.part}`)?.focus();
    drawPreview();
    updateClickButton();
  }

  const clickButton = dialog.querySelector<HTMLButtonElement>("#co-click")!;
  function updateClickButton() {
    const state = { ...size, click: picture.click, callouts: working };
    const possible = newCalloutFromClick(state) !== null;
    const done = !possible && calloutFromClick(state) !== null;
    clickButton.disabled = !possible;
    clickButton.setAttribute("aria-describedby", "co-click-help");
    dialog.querySelector("#co-click-help")?.remove();
    const note = document.createElement("span");
    note.id = "co-click-help";
    note.className = "help";
    note.textContent = possible ? " Uses the outline of the item that was clicked."
      : picture.click ? (done ? " The clicked item already has a callout." : " The click has no outline to make a callout from.") : " Only a picture from Click by click has a click.";
    clickButton.after(note);
  }

  dialog.querySelector<HTMLButtonElement>("#co-add")!.addEventListener("click", () => {
    clearErrors();
    working.forEach((_, j) => takeRow(j));
    const click = picture.click;
    const around = click
      ? clipToPicture({ x: click.x - 40, y: click.y - 20, width: 80, height: 40 }, size)
      : null;
    const target = around ?? clipToPicture({ x: Math.round(size.width * 0.4), y: Math.round(size.height * 0.45), width: Math.round(size.width * 0.15), height: Math.round(size.height * 0.06) }, size)!;
    working.push({ id: newId(), name: "", description: "", target, marker: placeMarker(target, size, working.map((c) => c.marker)) });
    drawRows({ index: working.length - 1, part: "name" });
    say(`Callout ${letterFor(working.length - 1)} added. Give it a name and a sentence, and check where it is.`);
  });
  clickButton.addEventListener("click", () => {
    clearErrors();
    working.forEach((_, j) => takeRow(j));
    const made = newCalloutFromClick({ ...size, click: picture.click, callouts: working });
    if (!made) return;
    working.push(made);
    drawRows({ index: working.length - 1, part: "name" });
    say(`Callout ${letterFor(working.length - 1)} made from the clicked item.`);
  });

  let result: Callout[] | null = null;
  dialog.querySelector<HTMLFormElement>("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    if ((event.submitter as HTMLButtonElement | null)?.value === "cancel") return dialog.close("cancel");
    clearErrors();
    const next: Callout[] = [];
    for (let i = 0; i < working.length; i++) {
      const checked = checkCalloutInput(inputOf(i), size);
      if (!checked.ok) {
        const box = rowsEl.querySelector<HTMLInputElement>(`#co-${i}-${checked.field}`)!;
        box.setAttribute("aria-invalid", "true");
        errorEl.textContent = `Problem in callout ${letterFor(i)}: ${checked.message}`;
        box.focus();
        return;
      }
      next.push({ id: working[i].id, ...checked.callout });
    }
    result = next;
    dialog.close("ok");
  });
  drawRows();
  await open(dialog, working.length ? rowsEl.querySelector<HTMLElement>("#co-0-name")! : dialog.querySelector<HTMLElement>("#co-add")!);
  return dialog.returnValue === "ok" ? result : null;
}

/** What the author chose in the Picture view dialog: a view, or `null` for the whole picture. */
export interface ViewChoice {
  view: PictureView | null;
}

/**
 * Chooses which part of one picture is shown where it is used: the whole picture, a region typed as four numbers, or zoomed in on the click. The picture
 * itself is never cut. A sample of the whole picture shows the chosen part with the rest dimmed, and a line of words says the same. A mistake is
 * explained in plain words and the dialog stays open. Returns `null` if cancelled.
 */
export async function pictureViewDialog(picture: Picture, imageUrl: string | null, zoom: ZoomSettings, place: HighlightKind): Promise<ViewChoice | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">Picture view</h2>
      <p class="help" id="pv-help"></p>
      <fieldset>
        <legend>Which part of the picture to show</legend>
        <p><label><input type="radio" name="pv-kind" id="pv-whole" value="whole"> The whole picture</label></p>
        <p><label><input type="radio" name="pv-kind" id="pv-crop" value="crop"> A region I choose</label></p>
        <div id="pv-crop-boxes" class="co-numbers" hidden></div>
        <p><label><input type="radio" name="pv-kind" id="pv-zoom" value="zoom"> Zoomed in on the click</label></p>
        <p id="pv-zoom-help" class="help"></p>
      </fieldset>
      <p id="pv-summary" class="help" role="status"></p>
      <div id="pv-sample"></div>
      <p id="pv-error" class="error" role="alert"></p>
      <p><button value="ok">Save the view</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const size = { width: picture.width, height: picture.height };
  const placeName = place === "book" ? "the book" : "a quick guide";
  dialog.querySelector("#pv-help")!.textContent =
    "The picture file is never cut: a view only says which part of it is shown, so it can be changed or taken off at any time. Callouts and the click circle stay on " +
    `the picture and line up in every view. Numbers count in pixels from the top left corner of the picture, which is ${picture.width} by ${picture.height} pixels.`;
  const errorEl = dialog.querySelector<HTMLElement>("#pv-error")!;
  const summaryEl = dialog.querySelector<HTMLElement>("#pv-summary")!;
  const sampleEl = dialog.querySelector<HTMLElement>("#pv-sample")!;
  const cropBoxes = dialog.querySelector<HTMLElement>("#pv-crop-boxes")!;
  const radio = (id: string) => dialog.querySelector<HTMLInputElement>(`#${id}`)!;
  const hasClick = !!picture.click;
  radio("pv-zoom").disabled = !hasClick;
  const zoomWords = (settings: ZoomSettings) => {
    const part = (p: HighlightKind) => shownPart({ ...size, click: picture.click, view: { kind: "zoom" } }, settings, p);
    const book = part("book"), guide = part("guide");
    return `Centred on the click. The size is a project setting: ${book.width} by ${book.height} pixels in the book (${settings.book.size} percent of the width) and ${guide.width} by ${guide.height} in a quick guide (${settings.guide.size} percent). Change it with Zoom settings.`;
  };
  dialog.querySelector("#pv-zoom-help")!.textContent = hasClick ? zoomWords(zoom) : "This picture has no click to zoom in on, so this choice is off. Pictures from Click by click have one.";

  // The four boxes of a region, with the starting region being what the picture shows now, or the middle half.
  const BOXES: { field: "left" | "top" | "width" | "height"; label: string }[] = [
    { field: "left", label: "Region: how far across it starts" },
    { field: "top", label: "Region: how far down it starts" },
    { field: "width", label: "Region: width" },
    { field: "height", label: "Region: height" },
  ];
  const current = picture.view?.kind === "crop" ? picture.view : null;
  const start: ShownRect = current ?? { x: Math.round(size.width / 4), y: Math.round(size.height / 4), width: Math.round(size.width / 2), height: Math.round(size.height / 2) };
  const startValues: Record<string, string> = { left: String(start.x), top: String(start.y), width: String(start.width), height: String(start.height) };
  for (const box of BOXES) {
    const p = document.createElement("p");
    p.className = "co-number";
    const label = document.createElement("label");
    label.htmlFor = `pv-${box.field}`;
    label.textContent = box.label;
    const input = document.createElement("input");
    input.type = "text";
    input.id = `pv-${box.field}`;
    input.size = 6;
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.value = startValues[box.field];
    input.setAttribute("aria-describedby", "pv-error");
    p.append(label, document.createElement("br"), input);
    cropBoxes.append(p);
  }
  const boxValue = (field: string) => dialog.querySelector<HTMLInputElement>(`#pv-${field}`)!.value;
  const cropInput = () => ({ left: boxValue("left"), top: boxValue("top"), width: boxValue("width"), height: boxValue("height") });

  const kind = () => (radio("pv-crop").checked ? "crop" : radio("pv-zoom").checked ? "zoom" : "whole");
  radio(picture.view?.kind === "crop" ? "pv-crop" : picture.view?.kind === "zoom" && hasClick ? "pv-zoom" : "pv-whole").checked = true;

  /** The part that is shown by what is chosen and typed now, as far as it is good. */
  let lastGood: ShownRect | null = picture.view?.kind === "crop" ? { x: picture.view.x, y: picture.view.y, width: picture.view.width, height: picture.view.height } : null;
  function chosenPart(): ShownRect {
    const whole = { x: 0, y: 0, width: size.width, height: size.height };
    if (kind() === "zoom") return shownPart({ ...size, click: picture.click, view: { kind: "zoom" } }, zoom, place);
    if (kind() === "crop") {
      const checked = checkCropInput(cropInput(), size);
      if (checked.ok && checked.view.kind === "crop") lastGood = { x: checked.view.x, y: checked.view.y, width: checked.view.width, height: checked.view.height };
      return lastGood ?? start;
    }
    return whole;
  }

  function redraw() {
    cropBoxes.hidden = kind() !== "crop";
    const part = chosenPart();
    const all = part.x === 0 && part.y === 0 && part.width === size.width && part.height === size.height;
    summaryEl.textContent = kind() === "whole" || all
      ? "The whole picture will be shown."
      : kind() === "zoom"
        ? `Zoomed in on the click: ${part.width} by ${part.height} pixels, starting ${part.x} across and ${part.y} down, as set for ${placeName}.`
        : `Cropped: ${part.width} by ${part.height} pixels, starting ${part.x} across and ${part.y} down.`;
    sampleEl.replaceChildren();
    if (!imageUrl) return;
    // The sample shows the whole picture with the part that is shown outlined and the rest dimmed.
    const box = document.createElement("span");
    box.className = "thumbbox";
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = picture.altText || "The picture the view is for";
    img.className = "thumb callout-preview";
    box.append(img);
    const svg = document.createElementNS(SVG, "svg");
    for (const [k, v] of Object.entries({ viewBox: `0 0 ${size.width} ${size.height}`, preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false", class: "circle-overlay" })) svg.setAttribute(k, v);
    if (!all) {
      const shade = document.createElementNS(SVG, "path");
      shade.setAttribute("d", `M0 0H${size.width}V${size.height}H0Z M${part.x} ${part.y}V${part.y + part.height}H${part.x + part.width}V${part.y}Z`);
      shade.setAttribute("fill-rule", "evenodd");
      shade.setAttribute("fill", "#000000");
      shade.setAttribute("fill-opacity", "0.55");
      svg.append(shade);
      const outline = document.createElementNS(SVG, "rect");
      for (const [k, v] of Object.entries({ x: part.x, y: part.y, width: part.width, height: part.height, fill: "none", stroke: "#FFD600", "stroke-width": 2, "vector-effect": "non-scaling-stroke" })) outline.setAttribute(k, String(v));
      svg.append(outline);
    }
    box.append(svg);
    const marks = marksOverlay(picture, null);
    if (marks) box.append(marks);
    sampleEl.append(box);
  }

  const clearErrors = () => { errorEl.textContent = ""; cropBoxes.querySelectorAll("[aria-invalid]").forEach((e) => e.removeAttribute("aria-invalid")); };
  for (const r of ["pv-whole", "pv-crop", "pv-zoom"]) radio(r).addEventListener("change", () => { clearErrors(); redraw(); });
  cropBoxes.addEventListener("input", () => { clearErrors(); redraw(); });
  redraw();

  let result: ViewChoice | null = null;
  dialog.querySelector<HTMLFormElement>("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    if ((event.submitter as HTMLButtonElement | null)?.value === "cancel") return dialog.close("cancel");
    clearErrors();
    if (kind() === "crop") {
      const checked = checkCropInput(cropInput(), size);
      if (!checked.ok) {
        const box = dialog.querySelector<HTMLInputElement>(`#pv-${checked.field}`)!;
        box.setAttribute("aria-invalid", "true");
        errorEl.textContent = `Problem with the region: ${checked.message}`;
        box.focus();
        return;
      }
      result = { view: checked.view };
    } else {
      result = { view: kind() === "zoom" ? { kind: "zoom" } : null };
    }
    dialog.close("ok");
  });
  await open(dialog, radio(kind() === "crop" ? "pv-crop" : kind() === "zoom" ? "pv-zoom" : "pv-whole"));
  return dialog.returnValue === "ok" ? result : null;
}

/**
 * The zoom sizes: how much of a picture a zoomed picture shows, for the book and for a quick guide, as a percent of the picture's width. Kept in the
 * project. Returns the new sizes, or `null` if cancelled.
 */
export async function zoomSettingsDialog(zoom: ZoomSettings): Promise<ZoomSettings | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">Zoom settings</h2>
      <p class="help">A picture can be zoomed in on its click. These sizes say how much of the picture a zoomed picture shows, as a percent of the picture's width
        (${ZOOM_LIMITS.min} to ${ZOOM_LIMITS.max}; the height keeps the picture's shape, and ${ZOOM_LIMITS.max} shows all of it). They are kept in the project, one
        for the book and one for a quick guide, and apply to every picture that is set to zoom. A smaller number zooms in closer.</p>
      <p><label for="zs-book">Zoom size in the book, in percent</label><br><input type="text" id="zs-book" size="6" inputmode="decimal" autocomplete="off" aria-describedby="zs-error"></p>
      <p><label for="zs-guide">Zoom size in a quick guide, in percent</label><br><input type="text" id="zs-guide" size="6" inputmode="decimal" autocomplete="off" aria-describedby="zs-error"></p>
      <p id="zs-error" class="error" role="alert"></p>
      <p><button value="ok">Save the settings</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const book = dialog.querySelector<HTMLInputElement>("#zs-book")!;
  const guide = dialog.querySelector<HTMLInputElement>("#zs-guide")!;
  const errorEl = dialog.querySelector<HTMLElement>("#zs-error")!;
  book.value = String(zoom.book.size);
  guide.value = String(zoom.guide.size);
  for (const input of [book, guide]) input.addEventListener("input", () => { errorEl.textContent = ""; book.removeAttribute("aria-invalid"); guide.removeAttribute("aria-invalid"); });
  let result: ZoomSettings | null = null;
  dialog.querySelector<HTMLFormElement>("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    if ((event.submitter as HTMLButtonElement | null)?.value === "cancel") return dialog.close("cancel");
    const checked = checkZoomInput({ book: book.value, guide: guide.value });
    if (!checked.ok) {
      const box = checked.field === "book" ? book : guide;
      box.setAttribute("aria-invalid", "true");
      errorEl.textContent = `Problem in the zoom settings: ${checked.message}`;
      box.focus();
      return;
    }
    result = checked.zoom;
    dialog.close("ok");
  });
  await open(dialog, book);
  return dialog.returnValue === "ok" ? result : null;
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
