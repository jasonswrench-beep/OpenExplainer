// Machine checks of the editor itself, in my own copy of the new program on a COPY of the OpenStage Author guide, through the page's debugging port (no real mouse or keyboard of the user's).
//   OE_EXE=<openexplainer.exe> [OE_PROJECT=<a project with a topic 2.2 that has a picture>] node tools/a11y/a11y_editor.mjs   (results: tools/a11y/out/a11y_editor_result.json)
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, sleep, waitFor, auditTree, auditDom, auditContrast, walkTab, endProfileProcesses } from "./a11y_lib.mjs";


const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.A11Y_OUT ?? path.join(here, "out");
fs.mkdirSync(outDir, { recursive: true });
const EXE = process.env.OE_EXE;
const PORT = 9227;
const dir = path.join(outDir, "editor_run");
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
const report = { sections: [], summary: { checks: 0, failed: 0 } };
const note = (section, name, ok, detail = [], info = false) => {
  report.summary.checks++;
  if (!ok && !info) report.summary.failed++;
  let s = report.sections.find((x) => x.section === section);
  if (!s) report.sections.push((s = { section, rows: [] }));
  s.rows.push({ name, ok, detail, info });
  console.log(`${ok ? "PASS" : info ? "INFO" : "FAIL"}  [${section}] ${name}${detail.length ? "\n      " + detail.slice(0, 8).join("\n      ") + (detail.length > 8 ? `\n      ... and ${detail.length - 8} more` : "") : ""}`);
};
const dialogTitle = () => page.ev(`document.querySelector('dialog[open] h2')?.textContent ?? null`);

const opened = await waitFor(async () => /OpenStage Author User Guide/.test(await page.ev(`document.getElementById('project-heading')?.textContent ?? ''`)), 40000, 300);
if (!opened) { child.kill(); throw new Error("the guide did not open"); }
await sleep(1500);

