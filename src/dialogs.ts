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

export async function promptText(title: string, label: string, initial = ""): Promise<string | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title"></h2>
      <p><label for="dlg-input"></label><br><input id="dlg-input" type="text" size="40" required></p>
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
  return dialog.returnValue === "ok" && value ? value : null;
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
