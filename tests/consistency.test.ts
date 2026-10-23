import test from "node:test";
import assert from "node:assert/strict";
import { addNode, createProject, ensurePage, type Picture, type Project, type TreeNode } from "../src/project/model.ts";
import type { ClickInfo, ClickTarget } from "../src/project/model.ts";
import { SUITS, consistencyIssues, knownControls, normalName } from "../src/project/consistency.ts";
import { avoidCountWords, avoidWordsFromLines, avoidWordsToLines, cleanAvoidWords, type AvoidWord } from "../src/project/avoid-words.ts";
import { stepFor } from "../src/project/procedure-draft.ts";
import { checkProject, kindInfo, summaryWords } from "../src/project/checks.ts";
import { makeBlock, type CalloutBlock, type HeadingBlock, type ParagraphBlock, type ProcedureBlock } from "../src/project/page.ts";
import { parseMarks } from "../src/project/text.ts";

let n = 0;
function click(target: ClickTarget | undefined, extra: Partial<ClickInfo> = {}): Picture {
  n++;
  return {
    id: `p${n}`,
    file: `images/p${n}.png`,
    width: 800,
    height: 600,
    altText: "",
    source: { kind: "click", capturedAt: "t" },
    click: { x: 60, y: 30, button: "left", ...extra, ...(target ? { target: { bounds: { x: 20, y: 10, width: 80, height: 40 }, ...target } } : {}) },
  };
}
function para(source: string): ParagraphBlock {
  const b = makeBlock("paragraph") as ParagraphBlock;
  b.text = parseMarks(source);
  return b;
}
function steps(...lines: Array<string | [string, string]>): ProcedureBlock {
  const b = makeBlock("procedure") as ProcedureBlock;
  b.steps = lines.map((l, i) => ({ id: `s${i}`, text: parseMarks(typeof l === "string" ? l : l[0]), ...(typeof l === "string" ? {} : { pictureId: l[1] }) }));
  return b;
}

/** A book that captured Save as... (a menu item), OK and Save (buttons), Remember me (a check box) and the File menu. */
function book(): { project: Project; topic: TreeNode } {
  const project = createProject("Consistency");
  const chapter = addNode(project.tree, null, "Working with documents");
  const topic = addNode(project.tree, chapter.id, "Saving your work");
  topic.pictures.push(click({ role: "menu item", name: "Save as..." }), click({ role: "button", name: "OK" }), click({ role: "button", name: "Save" }), click({ role: "check box", name: "Remember me" }), click({ role: "menu", name: "File" }));
  ensurePage(topic);
  return { project, topic };
}
const issues = (project: Project, topic: TreeNode, avoid: AvoidWord[] = []) => consistencyIssues(topic, "1.1 Saving your work", knownControls(project), avoid);

test("a control's name is compared without capitals, the access-key mark and a closing ellipsis or colon", () => {
  assert.equal(normalName("Save as..."), "save as");
  assert.equal(normalName("&Save As…"), "save as");
  assert.equal(normalName("  File   name: "), "file name");
  assert.equal(normalName("OK"), "ok");
});

test("the controls the book has pictures of are known by name and kind; placeholders and password boxes are not", () => {
  const { project, topic } = book();
  topic.pictures.push(click({ role: "text box", name: "Pane 3" }), click({ role: "text box", password: true, name: "Secret" }), click(undefined));
  const known = knownControls(project);
  assert.deepEqual([...known.keys()].sort(), ["file", "ok", "remember me", "save", "save as"]);
  assert.deepEqual([...known.get("save as")!.names], [["Save as...", 1]]);
  assert.deepEqual([...known.get("save as")!.roles], ["menu item"]);
});

test("a control written differently from the name the program showed is a note, with the exact words and where", () => {
  const { project, topic } = book();
  ensurePage(topic).blocks.push(
    para("Open the [[File]] menu and choose [[Save as]] to keep both versions."),
    steps("Choose [[Save As...]].", "Click [[Save]].", "Choose [[Save as...]]."),
  );
  const found = issues(project, topic).filter((i) => i.kind === "control-name");
  assert.deepEqual(found.map((i) => i.words), [
    'Block 1 (paragraph) of "1.1 Saving your work" writes the control as "Save as", but the program showed "Save as..." when it was clicked.',
    'Step 1 of block 2 (procedure) of "1.1 Saving your work" writes the control as "Save As...", but the program showed "Save as..." when it was clicked.',
  ]);
  assert.match(found[0].fix, /Write it as "Save as\.\.\.", the way the program shows it, or ignore this if you mean it\./);
  assert.equal(found[0].blockId, topic.page!.blocks[0].id);
  assert.equal(found[0].nodeId, topic.id);
  assert.ok(new Set(found.map((i) => i.key)).size === 2, "a different key for each place, so one can be ignored alone");
});

