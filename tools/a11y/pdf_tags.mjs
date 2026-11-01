// Looks inside a PDF the program made for what a screen reader needs: that it is marked as tagged, has a structure tree with headings, lists, figures with alternative text and links, a language, a title that is
// shown, and bookmarks. It reads the file itself (inflating the compressed parts), so it finds only what is written there; it cannot say how a screen reader reads it. Usage: node tools/a11y/pdf_tags.mjs <file.pdf> [...]
import * as fs from "node:fs";
import * as zlib from "node:zlib";

for (const file of process.argv.slice(2)) {
  const bytes = fs.readFileSync(file);
  const raw = bytes.toString("latin1");
  const parts = [raw];
  // Inflate every compressed stream; object streams hide most of the structure tree.
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    try { parts.push(zlib.inflateSync(bytes.subarray(start, end)).toString("latin1")); } catch { /* not Flate, or damaged: skip */ }
    re.lastIndex = end;
  }
  const all = parts.join("\n");
  const count = (rx) => (all.match(rx) ?? []).length;
  const rows = [];
  const check = (name, ok, detail = "") => rows.push({ name, ok, detail });
  check("marked as tagged (/MarkInfo with /Marked true)", /\/MarkInfo\s*<<[^>]*\/Marked\s+true/.test(all));
  check("has a structure tree (/StructTreeRoot)", /\/StructTreeRoot/.test(all));
  const headings = count(/\/S\s*\/H[1-6]\b/g);
  check("has headings in the structure tree", headings > 0, `${headings} heading tags`);
  const lists = count(/\/S\s*\/L\b/g), items = count(/\/S\s*\/LI\b/g);
  check("has lists", lists > 0, `${lists} lists, ${items} items`);
  const figures = count(/\/S\s*\/Figure\b/g), alts = count(/\/Alt\s*[(<]/g);
  check("pictures are tagged as figures", figures > 0, `${figures} figures`);
  check("figures have alternative text", figures === 0 || alts >= figures, `${alts} /Alt entries for ${figures} figures`);
  const links = count(/\/S\s*\/Link\b/g);
  check("links are tagged", links > 0, `${links} link tags`);
  check("the document language is set (/Lang)", /\/Lang\s*\(/.test(all), (all.match(/\/Lang\s*\(([^)]*)\)/) ?? [])[1] ?? "");
  check("the title is shown, not the file name (/DisplayDocTitle true)", /\/DisplayDocTitle\s+true/.test(all));
  check("there is a title (/Title)", /\/Title\s*[(<]/.test(all) || /<dc:title>/.test(all));
  check("has bookmarks (/Outlines)", /\/Outlines/.test(all), `${count(/\/Type\s*\/Outlines/g)} outline roots`);
  check("tables have header cells when there are tables", count(/\/S\s*\/Table\b/g) === 0 || count(/\/S\s*\/TH\b/g) > 0, `${count(/\/S\s*\/Table\b/g)} tables, ${count(/\/S\s*\/TH\b/g)} header cells`);
  console.log(`\n${file}  (${Math.round(bytes.length / 1024)} KB)`);
  for (const r of rows) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  | ${r.detail}` : ""}`);
}
