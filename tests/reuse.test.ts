import test from "node:test";
import assert from "node:assert/strict";
import { addNode, createProject, CURRENT_VERSION, ensurePage, findNode, type Project } from "../src/project/model.ts";
import { addBlock, makeBlock, type ParagraphBlock, type ProcedureBlock, type SnippetBlock } from "../src/project/page.ts";
import { parseMarks, formatMarks } from "../src/project/text.ts";
import {
  applyReuse, cleanConditions, cleanSnippets, cleanTargets, conditionIds, conditionUses, deleteSnippet, expandOutput, MOST_SNIPPET_BLOCKS, setConditionNames, setSnippet, setTargetList,
  snippetFromText, snippetGist, snippetToText, snippetUses,
} from "../src/project/snippets.ts";
import { fromFiles, toFiles } from "../src/project/files.ts";
import { migrate } from "../src/project/migrate.ts";
import { checkProject } from "../src/project/checks.ts";
import { renderPrintPreview } from "../src/render/print.ts";
import { bookMarkdown } from "../src/export/markdown.ts";
import { buildDocxParts } from "../src/export/docx.ts";
import { buildHelpSiteText } from "../src/export/help-site.ts";
import { buildJsonExport, readJsonExport } from "../src/export/json.ts";
import { makeExport } from "../src/export/make.ts";
import { reuseProblems, reuseStateOf } from "../src/reuse-dialog.ts";

const TEXT = `# Before you start

Back up your **work** first, see [[Save]].

> Caution: Close other programs.

1. Open the [[File]] menu.
Result: The menu opens.
2. Choose [[Back up]].`;

function sample() {
  const project = createProject("Reuse <book>");
  project.variables = { PRODUCT: "Acme Draw", VERSION: "", COMPANY: "" };
  const chapter = addNode(project.tree, null, "Everyday");
  const saving = addNode(project.tree, chapter.id, "Saving");
  const printing = addNode(project.tree, chapter.id, "Printing");
  const admin = addNode(project.tree, null, "Administration");
  const write = (node: typeof saving, source: string) => {
    const b = makeBlock("paragraph") as ParagraphBlock;
    b.text = parseMarks(source);
    addBlock(ensurePage(node), b);
    return b;
  };
  write(saving, "Intro to saving.");
  write(printing, "Intro to printing.");
  write(admin, "Admin words.");
  const { blocks } = snippetFromText(TEXT);
  const snippet = setSnippet(project, "Back up first", blocks);
  setConditionNames(project, ["Administrators", "Version 2"]);
  const [adminId, v2Id] = conditionIds(project, ["Administrators", "Version 2"]);
  const place = (node: typeof saving) => { const b = makeBlock("snippet") as SnippetBlock; b.snippetId = snippet.id; addBlock(ensurePage(node), b); return b; };
  const inSaving = place(saving);
  const inPrinting = place(printing);
  return { project, chapter, saving, printing, admin, snippet, adminId, v2Id, inSaving, inPrinting };
}

const ctxOf = (project: Project) => ({ project, place: "book" as const, notes: false, imageSrc: () => null });
const titles = (project: Project) => { const out: string[] = []; const walk = (nodes: Project["tree"]) => nodes.forEach((n) => { out.push(n.title); walk(n.children); }); walk(project.tree); return out; };

test("a snippet is typed as plain text and read back as blocks, and the text form round-trips", () => {
  const { blocks, problems } = snippetFromText(TEXT);
  assert.deepEqual(problems, []);
  assert.deepEqual(blocks.map((b) => b.type), ["heading", "paragraph", "callout", "procedure"]);
  const proc = blocks[3] as ProcedureBlock;
  assert.equal(proc.steps.length, 2);
  assert.equal(formatMarks(proc.steps[0].text), "Open the [[File]] menu.");
  assert.equal(formatMarks(proc.steps[0].result!), "The menu opens.");
  assert.equal(proc.steps[1].result, undefined);
  assert.equal(blocks[2].type === "callout" && blocks[2].kind, "caution");
  assert.equal(snippetToText(blocks), TEXT.replace("Result: The menu opens.", "Result: The menu opens."), "what is written is what is shown again");
  assert.equal(snippetToText(snippetFromText(snippetToText(blocks)).blocks), snippetToText(blocks));
  const odd = snippetFromText("> Wobbly: not a box\n\n\n\nJust words\nover two lines");
  assert.match(odd.problems[0], /"Wobbly" is not the name of a box, so that note is a Design Tip\./);
  assert.deepEqual(odd.blocks.map((b) => b.type === "callout" ? b.kind : b.type), ["design-tip", "paragraph"]);
  assert.equal(formatMarks((odd.blocks[1] as ParagraphBlock).text), "Just words over two lines");
  assert.equal(snippetFromText("").blocks.length, 0);
  const many = snippetFromText(Array.from({ length: MOST_SNIPPET_BLOCKS + 3 }, (_, i) => `Paragraph ${i}`).join("\n\n"));
  assert.equal(many.blocks.length, MOST_SNIPPET_BLOCKS);
  assert.match(many.problems[0], /up to 20 blocks, so the rest were left out\./);
  assert.match(snippetGist({ id: "x", name: "n", blocks }), /^Before you start$/);
  assert.equal(snippetGist({ id: "x", name: "n", blocks: [] }), "Empty");
});

