import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { CURRENT_VERSION, addNode, createProject, ensurePage, type Picture, type Project } from "../src/project/model.ts";
import { DRAFTS_FILE, PROJECT_FILE, STRUCTURE_FILE, fromFiles, toFiles } from "../src/project/files.ts";
import { acceptDraft, addDraft, cleanDrafts, draftCount, draftRows, isProcedure, procedureWaiting, rejectDraft, type ProcedureDraft, type ProcedureRow } from "../src/project/drafts.ts";
import { NO_NAME_FLAG, controlName, draftProcedure, planProcedure, stepFor } from "../src/project/procedure-draft.ts";
import { checkProject } from "../src/project/checks.ts";
import { makeBlock, type ProcedureBlock } from "../src/project/page.ts";
import { parseMarks } from "../src/project/text.ts";
import { buildJsonExport } from "../src/export/json.ts";
import type { ClickInfo, ClickTarget } from "../src/project/model.ts";

let n = 0;
function click(target: ClickTarget | undefined, extra: Partial<ClickInfo> = {}, callouts?: Picture["callouts"]): Picture {
  n++;
  return {
    id: `c${n}`,
    file: `images/c${n}.png`,
    width: 800,
    height: 600,
    altText: "",
    source: { kind: "click", capturedAt: "t" },
    click: { x: 60, y: 30, button: "left", ...extra, ...(target ? { target: { bounds: { x: 20, y: 10, width: 80, height: 40 }, ...target } } : {}) },
    ...(callouts ? { callouts } : {}),
  };
}
const callout = (name: string, description = "", x = 20) => ({ id: `k${name}${x}`, name, description, target: { x, y: 10, width: 80, height: 40 }, marker: { x: 5, y: 5 } });

function topicWith(...pictures: Picture[]): { project: Project; id: string } {
  const project = createProject("Procedures");
  const chapter = addNode(project.tree, null, "Getting started");
  const topic = addNode(project.tree, chapter.id, "Saving your work");
  topic.pictures.push(...pictures);
  return { project, id: topic.id };
}

test("each kind of item is spoken of the right way, with the control name marked", () => {
  const cases: Array<[ClickTarget, Partial<ClickInfo>, string]> = [
    [{ role: "button", name: "Save" }, {}, "Click [[Save]]."],
    [{ role: "split button", name: "Paste" }, {}, "Click [[Paste]]."],
    [{ role: "menu item", name: "Save as..." }, {}, "Choose [[Save as...]]."],
    [{ role: "menu", name: "File" }, {}, "Open the [[File]] menu."],
    [{ role: "check box", name: "Remember me" }, {}, "Tick [[Remember me]]."],
    [{ role: "radio button", name: "Landscape" }, {}, "Select [[Landscape]]."],
    [{ role: "combo box", name: "Save as type" }, {}, "Open the [[Save as type]] list."],
    [{ role: "button", name: "Open" }, { double: true }, "Double-click [[Open]]."],
    [{ role: "button", name: "Open" }, { button: "right" }, "Right-click [[Open]]."],
    [{ role: "button", name: "Open" }, { button: "middle" }, "Middle-click [[Open]]."],
    [{ role: "menu", name: "File" }, { button: "right" }, "Right-click the [[File]] menu."],
    [{ role: "check box", name: "Remember me" }, { double: true }, "Double-click [[Remember me]]."],
    [{ name: "Go" }, {}, "Click [[Go]]."],
  ];
  for (const [target, extra, expected] of cases) assert.equal(stepFor(click(target, extra))!.text, expected, JSON.stringify([target, extra]));
  // The kinds Windows names no control of come with the author's callout name.
  const named = (role: string, name: string, extra: Partial<ClickInfo> = {}) => stepFor(click({ role }, extra, [callout(name)]))!.text;
  assert.equal(named("text box", "File name"), "Click the [[File name]] box.");
  assert.equal(named("tab", "Layout"), "Click the [[Layout]] tab.");
  assert.equal(named("link", "Learn more"), "Click the [[Learn more]] link.");
  assert.equal(named("list item", "Report.docx"), "Select [[Report.docx]].");
  assert.equal(named("tree item", "Documents"), "Select [[Documents]].");
  assert.equal(named("spin box", "Copies"), "Click the [[Copies]] box.");
  assert.equal(named("header item", "Date"), "Click the [[Date]] heading.");
  assert.equal(named("pane", "Preview"), "Click [[Preview]].");
  assert.equal(named("list item", "Report.docx", { double: true }), "Double-click [[Report.docx]].");
});

