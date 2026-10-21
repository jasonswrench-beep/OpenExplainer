import test from "node:test";
import assert from "node:assert/strict";
import { addNode, addPicture, createProject, CURRENT_VERSION, ensurePage, removeNode, type Picture, type Project } from "../src/project/model.ts";
import { addBlock, makeBlock, type Step } from "../src/project/page.ts";
import { migrate } from "../src/project/migrate.ts";
import { fromFiles, toFiles } from "../src/project/files.ts";
import {
  addTask, checkGuideName, cleanGuides, DEFAULT_GUIDE_NAME, focusPicture, GUIDE_LAYOUTS, guideSteps, guideSummary, guideTasks, layoutOf, moveTask, newGuide, removeTask,
  setGuideLayout, setStepLayout, stepCount, tasksFromChapter, topicsWithSteps,
} from "../src/project/guides.ts";

const size = { width: 1920, height: 1080 };
const picture = (id: string, extra: Partial<Picture> = {}): Picture => ({ id, file: `images/${id}.png`, ...size, altText: `Picture ${id}`, source: { kind: "click", capturedAt: "t", originalName: `${id}.png` }, click: { x: 960, y: 540, button: "left" }, ...extra });
const step = (id: string, words: string, pictureId?: string): Step => ({ id, text: [{ text: words }], ...(pictureId ? { pictureId } : {}) });

/** A book with a chapter holding two tasks (each with steps), a topic with no steps, and a second chapter with one task. */
function book(): { project: Project; ids: Record<string, string> } {
  const project = createProject("Guides test");
  const chapter = addNode(project.tree, null, "Saving");
  const save = addNode(project.tree, chapter.id, "Save a file");
  const close = addNode(project.tree, chapter.id, "Close a file");
  const plain = addNode(project.tree, chapter.id, "Why save?");
  const other = addNode(project.tree, null, "Printing");
  addPicture(project.tree, save.id, picture("a"));
  addPicture(project.tree, save.id, picture("b", { view: { kind: "crop", x: 0, y: 0, width: 960, height: 540 } }));
  addPicture(project.tree, save.id, picture("c", { click: undefined }));
  const page = ensurePage(save);
  const p1 = makeBlock("procedure"); (p1 as { steps: Step[] }).steps = [step("s1", "Open the menu.", "a"), step("s2", "Choose Save.", "b"), step("s3", "Name it.", "c")];
  const note = makeBlock("callout", { kind: "caution" }); (note as { text: unknown }).text = [{ text: "Save often." }];
  const para = makeBlock("paragraph"); (para as { text: unknown }).text = [{ text: "Background that belongs to the book." }];
  const p2 = makeBlock("procedure"); (p2 as { steps: Step[] }).steps = [step("s4", "Check it saved.")];
  [para, p1, note, p2].forEach((b) => addBlock(page, b));
  const closePage = ensurePage(close);
  const p3 = makeBlock("procedure"); (p3 as { steps: Step[] }).steps = [step("s5", "Press Close.")];
  addBlock(closePage, p3);
  const plainPage = ensurePage(plain);
  const pp = makeBlock("paragraph"); (pp as { text: unknown }).text = [{ text: "Words only." }];
  addBlock(plainPage, pp);
  const otherPage = ensurePage(other);
  const p4 = makeBlock("procedure"); (p4 as { steps: Step[] }).steps = [step("s6", "Press Print.")];
  addBlock(otherPage, p4);
  return { project, ids: { chapter: chapter.id, save: save.id, close: close.id, plain: plain.id, other: other.id } };
}

test("a new guide is one layout with no tasks yet, and needs a name", () => {
  const guide = newGuide();
  assert.equal(guide.name, DEFAULT_GUIDE_NAME);
  assert.deepEqual([guide.tasks, guide.layout, guide.zoomFocus, guide.stepLayouts], [[], "top", true, undefined]);
  assert.notEqual(newGuide().id, newGuide().id);
  assert.deepEqual(newGuide("Two", ["x", "x", "y"]).tasks, ["x", "y"], "a topic is a task only once");
  assert.match(checkGuideName("   ")!, /Give the guide a name/);
  assert.equal(checkGuideName("Saving"), null);
  assert.deepEqual(GUIDE_LAYOUTS.map((l) => l.name), ["Picture on top", "Pictures on the left"]);
});

