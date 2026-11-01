import test from "node:test";
import assert from "node:assert/strict";
import { addNode, createProject, CURRENT_VERSION, ensurePage, findNode, numbering, removeNode, type Project } from "../src/project/model.ts";
import { addBlock, makeBlock, type ParagraphBlock, type ProcedureBlock } from "../src/project/page.ts";
import { cleanRuns, formatMarks, linkRun, parseMarks } from "../src/project/text.ts";
import { brokenLinks, cleanSeeAlso, countLinksTo, forgetTopics, linkLossWords, linksIn, MOST_SEE_ALSO, setSeeAlso, subtreeIds } from "../src/project/links.ts";
import { fromFiles, toFiles } from "../src/project/files.ts";
import { migrate } from "../src/project/migrate.ts";
import { checkProject } from "../src/project/checks.ts";
import { renderPrintPreview } from "../src/render/print.ts";
import { renderHelpPage } from "../src/render/help.ts";
import { renderGuide } from "../src/render/guide.ts";
import { newGuide } from "../src/project/guides.ts";
import type { RenderContext } from "../src/render/html.ts";
import { bookMarkdown } from "../src/export/markdown.ts";
import { buildDocxParts } from "../src/export/docx.ts";
import { buildJsonExport, readJsonExport } from "../src/export/json.ts";
import { anchorPages, bookPdfHtml, placeholderPages } from "../src/export/pdf.ts";
import { narrowChoices, topicChoices } from "../src/topic-choices.ts";

/** A small book: chapter 1 with topics 1.1 (Saving) and 1.2 (Printing, with a link forward and back), and chapter 2 with 2.1 (Sharing). */
function sample() {
  const project = createProject("Links <book>");
  project.variables = { PRODUCT: "Acme Draw", VERSION: "", COMPANY: "" };
  const one = addNode(project.tree, null, "Getting started");
  const saving = addNode(project.tree, one.id, "Saving");
  const printing = addNode(project.tree, one.id, "Printing");
  const two = addNode(project.tree, null, "Working together");
  const sharing = addNode(project.tree, two.id, "Sharing {{PRODUCT}} files");
  const para = (node: typeof saving, source: string) => {
    const block = makeBlock("paragraph") as ParagraphBlock;
    block.text = parseMarks(source);
    addBlock(ensurePage(node), block);
    return block;
  };
  para(saving, `Read [how to print](#${printing.id}) before you save, and see [Sharing](#${sharing.id}).`);
  para(printing, `Back to [saving](#${saving.id}).`);
  const proc = makeBlock("procedure") as ProcedureBlock;
  proc.steps = [{ id: "s1", text: parseMarks(`Open the [[Share]] box, see [sharing](#${sharing.id}).`), result: parseMarks(`It opens, as in [saving](#${saving.id}).`) }];
  addBlock(ensurePage(printing), proc);
  setSeeAlso(project.tree, saving.id, [printing.id, sharing.id]);
  return { project, one, saving, printing, two, sharing };
}

const ctxFor = (project: Project): RenderContext => ({ project, place: "book", notes: false, imageSrc: () => null });

test("a link is typed as [words](#topic-id) and goes back and forth between the text and the runs", () => {
  const runs = parseMarks("See [the **big** way](#abc_1) and [Printing](#nXy-9), then *more*.");
  // A link holds only words: a star inside it stays a star.
  assert.deepEqual(runs.map((r) => [r.text, r.mark, r.topic]), [["See ", undefined, undefined], ["the **big** way", "link", "abc_1"], [" and ", undefined, undefined], ["Printing", "link", "nXy-9"], [", then ", undefined, undefined], ["more", "italic", undefined], [".", undefined, undefined]]);
  assert.equal(formatMarks(runs), "See [the \\*\\*big\\*\\* way](#abc_1) and [Printing](#nXy-9), then *more*.");
  assert.deepEqual(parseMarks(formatMarks(runs)), runs, "typing what was shown gives the same runs");
  assert.equal(formatMarks([linkRun("Save", "t1")]), "[Save](#t1)");
  assert.equal(formatMarks([{ text: " Save ", mark: "link", topic: "t1" }]), " [Save](#t1) ", "spaces go outside the brackets so it can be read back");
  assert.deepEqual(parseMarks(formatMarks([{ text: " Save ", mark: "link", topic: "t1" }])).map((r) => [r.text, r.mark]), [[" ", undefined], ["Save", "link"], [" ", undefined]]);
});

