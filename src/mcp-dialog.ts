// The MCP access dialog: whether an AI assistant may use OpenExplainer (MCP), which folder it may keep projects in, whether it may capture windows and, on top of that, a whole screen, and the lines to
// give an assistant so it can connect. MCP is off until it is turned on here. The settings are kept by the shell (src-tauri/src/mcp.rs) in the app's config folder. Everything can be done by keyboard.
import { invoke } from "@tauri-apps/api/core";
import { open as chooseFolder } from "@tauri-apps/plugin-dialog";
import { open } from "./dialogs.ts";
import { connectionLines } from "./mcp/connect.ts";

export interface McpAccess {
  enabled: boolean;
  folder: string;
  allowWindows: boolean;
  allowFullScreen: boolean;
}

/** Shows the settings. Keeps them (through the shell) when the author presses Save, and returns them, or returns `null` if cancelled or they could not be kept. */
export async function mcpDialog(): Promise<McpAccess | null> {
  const current = await invoke<McpAccess>("mcp_settings_get");
  const exe = await invoke<string>("mcp_exe_path");
  const lines = connectionLines(exe);
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">MCP access</h2>
      <p class="help" id="mcp-intro">MCP lets an AI assistant that supports MCP use OpenExplainer to document a program while nobody is at the keyboard: it can make a project, capture a window, write the pages, run the checks and make the exports. It is <strong>off</strong> until you turn it on here. An assistant works in its own hidden copy of OpenExplainer, so do not edit the same project in this window while one is working on it.</p>
      <p><label><input type="checkbox" id="mcp-enabled"> Turn on MCP access</label></p>
      <p><label for="mcp-folder">Folder an assistant may use</label><br><input type="text" id="mcp-folder" size="52" aria-describedby="mcp-folder-help"> <button type="button" id="mcp-choose">Choose the folder</button></p>
      <p class="help" id="mcp-folder-help">An assistant can only open, save and export inside this folder, and nowhere else on this PC. A plain log of what it did is kept there too (OpenExplainer MCP log.txt).</p>
      <p><label><input type="checkbox" id="mcp-windows" aria-describedby="mcp-windows-help"> Let an assistant capture windows</label><br><span class="help" id="mcp-windows-help">Off to begin with. With it off, an assistant cannot see the titles of your open windows or capture anything on the screen; it can still make projects, write the pages and make the exports. With it on, it captures one window at a time.</span></p>
      <p><label><input type="checkbox" id="mcp-full" aria-describedby="mcp-full-help"> Also let it capture a whole screen, not only one window</label><br><span class="help" id="mcp-full-help">Off to begin with, and only used when capturing windows is allowed. With it off, a click capture keeps only the clicks inside the window it was told to watch, so a mail window or a password manager on the same screen never gets into a project. A small window with a Stop button is always showing while a click capture runs.</span></p>
      <p id="mcp-error" role="alert" class="error"></p>
      <h3>Connecting an assistant</h3>
      <p class="help">Give the assistant these lines once. For an assistant that reads its MCP servers from a settings file, add this to that file:</p>
      <p><textarea id="mcp-desktop" rows="7" cols="60" readonly aria-label="Settings for an assistant's settings file"></textarea><br><button type="button" id="mcp-copy-desktop">Copy these settings</button></p>
      <p class="help">For an assistant that asks for the command that starts a server, give it this:</p>
      <p><textarea id="mcp-code" rows="2" cols="60" readonly aria-label="The command that starts OpenExplainer for an assistant"></textarea><br><button type="button" id="mcp-copy-code">Copy this command</button></p>
      <p id="mcp-status" class="visually-hidden" role="status"></p>
      <p><button value="ok" id="mcp-save">Save</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const $ = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const say = (words: string) => { $("mcp-status").textContent = ""; setTimeout(() => ($("mcp-status").textContent = words), 30); };
  $<HTMLInputElement>("mcp-enabled").checked = current.enabled;
  $<HTMLInputElement>("mcp-folder").value = current.folder;
  $<HTMLInputElement>("mcp-windows").checked = current.allowWindows === true;
  $<HTMLInputElement>("mcp-full").checked = current.allowFullScreen;
  $<HTMLTextAreaElement>("mcp-desktop").value = lines.desktop;
  $<HTMLTextAreaElement>("mcp-code").value = lines.code;

  $("mcp-choose").addEventListener("click", async () => {
    const picked = await chooseFolder({ title: "Folder an assistant may use", directory: true, multiple: false, defaultPath: $<HTMLInputElement>("mcp-folder").value || undefined });
    if (typeof picked === "string") {
      $<HTMLInputElement>("mcp-folder").value = picked;
      say(`Folder chosen: ${picked}`);
    }
    $("mcp-choose").focus();
  });
  for (const [button, box, words] of [["mcp-copy-desktop", "mcp-desktop", "The settings were copied."], ["mcp-copy-code", "mcp-code", "The command was copied."]] as const) {
    $(button).addEventListener("click", async () => {
      const field = $<HTMLTextAreaElement>(box);
      try {
        await navigator.clipboard.writeText(field.value);
        say(words);
      } catch {
        // The clipboard may be refused: the text is selected so Ctrl+C copies it.
        field.focus();
        field.select();
        say("The text is selected. Press Ctrl+C to copy it.");
      }
    });
  }
  let result: McpAccess | null = null;
  dialog.querySelector<HTMLFormElement>("form")!.addEventListener("submit", async (event) => {
    event.preventDefault();
    if ((event.submitter as HTMLButtonElement | null)?.value === "cancel") return dialog.close("cancel");
    const next: McpAccess = { enabled: $<HTMLInputElement>("mcp-enabled").checked, folder: $<HTMLInputElement>("mcp-folder").value.trim(), allowWindows: $<HTMLInputElement>("mcp-windows").checked, allowFullScreen: $<HTMLInputElement>("mcp-full").checked };
    if (next.enabled && !next.folder) {
      $("mcp-error").textContent = "Choose the folder an assistant may use before turning MCP on. It can only open and save projects inside it.";
      $("mcp-folder").focus();
      return;
    }
    try {
      await invoke("mcp_settings_set", { settings: next });
    } catch (error) {
      $("mcp-error").textContent = typeof error === "string" ? error : error instanceof Error ? error.message : "The settings could not be saved.";
      $("mcp-folder").focus();
      return;
    }
    result = next;
    dialog.close("ok");
  });
  $("mcp-folder").addEventListener("input", () => { $("mcp-error").textContent = ""; });
  await open(dialog, $("mcp-enabled"));
  return dialog.returnValue === "ok" ? result : null;
}
