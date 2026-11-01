// Machine checks of what a screen reader and a keyboard user meet, run through a browser's debugging port. They use the browser's own accessibility tree (names, roles, headings, landmarks), the order the Tab key
// visits things, whether focus can be trapped, and whether a focused thing can be seen. They find faults; they cannot tell how a page SOUNDS in a screen reader, and nothing here claims they can.
import { spawn, execSync } from "node:child_process";
import * as fs from "node:fs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const waitFor = async (fn, ms = 10000, every = 150) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(every); } return null; };

/** Connects to one page of a browser that has a debugging port. */
export async function connect(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let nextId = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++nextId; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "page error");
    return r.result.result.value;
  };
  const key = async (k, code, vk, modifiers = 0) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers });
  };
  const tab = (shift = false) => key("Tab", "Tab", 9, shift ? 8 : 0);
  return { send, ev, key, tab, close: () => { try { ws.close(); } catch { /* closed */ } } };
}

const INTERACTIVE = new Set(["button", "link", "textbox", "searchbox", "combobox", "listbox", "checkbox", "radio", "tab", "menuitem", "treeitem", "spinbutton", "slider", "switch", "option"]);

/**
 * The names and roles in the accessibility tree: every interactive thing must have a name, every image a description (or be marked as decoration), headings must not skip a level, and the page needs one main
 * landmark. `scope` is a CSS selector to look inside (for a dialog), or empty for the whole page.
 */
export async function auditTree(page, scope = "") {
  await page.send("Accessibility.enable");
  await page.send("DOM.enable");
  const { result } = await page.send("Accessibility.getFullAXTree");
  const nodes = result.nodes.filter((n) => !n.ignored);
  const inside = scope
    ? new Set((await (async () => {
        const doc = await page.send("DOM.getDocument", { depth: -1, pierce: true });
        const q = await page.send("DOM.querySelectorAll", { nodeId: doc.result.root.nodeId, selector: scope });
        const ids = new Set();
        for (const nodeId of q.result.nodeIds) {
          const d = await page.send("DOM.describeNode", { nodeId, depth: -1, pierce: true });
          const walk = (n) => { if (n.backendNodeId) ids.add(n.backendNodeId); (n.children ?? []).forEach(walk); };
          walk(d.result.node);
        }
        return [...ids];
      })()))
    : null;
  const mine = nodes.filter((n) => !inside || (n.backendDOMNodeId && inside.has(n.backendDOMNodeId)));
  const describe = async (n) => {
    if (!n.backendDOMNodeId) return "";
    const d = await page.send("DOM.describeNode", { backendNodeId: n.backendDOMNodeId });
    const a = d.result?.node?.attributes ?? [];
    const attr = (name) => { const i = a.indexOf(name); return i >= 0 ? a[i + 1] : ""; };
    return `<${(d.result?.node?.localName ?? "?")}${attr("id") ? ` id="${attr("id")}"` : ""}${attr("class") ? ` class="${attr("class")}"` : ""}>`;
  };
  const problems = [];
  const headings = [];
  const landmarks = [];
  let counted = 0;
  for (const n of mine) {
    const role = n.role?.value;
    const name = (n.name?.value ?? "").trim();
    if (INTERACTIVE.has(role)) {
      counted++;
      if (name === "") problems.push(`${role} with no name: ${await describe(n)}`);
    }
    if (role === "img" && name === "" && !(n.properties ?? []).some((p) => p.name === "hiddenRoot")) problems.push(`image with no description: ${await describe(n)}`);
    if (role === "heading") {
      const level = Number((n.properties ?? []).find((p) => p.name === "level")?.value?.value ?? 0);
      headings.push({ level, name });
      if (name === "") problems.push(`heading with no words: ${await describe(n)}`);
    }
    if (["main", "navigation", "banner", "contentinfo", "complementary", "region", "search", "form"].includes(role)) landmarks.push({ role, name });
  }
  let previous = 0;
  for (const h of headings) {
    if (previous && h.level > previous + 1) problems.push(`heading level jumps from ${previous} to ${h.level}: "${h.name.slice(0, 50)}"`);
    previous = h.level;
  }
  return { interactive: counted, headings, landmarks, problems };
}

/** Things the tree does not show: ids used twice, references to ids that are not there, a page with no language or title, and form controls with no label. */
export async function auditDom(page, scope = "") {
  return page.ev(`(() => {
    const root = ${scope ? `document.querySelector(${JSON.stringify(scope)})` : "document"} ?? document;
    const out = [];
    const all = [...root.querySelectorAll('[id]')];
    const seen = new Map();
    for (const e of all) seen.set(e.id, (seen.get(e.id) ?? 0) + 1);
    for (const [id, n] of seen) if (n > 1) out.push('id used ' + n + ' times: ' + id);
    for (const e of root.querySelectorAll('[aria-labelledby],[aria-describedby],[aria-controls]')) {
      for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
        for (const id of (e.getAttribute(attr) ?? '').split(/\\s+/).filter(Boolean)) if (!document.getElementById(id)) out.push(attr + ' points at a missing id "' + id + '" on <' + e.localName + (e.id ? ' id=' + e.id : '') + '>');
      }
    }
    for (const e of root.querySelectorAll('input:not([type=hidden]), select, textarea')) {
      const named = e.labels?.length || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.title;
      if (!named) out.push('form control with no label: <' + e.localName + (e.id ? ' id=' + e.id : '') + ' type=' + (e.type || '') + '>');
    }
    for (const e of root.querySelectorAll('img')) if (!e.hasAttribute('alt')) out.push('img with no alt attribute: ' + (e.getAttribute('src') ?? '').slice(0, 60));
    for (const e of root.querySelectorAll('a')) if (e.hasAttribute('href') && !(e.textContent ?? '').trim() && !e.getAttribute('aria-label') && !e.querySelector('img[alt]:not([alt=""])')) out.push('link with no words: ' + (e.getAttribute('href') ?? '').slice(0, 60));
    for (const e of root.querySelectorAll('button')) if (!(e.textContent ?? '').trim() && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.title) out.push('button with no words: <button' + (e.id ? ' id=' + e.id : '') + '>');
    for (const e of root.querySelectorAll('table')) if (!e.querySelector('th')) out.push('table with no header cells');
    if (!root.querySelectorAll || root === document) {
      if (!document.documentElement.lang) out.push('the page has no language (html lang)');
      if (!document.title.trim()) out.push('the page has no title');
    }
    return out;
  })()`);
}

