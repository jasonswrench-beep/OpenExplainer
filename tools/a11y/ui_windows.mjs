// Tries the windows and buttons added for the improve-build list in MY OWN copy of the new program, on a COPY of the OpenStage Author guide, through the page's debugging port.
// The file choosers of the operating system (Import from Word, Bring in review comments, Import a translation, Replace the picture file) cannot be driven this way, so only that their buttons are there is checked; their work is tested without a screen.
//   OE_EXE=<openexplainer.exe> [OE_PROJECT=<a project with a topic 2.2 that has a picture>] node tools/a11y/ui_windows.mjs
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, sleep, waitFor, endProfileProcesses } from "./a11y_lib.mjs";


const here = path.dirname(fileURLToPath(import.meta.url));
const EXE = process.env.OE_EXE;
const PORT = 9228;
const dir = path.join(process.env.A11Y_OUT ?? path.join(here, "out"), "windows_run");
const profile = path.join(dir, "profile");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(profile, { recursive: true });
const file = path.join(dir, "Guide copy.openexplainer");
fs.copyFileSync(process.env.OE_PROJECT ?? "C:\\Users\\Jason\\Documents\\OpenStage Author Manual\\OpenStage Author User Guide.openexplainer", file);
endProfileProcesses(profile);
const child = spawn(EXE, [file], { env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT} --force-renderer-accessibility` }, stdio: "ignore" });
const target = await waitFor(async () => { try { return (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page" && /tauri\.localhost/.test(x.url) && !/click-bar|capture-bar|selection/.test(x.url)); } catch { return null; } }, 40000, 300);
if (!target) throw new Error("my copy did not start");
const page = await connect(target.webSocketDebuggerUrl);
const { ev } = page;
const results = [];
const check = (name, ok, extra = "") => { results.push([name, !!ok]); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  | " + extra : ""}`); };
const dialog = () => ev(`[...document.querySelectorAll('dialog[open] h2')].at(-1)?.textContent ?? null`);
const setValue = (sel, value) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const click = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
const said = () => ev(`document.getElementById('announce').textContent`);

const opened = await waitFor(async () => /OpenStage Author User Guide/.test(await ev(`document.getElementById('project-heading')?.textContent ?? ''`)), 40000, 300);
check("the program opened the guide copy", opened);
if (!opened) { child.kill(); process.exit(1); }
await sleep(1000);

// ---- The toolbar
for (const [id, words] of [["b-import-word", "Import from Word"], ["b-review-in", "Bring in review comments"], ["b-import-translation", "Import a translation"], ["b-history", "History"]]) {
  check(`the toolbar has "${words}"`, (await ev(`document.getElementById(${JSON.stringify(id)})?.textContent?.trim()`)) === words);
}

// ---- Export: the new kinds
await click("#b-export"); await sleep(500);
check("the Export window opens", (await dialog()) === "Export");
const kinds = await ev(`[...document.querySelectorAll('input[name=ex-kind]')].map((r) => r.value)`);
check("it offers the Word review copy, the e-book and the translation file", ["word-review", "epub", "xliff"].every((k) => kinds.includes(k)), kinds.join(", "));
check("the language box is hidden until the translation file is chosen", (await ev(`document.getElementById('ex-language').hidden`)) === true);
await ev(`document.getElementById('ex-kind-xliff').click()`); await sleep(200);
check("choosing the translation file shows the language box", (await ev(`document.getElementById('ex-language').hidden`)) === false);
await click("dialog[open] button[value=ok]"); await sleep(400);
check("an empty language keeps the window open and the keyboard goes to the language box", (await dialog()) === "Export" && (await ev(`document.activeElement?.id`)) === "ex-language-input");
check("and the problem is said in words", /Type a language code/.test(await ev(`document.getElementById('ex-language-line').textContent`)), await ev(`document.getElementById('ex-language-line').textContent`));
await setValue("#ex-language-input", "fr-ca");
check("a good code says the language's name", /Canadian French|French \(Canada\)/.test(await ev(`document.getElementById('ex-language-line').textContent`)), await ev(`document.getElementById('ex-language-line').textContent`));
await ev(`document.querySelector('dialog[open] button[value=cancel]').click()`); await sleep(400);
check("Cancel closes it and the keyboard goes back to the button", (await dialog()) === null && (await ev(`document.activeElement?.id`)) === "b-export");

// ---- Look of the book: the language
await click("#b-look"); await sleep(500);
check("Look of the book has a language box that starts as en", (await ev(`document.getElementById('look-language').value`)) === "en");
await setValue("#look-language", "english");
check("a wrong code is warned about in words", /^⚠ That is not a language code/.test(await ev(`document.getElementById('look-language-line').textContent`)));
await click("#look-save"); await sleep(400);
check("it is not kept: the window stays open and the keyboard is on the language box", (await dialog()) === "Look of the book" && (await ev(`document.activeElement?.id`)) === "look-language");
await setValue("#look-language", "pt_br");
check("a code with an underscore is understood", /Brazilian Portuguese|Portuguese \(Brazil\)/.test(await ev(`document.getElementById('look-language-line').textContent`)));
await click("#look-save"); await sleep(600);
check("it is kept and announced with the language's name", /Language: (Brazilian Portuguese|Portuguese \(Brazil\))\.$/.test(await said()), await said());
await click("#b-look"); await sleep(400);
check("and it shows as pt-BR when the window is opened again", (await ev(`document.getElementById('look-language').value`)) === "pt-BR");
await setValue("#look-language", "en");
await click("#look-save"); await sleep(500);