test("a link is only a link when it is whole: no words, no good id, or an escaped bracket leave plain text, and two links in a row stay two", () => {
  for (const plain of ["[](#abc)", "[words](abc)", "[words](#)", "[words](#a b)", "[words](#abc", "[ words](#abc)", "[words ](#abc)", "[[words]](#abc)", "\\[words](#abc)"]) {
    assert.ok(parseMarks(plain).every((r) => r.mark !== "link"), `${plain} is not a link`);
  }
  assert.equal(parseMarks("a \\[b\\](#c) d")[0].text, "a [b](#c) d", "an escaped bracket is a letter");
  assert.equal(formatMarks(parseMarks("a \\[b\\](#c) d")), "a \\[b\\](#c) d", "and stays escaped");
  const two = parseMarks("[a](#x)[b](#y)");
  assert.deepEqual(two.map((r) => [r.text, r.topic]), [["a", "x"], ["b", "y"]], "neighbours that go to different topics are not joined");
  assert.deepEqual(parseMarks("[a](#x)[b](#x)").map((r) => [r.text, r.topic]), [["ab", "x"]], "neighbours that go to the same topic are one link");
});

test("runs read from a saved file keep a link only with a good topic id", () => {
  assert.deepEqual(cleanRuns([{ text: "a", mark: "link", topic: "t_1" }, { text: "b", mark: "link" }, { text: "c", mark: "link", topic: "no good!" }, { text: "d", mark: "link", topic: 5 }]),
    [{ text: "a", mark: "link", topic: "t_1" }, { text: "bcd" }]);
});

test("a topic's See also list holds other topics of the book only, each once, up to the most allowed", () => {
  const { project, saving, printing, sharing } = sample();
  assert.deepEqual(findNode(project.tree, saving.id)!.seeAlso, [printing.id, sharing.id]);
  assert.equal(setSeeAlso(project.tree, saving.id, [sharing.id, sharing.id, printing.id]), 2, "a repeated topic is listed once");
  assert.deepEqual(findNode(project.tree, saving.id)!.seeAlso, [sharing.id, printing.id], "in the order given");
  assert.throws(() => setSeeAlso(project.tree, saving.id, [saving.id]), /cannot list itself/);
  assert.throws(() => setSeeAlso(project.tree, saving.id, ["nope"]), /There is no topic with the id "nope"/);
  assert.throws(() => setSeeAlso(project.tree, "nope", []), /topic was not found/);
  assert.throws(() => setSeeAlso(project.tree, saving.id, Array.from({ length: MOST_SEE_ALSO + 1 }, (_, i) => `x${i}`)), /up to 12 topics/);
  assert.deepEqual(findNode(project.tree, saving.id)!.seeAlso, [sharing.id, printing.id], "a refused list changes nothing");
  assert.equal(setSeeAlso(project.tree, saving.id, []), 0);
  assert.equal(findNode(project.tree, saving.id)!.seeAlso, undefined, "an empty list is left out");
  const ids = new Set(["a", "b"]);
  assert.deepEqual(cleanSeeAlso(["a", "a", "b", "c", 5, "b!"], "b", ids), ["a"], "itself, strangers and bad ids are dropped");
});

test("a project with links and a See also list is saved, opened again and is the same", () => {
  const { project, saving } = sample();
  assert.ok(CURRENT_VERSION >= 17, "links arrived in format 17");
  const files = toFiles(project);
  assert.equal(JSON.parse(files["project.json"]).version, CURRENT_VERSION);
  assert.deepEqual(JSON.parse(files["structure.json"]).tree[0].children[0].seeAlso, project.tree[0].children[0].seeAlso, "the list is in structure.json");
  const again = fromFiles(files);
  assert.deepEqual(again, project);
  assert.deepEqual(linksIn(findNode(again.tree, saving.id)!).map((l) => l.words), ["how to print", "Sharing"]);
  // A list that points at nothing is cleaned when the project is read.
  const damaged = { ...files, "structure.json": files["structure.json"].replace(/"seeAlso": \[[^\]]*\]/, '"seeAlso": ["ghost", "' + project.tree[1].id + '"]') };
  assert.deepEqual(findNode(fromFiles(damaged).tree, saving.id)!.seeAlso, [project.tree[1].id]);
});

test("an older project (format 16) opens with no links and no lists, and is upgraded", () => {
  const old = migrate({ version: 16, name: "Old", template: "empty", variables: {}, highlight: {}, tree: [{ id: "a", title: "A", status: "captured", pictures: [], children: [] }] });
  assert.equal(old.version, CURRENT_VERSION);
  assert.equal(old.tree[0].seeAlso, undefined);
});