/** Text with too little contrast against what is behind it, for a person to look at (it cannot see images or gradients behind text, and ignores disabled controls). */
export async function auditContrast(page, scope = "") {
  return page.ev(`(() => {
    const root = ${scope ? `document.querySelector(${JSON.stringify(scope)})` : "document.body"} ?? document.body;
    const parse = (c) => { const m = /rgba?\\(([^)]+)\\)/.exec(c); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    const backgroundOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; } } let base = { r: 255, g: 255, b: 255, a: 1 }; for (const c of stack.reverse()) base = over(c, base); return base; };
    const out = []; const seen = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? '').trim(); if (!text) continue;
      const el = n.parentElement; if (!el || el.closest('[hidden],[disabled],script,style')) continue;
      const style = getComputedStyle(el); if (style.visibility === 'hidden' || style.display === 'none') continue;
      const rect = el.getBoundingClientRect(); if (rect.width === 0 || rect.height === 0) continue;
      const fg = parse(style.color); if (!fg) continue;
      const bg = backgroundOf(el); const text2 = over(fg, bg);
      const ratio = (Math.max(lum(text2), lum(bg)) + 0.05) / (Math.min(lum(text2), lum(bg)) + 0.05);
      const size = parseFloat(style.fontSize); const bold = parseInt(style.fontWeight, 10) >= 700;
      const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      const key = el.localName + '|' + style.color + '|' + style.backgroundColor;
      if (ratio < need && !seen.has(key)) { seen.add(key); out.push({ ratio: Math.round(ratio * 100) / 100, need, text: text.slice(0, 40), element: '<' + el.localName + (el.id ? ' id=' + el.id : '') + (el.className && typeof el.className === 'string' ? ' class=' + el.className : '') + '>' }); }
    }
    return out;
  })()`);
}

/** Presses Tab `count` times from where the keyboard is and records where it goes, whether anything is trapped (the same few things over and over), and whether each stop can be seen. */
export async function walkTab(page, count, { inside = "" } = {}) {
  const stops = [];
  for (let i = 0; i < count; i++) {
    await page.tab();
    await sleep(70);
    stops.push(await page.ev(`(() => {
      const e = document.activeElement; if (!e) return null;
      const s = getComputedStyle(e);
      const seen = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
      const within = ${inside ? `!!e.closest(${JSON.stringify(inside)})` : "true"};
      return { tag: e.localName, id: e.id || '', name: (e.getAttribute('aria-label') || e.textContent || e.value || '').trim().slice(0, 40), seen, within };
    })()`));
  }
  const key = (s) => (s ? `${s.tag}#${s.id}|${s.name}` : "none");
  const distinct = new Set(stops.map(key));
  return {
    stops,
    distinct: distinct.size,
    unseen: stops.filter((s) => s && !s.seen && s.tag !== 'body').map(key),
    outside: stops.filter((s) => s && !s.within).map(key),
    // Tab always moves on: if the same thing is current twice in a row, the keyboard is stuck.
    stuck: distinct.size === 1 && (await page.ev(`document.querySelectorAll(${JSON.stringify((inside || 'body') + ' a[href], ' + (inside || 'body') + ' button:not([disabled]), ' + (inside || 'body') + ' input:not([disabled]):not([type=hidden]), ' + (inside || 'body') + ' select:not([disabled]), ' + (inside || 'body') + ' textarea:not([disabled]), ' + (inside || 'body') + ' [tabindex="0"]')}).length`)) > 1,
  };
}

/** Starts a headless Edge (a browser of mine, not the person's) with a debugging port, and returns a way to open pages in it. */
export async function startBrowser(port, profileDir) {
  const edge = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].find((p) => fs.existsSync(p));
  if (!edge) throw new Error("Edge was not found");
  fs.mkdirSync(profileDir, { recursive: true });
  const child = spawn(edge, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, "--no-first-run", "--disable-gpu", "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
  await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { return false; } }, 20000);
  return {
    child,
    open: async (url) => {
      const made = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
      const page = await connect(made.webSocketDebuggerUrl);
      await sleep(600);
      return { page, id: made.id, close: async () => { page.close(); try { await fetch(`http://127.0.0.1:${port}/json/close/${made.id}`); } catch { /* gone */ } } };
    },
    stop: () => { try { child.kill(); } catch { /* gone */ } },
  };
}

/** Ends the leftover browser-engine processes that belong to one of MY profile folders (matched by its exact path), so a new run can start on it. */
export function endProfileProcesses(dir) {
  const needle = dir.replace(/\//g, "\\");
  try { execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${needle}') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`, { stdio: "ignore" }); } catch { /* none left */ }
}
