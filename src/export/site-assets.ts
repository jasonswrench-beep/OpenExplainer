// The style sheet and the little script that go with an exported help site (assets/site.css and assets/site.js). The page structure is plain HTML that works with no script at all: the
// contents tree, the breadcrumbs and the previous and next links are links between files. The script only adds search over assets/search-index.js (loaded as a script, so it works when the
// pages are opened straight from a folder, where a browser will not fetch a JSON file) and a Print this page button. Colours are chosen to meet WCAG 2.2 AA (tests/builtin-contrast.test.ts
// checks them); a keyboard user gets a skip link, a visible focus outline everywhere and landmarks.

import { automaticFonts, fontById, type Look } from "../project/look.ts";

/** The style sheet with the look's choices after it: the accent colour for the header bar, the links and the headings, and the fonts when the author chose some. */
export function siteCss(look: Look): string {
  const extra: string[] = [".site-logo { height: 2rem; width: auto; vertical-align: middle; margin-right: 0.6rem; background: #ffffff; padding: 0.15rem; border-radius: 3px; }", ".site-footer-text { margin-right: 1rem; }"];
  if (look.accent) extra.push(`:root { --accent: ${look.accent}; --link: ${look.accent}; }`, `h1, h2, h3, h4, h5, h6 { color: ${look.accent}; }`);
  if (!automaticFonts(look)) {
    extra.push(`body { font-family: ${fontById(look.bodyFont).css}; }`, `h1, h2, h3, h4, h5, h6, .site-title, .site-header, .hs-tree, .hs-crumbs, .pv-box, .pv-entries { font-family: ${fontById(look.headingFont).css}; }`);
  }
  return `${SITE_CSS}\n${extra.join("\n")}\n`;
}

export const SITE_CSS = `:root { --text: #1a1a1a; --muted: #444444; --link: #0b57d0; --accent: #1f4e8c; --focus: #b35c00; --line: #767676; --panel: #f4f6f9; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, "Segoe UI", sans-serif; line-height: 1.55; color: var(--text); background: #ffffff; }
a { color: var(--link); }
a:focus-visible, button:focus-visible, input:focus-visible, [tabindex]:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.skip-link { position: absolute; left: -999px; top: 0; background: #ffffff; color: var(--text); padding: 0.6rem 1rem; z-index: 10; }
.skip-link:focus { left: 0.5rem; top: 0.5rem; }
.site-header { background: var(--accent); color: #ffffff; padding: 0.6rem 1rem; display: flex; flex-wrap: wrap; gap: 0.6rem 1.5rem; align-items: center; justify-content: space-between; }
.site-title { margin: 0; font-size: 1.2rem; font-weight: 700; }
.site-title a { color: #ffffff; text-decoration: none; }
.site-nav a { color: #ffffff; font-weight: 600; }
.pv-index-groups { column-width: 18rem; column-gap: 2rem; }
.pv-index-group { break-inside: avoid; margin: 0 0 1rem; }
.pv-index-letter { font-size: 1.15rem; border-bottom: 1px solid var(--line); margin: 0.6rem 0 0.3rem; }
.pv-index-list { list-style: none; margin: 0; padding: 0; }
.pv-index-list li { margin: 0.25rem 0; }
.site-search { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
.site-search input { font: inherit; padding: 0.3rem 0.5rem; min-width: 14rem; }
.site-search button, .site-footer button, .search-results button { font: inherit; padding: 0.3rem 0.8rem; cursor: pointer; }
.search-results { background: var(--panel); border-bottom: 1px solid var(--line); padding: 0.5rem 1rem 1rem; }
.search-results ol { margin: 0.4rem 0; padding-left: 1.4rem; }
.search-results li { margin: 0.5rem 0; }
.search-results .snippet { margin: 0.1rem 0 0; color: var(--muted); font-size: 0.92rem; }
.hs { padding: 1rem; max-width: 70rem; margin: 0 auto; display: block; }
.hs-tree-list { list-style: none; margin: 0; padding-left: 1rem; }
.hs-tree > .hs-tree-list { padding-left: 0; }
.hs-tree a[aria-current="page"] { font-weight: 700; text-decoration: underline; color: var(--text); }
.hs-crumbs ol { list-style: none; display: flex; flex-wrap: wrap; gap: 0.3rem; padding: 0; margin: 0 0 0.6rem; font-size: 0.92rem; }
.hs-crumbs li + li::before { content: "\\203A"; margin-right: 0.3rem; }
.hs-page h1 { font-size: 1.7rem; margin: 0.3rem 0 0.8rem; }
.hs-page h2 { font-size: 1.3rem; margin: 1.4rem 0 0.5rem; }
.hs-pager { display: flex; justify-content: space-between; gap: 1rem; margin-top: 1.5rem; border-top: 1px solid var(--line); padding-top: 0.6rem; flex-wrap: wrap; }
.pv-figure { margin: 1rem 0; }
.pv-figure img { max-width: 100%; height: auto; border: 1px solid var(--line); }
.pv-entries { list-style: none; padding: 0; margin: 0.4rem 0 0; font-size: 0.92rem; }
.pv-steps { padding-left: 1.6rem; }
.pv-steps li { margin: 0.6rem 0; }
.pv-result { margin: 0.3rem 0; }
.pv-box { border: 1px solid var(--line); border-left-width: 8px; padding: 0.3rem 0.9rem; margin: 1rem 0; background: var(--panel); }
.pv-box p { margin: 0.3rem 0; }
.pv-box-label { font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.85rem; }
.pv-box-design-tip { border-left-color: #1f4e8c; }
.pv-box-caution { border-left-color: #a31515; }
.pv-box-bright-idea { border-left-color: #8a6d00; }
.pv-box-power-tip { border-left-color: #5a2a82; }
.pv-box-time-saver { border-left-color: #1b6b2f; }
.pv-box-new-feature { border-left-color: #00606b; }
.topic-link { color: var(--link, #0b57d0); text-decoration: underline; }
.pv-see-also { margin: 1rem 0; }
.pv-see-also h2, .pv-see-also h3, .pv-see-also h4, .pv-see-also h5, .pv-see-also h6 { font-size: 1rem; margin: 0.4rem 0; }
.pv-see-also ul { margin: 0.2rem 0; padding-left: 1.4rem; }
.pv-missing { color: #8a1c1c; font-weight: 600; }
.site-footer { max-width: 70rem; margin: 0 auto; padding: 0 1rem 1.5rem; }
@media (min-width: 52rem) { .hs { display: grid; grid-template-columns: minmax(12rem, 16rem) minmax(0, 1fr); gap: 1.5rem; } .hs-tree { border-right: 1px solid var(--line); padding-right: 0.8rem; } }
@media print { .skip-link, .site-header, .search-results, .hs-tree, .hs-pager, .site-footer, .hs-crumbs { display: none !important; } .hs { display: block; padding: 0; } a { color: inherit; } .pv-figure img { border: 0; } }
`;