test("deleting a topic turns the links to it into plain words, takes it off every See also list, and says how many", () => {
  const { project, printing, saving, sharing } = sample();
  const gone = subtreeIds(findNode(project.tree, printing.id)!);
  const count = countLinksTo(project.tree, gone);
  assert.deepEqual(count, { links: 1, seeAlso: 1 }, "one link in Saving and one See also entry");
  assert.equal(linkLossWords(count), "1 link in the text will become plain words, and 1 See also entry will be taken off.");
  assert.equal(linkLossWords({ links: 0, seeAlso: 0 }), "");
  assert.equal(linkLossWords({ links: 2, seeAlso: 0 }), "2 links in the text will become plain words.");
  assert.ok(removeNode(project.tree, printing.id));
  const text = formatMarks((findNode(project.tree, saving.id)!.page!.blocks[0] as ParagraphBlock).text);
  assert.match(text, /^Read how to print before you save, and see \[Sharing\]\(#/, "the words stay, the link goes");
  assert.deepEqual(findNode(project.tree, saving.id)!.seeAlso, [sharing.id]);
  assert.deepEqual(brokenLinks(project.tree), [], "nothing is left pointing at nothing");
  // Deleting a chapter forgets every topic under it.
  const { project: p2, one, saving: s2 } = sample();
  removeNode(p2.tree, one.id);
  assert.equal(findNode(p2.tree, s2.id), null);
  assert.equal(forgetTopics(p2.tree, new Set(["nothing"])).links, 0);
});

test("the book check finds a link or a See also entry that goes to a topic that is gone, and says where", () => {
  const { project, saving } = sample();
  assert.equal(checkProject(project).filter((i) => i.kind === "broken-link").length, 0);
  const node = findNode(project.tree, saving.id)!;
  (node.page!.blocks[0] as ParagraphBlock).text.push({ text: "gone", mark: "link", topic: "ghost" });
  node.seeAlso = [...(node.seeAlso ?? []), "phantom"];
  const found = checkProject(project).filter((i) => i.kind === "broken-link");
  assert.equal(found.length, 2);
  assert.match(found[0].words, /^The link "gone" in "1\.1 Saving" goes to a topic that is not in the book\./);
  assert.match(found[1].words, /^A See also entry in "1\.1 Saving" goes to a topic that is not in the book\./);
  assert.equal(new Set(found.map((i) => i.key)).size, 2, "each has its own key, so ignoring one does not hide the other");
});

test("the print preview writes a link as a link with the topic's number, and the See also list with its numbers", () => {
  const { project, printing, sharing } = sample();
  const { html } = renderPrintPreview(ctxFor(project));
  assert.match(html, new RegExp(`<a class="topic-link" href="#pv-topic-${printing.id}" data-anchor="pv-topic-${printing.id}">how to print</a><span class="pv-ref"> \\(1\\.2\\)</span>`));
  assert.match(html, new RegExp(`see <a class="topic-link" href="#pv-topic-${sharing.id}"[^>]*>Sharing</a><span class="pv-ref"> \\(2\\.1\\)</span>`), "forward links work too");
  assert.match(html, new RegExp(`<section class="pv-see-also"><h3>See also</h3><ul><li><a class="topic-link" href="#pv-topic-${printing.id}"[^>]*>Printing</a><span class="pv-ref"> \\(1\\.2\\)</span></li><li><a [^>]*>Sharing Acme Draw files</a><span class="pv-ref"> \\(2\\.1\\)</span></li></ul></section>`), "a title in the list has its variable filled in");
  assert.ok(!html.includes(", page "), "no pages in the preview: only a PDF knows them");
});

test("a PDF says the page after the number, with stand-in pages the first time and the real ones once they are known", () => {
  const { project, printing } = sample();
  const flat = new Map();
  const first = bookPdfHtml(project, flat, placeholderPages(project));
  assert.match(first, /how to print<\/a><span class="pv-ref"> \(1\.2\), page 000<\/span>/, "stand-ins as wide as the real numbers");
  const pages = new Map<string, string>([[printing.id, "7"], [project.tree[0].children[0].id, "6"], [project.tree[0].id, "5"], [project.tree[1].id, "9"], [project.tree[1].children[0].id, "10"]]);
  const second = bookPdfHtml(project, flat, pages);
  assert.match(second, /how to print<\/a><span class="pv-ref"> \(1\.2\), page 7<\/span>/);
  assert.match(second, /<li><a class="topic-link"[^>]*>Printing<\/a><span class="pv-ref"> \(1\.2\), page 7<\/span><\/li>/, "the See also list too");
  assert.equal(typeof anchorPages, "function");
});

test("the help site writes a link as a plain link to the topic's page, with no number, and a guide shows the words only", () => {
  const { project, printing, saving } = sample();
  const html = renderHelpPage(ctxFor(project), saving.id, (id) => `topic-${id}.html`);
  assert.match(html, new RegExp(`<a class="topic-link" href="topic-${printing.id}\\.html">how to print</a> before you save`));
  assert.ok(!html.includes("(1.2)"), "no number: the link is enough");
  assert.match(html, /<section class="pv-see-also"><h2>See also<\/h2><ul><li><a class="topic-link" href="topic-/);
  const inApp = renderHelpPage(ctxFor(project), saving.id);
  assert.match(inApp, new RegExp(`<a class="topic-link" href="#" data-topic="${printing.id}">how to print</a>`), "in the app a topic is opened by script");
  const guide = renderGuide(ctxFor(project), newGuide("Guide", [printing.id]));
  assert.ok(!guide.html.includes("topic-link"), "a guide has nothing to link to");
  assert.match(guide.html, /see sharing\./, "the words stay");
});

test("Word gets links to the topics' headings, even forward ones, with the number after them, and a See also list", () => {
  const { project, printing, sharing } = sample();
  const parts = buildDocxParts(project, new Map());
  const doc = new TextDecoder().decode(parts["word/document.xml"]);
  // The bookmark of a topic's heading: the _Toc number written just before the heading's words.
  const bookmark = (id: string) => new RegExp(`w:name="_Toc([0-9]+)"/><w:r><w:t xml:space="preserve">${numbering(project.tree).get(id)} `).exec(doc)?.[1];
  const forward = /<w:hyperlink w:anchor="_Toc(\d+)" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"\/><\/w:rPr><w:t xml:space="preserve">Sharing<\/w:t><\/w:r><\/w:hyperlink><w:r><w:t xml:space="preserve"> \(2\.1\)<\/w:t><\/w:r>/.exec(doc);
  assert.ok(forward, "a link to a topic that comes later, with its number");
  assert.equal(forward![1], bookmark(sharing.id), "it goes to that topic's heading");
  assert.ok(bookmark(printing.id));
  assert.match(doc, /<w:r><w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">See also<\/w:t><\/w:r>/);
  assert.match(doc, /Sharing Acme Draw files<\/w:t><\/w:r><\/w:hyperlink><w:r><w:t xml:space="preserve"> \(2\.1\)<\/w:t><\/w:r>/);
});

test("Markdown says the number after the linked words, and lists See also", () => {
  const { project } = sample();
  const md = bookMarkdown(project, new Map());
  assert.match(md, /Read how to print \(1\.2\) before you save, and see Sharing \(2\.1\)\./);
  assert.match(md, /\*\*See also\*\*\n\n- 1\.2 Printing\n- 2\.1 Sharing Acme Draw files/);
});

test("a JSON export keeps the links and the See also lists and reads back the same", () => {
  const { project } = sample();
  const { files } = buildJsonExport(project, new Map());
  const book = JSON.parse(new TextDecoder().decode(files["book.json"]));
  assert.deepEqual(book.tree[0].children[0].seeAlso, project.tree[0].children[0].seeAlso);
  assert.equal(book.tree[0].children[0].page.blocks[0].text[1].mark, "link");
  const back = readJsonExport(files);
  assert.deepEqual(back.project.tree, project.tree);
});

test("the list of topics to choose from is numbered in book order and narrows by what is typed", () => {
  const { project, saving } = sample();
  const all = topicChoices(project);
  assert.deepEqual(all.map((c) => c.label), ["1 Getting started", "1.1 Saving", "1.2 Printing", "2 Working together", "2.1 Sharing Acme Draw files"]);
  assert.ok(!topicChoices(project, saving.id).some((c) => c.id === saving.id), "the topic the choice is for can be left out");
  assert.deepEqual(narrowChoices(all, "shar").map((c) => c.label), ["2.1 Sharing Acme Draw files"]);
  assert.deepEqual(narrowChoices(all, "  1.  PRINT ").map((c) => c.label), ["1.2 Printing"], "all the words must match, ignoring capitals");
  assert.equal(narrowChoices(all, "").length, 5);
  assert.deepEqual(narrowChoices(all, "zzz"), []);
});
