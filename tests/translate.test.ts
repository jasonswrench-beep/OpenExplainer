import test from "node:test";
import assert from "node:assert/strict";
import { addNode, addPicture, createProject, CURRENT_VERSION, ensurePage, findNode, type Picture, type Project } from "../src/project/model.ts";
import { addBlock, makeBlock, type CalloutBlock, type HeadingBlock, type ParagraphBlock, type ProcedureBlock } from "../src/project/page.ts";
import { parseMarks, formatMarks } from "../src/project/text.ts";
import { cleanLanguage, languageWords, tidyLanguage } from "../src/project/language.ts";
import { migrate } from "../src/project/migrate.ts";
import { replacePictureFile } from "../src/project/replace-picture.ts";
import { makeExport, EXPORT_EXTENSION } from "../src/export/make.ts";
import { descendantsNamed, parseXml } from "../src/import/xml.ts";
import { buildXliff, parseXliff, sourceMarkup, translatedCopy } from "../src/translate/xliff.ts";
import { translatableUnits } from "../src/translate/units.ts";

const NOW = "2026-11-01T10:00:00.000Z";

const png = (w: number, h: number, mark = 0): Uint8Array => { const b = new Uint8Array(34); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]); const v = new DataView(b.buffer); v.setUint32(16, w); v.setUint32(20, h); b[33] = mark; return b; };

function book() {
  const project = createProject("Acme Draw Guide");
  project.variables = { PRODUCT: "Acme Draw", VERSION: "2.0", COMPANY: "Acme" };
  project.look.header = "{{PRODUCT}} guide";
  const one = addNode(project.tree, null, "Getting started");
  const saving = addNode(project.tree, one.id, "Saving");
  const printing = addNode(project.tree, one.id, "Printing");
  const picture: Picture = {
    id: "pic1", file: "images/pic1.png", width: 640, height: 360, altText: "The Save dialog",
    source: { kind: "import", capturedAt: NOW, originalName: "save.png" },
    callouts: [{ id: "c1", name: "Save button", description: "Saves the file.", target: { x: 10, y: 10, width: 50, height: 20 }, marker: { x: 5, y: 5 } }],
    shapes: [{ id: "sh1", kind: "text", box: { x: 1, y: 1, width: 100, height: 30 }, text: "Click here", fill: null, outline: "#000000", textColor: "#000000", size: 14, alt: "A label" } as never],
  };
  addPicture(project.tree, saving.id, picture);
  const para = makeBlock("paragraph") as ParagraphBlock;
  para.text = [{ text: "Press " }, { text: "Save", mark: "control" }, { text: " in {{PRODUCT}} to keep your " }, { text: "work", mark: "italic" }, { text: ", then read " }, { text: "Printing", mark: "link", topic: printing.id }, { text: " and " }, { text: "Saving a copy", mark: "link", topic: saving.id }, { text: "." }];
  const heading = makeBlock("heading") as HeadingBlock;
  heading.text = "Saving a copy";
  const proc = makeBlock("procedure") as ProcedureBlock;
  proc.steps = [{ id: "s1", text: parseMarks("Open the [[File]] menu.") }, { id: "s2", text: parseMarks("Choose **Save**."), result: parseMarks("A file is saved.") }];
  const box = makeBlock("callout", { kind: "caution" }) as CalloutBlock;
  box.text = parseMarks("Save before you close.");
  [para, heading, proc, box].forEach((b) => addBlock(ensurePage(saving), b));
  findNode(project.tree, saving.id)!.index = { terms: [{ text: "Saving files", by: "author" }] };
  const lonely = makeBlock("paragraph") as ParagraphBlock;
  lonely.text = parseMarks("Print it.");
  addBlock(ensurePage(printing), lonely);
  project.guides.push({ id: "g1", name: "Quick save", tasks: [saving.id], layout: "picture-top", zoomFocus: false } as never);
  return { project, one, saving, printing, para, proc };
}

/** What a translator's program does: translates the words (here by putting [fr] before every run of text) and keeps the tags. */
function translate(xliff: string, language = "fr", skip: string[] = []): string {
  return xliff.replace(/<trans-unit id="([^"]*)"([^>]*)>\n<source xml:lang="([^"]*)">([\s\S]*?)<\/source>/g, (whole, id: string, _attrs: string, _lang: string, inner: string) => {
    if (skip.includes(id)) return whole;
    const target = inner.replace(/(^|>)([^<>]+)(?=<|$)/g, (_m, before: string, words: string) => `${before}[${language}] ${words}`);
    return `${whole}\n<target xml:lang="${language}" state="translated">${target}</target>`;
  });
}

