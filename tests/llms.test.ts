import test from "node:test";
import assert from "node:assert/strict";
import { addNode, addPicture, createProject, ensurePage, findNode, type Picture } from "../src/project/model.ts";
import { addBlock, makeBlock, type CalloutBlock, type ParagraphBlock, type PictureBlock, type ProcedureBlock } from "../src/project/page.ts";
import { parseMarks } from "../src/project/text.ts";
import { buildHelpSite, buildHelpSiteText } from "../src/export/help-site.ts";
import type { FlatPicture } from "../src/export/pictures.ts";

const png = (): Uint8Array => { const b = new Uint8Array(33); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]); return b; };

function book() {
  const project = createProject("Acme *Draw* [guide]");
  project.variables = { PRODUCT: "Acme Draw", VERSION: "2.0", COMPANY: "Acme & Sons" };
  const one = addNode(project.tree, null, "Getting started");
  const saving = addNode(project.tree, one.id, "Saving");
  const printing = addNode(project.tree, one.id, "Printing");
  const two = addNode(project.tree, null, "Reference");
  const picture: Picture = { id: "pic1", file: "images/pic1.png", width: 640, height: 360, altText: "The Save dialog", source: { kind: "import", capturedAt: "2026-11-01T00:00:00Z" } };
  addPicture(project.tree, saving.id, picture);
  const intro = makeBlock("paragraph") as ParagraphBlock;
  intro.text = parseMarks("Welcome to {{PRODUCT}}. This is a *long* introduction that goes on and on and on, so that the summary in the list has to be cut short at a word, because a list of pages should stay easy to scan by eye.");
  addBlock(ensurePage(one), intro);
  const para = makeBlock("paragraph") as ParagraphBlock;
  para.text = [...parseMarks("Press [[Save]] to keep your work, then see "), { text: "Printing", mark: "link", topic: printing.id }, { text: "." }];
  const pic = makeBlock("picture") as PictureBlock;
  pic.pictureId = "pic1";
  const proc = makeBlock("procedure") as ProcedureBlock;
  proc.steps = [{ id: "s1", text: parseMarks("Open the File menu.") }, { id: "s2", text: parseMarks("Choose **Save**."), result: parseMarks("A file is saved.") }];
  const box = makeBlock("callout", { kind: "caution" }) as CalloutBlock;
  box.text = parseMarks("Save before you close.");
  const sub = makeBlock("heading");
  (sub as { text: string }).text = "Saving a copy";
  [para, pic, proc, box, sub].forEach((b) => addBlock(ensurePage(saving), b));
  const steps = makeBlock("procedure") as ProcedureBlock;
  steps.steps = [{ id: "p1", text: parseMarks("Click Print.") }];
  addBlock(ensurePage(printing), steps);
  findNode(project.tree, saving.id)!.seeAlso = [printing.id];
  const flat = new Map<string, FlatPicture>([["pic1", { path: "images/pic1.png", bytes: png(), width: 640, height: 360 }]]);
  return { project, flat, one, saving, printing, two };
}