test("the topics a guide can use are those with numbered steps, and a chapter gives its own and its topics' in order", () => {
  const { project, ids } = book();
  assert.equal(stepCount(project.tree[0].children[0]), 4);
  assert.deepEqual(topicsWithSteps(project.tree).map((n) => n.id), [ids.save, ids.close, ids.other], "the topic with only a paragraph has no steps");
  assert.deepEqual(tasksFromChapter(project.tree, ids.chapter), [ids.save, ids.close]);
  assert.deepEqual(tasksFromChapter(project.tree, ids.plain), []);
  assert.deepEqual(tasksFromChapter(project.tree, "nope"), []);
  const withOwn = ensurePage(project.tree[0]);
  const proc = makeBlock("procedure"); (proc as { steps: Step[] }).steps = [step("s9", "Begin here.")];
  addBlock(withOwn, proc);
  assert.deepEqual(tasksFromChapter(project.tree, ids.chapter), [ids.chapter, ids.save, ids.close], "a chapter with steps of its own comes first");
});

test("tasks are added once, taken away and moved, and nothing moves past the ends", () => {
  const { project, ids } = book();
  const guide = newGuide("G");
  assert.equal(addTask(guide, project.tree, ids.close), true);
  assert.equal(addTask(guide, project.tree, ids.save), true);
  assert.equal(addTask(guide, project.tree, ids.save), false, "already a task");
  assert.equal(addTask(guide, project.tree, "not-in-the-book"), false);
  assert.deepEqual(guide.tasks, [ids.close, ids.save]);
  assert.equal(moveTask(guide, ids.close, -1), false);
  assert.equal(moveTask(guide, ids.save, 1), false);
  assert.equal(moveTask(guide, ids.save, -1), true);
  assert.deepEqual(guide.tasks, [ids.save, ids.close]);
  assert.equal(removeTask(guide, ids.other), false);
  assert.equal(removeTask(guide, ids.save), true);
  assert.deepEqual(guide.tasks, [ids.close]);
});

test("each step follows the guide's layout unless it has its own, and a step never repeats what the guide already says", () => {
  const guide = newGuide("G");
  assert.equal(layoutOf(guide, "s1"), "top");
  setStepLayout(guide, "s1", "left");
  assert.equal(layoutOf(guide, "s1"), "left");
  assert.equal(layoutOf(guide, "s2"), "top");
  setStepLayout(guide, "s1", "top");
  assert.equal(guide.stepLayouts, undefined, "choosing the guide's own layout lets the step follow it again");
  setStepLayout(guide, "s1", "left");
  setStepLayout(guide, "s2", "left");
  setGuideLayout(guide, "left");
  assert.equal(guide.layout, "left");
  assert.equal(guide.stepLayouts, undefined, "the steps that were left are now just like the guide");
  setStepLayout(guide, "s3", "top");
  setStepLayout(guide, "s3", null);
  assert.equal(guide.stepLayouts, undefined);
});

test("a guide is made of its topics' steps and boxed notes in page order, numbered again for each list, with everything else left to the book", () => {
  const { project, ids } = book();
  const guide = newGuide("Saving", [ids.save, ids.close, ids.plain]);
  setStepLayout(guide, "s2", "left");
  const tasks = guideTasks(project, guide);
  assert.deepEqual(tasks.map((t) => t.node.id), [ids.save, ids.close, ids.plain]);
  const kinds = tasks[0].items.map((i) => (i.type === "step" ? `${i.number}:${i.step.id}:${i.layout}` : `box:${i.kind}`));
  assert.deepEqual(kinds, ["1:s1:top", "2:s2:left", "3:s3:top", "box:caution", "1:s4:top"], "the paragraph is not in the guide, and the second list starts again at 1");
  const steps = guideSteps(project, guide);
  assert.deepEqual(steps.map((s) => s.step.id), ["s1", "s2", "s3", "s4", "s5"]);
  assert.equal(steps[0].picture?.id, "a");
  assert.equal(steps[3].picture, undefined, "a step with no picture");
  assert.deepEqual(tasks[2].items, [], "a topic with no steps is a task with nothing in it");
  assert.equal(guideSummary(project, guide), "3 tasks, 5 steps");
  assert.equal(guideSummary(project, newGuide("Empty")), "0 tasks, 0 steps");
  assert.equal(guideSummary(project, newGuide("One", [ids.other])), "1 task, 1 step");
  removeNode(project.tree, ids.close);
  assert.deepEqual(guideTasks(project, guide).map((t) => t.node.id), [ids.save, ids.plain], "a task whose topic is gone is left out");
  // The text is the book's own: changing it there changes the guide.
  (project.tree[0].children[0].page!.blocks[1] as unknown as { steps: Step[] }).steps[0].text = [{ text: "Open the File menu." }];
  assert.equal(guideSteps(project, guide)[0].step.text[0].text, "Open the File menu.");
});

