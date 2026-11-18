import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { addNode, addPicture, createProject, ensurePage, type Picture } from "../src/project/model.ts";
import { addBlock, makeBlock, type Step } from "../src/project/page.ts";
import { newGuide } from "../src/project/guides.ts";
import type { Run } from "../src/project/text.ts";
import { STUDIO_MOST_STEPS, checkStudioOptions, looksLikePath, programId, studioFileName, studioScript, type StudioOptions } from "../src/export/studio-script.ts";

const size = { width: 1000, height: 500 };
const picture = (id: string, click: Picture["click"]): Picture => ({ id, file: `images/${id}.png`, ...size, altText: id, source: { kind: "click", capturedAt: "t", originalName: id }, ...(click ? { click } : {}) });
const step = (id: string, words: string | Run[], pictureId?: string, result?: string): Step => ({ id, text: typeof words === "string" ? [{ text: words }] : words, ...(pictureId ? { pictureId } : {}), ...(result ? { result: [{ text: result }] } : {}) });
const options: StudioOptions = { programName: "Practice Planner", programVersion: "1.0", demoProject: "demo-lessons-01", goal: "Save a lesson." };

function book() {
  const project = createProject("Studio test");
  project.variables.PRODUCT = "Practice Planner";
  const chapter = addNode(project.tree, null, "Lessons");
  const save = addNode(project.tree, chapter.id, "Save a lesson");
  const close = addNode(project.tree, chapter.id, "Close a lesson");
  addPicture(project.tree, save.id, picture("a", { x: 250, y: 100, button: "left", target: { role: "button", name: "Save" } }));
  addPicture(project.tree, save.id, picture("b", { x: 500, y: 250, button: "left", target: { role: "list item" } }));
  addPicture(project.tree, save.id, picture("c", { x: 100, y: 50, button: "right", double: false, target: { role: "menu item", name: "Open" } }));
  addPicture(project.tree, save.id, picture("d", undefined));
  const p = makeBlock("procedure");
  (p as { steps: Step[] }).steps = [
    step("s1", [{ text: "Click " }, { text: "Save", mark: "bold" }, { text: " in {{PRODUCT}}." }], "a", "The lesson is saved."),
    step("s2", "Choose the lesson in the list.", "b"),
    step("s3", "Right-click and choose [[Open]].", "c"),
    step("s4", "Check the title.", "d"),
    step("s5", "   "),
  ];
  addBlock(ensurePage(save), p);
  const q = makeBlock("procedure");
  (q as { steps: Step[] }).steps = [step("s6", "Press Close.")];
  addBlock(ensurePage(close), q);
  return { project, save, close };
}

test("every step of a guide's tasks becomes a step of the script, in order, with a chapter for each task", () => {
  const { project, save, close } = book();
  const done = studioScript(project, newGuide("Lessons guide", [save.id, close.id]), options);
  assert.ok(done.ok);
  if (!done.ok) return;
  const s = done.script;
  assert.deepEqual([s.format, s.version, s.title, s.goal, s.driver], ["openstage-studio-script", 3, "Lessons guide", "Save a lesson.", "accessibility"]);
  assert.deepEqual(s.program, { id: "practice-planner", name: "Practice Planner", version: "1.0" });
  assert.deepEqual(s.startState.demoProject, "demo-lessons-01");
  assert.equal(s.steps.length, 6);
  assert.deepEqual(s.steps.map((x) => x.chapter), ["Save a lesson", undefined, undefined, undefined, undefined, "Close a lesson"]);
  assert.deepEqual(s.steps[0], { action: "click", fallback: { role: "button", name: "Save" }, narration: "Click Save in Practice Planner.", expect: "The lesson is saved.", chapter: "Save a lesson" });
});

test("a click is found by its kind and name in Studio's words, and an item with no kept name is only spoken and counted", () => {
  const { project, save } = book();
  const done = studioScript(project, newGuide("G", [save.id]), options);
  if (!done.ok) return assert.fail(done.message);
  const [named, byPlace, menu] = done.script.steps;
  assert.deepEqual(named.fallback, { role: "button", name: "Save" });
  assert.deepEqual(byPlace, { action: "wait", value: "1", narration: "Choose the lesson in the list." });
  assert.deepEqual(menu.fallback, { role: "menuitem", name: "Open" });
  assert.ok(done.notes.some((n) => /1 click is on an item whose name is not kept.*only spoken/.test(n)));
});