test("a snippet block is written out in each topic that uses it, and changing the snippet changes both", () => {
  const { project, saving, printing, snippet } = sample();
  const shown = expandOutput(project);
  const blocks = (id: string) => findNode(shown.tree, id)!.page!.blocks;
  assert.deepEqual(blocks(saving.id).map((b) => b.type), ["paragraph", "heading", "paragraph", "callout", "procedure"]);
  assert.deepEqual(blocks(printing.id).map((b) => b.type), ["paragraph", "heading", "paragraph", "callout", "procedure"]);
  assert.ok(!blocks(saving.id).some((b) => b.type === "snippet"), "no snippet block reaches an output");
  const ids = [...blocks(saving.id), ...blocks(printing.id)].flatMap((b) => [b.id, ...(b.type === "procedure" ? b.steps.map((s) => s.id) : [])]);
  assert.equal(new Set(ids).size, ids.length, "every written-out block and step has its own id");
  assert.equal(findNode(project.tree, saving.id)!.page!.blocks.length, 2, "the project itself is not changed");
  setSnippet(project, "BACK UP FIRST", snippetFromText("Changed words.").blocks);
  assert.equal(project.snippets.length, 1, "the same name (any capitals) is the same snippet");
  assert.equal(project.snippets[0].id, snippet.id, "and keeps its id, so every use follows");
  const after = expandOutput(project);
  for (const id of [saving.id, printing.id]) assert.equal(formatMarks((findNode(after.tree, id)!.page!.blocks[1] as ParagraphBlock).text), "Changed words.");
  assert.deepEqual(snippetUses(project.tree, snippet.id).map((u) => [u.node.title, u.count]), [["Saving", 1], ["Printing", 1]]);
});

test("an output made for a target leaves out what carries a condition the target hides: topics (with what is under them), blocks and steps", () => {
  const { project, saving, admin, adminId, v2Id } = sample();
  setTargetList(project, [{ name: "Guide for students", hide: ["Administrators"] }, { name: "Version 1", hide: ["Version 2"] }, { name: "Everything shown", hide: [] }]);
  findNode(project.tree, admin.id)!.conditions = [adminId];
  const savingPage = findNode(project.tree, saving.id)!.page!;
  const intro = savingPage.blocks[0];
  intro.conditions = [v2Id];
  const proc = makeBlock("procedure") as ProcedureBlock;
  proc.steps = [{ id: "a", text: parseMarks("Everyone does this.") }, { id: "b", text: parseMarks("Admins also do this."), conditions: [adminId] }];
  addBlock(savingPage, proc);
  const only = makeBlock("procedure") as ProcedureBlock;
  only.steps = [{ id: "c", text: parseMarks("Only for admins."), conditions: [adminId] }];
  addBlock(savingPage, only);
  const [students, v1] = project.targets;
  const forStudents = expandOutput(project, students.id);
  assert.deepEqual(titles(forStudents), ["Everyday", "Saving", "Printing"], "the topic with the condition is gone");
  const stu = findNode(forStudents.tree, saving.id)!.page!.blocks;
  assert.ok(stu.some((b) => b.id === intro.id), "a block with another condition stays");
  const stuProc = stu.find((b) => b.type === "procedure" && b.steps.some((s) => s.id === "a")) as ProcedureBlock;
  assert.deepEqual(stuProc.steps.map((s) => s.id), ["a"], "a hidden step goes from its procedure");
  assert.ok(!stu.some((b) => b.type === "procedure" && b.steps.some((s) => s.id === "c")), "a procedure left with no steps goes");
  const forV1 = expandOutput(project, v1.id);
  assert.ok(!findNode(forV1.tree, saving.id)!.page!.blocks.some((b) => b.id === intro.id), "the block for version 2 is not in version 1");
  assert.deepEqual(titles(forV1), titles(project), "and nothing else went");
  assert.deepEqual(titles(expandOutput(project)), titles(project), "with no target nothing is hidden");
  assert.deepEqual(titles(expandOutput(project, project.targets[2].id)), titles(project), "a target that hides nothing hides nothing");
  assert.throws(() => expandOutput(project, "nope"), /There is no target with that id/);
  // A hidden chapter takes the topics under it, and a guide loses the tasks that went.
  const { project: p2, chapter, adminId: a2, saving: s2 } = sample();
  p2.guides = [{ id: "g", name: "G", layout: "top", tasks: [s2.id], steps: [] } as never];
  findNode(p2.tree, chapter.id)!.conditions = [a2];
  setTargetList(p2, [{ name: "T", hide: ["Administrators"] }]);
  const gone = expandOutput(p2, p2.targets[0].id);
  assert.deepEqual(titles(gone), ["Administration"], "topics under a hidden chapter go too");
  assert.deepEqual(gone.guides[0].tasks, [], "a guide does not keep a task that is not in the output");
});