test("a zoomed focus goes with a picture that has a click and is shown whole, and not when the author chose a view or turned it off", () => {
  const { project } = book();
  const pics = project.tree[0].children[0].pictures;
  const on = newGuide("G");
  assert.deepEqual(focusPicture(pics[0], on)?.view, { kind: "zoom" });
  assert.equal(focusPicture(pics[0], on)?.id, "a", "it is the same picture, zoomed");
  assert.equal(pics[0].view, undefined, "the picture itself is not changed");
  assert.equal(focusPicture(pics[1], on), null, "the author's own crop is respected");
  assert.equal(focusPicture(pics[2], on), null, "no click, nothing to zoom in on");
  assert.equal(focusPicture(pics[0], { ...on, zoomFocus: false }), null);
});

test("odd guides in a file are put right: unknown topics, repeats, layouts and ids", () => {
  const { project, ids } = book();
  assert.deepEqual(cleanGuides("nope", project.tree), []);
  assert.deepEqual(cleanGuides(undefined, project.tree), []);
  const cleaned = cleanGuides([
    { id: "g1", name: "  Saving  ", tasks: [ids.save, ids.save, "gone", 5, ids.close], layout: "left", zoomFocus: false, stepLayouts: { s1: "top", s2: "left", "bad id!": "top", s3: "sideways" } },
    { id: "g1", name: "", tasks: "not a list", layout: "diagonal" },
    null, 7,
    { id: "../escape", name: "x".repeat(500) },
    { stepLayouts: [] },
  ], project.tree);
  assert.equal(cleaned.length, 4);
  assert.deepEqual([cleaned[0].id, cleaned[0].name, cleaned[0].tasks, cleaned[0].layout, cleaned[0].zoomFocus], ["g1", "Saving", [ids.save, ids.close], "left", false]);
  assert.deepEqual(cleaned[0].stepLayouts, { s1: "top" }, "a step layout is kept only if it differs from the guide and is a layout");
  assert.notEqual(cleaned[1].id, "g1", "two guides never share an id");
  assert.deepEqual([cleaned[1].name, cleaned[1].tasks, cleaned[1].layout, cleaned[1].zoomFocus], [DEFAULT_GUIDE_NAME, [], "top", true]);
  assert.match(cleaned[2].id, /^[A-Za-z0-9_-]{1,64}$/, "an id that could escape a folder is replaced");
  assert.equal(cleaned[2].name.length, 200);
  assert.equal(cleaned[3].stepLayouts, undefined);
});

test("a project is saved and opened with its guides, a topic that was removed leaves its guides, and an older project has none", () => {
  const { project, ids } = book();
  assert.equal(CURRENT_VERSION, 12);
  assert.deepEqual(createProject("x").guides, []);
  const guide = newGuide("Saving", [ids.save, ids.close]);
  setStepLayout(guide, "s2", "left");
  guide.zoomFocus = false;
  project.guides.push(guide);
  const back = fromFiles(toFiles(project));
  assert.deepEqual(back.guides, project.guides, "the guide comes back as it was");
  assert.equal(JSON.parse(toFiles(project)["project.json"]).version, 12);
  removeNode(project.tree, ids.close);
  const after = fromFiles(toFiles(project));
  assert.deepEqual(after.guides[0].tasks, [ids.save], "a task whose topic was removed is not kept");
  // an older project
  const old = migrate({ version: 10, name: "Old", template: "empty", variables: {}, highlight: {}, zoom: {}, styles: [], checks: { ignored: [] }, tree: [] });
  assert.equal(old.version, 12);
  assert.deepEqual(old.guides, []);
  const odd = migrate({ version: 11, name: "Odd", template: "empty", variables: {}, guides: [{ id: "q", name: "Q", tasks: ["nope"] }, 3], tree: [] });
  assert.deepEqual(odd.guides.map((g) => [g.id, g.tasks]), [["q", []]]);
});