test("the name comes from the author's callout first, then from Windows, and a placeholder is not a name", () => {
  const both = click({ role: "button", name: "Save" }, {}, [callout("Save changes")]);
  assert.deepEqual(controlName(both), { name: "Save changes", source: "callout A" });
  assert.equal(stepFor(both)!.text, "Click [[Save changes]].");
  assert.match(stepFor(both)!.from, /Name taken from callout A\.$/);
  const windows = click({ role: "button", name: "Save" });
  assert.deepEqual(controlName(windows), { name: "Save", source: "Windows" });
  assert.match(stepFor(windows)!.from, /Name taken from Windows\.$/);
  assert.equal(stepFor(windows)!.flag, undefined);
  // A callout that is not on the clicked item does not name it; a placeholder name is passed over for Windows' name.
  const elsewhere = click({ role: "button", name: "Save" }, {}, [callout("Cancel", "", 300)]);
  assert.equal(controlName(elsewhere)!.name, "Save");
  const placeholder = click({ role: "button", name: "Save" }, {}, [callout("Button1")]);
  assert.equal(controlName(placeholder)!.name, "Save");
  // The second callout can be the one on the click.
  const second = click({ role: "text box" }, {}, [callout("Cancel", "", 300), callout("File name", "", 20)]);
  assert.deepEqual(controlName(second), { name: "File name", source: "callout B" });
});

test("a step with no name says what it can and is flagged; a click with neither name nor kind is the item shown; a password box is only a fact", () => {
  const box = stepFor(click({ role: "text box" }))!;
  assert.deepEqual([box.text, box.flag], ["Click the text box.", NO_NAME_FLAG]);
  assert.equal(stepFor(click({ role: "menu item" }))!.text, "Choose the menu item.");
  assert.equal(stepFor(click({ role: "combo box" }))!.text, "Open the list.");
  assert.equal(stepFor(click({ role: "tab" }))!.text, "Click the tab.");
  assert.equal(stepFor(click({ role: "list item" }))!.text, "Select the item.");
  assert.equal(stepFor(click({ role: "pane" }))!.text, "Click the pane.");
  const nothing = stepFor(click(undefined))!;
  assert.deepEqual([nothing.text, nothing.flag], ["Click the item shown.", NO_NAME_FLAG]);
  assert.equal(stepFor(click({ role: "text box" }, { double: true }))!.text, "Double-click the text box.");
  const thin = stepFor(click({ role: "button", name: "Button1" }))!;
  assert.deepEqual([thin.text, thin.flag], ["Click the button.", NO_NAME_FLAG], "a name that is only a placeholder is not used");
  const password = stepFor(click({ password: true }))!;
  assert.deepEqual([password.text, password.flag, password.from], ["Click the password box.", undefined, "Click on a password box."]);
  assert.equal(stepFor({ ...click(undefined), click: undefined }), null, "a picture with no click note has no step");
});

test("a name with marks in it is escaped so it stays one control name", () => {
  const step = stepFor(click({ role: "button" }, {}, [callout("Find *all* [now]")]))!;
  assert.equal(step.text, "Click [[Find \\*all\\* \\[now\\]]].");
  const runs = parseMarks(step.text);
  assert.deepEqual(runs, [{ text: "Click " }, { text: "Find *all* [now]", mark: "control" }, { text: "." }]);
});