// ---- The main window
{
  const tree = await auditTree(page);
  note("Main window", "every button, field, tab and tree item has a name (browser's own accessibility tree)", tree.problems.length === 0, tree.problems);
  note("Main window", "there is a main landmark and the page has headings", tree.landmarks.some((l) => l.role === "main") && tree.headings.length > 0, [`landmarks: ${tree.landmarks.map((l) => `${l.role}${l.name ? ` "${l.name}"` : ""}`).join(", ")}`, `headings: ${tree.headings.slice(0, 12).map((h) => `h${h.level} ${h.name}`).join(" | ")}`]);
  note("Main window", `${tree.interactive} interactive things were counted`, tree.interactive > 40);
  const dom = await auditDom(page);
  note("Main window", "no repeated ids, no broken label references, every field labelled, every picture described, page language and title set", dom.length === 0, dom);
  const lang = await page.ev(`document.documentElement.lang`);
  note("Main window", `the page language is set (${lang || "none"})`, !!lang);
  const contrast = await auditContrast(page);
  note("Main window", "text contrast is at least 4.5 to 1 (3 to 1 for large text) where it can be measured", contrast.length === 0, contrast.map((c) => `${c.ratio} (needs ${c.need}) "${c.text}" ${c.element}`));
  // Tab order across the whole window.
  await page.ev(`document.body.focus(); document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
  const walked = await walkTab(page, 90);
  note("Main window", `Tab visits ${walked.distinct} different things in 90 presses and is never stuck`, walked.distinct > 30 && !walked.stuck);
  note("Main window", "every thing the keyboard reaches shows where it is (an outline or a glow)", walked.unseen.length === 0, [...new Set(walked.unseen)]);
  // F6 and Shift+F6 between the panes.
  const panes = [];
  await page.ev(`document.getElementById('pane-tree').focus()`);
  for (let i = 0; i < 4; i++) { await page.key("F6", "F6", 117); await sleep(60); panes.push(await page.ev(`document.activeElement?.closest('.pane')?.id ?? document.activeElement?.id ?? 'none'`)); }
  note("Main window", "F6 moves through the three panes and round again", panes.slice(0, 3).every((p) => /^pane-/.test(p)) && new Set(panes.slice(0, 3)).size === 3 && panes[3] === panes[0], [`F6 went to: ${panes.join(" > ")}`]);
  const back = [];
  for (let i = 0; i < 3; i++) { await page.key("F6", "F6", 117, 8); await sleep(60); back.push(await page.ev(`document.activeElement?.closest('.pane')?.id ?? document.activeElement?.id ?? 'none'`)); }
  note("Main window", "Shift+F6 goes the other way", new Set(back).size === 3, [`Shift+F6 went to: ${back.join(" > ")}`]);
  // The tree by arrow keys.
  await page.ev(`document.querySelector('#tree [aria-selected=true]')?.focus()`);
  const before = await page.ev(`document.querySelector('#tree [aria-selected=true]')?.textContent?.trim()`);
  await page.key("ArrowDown", "ArrowDown", 40); await sleep(150);
  const after = await page.ev(`document.querySelector('#tree [aria-selected=true]')?.textContent?.trim()`);
  note("Main window", "the arrow keys move through the chapters and topics, and the selected one changes", before !== after, [`${before} > ${after}`]);
}

// ---- Each window the toolbar opens
const openers = [
  ["b-vars", "Project variables"], ["b-style", "Writing style"], ["b-look", "Look of the book"], ["b-reuse", "Reuse"], ["b-history", "History"], ["b-drafts", "Drafts"], ["b-guides", "Guides"],
  ["b-index", "Index"], ["b-ai", "AI help"], ["b-mcp", "MCP access"], ["b-check", "Check"], ["b-export", "Export"], ["b-new", "New project"],
];
for (const [button, label] of openers) {
  await page.ev(`document.getElementById(${JSON.stringify(button)})?.focus()`);
  await page.ev(`document.getElementById(${JSON.stringify(button)})?.click()`);
  const title = await waitFor(dialogTitle, 4000, 100);
  const section = `Window: ${label}`;
  if (!title) { note(section, "the window opens", false, [`no dialog opened from #${button}`]); continue; }
  await sleep(300);
  note(section, `opens with a title ("${title}")`, true);
  const role = await page.ev(`(() => { const d = document.querySelector('dialog[open]'); return { labelled: !!d.getAttribute('aria-labelledby') && !!document.getElementById(d.getAttribute('aria-labelledby')), name: d.getAttribute('aria-labelledby') }; })()`);
  note(section, "the window is named by its title", role.labelled, [`aria-labelledby=${role.name}`]);
  const inFocus = await page.ev(`!!document.activeElement?.closest('dialog[open]')`);
  note(section, "the keyboard starts inside the window", inFocus);
  const tree = await auditTree(page, "dialog[open]");
  note(section, "every control inside has a name", tree.problems.length === 0, tree.problems);
  const dom = await auditDom(page, "dialog[open]");
  note(section, "no broken label references, every field labelled", dom.length === 0, dom);
  const contrast = await auditContrast(page, "dialog[open]");
  note(section, "text contrast is enough where it can be measured", contrast.length === 0, contrast.map((c) => `${c.ratio} (needs ${c.need}) "${c.text}" ${c.element}`));
  const walked = await walkTab(page, 70, { inside: "dialog[open]" });
  note(section, "Tab goes round inside the window and never leaves it or sticks", walked.outside.length === 0 && !walked.stuck && walked.distinct >= 1, [...new Set(walked.outside)]);
  note(section, "everything the keyboard reaches shows where it is", walked.unseen.length === 0, [...new Set(walked.unseen)]);
  await page.key("Escape", "Escape", 27); await sleep(500);
  const closed = (await dialogTitle()) === null;
  note(section, "Escape closes it", closed);
  if (!closed) { await page.ev(`document.querySelector('dialog[open]')?.close()`); await sleep(300); }
  const backTo = await page.ev(`document.activeElement?.id ?? ''`);
  note(section, "the keyboard goes back to the button that opened it", backTo === button, [`focus is on "${backTo}"`]);
}

// ---- The windows opened from a topic's page and its pictures
{
  await page.ev(`(() => { const rows = [...document.querySelectorAll('#tree [role=treeitem]')]; const row = rows.find((r) => /^\\s*[▾▸]?\\s*2\\.2\\b/.test(r.textContent ?? '')); row?.click(); })()`);
  await sleep(900);
  const heading = await page.ev(`document.getElementById('page-heading')?.textContent ?? ''`);
  const labels = await page.ev(`(() => {
    const out = [];
    [...document.querySelectorAll('#pane-page button, #pane-props button')].forEach((b, i) => {
      const text = (b.getAttribute('aria-label') || b.textContent || '').trim();
      if (b.disabled || !b.offsetParent) return;
      if (!/description|picture view|callouts|drawing|circle|comment|link to|condition|style|marks/i.test(text)) return;
      if (/remove|delete|accept|reject|draft|replace|capture|import/i.test(text)) return;
      b.setAttribute('data-audit', String(i)); out.push({ i, text });
    });
    return out;
  })()`);
  note("Page of a topic", `the page "${heading}" has buttons that open windows (${labels.length} found)`, labels.length > 0, labels.map((l) => l.text));
  const seenTitles = new Set();
  for (const { i, text } of labels) {
    await page.ev(`document.querySelector('[data-audit="${i}"]')?.focus()`);
    await page.ev(`document.querySelector('[data-audit="${i}"]')?.click()`);
    const title = await waitFor(dialogTitle, 2500, 100);
    if (!title) { await sleep(200); continue; }
    const section = `Window: ${title}`;
    if (seenTitles.has(title)) { await page.key("Escape", "Escape", 27); await sleep(400); if (await dialogTitle()) await page.ev(`document.querySelector('dialog[open]')?.close()`); continue; }
    seenTitles.add(title);
    await sleep(300);
    note(section, `opened by "${text.slice(0, 50)}"; the window is named by its title`, await page.ev(`(() => { const d = document.querySelector('dialog[open]'); const id = d.getAttribute('aria-labelledby'); return !!id && !!document.getElementById(id); })()`));
    note(section, "the keyboard starts inside the window", await page.ev(`!!document.activeElement?.closest('dialog[open]')`));
    const tree = await auditTree(page, "dialog[open]");
    note(section, "every control inside has a name", tree.problems.length === 0, tree.problems);
    const dom = await auditDom(page, "dialog[open]");
    note(section, "no broken label references, every field labelled", dom.length === 0, dom);
    const contrast = await auditContrast(page, "dialog[open]");
    note(section, "text contrast is enough where it can be measured", contrast.length === 0, contrast.map((c) => `${c.ratio} (needs ${c.need}) "${c.text}" ${c.element}`));
    const walked = await walkTab(page, 70, { inside: "dialog[open]" });
    note(section, "Tab goes round inside the window and never leaves it or sticks", walked.outside.length === 0 && !walked.stuck, [...new Set(walked.outside)]);
    note(section, "everything the keyboard reaches shows where it is", walked.unseen.length === 0, [...new Set(walked.unseen)]);
    await page.key("Escape", "Escape", 27); await sleep(500);
    const closed = (await dialogTitle()) === null;
    note(section, "Escape closes it", closed);
    if (!closed) { await page.ev(`document.querySelector('dialog[open]')?.close()`); await sleep(300); }
  }
  const live = await page.ev(`(() => { const a = document.getElementById('announce'); return { role: a?.getAttribute('role'), live: a?.getAttribute('aria-live') }; })()`);
  note("Main window", "results are announced through a polite live region", live.role === "status" && live.live === "polite", [JSON.stringify(live)]);
}

// ---- A topic with a page, the previews, and a narrow window
{
  await page.ev(`(() => { const rows = [...document.querySelectorAll('#tree [role=treeitem]')]; const row = rows.find((r) => /^\\s*1\\.1\\b/.test(r.textContent ?? '')) ?? rows[2]; row?.click(); })()`);
  await sleep(700);
  const edit = await auditTree(page, "#pane-page");
  note("Page of a topic", "every control of the page editor and picture list has a name", edit.problems.length === 0, edit.problems);
  const domEdit = await auditDom(page, "#pane-page");
  note("Page of a topic", "no broken label references, every field labelled, every picture described", domEdit.length === 0, domEdit);
  for (const tab of ["tab-print", "tab-help", "tab-guide"]) {
    await page.ev(`document.getElementById(${JSON.stringify(tab)}).click()`); await sleep(1800);
    const t = await auditTree(page, "#preview-content");
    note("Previews", `${tab.replace("tab-", "")} preview: names and headings inside the preview are sound`, t.problems.length === 0, t.problems);
    const c = await auditContrast(page, "#preview-content");
    note("Previews", `${tab.replace("tab-", "")} preview: text contrast is enough where it can be measured`, c.length === 0, c.map((x) => `${x.ratio} (needs ${x.need}) "${x.text}" ${x.element}`));
  }
  await page.ev(`document.getElementById('tab-edit').click()`); await sleep(400);
  await page.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  const overflow = await page.ev(`({ scroll: document.scrollingElement.scrollWidth, client: document.scrollingElement.clientWidth })`);
  note("Reflow (information)", `at a window 320 pixels wide the page ${overflow.scroll <= overflow.client + 1 ? "fits without sideways scrolling" : `needs sideways scrolling (${overflow.scroll} pixels of content in ${overflow.client})`}`, overflow.scroll <= overflow.client + 1, ["WCAG 1.4.10 asks for no sideways scrolling at 320 pixels for ordinary pages; this is a three-pane desktop editor, so this is recorded, not required."], true);
  await page.send("Emulation.clearDeviceMetricsOverride");
}

fs.writeFileSync(path.join(outDir, "a11y_editor_result.json"), JSON.stringify(report, null, 2));
console.log(`\n${report.summary.checks - report.summary.failed} of ${report.summary.checks} checks passed`);
page.close();
try { child.kill(); } catch { /* gone */ }
endProfileProcesses(profile);