test("language tags are tidied, an older book is English, and the name of a language is said in words", () => {
  assert.deepEqual(["en", "FR", "pt_br", "pt-br", "zh-hant", "es-419", " de "].map((t) => tidyLanguage(t)), ["en", "fr", "pt-BR", "pt-BR", "zh-Hant", "es-419", "de"]);
  for (const bad of ["", "e", "english", "fr--CA", "fr-", 42, null, "fr-CANADIAN1"]) assert.equal(tidyLanguage(bad), null, String(bad));
  assert.equal(cleanLanguage("nonsense"), "en");
  assert.equal(languageWords("fr"), "French");
  assert.match(languageWords("pt-BR"), /^(Brazilian Portuguese|Portuguese \(Brazil\))$/, "the name comes from the system's language data, which words it a little differently in places");
  assert.equal(createProject("x").language, "en");
  const old = migrate({ ...JSON.parse(JSON.stringify(createProject("Old"))), version: 20, language: undefined, tree: [] });
  assert.deepEqual([old.version, old.language, CURRENT_VERSION >= 21], [CURRENT_VERSION, "en", true]);
});

test("the list of what can be translated has a stable name for each piece, in reading order, and leaves out what is empty", () => {
  const { project, saving, para, proc } = book();
  const units = translatableUnits(project);
  const ids = units.map((u) => u.id);
  assert.equal(new Set(ids).size, ids.length, "names are used once");
  assert.deepEqual(ids.slice(0, 4), ["project:name", "look:header", `topic:${project.tree[0].id}:title`, `topic:${saving.id}:title`]);
  for (const expected of [`block:${para.id}`, `step:s1`, `step:s2`, `step:s2:result`, "picture:pic1:alt", "callout:pic1:c1:name", "callout:pic1:c1:description", "shape:pic1:sh1:alt", "shape:pic1:sh1:text", `index:${saving.id}:0`, "guide:g1:name"]) assert.ok(ids.includes(expected), expected);
  assert.equal(ids.includes("look:footer"), false, "an empty footer is not a thing to translate");
  assert.equal(ids.includes("look:logo-alt"), false);
  assert.deepEqual(translatableUnits(project).map((u) => u.id), ids, "the same book gives the same names");
  assert.match(units.find((u) => u.id === `step:s2:result`)!.note, /^1\.1: result of step 2$/);
  assert.equal(proc.steps.length, 2);
});

test("the XLIFF file is well-formed, names the languages, keeps marks as tags and variables as placeholders, and describes where each piece is", () => {
  const { project, para } = book();
  const made = buildXliff(project, "FR", { now: NOW });
  const root = parseXml(made.xml);
  assert.equal(root.attrs["version"], "1.2");
  const file = descendantsNamed(root, "file")[0];
  assert.deepEqual([file.attrs["source-language"], file.attrs["target-language"], file.attrs["original"], file.attrs["date"]], ["en", "fr", "Acme Draw Guide.openexplainer", "2026-11-01T10:00:00Z"]);
  const units = descendantsNamed(root, "trans-unit");
  assert.equal(units.length, made.units);
  assert.equal(made.units, translatableUnits(project).length);
  assert.ok(made.words > 40);
  assert.equal(new Set(units.map((u) => u.attrs["id"])).size, units.length);
  const paragraph = made.xml.match(new RegExp(`<trans-unit id="block:${para.id}"[^>]*>\\n<source[^>]*>([^\\n]*)</source>\\n<note[^>]*>([^<]*)</note>`));
  assert.equal(paragraph![1], 'Press <g id="2" ctype="x-control">Save</g> in <x id="v1" ctype="x-variable" equiv-text="{{PRODUCT}}"/> to keep your <g id="4" ctype="italic">work</g>, then read <g id="6" ctype="link">Printing</g> and <g id="8" ctype="link">Saving a copy</g>.');
  assert.equal(paragraph![2], "1.1: paragraph");
  assert.equal(sourceMarkup("Hello {{ NAME }} & <you>"), 'Hello <x id="v1" ctype="x-variable" equiv-text="{{ NAME }}"/> &amp; &lt;you&gt;');
  assert.throws(() => buildXliff(project, "english"), /must be a language code/);
});