test("the plan is one step for each click picture in order, leaving out other pictures and any already in a step", () => {
  const a = click({ role: "menu item", name: "File" });
  const b = click({ role: "menu item", name: "Save as..." });
  const imported: Picture = { ...click(undefined), id: "imp", source: { kind: "import", capturedAt: "t" }, click: undefined };
  const c = click({ role: "button", name: "Save" });
  const { project, id } = topicWith(a, imported, b, c);
  let plan = planProcedure(project, id);
  assert.equal(plan.ok, true);
  assert.deepEqual((plan as { steps: { pictureId: string; text: string }[] }).steps.map((s) => [s.pictureId, s.text]), [[a.id, "Choose [[File]]."], [b.id, "Choose [[Save as...]]."], [c.id, "Click [[Save]]."]]);
  // A picture already in a step on the page is not made into another.
  const block = makeBlock("procedure") as ProcedureBlock;
  block.steps = [{ id: "s1", text: [{ text: "Choose File." }], pictureId: a.id }];
  ensurePage(project.tree[0].children[0]).blocks.push(block);
  plan = planProcedure(project, id);
  assert.deepEqual((plan as { steps: { pictureId: string }[] }).steps.map((s) => s.pictureId), [b.id, c.id]);
  block.steps.push({ id: "s2", text: [{ text: "x" }], pictureId: b.id }, { id: "s3", text: [{ text: "y" }], pictureId: c.id });
  assert.deepEqual(planProcedure(project, id), { ok: false, words: "Every click picture of this topic is already in a step on its page." });
  const noClicks = topicWith(imported);
  assert.deepEqual(planProcedure(noClicks.project, noClicks.id), { ok: false, words: "This topic has no click pictures to make steps from. Capture clicks into it first." });
  assert.deepEqual(planProcedure(project, "nope"), { ok: false, words: "That topic was not found." });
});

test("making the draft keeps it apart from the page, says how many steps need a name, and will not make a second while one waits", () => {
  const { project, id } = topicWith(click({ role: "button", name: "Save" }), click({ role: "text box" }), click({ role: "link" }));
  const before = JSON.stringify(project.tree);
  const made = draftProcedure(project, id, "2026-10-22T09:00:00.000Z");
  assert.equal(made.ok, true);
  if (!made.ok) return;
  assert.equal(made.flagged, 2);
  assert.deepEqual([made.draft.kind, made.draft.by, made.draft.nodeId, made.draft.steps.length, made.draft.madeAt], ["procedure", "rule", id, 3, "2026-10-22T09:00:00.000Z"]);
  assert.equal(JSON.stringify(project.tree), before, "the page and the pictures are untouched");
  assert.ok(project.tree[0].children[0].page === undefined);
  assert.equal(procedureWaiting(project, id), true);
  assert.deepEqual(draftProcedure(project, id, "later"), { ok: false, words: "A procedure draft is already waiting for this topic. Open Drafts and accept or reject it first." });
  assert.equal(project.drafts.length, 1);
  assert.equal(draftCount(project), 1);
  // It comes first in the list for its topic, with where each step's picture is.
  const rows = draftRows(project);
  assert.equal(rows.length, 1);
  const row = rows[0] as ProcedureRow;
  assert.deepEqual([row.where, row.pictureWords, row.blocksNow], ["1.1 Saving your work", ["picture 1", "picture 2", "picture 3"], 0]);
  assert.ok(isProcedure(row.draft));
});

test("accepting adds a numbered procedure at the end of the page, each step with its picture and its control marks, and changes nothing else", () => {
  const a = click({ role: "menu item", name: "File" });
  const b = click({ role: "button", name: "Save" });
  const { project, id } = topicWith(a, b);
  const topic = project.tree[0].children[0];
  const intro = makeBlock("paragraph");
  ensurePage(topic).blocks.push(intro);
  const made = draftProcedure(project, id, "now");
  assert.equal(made.ok, true);
  const draft = (made as { draft: ProcedureDraft }).draft;
  const done = acceptDraft(project, draft.id, ["Choose [[File]], then wait.", "  Click   [[Save]].  "]);
  assert.deepEqual(done, { ok: true, where: "1.1 Saving your work", words: "Added a numbered procedure of 2 steps to the end of the page of 1.1 Saving your work." });
  const blocks = topic.page!.blocks;
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0], intro, "the page's other blocks are as they were");
  const added = blocks[1] as ProcedureBlock;
  assert.equal(added.type, "procedure");
  assert.deepEqual(added.steps.map((s) => s.pictureId), [a.id, b.id]);
  assert.deepEqual(added.steps[0].text, [{ text: "Choose " }, { text: "File", mark: "control" }, { text: ", then wait." }]);
  assert.deepEqual(added.steps[1].text, [{ text: "Click " }, { text: "Save", mark: "control" }, { text: "." }]);
  assert.equal(new Set([added.id, ...added.steps.map((s) => s.id), intro.id]).size, 4, "every id is its own");
  assert.equal(project.drafts.length, 0, "and the draft is gone");
  assert.equal(procedureWaiting(project, id), false);
  // The pictures are now in steps, so drafting again has nothing to do.
  assert.deepEqual(draftProcedure(project, id, "now"), { ok: false, words: "Every click picture of this topic is already in a step on its page." });
});

