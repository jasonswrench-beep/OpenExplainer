// SPDX-License-Identifier: Apache-2.0
// Help, Check for updates: which release this copy is, and a button that asks GitHub, once, whether a newer one is published. Notify only: the answer is said in
// words in the dialog's status line, and a newer release's page opens in the author's own browser only if they press the second button. The request and the
// opening are done by the shell (src-tauri/src/updates.rs); the page itself never goes online. docs/update-check.md says what and why.
import { invoke } from "@tauri-apps/api/core";
import { open } from "./dialogs.ts";
import { pageButtonText, parseUpdateAnswer, releaseWords } from "./updates.ts";

/** What the dialog needs from the shell, so a test can give it a stand-in. */
export interface UpdateShell {
  release(): Promise<string>;
  check(): Promise<string>;
  openPage(url: string): Promise<void>;
}

export const tauriUpdateShell: UpdateShell = {
  release: () => invoke<string>("app_release"),
  check: () => invoke<string>("check_for_updates"),
  openPage: (url) => invoke<void>("open_release_page", { url }),
};

export async function updatesDialog(shell: UpdateShell = tauriUpdateShell): Promise<void> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "up-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="up-title">Check for updates</h2>
      <p id="up-copy">This copy is OpenExplainer.</p>
      <p class="help">Check now asks GitHub, once, whether a newer version of OpenExplainer is published. It happens only when you press the button. Nothing about you or your books is sent, and nothing is downloaded or installed: if there is a newer version, you can open its page in your browser, and running its setup updates this copy and keeps your projects and settings.</p>
      <p><button type="button" id="up-check">Check now</button> <button type="button" id="up-open" hidden>Open the releases page</button></p>
      <p id="up-said" role="status" aria-atomic="true"></p>
      <p><button value="close">Close</button></p>
    </form>`;
  const copy = dialog.querySelector<HTMLElement>("#up-copy")!;
  const said = dialog.querySelector<HTMLElement>("#up-said")!;
  const check = dialog.querySelector<HTMLButtonElement>("#up-check")!;
  const page = dialog.querySelector<HTMLButtonElement>("#up-open")!;
  let url: string | undefined;
  void shell.release().then((r) => { copy.textContent = `This copy is OpenExplainer ${releaseWords(r)}.`; }, () => undefined);
  check.addEventListener("click", () => {
    check.disabled = true;
    page.hidden = true;
    url = undefined;
    said.textContent = "Checking...";
    void shell.check()
      .then((raw) => parseUpdateAnswer(raw), (err: unknown) => parseUpdateAnswer(JSON.stringify({ state: "error", message: err instanceof Error ? err.message : String(err) })))
      .then((answer) => {
        said.textContent = answer.message;
        url = answer.url;
        if (url !== undefined) {
          page.textContent = pageButtonText(answer);
          page.hidden = false;
        }
      })
      .finally(() => { check.disabled = false; check.focus(); });
  });
  page.addEventListener("click", () => {
    if (url === undefined) return;
    void shell.openPage(url).catch((err: unknown) => { said.textContent = err instanceof Error ? err.message : String(err); });
  });
  await open(dialog, check);
}