export const SITE_JS = `(function () {
  var form = document.getElementById("site-search");
  var input = document.getElementById("site-search-input");
  var box = document.getElementById("search-results");
  var title = document.getElementById("search-title");
  var list = document.getElementById("search-list");
  var close = document.getElementById("search-close");
  var print = document.getElementById("print-page");
  if (print) print.addEventListener("click", function () { window.print(); });
  if (!form || !input || !box || !title || !list) return;
  function words(text) { return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }
  function find(query) {
    var terms = words(query);
    var found = [];
    (window.SEARCH_INDEX || []).forEach(function (entry) {
      var head = (entry.number + " " + entry.title).toLowerCase();
      var body = entry.text.toLowerCase();
      var score = 0;
      for (var i = 0; i < terms.length; i++) {
        var inHead = head.indexOf(terms[i]) >= 0;
        var inBody = body.indexOf(terms[i]) >= 0;
        if (!inHead && !inBody) return;
        score += (inHead ? 5 : 0) + (inBody ? 1 : 0);
      }
      var at = body.indexOf(terms[0]);
      var snippet = at < 0 ? "" : (at > 40 ? "\\u2026" : "") + entry.text.slice(Math.max(0, at - 40), at + 100) + (at + 100 < entry.text.length ? "\\u2026" : "");
      found.push({ entry: entry, score: score, snippet: snippet });
    });
    found.sort(function (a, b) { return b.score - a.score; });
    return found;
  }
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var query = input.value.trim();
    var terms = words(query);
    list.textContent = "";
    if (terms.length === 0) { box.hidden = true; return; }
    var found = find(query);
    title.textContent = found.length === 0 ? 'No topics match "' + query + '".' : found.length + (found.length === 1 ? " topic matches" : " topics match") + ' "' + query + '".';
    found.slice(0, 50).forEach(function (hit) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = hit.entry.url;
      a.textContent = hit.entry.number + " " + hit.entry.title;
      li.appendChild(a);
      if (hit.snippet) { var p = document.createElement("p"); p.className = "snippet"; p.textContent = hit.snippet; li.appendChild(p); }
      list.appendChild(li);
    });
    box.hidden = false;
    box.focus();
  });
  if (close) close.addEventListener("click", function () { box.hidden = true; input.focus(); });
})();
`;