test("accepting is refused in words when a step has no words, and when what it was for has gone", () => {
  const a = click({ role: "button", name: "Save" });
  const b = click({ role: "button", name: "Open" });
  const { project, id } = topicWith(a, b);
  const topic = project.tree[0].children[0];
  const draft = (draftProcedure(project, id, "now") as { draft: ProcedureDraft }).draft;
  const refused = acceptDraft(project, draft.id, ["Click [[Save]].", "   "]);
  assert.deepEqual(refused, { ok: false, words: "Step 2 has no words. Write it, or reject the draft." });
  assert.equal(project.drafts.length, 1);
  assert.ok(!topic.page, "nothing was added");
  // A picture removed since: its step goes, the rest are added.
  topic.pictures.splice(0, 1);
  const partly = acceptDraft(project, draft.id);
  assert.equal(partly.ok, true);
  assert.equal((topic.page!.blocks[0] as ProcedureBlock).steps.length, 1);
  assert.match((partly as { words: string }).words, /of 1 step to the end/);
  // All pictures gone: dropped.
  const again = topicWith(click({ role: "button", name: "Save" }));
  const d2 = (draftProcedure(again.project, again.id, "now") as { draft: ProcedureDraft }).draft;
  again.project.tree[0].children[0].pictures = [];
  const gone = acceptDraft(again.project, d2.id);
  assert.deepEqual(gone, { ok: false, words: "The pictures this procedure was made from are gone, so the draft was dropped." });
  assert.equal(again.project.drafts.length, 0);
  // The topic gone.
  const third = topicWith(click({ role: "button", name: "Save" }));
  const d3 = (draftProcedure(third.project, third.id, "now") as { draft: ProcedureDraft }).draft;
  third.project.tree = [];
  assert.deepEqual(acceptDraft(third.project, d3.id), { ok: false, words: "The topic this draft was for is gone, so the draft was dropped." });
  assert.equal(third.project.drafts.length, 0);
});

test("rejecting a procedure draft changes nothing else", () => {
  const { project, id } = topicWith(click({ role: "button", name: "Save" }));
  const before = JSON.stringify(project.tree);
  const draft = (draftProcedure(project, id, "now") as { draft: ProcedureDraft }).draft;
  assert.equal(rejectDraft(project, draft.id), true);
  assert.equal(JSON.stringify(project.tree), before);
  assert.equal(project.drafts.length, 0);
});

test("a procedure draft is cleaned when a project is opened: topic, pictures, words, length, one for a topic", () => {
  const a = click({ role: "button", name: "Save" });
  const { project, id } = topicWith(a);
  const step = (text: string, pictureId = a.id) => ({ pictureId, text, from: "Click on the button.", flag: "" });
  const raw = [
    { id: "d1", kind: "procedure", nodeId: id, steps: [step("First.")], madeAt: "t", by: "rule" },
    { id: "d2", kind: "procedure", nodeId: id, steps: [step("Newer."), step("Gone picture", "nope"), step("   "), "junk", step("x".repeat(500))], madeAt: "t", by: "model" },
    { id: "d3", kind: "procedure", nodeId: "no-such-topic", steps: [step("x")] },
    { id: "d4", kind: "procedure", nodeId: id, steps: [] },
    { id: "d5", kind: "procedure", steps: [step("x")] },
    { id: "d6", kind: "procedure", nodeId: id, steps: "not a list" },
  ];
  const kept = cleanDrafts(raw, project.tree);
  assert.equal(kept.length, 1);
  const d = kept[0] as ProcedureDraft;
  assert.deepEqual([d.id, d.by, d.steps.length], ["d2", "model", 2], "the newest for the topic, with only the usable steps");
  assert.equal(d.steps[1].text.length, 300);
  assert.equal(d.steps[0].flag, undefined, "an empty flag is not kept");
  const many = Array.from({ length: 80 }, (_, i) => step(`Step ${i}`));
  assert.equal((cleanDrafts([{ kind: "procedure", nodeId: id, steps: many }], project.tree)[0] as ProcedureDraft).steps.length, 60);
});