// ---- History
await click("#b-history"); await sleep(500);
check("History opens with no snapshots", (await dialog()) === "History: snapshots of the book" && /No snapshots yet/.test(await ev(`document.getElementById('hist-list').textContent`)));
check("Compare, Restore, Rename and Delete are off with nothing chosen", await ev(`['hist-compare','hist-whole','hist-rename','hist-delete'].every((id) => document.getElementById(id).disabled)`));
await click("#hist-take"); await sleep(400);
check("Take a snapshot asks for a name", (await dialog()) === "Take a snapshot");
await setValue("#dlg-input", "Before the test");
await click("dialog[open]:last-of-type button[value=ok]"); await sleep(500);
check("the snapshot is listed and said in words", /Before the test, taken by hand/.test(await ev(`document.getElementById('hist-list').textContent`)) && /Took the snapshot "Before the test"\. The book has 1 of 20\./.test(await ev(`document.getElementById('hist-status').textContent`)), await ev(`document.getElementById('hist-status').textContent`));
await click("#hist-compare"); await sleep(500);
check("comparing says there is no difference", /The book is the same as "Before the test"\./.test(await ev(`document.getElementById('hist-status').textContent`)), await ev(`document.getElementById('hist-status').textContent`));
// Change the book from outside this window: the variables.
await ev(`document.querySelector('dialog[open]').close()`); await sleep(400);
await click("#b-vars"); await sleep(400);
await setValue("input[data-name=PRODUCT]", "Changed product");
await click("dialog[open] button[value=ok]"); await sleep(500);
await click("#b-history"); await sleep(500);
await click("#hist-compare"); await sleep(500);
check("after a change, comparing says what changed", /1 difference/.test(await ev(`document.getElementById('hist-status').textContent`)) && /variables changed/.test(await ev(`document.getElementById('hist-book-diff').textContent`)), await ev(`document.getElementById('hist-book-diff').textContent`));
await click("#hist-whole"); await sleep(400);
check("restoring the whole book asks first, and says a snapshot of now is kept", (await dialog()) === "Restore the whole book?" && /kept first as a new snapshot called "Before restoring/.test(await ev(`document.getElementById('dlg-message').textContent`)));
await click("dialog[open] button[value=cancel]"); await sleep(400);
check("Cancel changes nothing", (await dialog()) === "History: snapshots of the book" && (await ev(`document.getElementById('hist-list').options.length`)) === 1);
await click("#hist-whole"); await sleep(400);
await click("dialog[open] button[value=yes]"); await sleep(700);
check("restoring puts it back and keeps a safety snapshot", (await ev(`document.getElementById('hist-list').options.length`)) === 2 && /is kept as "Before restoring "Before the test""/.test(await ev(`document.getElementById('hist-status').textContent`)), await ev(`document.getElementById('hist-status').textContent`));
await click("#hist-close"); await sleep(600);
check("History closes and the keyboard goes back to its button", (await dialog()) === null && (await ev(`document.activeElement?.id`)) === "b-history");
check("the book is announced as put back", /put back from a snapshot/.test(await said()), await said());
await click("#b-vars"); await sleep(400);
check("the variable is as the snapshot had it", (await ev(`document.querySelector('input[data-name=PRODUCT]').value`)) !== "Changed product", await ev(`document.querySelector('input[data-name=PRODUCT]').value`));
await ev(`document.querySelector('dialog[open] button[value=cancel]').click()`); await sleep(300);
await click("#b-history"); await sleep(400);
await ev(`document.getElementById('hist-list').value = document.getElementById('hist-list').options[0].value; document.getElementById('hist-list').dispatchEvent(new Event('change'))`);
await click("#hist-delete"); await sleep(400);
check("Delete asks first", (await dialog()) === "Delete this snapshot?");
await click("dialog[open] button[value=yes]"); await sleep(500);
check("it is deleted and said", (await ev(`document.getElementById('hist-list').options.length`)) === 1 && /Deleted/.test(await ev(`document.getElementById('hist-status').textContent`)));
await click("#hist-close"); await sleep(500);

// ---- Pictures: the button to replace a file
await ev(`(() => { const rows = [...document.querySelectorAll('#tree [role=treeitem]')]; rows.find((r) => /^\\s*[▾▸]?\\s*2\\.2\\b/.test(r.textContent ?? ''))?.click(); })()`); await sleep(900);
check("each picture has a Replace the picture file button with a name that says which picture", (await ev(`[...document.querySelectorAll('[data-replace]')].every((b) => /^Replace the file of .+ with another of the same size$/.test(b.getAttribute('aria-label') ?? ''))`)) && (await ev(`document.querySelectorAll('[data-replace]').length`)) > 0, String(await ev(`document.querySelectorAll('[data-replace]').length`)));

const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed`);
page.close();
try { child.kill(); } catch { /* gone */ }
endProfileProcesses(profile);
