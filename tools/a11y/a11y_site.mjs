// Machine checks of the help site and the e-book pages a reader would meet, in a headless Edge of mine. Usage: node tools/a11y/a11y_site.mjs <folder with the unpacked help site> <folder with the unpacked EPUB's OEBPS>
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { auditTree, auditDom, auditContrast, startBrowser, sleep, walkTab } from "./a11y_lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.A11Y_OUT ?? path.join(here, "out");
fs.mkdirSync(outDir, { recursive: true });
const [siteDir, epubDir] = process.argv.slice(2);
const browser = await startBrowser(9331, path.join(outDir, "site_profile"));
const report = { sections: [], summary: { checks: 0, failed: 0 } };
const note = (section, name, ok, detail = []) => {
  report.summary.checks++;
  if (!ok) report.summary.failed++;
  let s = report.sections.find((x) => x.section === section);
  if (!s) report.sections.push((s = { section, rows: [] }));
  s.rows.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  [${section}] ${name}${detail.length ? "\n      " + detail.slice(0, 8).join("\n      ") + (detail.length > 8 ? `\n      ... and ${detail.length - 8} more` : "") : ""}`);
};

async function audit(section, file, { skipLink = false, markdown = false } = {}) {
  const tab = await browser.open(pathToFileURL(file).href);
  const page = tab.page;
  try {
    const name = path.basename(file);
    const lang = await page.ev(`document.documentElement.lang || document.documentElement.getAttribute('xml:lang') || ''`);
    note(section, `${name}: the page says its language (${lang || "none"})`, !!lang);
    const title = await page.ev(`document.title`);
    note(section, `${name}: the page has a title (${title.slice(0, 50)})`, !!title.trim());
    const tree = await auditTree(page);
    note(section, `${name}: every link, button and field has a name; pictures are described; heading levels do not jump`, tree.problems.length === 0, tree.problems);
    note(section, `${name}: exactly one level-1 heading`, tree.headings.filter((h) => h.level === 1).length === 1, [`headings: ${tree.headings.slice(0, 10).map((h) => `h${h.level} ${h.name}`).join(" | ")}`]);
    if (skipLink) note(section, `${name}: a main landmark and a labelled navigation`, tree.landmarks.some((l) => l.role === "main") && tree.landmarks.some((l) => l.role === "navigation" && l.name), [`landmarks: ${tree.landmarks.map((l) => `${l.role}${l.name ? ` "${l.name}"` : ""}`).join(", ")}`]);
    const dom = await auditDom(page);
    note(section, `${name}: no repeated ids, no broken label references, every image has an alt attribute, no empty links`, dom.length === 0, dom);
    const contrast = await auditContrast(page);
    note(section, `${name}: text contrast is enough where it can be measured`, contrast.length === 0, contrast.map((c) => `${c.ratio} (needs ${c.need}) "${c.text}" ${c.element}`));
    if (skipLink) {
      await page.ev(`document.body.focus()`);
      const walked = await walkTab(page, 25);
      note(section, `${name}: the first thing Tab reaches is the skip link`, /skip/i.test(walked.stops[0]?.name ?? ""), [`first stop: ${walked.stops[0]?.name}`]);
      note(section, `${name}: every stop the keyboard makes can be seen`, walked.unseen.length === 0, [...new Set(walked.unseen)]);
      await page.send("Page.reload"); await sleep(900);
      await page.tab(); await sleep(60);
      await page.ev(`document.activeElement.click()`); await sleep(200);
      const landed = await page.ev(`document.activeElement?.id ?? ''`);
      note(section, `${name}: the skip link moves the keyboard to the topic`, landed === "topic-main", [`focus is on "${landed}"`]);
    }
    if (markdown) {
      const alt = await page.ev(`!!document.querySelector('link[rel=alternate][type="text/markdown"]')`);
      note(section, `${name}: the page points to its Markdown version`, alt);
    }
  } finally {
    await tab.close();
  }
}

if (siteDir) {
  const pages = fs.readdirSync(siteDir).filter((f) => f.endsWith(".html"));
  const sample = [...new Set(["index.html", "book-index.html", ...pages.filter((_, i) => i % Math.max(1, Math.floor(pages.length / 6)) === 0).slice(0, 6)])].filter((f) => pages.includes(f));
  for (const f of sample) await audit("Help site", path.join(siteDir, f), { skipLink: true, markdown: f !== "book-index.html" });
  note("Help site", `${pages.length} pages; ${sample.length} were examined (the first, the index and an even spread)`, true);
}
if (epubDir) {
  for (const f of ["title.xhtml", "nav.xhtml", "ch1.xhtml", "ch2.xhtml", "book-index.xhtml"]) if (fs.existsSync(path.join(epubDir, f))) await audit("E-book pages", path.join(epubDir, f));
}
fs.writeFileSync(path.join(outDir, "a11y_site_result.json"), JSON.stringify(report, null, 2));
console.log(`\n${report.summary.checks - report.summary.failed} of ${report.summary.checks} checks passed`);
browser.stop();
