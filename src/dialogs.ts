import { cleanVariableName, CORE_VARIABLES, type Project } from "./project/model.ts";
import type { WindowInfo } from "./capture/outcome.ts";

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

/** What the author chose in the window list. */
export type WindowChoice = { kind: "capture"; window: WindowInfo } | { kind: "refresh" };

/** The spoken and written name of one open window: title first, then what and how big it is. */
export function windowLabel(w: WindowInfo): string {
  const notes = [`${w.process}`, `${w.width} by ${w.height} pixels`];
  if (w.minimized) notes.push("minimized, restore it first");
  if (w.not_responding) notes.push("not responding");
  return `${w.title} (${notes.join(", ")})`;
}

/** A list of the open windows to pick one from. A real list box, so arrows, typing a letter and a screen reader all work. */
export async function chooseWindowDialog(windows: WindowInfo[]): Promise<WindowChoice | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">Capture a window</h2>
      <p id="cw-help">Choose the window to capture. OpenExplainer hides while it captures, so it is never in the picture,
        and a window that other windows cover can still be captured. A minimized window has to be restored first.</p>
      <p><label for="cw-list">Open windows</label><br>
        <select id="cw-list" size="10" aria-describedby="cw-help"></select></p>
      <p id="cw-none" class="help" hidden>No open windows were found.</p>
      <p><button value="capture" id="cw-capture">Capture this window</button>
         <button value="refresh" formnovalidate>Refresh the list</button>
         <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const list = dialog.querySelector<HTMLSelectElement>("#cw-list")!;
  windows.forEach((w, i) => {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = windowLabel(w);
    list.append(option);
  });
  if (windows.length) list.selectedIndex = 0;
  else {
    list.disabled = true;
    dialog.querySelector<HTMLButtonElement>("#cw-capture")!.disabled = true;
    dialog.querySelector<HTMLElement>("#cw-none")!.hidden = false;
  }
  await open(dialog, windows.length ? list : dialog.querySelector<HTMLButtonElement>('button[value="refresh"]')!);
  if (dialog.returnValue === "refresh") return { kind: "refresh" };
  if (dialog.returnValue !== "capture") return null;
  const chosen = windows[list.selectedIndex];
  return chosen ? { kind: "capture", window: chosen } : null;
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