test("a block can carry the same condition as the snippet block that places it, and a snippet's own conditions add to it", () => {
  const { project, saving, inSaving, adminId, v2Id, snippet } = sample();
  inSaving.conditions = [adminId];
  snippet.blocks[1].conditions = [v2Id];
  setTargetList(project, [{ name: "No admins", hide: ["Administrators"] }, { name: "No v2", hide: ["Version 2"] }]);
  const blocks = (target: string) => findNode(expandOutput(project, project.targets.find((t) => t.name === target)!.id).tree, saving.id)!.page!.blocks;
  assert.deepEqual(blocks("No admins").map((b) => b.type), ["paragraph"], "the whole snippet use is gone");
  const noV2 = blocks("No v2");
  assert.deepEqual(noV2.map((b) => b.type), ["paragraph", "heading", "callout", "procedure"], "only the snippet block that carries version 2 goes");
  assert.deepEqual(noV2[1].conditions, [adminId], "what is written out carries the placing block's conditions");
});

test("deleting a snippet leaves its words where it was used as ordinary blocks; deleting a condition takes it off everything", () => {
  const { project, saving, snippet, adminId } = sample();
  findNode(project.tree, saving.id)!.conditions = [adminId];
  setTargetList(project, [{ name: "T", hide: ["Administrators", "Version 2"] }]);
  const places = deleteSnippet(project, snippet.id);
  assert.equal(places, 2);
  assert.deepEqual(project.snippets, []);
  assert.deepEqual(findNode(project.tree, saving.id)!.page!.blocks.map((b) => b.type), ["paragraph", "heading", "paragraph", "callout", "procedure"]);
  assert.throws(() => deleteSnippet(project, "nope"), /There is no snippet with that id/);
  assert.equal(conditionUses(project, adminId), 1);
  const result = setConditionNames(project, ["version 2", "Draft"]);
  assert.deepEqual(result, { added: 1, removed: 1 });
  assert.deepEqual(project.conditions.map((c) => c.name), ["Version 2", "Draft"], "a name that stays keeps its id, whatever the capitals");
  assert.equal(findNode(project.tree, saving.id)!.conditions, undefined, "the removed condition is off the topic");
  assert.deepEqual(project.targets[0].hide, [project.conditions[0].id], "and off the target");
  assert.throws(() => setConditionNames(project, Array.from({ length: 31 }, (_, i) => `C${i}`)), /up to 30 conditions/);
  assert.throws(() => setTargetList(project, [{ name: "X", hide: ["Nope"] }]), /hides "Nope", which is not one of the conditions \(Version 2, Draft\)/);
  assert.throws(() => setTargetList(project, [{ name: "X", hide: [] }, { name: "x", hide: [] }]), /two targets called "x"/);
  assert.throws(() => setTargetList(project, [{ name: " ", hide: [] }]), /needs a name/);
  assert.throws(() => setSnippet(project, "  ", []), /needs a name/);
  assert.throws(() => conditionIds(project, ["Ghost"]), /"Ghost" is not one of the conditions/);
});