test("a step with no click is only spoken, a step with no words is silent, and right-clicks are said to be sent as clicks", () => {
  const { project, save } = book();
  const done = studioScript(project, newGuide("G", [save.id]), options);
  if (!done.ok) return assert.fail(done.message);
  assert.deepEqual(done.script.steps[3], { action: "wait", value: "1", narration: "Check the title." });
  assert.deepEqual(done.script.steps[4], { action: "wait", value: "1", silent: true });
  assert.ok(done.notes.some((n) => /2 steps have no click.*only spoken/.test(n)));
  assert.ok(done.notes.some((n) => /1 step was a double-click or a right-click/.test(n)));
});

test("what the script cannot say is asked for, never made up", () => {
  const { project, save } = book();
  const guide = newGuide("G", [save.id]);
  for (const [change, expected] of [
    [{ programName: " " }, /name of the program/],
    [{ goal: "" }, /Type the goal/],
    [{ demoProject: "" }, /name of the demo project/],
    [{ demoProject: "C:\\Users\\a\\demo" }, /looks like a file path/],
    [{ demoProject: "../demo" }, /looks like a file path/],
  ] as const) {
    const done = studioScript(project, guide, { ...options, ...change });
    assert.equal(done.ok, false);
    if (!done.ok) assert.match(done.message, expected);
  }
  assert.equal(checkStudioOptions(options), null);
});

test("a guide with no steps, too many steps or a too long name is refused in words", () => {
  const { project, save } = book();
  assert.match((studioScript(project, newGuide("Empty", []), options) as { message: string }).message, /no steps/);
  assert.match((studioScript(project, newGuide("x".repeat(101), [save.id]), options) as { message: string }).message, /longer than 100 characters/);
  const big = createProject("Big");
  const topic = addNode(big.tree, null, "Many");
  const p = makeBlock("procedure");
  (p as { steps: Step[] }).steps = Array.from({ length: STUDIO_MOST_STEPS + 1 }, (_, i) => step(`s${i}`, `Do ${i}.`));
  addBlock(ensurePage(topic), p);
  assert.match((studioScript(big, newGuide("Big", [topic.id]), options) as { message: string }).message, /at most 200/);
});

test("the program's id, a path check and the file name are kept to what Studio accepts", () => {
  assert.equal(programId("Practice Planner"), "practice-planner");
  assert.equal(programId("  OpenStage: Author (2026)! "), "openstage-author-2026");
  assert.equal(programId("???"), "program");
  assert.equal(programId("A".repeat(100)).length <= 63, true);
  assert.equal(looksLikePath("demo-lessons-01"), false);
  assert.equal(looksLikePath("a/b"), true);
  assert.equal(studioFileName('Save: "a" lesson?'), "Save a lesson.studio-script.json");
  assert.equal(studioFileName("???"), "guide.studio-script.json");
});

test("the script text is plain JSON that reads back as the script", () => {
  const { project, save } = book();
  const done = studioScript(project, newGuide("G", [save.id]), options);
  if (!done.ok) return assert.fail(done.message);
  assert.deepEqual(JSON.parse(done.text), done.script);
  assert.ok(done.text.endsWith("\n"));
});

// Studio's own validator is the judge of the format. It lives in another repository, so this runs only where that repository is beside this one.
const STUDIO = "C:/Dev/OpenStage_Studio/src/script/validate.ts";
test("Studio's own validator accepts the script, with no errors", { skip: !existsSync(STUDIO) && "OpenStage Studio is not beside this repository" }, async () => {
  const { validateScript } = (await import(`file:///${STUDIO}`)) as { validateScript: (script: unknown) => { ok: boolean; errors: { path: string; message: string }[] } };
  const { project, save, close } = book();
  const done = studioScript(project, newGuide("Lessons guide", [save.id, close.id]), options);
  if (!done.ok) return assert.fail(done.message);
  const checked = validateScript(done.script);
  assert.deepEqual(checked.errors, []);
  assert.equal(checked.ok, true);
});