test("a control the book has no picture of, or one written the way the program shows it, or plain text, is left alone", () => {
  const { project, topic } = book();
  ensurePage(topic).blocks.push(para("Choose [[Print preview]], then [[Save as...]] and leave Save as alone in plain text."), steps("Click [[Cancel]]."));
  assert.deepEqual(issues(project, topic), []);
});

test("a control the program showed under two names is right if it matches either, and the note names the usual one", () => {
  const { project, topic } = book();
  topic.pictures.push(click({ role: "button", name: "Save" }), click({ role: "button", name: "Save" }), click({ role: "button", name: "Save..." }));
  ensurePage(topic).blocks.push(para("Click [[Save...]] or [[Save]] or [[Saved]] or [[save]]."));
  const words = issues(project, topic).filter((i) => i.kind === "control-name").map((i) => i.words);
  assert.deepEqual(words.length, 1, "Saved is a different control; only save (capitals) is the same one written differently");
  assert.match(words[0], /writes the control as "save", but the program showed "Save" when it was clicked/);
});

test("a step that starts with a verb that does not suit the control is a note; the usual verb is named", () => {
  const { project, topic } = book();
  ensurePage(topic).blocks.push(
    steps(
      "Press [[OK]].", // a button: Click
      "Click [[Save as...]].", // a menu item: Choose
      "Choose [[Save]].", // a button: Click
      "Click [[Remember me]].", // a check box: Tick, Select or Check
      "Open the [[File]] menu.", // fine
      "Click the [[File]] menu.", // fine
      "Double-click [[OK]].", // deliberate: never judged
      "Right-click [[OK]].",
      "In the window, press [[OK]].", // does not start with an action verb
      "Press [[Something else]].", // the book does not know this control
      "Choose [[Save as...]].", // fine
    ),
  );
  const found = issues(project, topic).filter((i) => i.kind === "step-verb");
  assert.deepEqual(found.map((i) => i.words), [
    'Step 1 of block 1 (procedure) of "1.1 Saving your work" starts with "Press" for the button "OK". The usual word for a button is "Click".',
    'Step 2 of block 1 (procedure) of "1.1 Saving your work" starts with "Click" for the menu item "Save as...". The usual word for a menu item is "Choose".',
    'Step 3 of block 1 (procedure) of "1.1 Saving your work" starts with "Choose" for the button "Save". The usual word for a button is "Click".',
    'Step 4 of block 1 (procedure) of "1.1 Saving your work" starts with "Click" for the check box "Remember me". The usual word for a check box is "Tick".',
  ]);
  assert.match(found[0].fix, /Start the step with "Click", or ignore this if you chose "Press" on purpose\./);
});

test("the kind comes from the step's own click picture when the book has none by that name, and a doubtful kind is not judged", () => {
  const { project, topic } = book();
  const box = click({ role: "text box" }); // Windows kept no name for it
  const go = click({ role: "button", name: "Go" });
  const goMenu = click({ role: "menu item", name: "Go" }); // the same name for two kinds: not sure which one is meant
  topic.pictures.push(box, go, goMenu);
  ensurePage(topic).blocks.push(steps(["Select the [[File name]] box.", box.id], ["Press [[Go]].", go.id], ["Press [[Name it]].", "gone"]));
  assert.deepEqual(issues(project, topic).filter((i) => i.kind === "step-verb"), [], "Select suits a text box; Go is a button and a menu item in the book, so it is not judged; a control nothing is known of is not judged");
  ensurePage(topic).blocks.push(steps(["Press the [[File name]] box.", box.id]));
  const found = issues(project, topic).filter((i) => i.kind === "step-verb");
  assert.equal(found.length, 1);
  assert.match(found[0].words, /starts with "Press" for the text box "File name"\. The usual word for a text box is "Click"\./);
});

test("the verbs the rules accept are the ones the Drafts procedure writes, kind for kind", () => {
  for (const [role, verbs] of Object.entries(SUITS)) {
    const step = stepFor(click({ role, name: "Thing" }));
    const first = step!.text.split(" ")[0].toLowerCase();
    assert.equal(first, verbs[0], role);
  }
});

test("a word on the Words to avoid list is a note wherever it is written for the reader, but not inside a control name", () => {
  const { project, topic } = book();
  const heading = makeBlock("heading") as HeadingBlock;
  heading.text = "Your File";
  const box = makeBlock("callout", { kind: "caution" }) as CalloutBlock;
  box.text = parseMarks("A file can be lost.");
  ensurePage(topic).blocks.push(
    heading,
    para("Saving over an existing file replaces it. A profile is not a file, and files are many; Choose [[File]] for the menu."),
    box,
    steps("Choose [[File]].", "Type the file name."),
  );
  topic.pictures[0].altText = "The File menu";
  const avoid = [{ avoid: "file", use: "document" }];
  const found = issues(project, topic, avoid).filter((i) => i.kind === "avoid-word");
  const where = found.map((i) => i.words.split(' of "1.1')[0]);
  assert.deepEqual(where, ["Block 1 (heading)", "Block 2 (paragraph)", "Block 3 (callout box, Caution)", "Step 2 of block 4 (procedure)", "The description of the picture \"The File menu\""]);
  assert.match(found[1].words, /uses "file", a word on your Words to avoid list: Saving over an existing file replaces it\./);
  assert.match(found[1].fix, /Use "document" instead, or ignore this if it is right here\./);
  assert.equal(found.every((i) => i.kind === "avoid-word" && i.nodeId === topic.id), true);
  assert.equal(found[4].pictureId, topic.pictures[0].id);
  assert.equal(found[1].blockId, topic.page!.blocks[1].id);
});