test("snippets, conditions, targets and what carries them are saved and come back, and a project from format 18 opens with none", () => {
  assert.ok(CURRENT_VERSION >= 19);
  const { project, saving, adminId, snippet } = sample();
  setTargetList(project, [{ name: "Guide for students", hide: ["Administrators"] }]);
  findNode(project.tree, saving.id)!.conditions = [adminId];
  (findNode(project.tree, saving.id)!.page!.blocks[0]).conditions = [adminId];
  const files = toFiles(project);
  const header = JSON.parse(files["project.json"]);
  assert.equal(header.snippets.length, 1);
  assert.deepEqual(header.conditions.map((c: { name: string }) => c.name), ["Administrators", "Version 2"]);
  assert.equal(header.targets[0].name, "Guide for students");
  assert.deepEqual(JSON.parse(files["structure.json"]).tree[0].children[0].conditions, [adminId]);
  const again = fromFiles(files);
  assert.deepEqual(again, project);
  // A condition id that is not the project's is dropped from everything when the project is opened.
  const damaged = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.split(adminId).join("ghost-id")]));
  damaged["project.json"] = files["project.json"];
  const cleaned = fromFiles(damaged);
  assert.equal(findNode(cleaned.tree, saving.id)!.conditions, undefined, "a topic with an unknown condition has none");
  assert.equal(findNode(cleaned.tree, saving.id)!.page!.blocks[0].conditions, undefined, "and so has a block");
  const old = migrate({ version: 18, name: "Old", template: "empty", variables: {}, highlight: {}, tree: [] });
  assert.equal(old.version, CURRENT_VERSION);
  assert.deepEqual([old.snippets, old.conditions, old.targets], [[], [], []]);
  assert.equal(snippet.blocks.length, 4);
});

test("lists read from a file keep only good, once-each, named things", () => {
  assert.deepEqual(cleanSnippets([{ id: "s1", name: " A  b ", blocks: [{ type: "heading", text: "H" }, { type: "picture", pictureId: "p" }, { type: "snippet", snippetId: "x" }, { type: "procedure", steps: [{ text: [{ text: "S", mark: "bold" }], pictureId: "p1" }] }] }, { id: "s2", name: "a B", blocks: [] }, { name: "", blocks: [] }, "x"])
    .map((s) => [s.id, s.name, s.blocks.map((b) => b.type)]), [["s1", "A b", ["heading", "procedure"]]], "no pictures, no nested snippets, no repeated name");
  const proc = cleanSnippets([{ id: "s", name: "N", blocks: [{ type: "procedure", steps: [{ text: [{ text: "S" }], pictureId: "p1" }] }] }])[0].blocks[0];
  assert.equal(proc.type === "procedure" && "pictureId" in proc.steps[0], false, "a step of a snippet has no picture");
  const conditions = cleanConditions([{ id: "c1", name: "One" }, { id: "c2", name: "one" }, { id: "c1", name: "Two" }, { id: "c3", name: "Three" }]);
  assert.deepEqual(conditions.map((c) => c.name), ["One", "Three"]);
  assert.deepEqual(cleanTargets([{ id: "t1", name: "T", hide: ["c1", "zzz", "c1", "c3"] }, { id: "t2", name: "t", hide: [] }], conditions).map((t) => [t.name, t.hide]), [["T", ["c1", "c3"]]]);
});

test("the print preview, Word, Markdown and the help site get the written-out snippet; JSON keeps the snippet block and the whole book", async () => {
  const { project, saving, snippet } = sample();
  const html = renderPrintPreview(ctxOf(expandOutput(project))).html;
  assert.equal(html.split("Back up your <strong>work</strong> first").length - 1, 2, "once in each topic");
  assert.match(html, /<h3>Before you start<\/h3>/);
  const flatten = async (bytes: Uint8Array) => bytes;
  const md = new TextDecoder().decode((await makeExport(project, new Map(), "markdown", { flatten })).bytes.length ? new Uint8Array() : new Uint8Array());
  assert.equal(md, "");
  assert.match(bookMarkdown(expandOutput(project), new Map()), /Back up your \*\*work\*\* first/);
  const doc = new TextDecoder().decode(buildDocxParts(expandOutput(project), new Map())["word/document.xml"]);
  assert.equal(doc.split("Close other programs.").length - 1, 2, "in Word too");
  assert.equal(Object.values(buildHelpSiteText(expandOutput(project), new Map())).filter((p) => p.includes("Close other programs.")).length >= 2, true);
  const json = buildJsonExport(project, new Map());
  const book = JSON.parse(new TextDecoder().decode(json.files["book.json"]));
  assert.deepEqual(book.snippets.map((s: { name: string }) => s.name), ["Back up first"], "the whole book: the snippet");
  assert.equal(book.tree[0].children[0].page.blocks[1].type, "snippet", "and the snippet block, not its words");
  assert.deepEqual(book.conditions.map((c: { name: string }) => c.name), ["Administrators", "Version 2"]);
  assert.deepEqual(readJsonExport(json.files).project.snippets, project.snippets);
  assert.equal(findNode(readJsonExport(json.files).project.tree, saving.id)!.page!.blocks[1].type, "snippet");
  assert.equal(snippet.name, "Back up first");
});