test("every page of the help site has a Markdown version beside it, linked from the page, and the pages link to each other", () => {
  const { project, flat, saving, printing } = book();
  const site = buildHelpSiteText(project, flat);
  const mdFiles = Object.keys(site).filter((f) => f.endsWith(".md")).sort();
  assert.deepEqual(mdFiles, ["1-1-saving.md", "1-2-printing.md", "1-getting-started.md", "2-reference.md"]);
  for (const md of mdFiles) assert.ok(site[md.replace(/\.md$/, ".html")], `${md} has a page of the same name`);
  assert.match(site["1-1-saving.html"], /<link rel="alternate" type="text\/markdown" href="1-1-saving\.md">\n<\/head>/);
  assert.match(site["index.html"], /<link rel="alternate" type="text\/markdown" href="1-getting-started\.md">/, "the first page is the first topic");
  const md = site["1-1-saving.md"];
  assert.match(md, /^# 1\.1 Saving\n\n\*From Acme \\\*Draw\\\* \\\[guide\\\], in 1 Getting started\.\*\n\n/);
  assert.match(md, /Press \*\*Save\*\* to keep your work, then see \[Printing\]\(1-2-printing\.md\) \(1\.2\)\./, "a link in the text is a link to the other page");
  assert.match(md, /!\[The Save dialog\]\(images\/pic1\.png\)/, "pictures are linked from the site's root, where the page is");
  assert.match(md, /1\. Open the File menu\.\n\n2\. Choose \*\*Save\*\*\.\n\n   \*Result:\* A file is saved\./);
  assert.match(md, /> \*\*Caution\.\*\* Save before you close\./);
  assert.match(md, /\n## Saving a copy\n/, "a heading block is one level below the page's title");
  assert.match(md, /\*\*See also\*\*\n\n- \[1\.2 Printing\]\(1-2-printing\.md\)\n$/);
  assert.equal(md.includes("{{"), false);
  const chapter = site["1-getting-started.md"];
  assert.match(chapter, /Welcome to Acme Draw\./, "variables are filled in");
  assert.match(chapter, /\*\*In this topic\*\*\n\n- \[1\.1 Saving\]\(1-1-saving\.md\)\n- \[1\.2 Printing\]\(1-2-printing\.md\)\n$/, "the topics under a chapter are linked, not repeated");
  assert.equal(chapter.includes("Press **Save**"), false, "a page holds only its own topic");
  assert.match(site["1-2-printing.md"], /^# 1\.2 Printing\n\n\*From Acme/);
  void saving; void printing;
});

test("llms.txt lists the pages of each chapter with a line about each, and llms-full.txt is the whole book", () => {
  const { project, flat } = book();
  const site = buildHelpSiteText(project, flat);
  const text = site["llms.txt"];
  const lines = text.split("\n");
  assert.equal(lines[0], "# Acme \\*Draw\\* \\[guide\\]");
  assert.equal(lines[2], "> Documentation for Acme Draw 2.0 from Acme & Sons.");
  assert.match(text, /Each page of this help is also available as Markdown: the file with the same name ending in \.md\. The whole book is in one Markdown file, llms-full\.txt\./);
  assert.deepEqual(lines.filter((l) => l.startsWith("## ")), ["## 1 Getting started", "## 2 Reference"]);
  const items = lines.filter((l) => l.startsWith("- ["));
  assert.deepEqual(items.map((l) => /^- \[([^\]]*(?:\\\][^\]]*)*)\]\(([^)]*)\)/.exec(l)!.slice(1, 3)), [["1 Getting started", "1-getting-started.md"], ["1.1 Saving", "1-1-saving.md"], ["1.2 Printing", "1-2-printing.md"], ["2 Reference", "2-reference.md"]]);
  assert.match(items[0], /: Welcome to Acme Draw. This is a long introduction that goes on and on and on, so that the summary in the list has to be cut short at a word, because...$/, "a long first paragraph is cut at a word");
  assert.match(items[1], /: Press Save to keep your work, then see Printing.$/, "a topic's line is its first paragraph");
  assert.match(items[2], /: 1 step, starting with: Click Print\.$/);
  assert.equal(items[3].includes(": "), false, "a topic with nothing on its page has no line");
  const full = site["llms-full.txt"];
  assert.match(full, /^# Acme \\\*Draw\\\* \\\[guide\\\]\n\n## Contents/);
  assert.match(full, /### 1\.1 Saving[\s\S]*### 1\.2 Printing/);
  assert.match(full, /!\[The Save dialog\]\(images\/pic1\.png\)/);
});

test("the site files come out as bytes with the pictures, and an empty book still has an llms.txt and no Markdown pages", () => {
  const { project, flat } = book();
  const files = buildHelpSite(project, flat);
  assert.ok(files["llms.txt"] && files["llms-full.txt"] && files["1-1-saving.md"] && files["images/pic1.png"]);
  assert.match(new TextDecoder().decode(files["1-1-saving.md"]), /^# 1\.1 Saving/);
  const empty = buildHelpSiteText(createProject("Nothing yet"), new Map());
  assert.equal(Object.keys(empty).some((f) => f.endsWith(".md")), false);
  assert.equal(empty["llms.txt"].split("\n")[0], "# Nothing yet");
  assert.match(empty["llms.txt"], /> A how-to book of 0 chapters\./);
  assert.equal(empty["index.html"].includes('rel="alternate"'), false, "no Markdown version of a page that says the book is empty");
});