test("a word is found as a whole word or phrase whatever the capitals, and a phrase with no replacement says so", () => {
  const { project, topic } = book();
  ensurePage(topic).blocks.push(para("Click on the button. Then click ON it. A beaconing sound; e-mail me; the Click-On."));
  const found = issues(project, topic, [{ avoid: "click on", use: "click" }, { avoid: "e-mail", use: "" }, { avoid: "con", use: "" }]).filter((i) => i.kind === "avoid-word");
  assert.equal(found.length, 2, "click on once for the paragraph, e-mail once; con is inside other words so it is never found");
  assert.match(found.find((i) => /e-mail/.test(i.words))!.fix, /Use another word, or ignore this if it is right here\./);
});

test("with no list nothing is looked for, and a long text is shown only around the word", () => {
  const { project, topic } = book();
  ensurePage(topic).blocks.push(para(`${"Words go on and on here. ".repeat(10)}Then a file appears. ${"More words follow it too. ".repeat(10)}`));
  assert.deepEqual(issues(project, topic), []);
  const found = issues(project, topic, [{ avoid: "file", use: "document" }]);
  assert.equal(found.length, 1);
  assert.match(found[0].words, /: …[^…]{0,120}file[^…]{0,120}…$/);
});

test("the three kinds are new notes in the book check, in reading order, that can be ignored like the others", () => {
  const { project, topic } = book();
  ensurePage(topic).blocks.push(para("Choose [[Save as]] to keep the file."), steps("Press [[OK]]."));
  project.avoidWords = [{ avoid: "file", use: "document" }];
  const all = checkProject(project);
  const kinds = all.map((i) => i.kind);
  for (const kind of ["control-name", "step-verb", "avoid-word"] as const) {
    assert.ok(kinds.includes(kind), kind);
    assert.equal(kindInfo(kind).severity, "note");
    assert.equal(kindInfo(kind).group, "book");
  }
  assert.equal(new Set(all.map((i) => i.key)).size, all.length, "every key is different");
  const three = all.filter((i) => ["control-name", "step-verb", "avoid-word"].includes(i.kind));
  assert.match(summaryWords(three, []), /3 notes\./);
  project.avoidWords = [];
  assert.equal(checkProject(project).some((i) => i.kind === "avoid-word"), false, "an empty list looks for nothing");
});

test("the word list is cleaned, and read from and written to lines of text", () => {
  assert.deepEqual(cleanAvoidWords([{ avoid: "  file ", use: "document" }, { avoid: "FILE", use: "x" }, { avoid: "", use: "y" }, { avoid: "[[bad]]" }, { avoid: "click on" }, 5, null, { avoid: "a".repeat(100), use: "b".repeat(100) }]), [
    { avoid: "file", use: "document" },
    { avoid: "click on", use: "" },
    { avoid: "a".repeat(60), use: "b".repeat(60) },
  ]);
  assert.deepEqual(cleanAvoidWords("nope"), []);
  assert.equal(cleanAvoidWords(Array.from({ length: 150 }, (_, i) => ({ avoid: `w${i}`, use: "" }))).length, 100);
  const list = avoidWordsFromLines("file => document\nclick on\n => nothing\n\n  e-mail   =>   email  ");
  assert.deepEqual(list, [{ avoid: "file", use: "document" }, { avoid: "click on", use: "" }, { avoid: "e-mail", use: "email" }]);
  assert.equal(avoidWordsToLines(list), "file => document\nclick on\ne-mail => email");
  assert.deepEqual(avoidWordsFromLines(avoidWordsToLines(list)), list);
});

test("the Writing style box says in words how many lines count and how many are left out", () => {
  assert.equal(avoidCountWords(""), "0 words and phrases are on the list.");
  assert.equal(avoidCountWords("file => document"), "1 word or phrase is on the list.");
  assert.equal(avoidCountWords("file => document\nclick on => click\n\n"), "2 words and phrases are on the list.");
  assert.equal(avoidCountWords("file => document\n => nothing"), "1 word or phrase is on the list. 1 line is left out: nothing before the arrow, a word that is already there, or more than 100 lines.");
  assert.equal(avoidCountWords("file\nFILE\n=> x"), "1 word or phrase is on the list. 2 lines are left out: nothing before the arrow, a word that is already there, or more than 100 lines.");
});