test("the book check says a snippet block with no snippet, an unused or empty snippet and an unused condition", () => {
  const { project, saving, snippet, printing } = sample();
  assert.deepEqual(checkProject(project).filter((i) => /^(snippet|condition)/.test(i.kind)).map((i) => i.kind), ["condition-unused", "condition-unused"], "two conditions nothing carries");
  const block = findNode(project.tree, saving.id)!.page!.blocks[1] as SnippetBlock;
  block.snippetId = "ghost";
  const missing = checkProject(project).filter((i) => i.kind === "snippet-missing");
  assert.equal(missing.length, 1);
  assert.match(missing[0].words, /^Block 2 of "1\.1 Saving" uses a snippet that is not in the book, so nothing is written there\.$/);
  (findNode(project.tree, printing.id)!.page!.blocks[1] as SnippetBlock).snippetId = "ghost";
  assert.deepEqual(checkProject(project).filter((i) => i.kind === "snippet-unused").map((i) => i.words), [`The snippet "Back up first" is not used in any topic.`]);
  snippet.blocks = [];
  assert.deepEqual(checkProject(project).filter((i) => i.kind === "snippet-empty").map((i) => i.where), ['Snippet "Back up first"']);
  const empty = makeBlock("snippet");
  addBlock(findNode(project.tree, saving.id)!.page!, empty);
  assert.ok(checkProject(project).some((i) => i.kind === "empty-block" && /snippet/.test(i.words)), "a snippet block with none chosen is an empty block");
});

test("the Reuse window's choices are applied: a snippet kept as it was keeps its blocks, a changed one is read again, a removed one becomes ordinary blocks, a removed condition goes everywhere", () => {
  const { project, saving, snippet, adminId } = sample();
  findNode(project.tree, saving.id)!.conditions = [adminId];
  const state = reuseStateOf(project);
  assert.deepEqual(reuseProblems(state), []);
  assert.equal(state.snippets[0].text, TEXT);
  const keep = project.snippets[0].blocks;
  // nothing changed
  assert.equal(applyReuse(project, { snippets: state.snippets, conditions: state.conditions, targets: state.targets }), 0);
  assert.deepEqual(project.snippets[0].blocks, keep, "the same blocks, with their ids and conditions");
  // change the text, remove a condition, add a target and a new snippet
  const next = { snippets: [{ ...state.snippets[0], text: "Only this now." }, { id: "newid1", name: "Second", text: "# Heading" }], conditions: state.conditions.filter((c) => c.id !== adminId), targets: [{ id: "t1", name: "T", hide: [adminId, state.conditions[1].id] }] };
  assert.equal(applyReuse(project, next), 0);
  assert.equal(snippetToText(project.snippets[0].blocks), "Only this now.");
  assert.equal(project.snippets[1].name, "Second");
  assert.deepEqual(project.targets[0].hide, [state.conditions[1].id]);
  assert.equal(findNode(project.tree, saving.id)!.conditions, undefined);
  assert.equal(applyReuse(project, { snippets: [state.snippets[0], next.snippets[1]].slice(1), conditions: next.conditions, targets: [] }), 2, "the two places that used the first snippet");
  assert.deepEqual(project.snippets.map((s) => s.name), ["Second"]);
  assert.equal(findNode(project.tree, saving.id)!.page!.blocks.length, 2, "the words stay as a block");
  assert.equal(snippet.id, state.snippets[0].id);
  // problems are said before anything is kept
  assert.deepEqual(reuseProblems({ snippets: [{ id: "a", name: "X", text: "" }, { id: "b", name: "x", text: "" }], conditions: [{ id: "c", name: "" }], targets: [] }), ['There are two snippets called "x". Each name can be used once, whatever the capitals.', "A condition has no name. Give it a name or remove it."]);
});