test("a translation comes back as a copy in the new language: every piece in place, marks and links kept, the original untouched", () => {
  const { project, saving, printing, para, proc } = book();
  const before = JSON.stringify(project);
  const file = translate(buildXliff(project, "fr", { now: NOW }).xml);
  const result = translatedCopy(project, file);
  assert.equal(JSON.stringify(project), before, "the book that was open is not changed");
  const copy = result.project;
  assert.deepEqual([result.language, copy.language, result.translated, result.total], ["fr", "fr", result.total, translatableUnits(project).length]);
  assert.equal(copy.name, "[fr] Acme Draw Guide");
  assert.equal(copy.look.header, "{{PRODUCT}}[fr]  guide", "a variable stays a variable");
  assert.equal(findNode(copy.tree, saving.id)!.title, "[fr] Saving");
  const text = (findNode(copy.tree, saving.id)!.page!.blocks.find((b) => b.id === para.id) as ParagraphBlock).text;
  assert.deepEqual(text.map((r) => [r.text, r.mark ?? "", r.topic ?? ""]), [
    ["[fr] Press ", "", ""], ["[fr] Save", "control", ""], ["[fr]  in {{PRODUCT}}[fr]  to keep your ", "", ""], ["[fr] work", "italic", ""], ["[fr] , then read ", "", ""],
    ["[fr] Printing", "link", printing.id], ["[fr]  and ", "", ""], ["[fr] Saving a copy", "link", saving.id], ["[fr] .", "", ""],
  ]);
  const steps = (findNode(copy.tree, saving.id)!.page!.blocks.find((b) => b.id === proc.id) as ProcedureBlock).steps;
  assert.equal(formatMarks(steps[0].text), "\\[fr\\] Open the [[\\[fr\\] File]]\\[fr\\]  menu.", "marks kept, step ids kept");
  assert.equal(steps[0].text[1].mark, "control");
  assert.equal(steps[1].id, "s2");
  assert.equal(steps[1].result!.map((r) => r.text).join(""), "[fr] A file is saved.");
  const pic = findNode(copy.tree, saving.id)!.pictures[0];
  assert.deepEqual([pic.altText, pic.callouts![0].name, pic.callouts![0].description, (pic.shapes![0] as { text: string; alt: string }).text, (pic.shapes![0] as { alt: string }).alt], ["[fr] The Save dialog", "[fr] Save button", "[fr] Saves the file.", "[fr] Click here", "[fr] A label"]);
  assert.deepEqual([pic.callouts![0].target, pic.file, pic.id, pic.width], [{ x: 10, y: 10, width: 50, height: 20 }, "images/pic1.png", "pic1", 640], "positions and files are the original's");
  assert.equal(findNode(copy.tree, saving.id)!.index!.terms[0].text, "[fr] Saving files");
  assert.equal(copy.guides[0].name, "[fr] Quick save");
  assert.equal(copy.variables.PRODUCT, "Acme Draw", "variables are the book's own, not translated");
  assert.deepEqual([copy.drafts, copy.history, project.language], [[], [], "en"]);
  assert.equal(result.report[0], `Translated ${result.total} of ${result.total} pieces of text into French (fr).`);
  assert.equal(result.report.length, 2, "only the note about pictures is added when nothing is wrong");
  assert.match(result.report[1], /replace each picture's file in the copy with a screen of the same size/);
});

test("a translator can move words about: a link still goes where the source link went, by its number", () => {
  const { project, saving, printing, para } = book();
  const file = buildXliff(project, "de", { now: NOW }).xml;
  const unit = `block:${para.id}`;
  const reordered = translate(file, "de", [unit]).replace(new RegExp(`(<trans-unit id="${unit}"[^>]*>\\n<source[^>]*>[^\\n]*</source>)`), `$1\n<target xml:lang="de" state="translated">Lesen Sie <g id="8" ctype="link">Speichern einer Kopie</g> und <g id="6" ctype="link">Drucken</g>; in <x id="v1" ctype="x-variable" equiv-text="{{PRODUCT}}"/> <g id="2" ctype="x-control">Sichern</g> <g id="4" ctype="italic">Arbeit</g>.</target>`);
  const copy = translatedCopy(project, reordered).project;
  const text = (findNode(copy.tree, saving.id)!.page!.blocks.find((b) => b.id === para.id) as ParagraphBlock).text;
  assert.deepEqual(text.map((r) => [r.text, r.mark ?? "", r.topic ?? ""]), [
    ["Lesen Sie ", "", ""], ["Speichern einer Kopie", "link", saving.id], [" und ", "", ""], ["Drucken", "link", printing.id], ["; in {{PRODUCT}} ", "", ""], ["Sichern", "control", ""], [" ", "", ""], ["Arbeit", "italic", ""], [".", "", ""],
  ]);
});

test("what is not translated stays in the original language and is counted; trouble in the file is said in words", () => {
  const { project, saving, para } = book();
  const total = translatableUnits(project).length;
  const base = buildXliff(project, "fr", { now: NOW }).xml;
  // Two units skipped, one marked new, and one the file does not know.
  const partial = translate(base, "fr", ["project:name", `topic:${saving.id}:title`]).replace(/(<trans-unit id="picture:pic1:alt"[^>]*>[\s\S]*?<target [^>]*) state="translated"/, '$1 state="new"').replace("</body>", '<trans-unit id="block:nope"><source>x</source><target>y</target></trans-unit></body>');
  const result = translatedCopy(project, partial);
  assert.equal(result.translated, total - 3);
  assert.equal(result.project.name, "Acme Draw Guide (fr)", "an untranslated name still tells the copy from the original");
  assert.equal(findNode(result.project.tree, saving.id)!.title, "Saving", "left in the original language");
  assert.equal(findNode(result.project.tree, saving.id)!.pictures[0].altText, "The Save dialog", "a target marked new is not a translation");
  assert.ok(result.report.includes("3 pieces of text were left in English: 3 had no translation or were marked as not translated yet."));
  assert.ok(result.report.includes("1 piece of text in the file is not in this book, so it was not used."));
  // The book changed since the file was made: a piece is missing from the file.
  const fewer = translate(base, "fr").replace(new RegExp(`<trans-unit id="block:${para.id}"[\\s\\S]*?</trans-unit>\\n?`), "");
  assert.ok(translatedCopy(project, fewer).report.some((l) => /1 piece of text was left in English: 1 is not in the file \(the book may have changed since the file was made\)\./.test(l)));
  // A link or a variable lost in translation, and a tag the book does not know.
  const lost = translate(base, "fr", [`block:${para.id}`]).replace(new RegExp(`(<trans-unit id="block:${para.id}"[^>]*>\\n<source[^>]*>[^\\n]*</source>)`), '$1\n<target xml:lang="fr" state="translated">Appuyez sur <g id="2" ctype="x-control">Enregistrer</g> pour garder votre <g id="4" ctype="underlined">travail</g>.</target>');
  const lostResult = translatedCopy(project, lost);
  assert.ok(lostResult.report.includes("2 links to other topics are missing from the translation, so their words are plain words now."));
  assert.ok(lostResult.report.includes("In 1 piece of text the variables ({{PRODUCT}} and the like) do not match the original. Look at them in the copy."));
  // Files that cannot be used.
  assert.throws(() => translatedCopy(project, "<html/>"), /not an XLIFF file/);
  assert.throws(() => translatedCopy(project, '<xliff version="2.0"><file/></xliff>'), /This is XLIFF 2\.0\. OpenExplainer reads and writes XLIFF 1\.2/);
  assert.throws(() => translatedCopy(project, '<xliff version="1.2"><file source-language="en" datatype="x"><body/></file></xliff>'), /does not say which language it is in/);
  assert.throws(() => translatedCopy(project, "<xliff"), /The XML is damaged/);
  const wrong = base.replace('source-language="en"', 'source-language="es"');
  assert.ok(translatedCopy(project, translate(wrong)).report.some((l) => /made from a book in es, and this book is in en/.test(l)));
  assert.deepEqual(parseXliff("﻿" + base).units.length, total, "a byte order mark at the start is allowed");
});

test("the translation file is a kind of export, needs a language, holds the whole book (snippets as snippets), and says how big it is", async () => {
  const { project } = book();
  assert.equal(EXPORT_EXTENSION.xliff, "xlf");
  await assert.rejects(makeExport(project, new Map(), "xliff", { flatten: async () => new Uint8Array() }), /Say which language to translate into/);
  const made = await makeExport(project, new Map(), "xliff", { flatten: async () => new Uint8Array(), language: "pt-br", now: NOW });
  assert.equal(made.extension, "xlf");
  assert.match(made.notes[0], /^The file holds \d+ pieces of text, about \d+ words, for the translator\.$/);
  const text = new TextDecoder().decode(made.bytes);
  assert.match(text, /target-language="pt-BR"/);
  parseXml(text);
});

test("a picture's file can be replaced by another of the same size, and nothing else about the picture changes", () => {
  const { project, saving } = book();
  const picture = findNode(project.tree, saving.id)!.pictures[0];
  const assets = new Map([["images/pic1.png", png(640, 360, 1)]]);
  const before = JSON.stringify({ ...picture, file: "", source: undefined });
  const done = replacePictureFile(picture, assets, png(640, 360, 2), "save-fr.png");
  assert.equal(done.ok, true);
  if (!done.ok) return;
  assert.equal(done.oldFile, "images/pic1.png");
  assert.match(picture.file, /^images\/n\w+\.png$/);
  assert.equal(assets.get(picture.file)![33], 2, "the new bytes are under the new name");
  assert.equal(assets.has("images/pic1.png"), true, "the old file is not thrown away here");
  assert.equal(picture.source.originalName, "save-fr.png");
  assert.equal(JSON.stringify({ ...picture, file: "", source: undefined }), before, "id, description, callouts and marks are as they were");
  const wrong = replacePictureFile(picture, assets, png(800, 450), "bigger.png");
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.match(wrong.message, /bigger\.png is 800 by 450 pixels, and the picture it would replace is 640 by 360\./);
  const text = replacePictureFile(picture, assets, new TextEncoder().encode("hello"), "notes.txt");
  assert.deepEqual([text.ok, !text.ok && /not a PNG or JPEG/.test(text.message)], [false, true]);
  void ({} as Project);
});