test("a procedure draft is saved in drafts.json and comes back, and projects saved before it open", () => {
  const a = click({ role: "menu item", name: "File" });
  const b = click({ role: "text box" });
  const { project, id } = topicWith(a, b);
  draftProcedure(project, id, "2026-10-22T09:00:00.000Z");
  assert.ok(CURRENT_VERSION >= 15);
  const files = toFiles(project);
  const saved = JSON.parse(files[DRAFTS_FILE]);
  assert.equal(saved.version, CURRENT_VERSION);
  assert.equal(saved.drafts[0].kind, "procedure");
  assert.ok(!files[STRUCTURE_FILE].includes("Choose [[File]]"), "the words are not in the tree");
  const back = fromFiles(files);
  assert.deepEqual(back.drafts, project.drafts);
  // Saved by the program before this one (format 14, with a sentence draft and a page file): opens, and the page and the draft are kept.
  const old = createProject("Old");
  const topic = addNode(old.tree, null, "Topic");
  topic.pictures.push(click({ role: "button", name: "Save" }, {}, [callout("Save")]));
  const block = makeBlock("paragraph");
  ensurePage(topic).blocks.push(block);
  addDraft(old, { kind: "callout-sentence", pictureId: topic.pictures[0].id, calloutId: topic.pictures[0].callouts![0].id, text: "Saves your work.", clues: [], madeAt: "t", model: "m" });
  const as14: Record<string, string> = {};
  for (const [name, text] of Object.entries(toFiles(old))) as14[name] = JSON.stringify({ ...JSON.parse(text), version: 14 });
  assert.ok(Object.keys(as14).some((f) => f.startsWith("topics/")) && DRAFTS_FILE in as14);
  const opened = fromFiles(as14);
  assert.equal(opened.version, CURRENT_VERSION);
  assert.equal(opened.tree[0].page!.blocks.length, 1);
  assert.equal(opened.drafts.length, 1);
  // The same protection as before: a page or draft file from a different save is still refused.
  const mixed = { ...as14 };
  const pageName = Object.keys(as14).find((f) => f.startsWith("topics/"))!;
  mixed[pageName] = JSON.stringify({ ...JSON.parse(as14[pageName]), version: 12 });
  assert.throws(() => fromFiles(mixed), /do not match/);
  assert.throws(() => fromFiles({ ...as14, [DRAFTS_FILE]: JSON.stringify({ ...JSON.parse(as14[DRAFTS_FILE]), version: 13 }) }), /do not match/);
  void PROJECT_FILE;
});

test("a project saved long ago with a page opens now (the page file is checked against the version it was saved with)", () => {
  const p = createProject("Ancient");
  const topic = addNode(p.tree, null, "Topic");
  ensurePage(topic).blocks.push(makeBlock("paragraph"));
  for (const saved of [5, 8, 12]) {
    const files: Record<string, string> = {};
    for (const [name, text] of Object.entries(toFiles(p))) files[name] = JSON.stringify({ ...JSON.parse(text), version: saved });
    const opened = fromFiles(files);
    assert.equal(opened.version, CURRENT_VERSION, `saved as ${saved}`);
    assert.equal(opened.tree[0].page?.blocks.length, 1, `its page is kept (saved as ${saved})`);
  }
});

test("the book check notes a waiting procedure draft, and it is in no export", () => {
  const { project, id } = topicWith(click({ role: "button", name: "Save" }));
  draftProcedure(project, id, "now");
  const notes = checkProject(project).filter((i) => i.kind === "ai-draft");
  assert.equal(notes.length, 1);
  assert.match(notes[0].words, /A draft of a numbered procedure is waiting for "1\.1 Saving your work"\. It is not in the book until you accept it\./);
  const { files } = buildJsonExport(project, new Map());
  const text = new TextDecoder().decode(files["book.json"]);
  assert.ok(!text.includes("Click [[Save]]") && !/"drafts"/.test(text) && !text.includes("procedure\""), "the draft is not exported");
  const accepted = acceptDraft(project, project.drafts[0].id);
  assert.equal(accepted.ok, true);
  assert.equal(checkProject(project).filter((i) => i.kind === "ai-draft").length, 0);
});

test("making a procedure uses no AI at all", () => {
  const source = fs.readFileSync(new URL("../src/project/procedure-draft.ts", import.meta.url), "utf8");
  assert.ok(!/from "\.\.\/ai\//.test(source) && !/fetch\(/.test(source), "no import from src/ai and no network call");
});
