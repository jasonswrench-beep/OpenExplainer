import test from "node:test";
import assert from "node:assert/strict";
import {
  checkProject, CHECK_KINDS, cleanChecks, emptyCheckSettings, ignoreIssue, ignoreKind, kindInfo, splitIssues, summaryWords, unignore, type Issue,
} from "../src/project/checks.ts";
import { addNode, addPicture, createProject, CURRENT_VERSION, ensurePage, type Picture, type Project } from "../src/project/model.ts";
import { addBlock, makeBlock } from "../src/project/page.ts";
import { newShape, type ArrowShape, type MarkerShape, type TextShape } from "../src/project/shapes.ts";
import { fromFiles, toFiles } from "../src/project/files.ts";
import { migrate } from "../src/project/migrate.ts";

const size = { width: 1920, height: 1080 };
const picture = (id: string, extra: Partial<Picture> = {}): Picture => ({ id, file: `images/${id}.png`, ...size, altText: "", source: { kind: "import", capturedAt: "t", originalName: `${id}.png` }, ...extra });

/** A project with something wrong of nearly every kind. */
function messy(): { project: Project; ids: Record<string, string> } {
  const project = createProject("My Book");
  project.variables = { PRODUCT: "", VERSION: "2.0", COMPANY: "" };
  const chapter = addNode(project.tree, null, "Getting started");
  const saving = addNode(project.tree, chapter.id, "Saving");
  const empty = addNode(project.tree, chapter.id, "Nothing here");
  const arrow = { ...(newShape("arrow", size) as ArrowShape), alt: "" };
  const text = { ...(newShape("text", size) as TextShape), text: "Note", fill: "#E57373", textColor: "#FFFFFF", alt: "A note" };
  const marker = { ...(newShape("marker", size) as MarkerShape), keptLowContrast: true as const };
  addPicture(project.tree, saving.id, picture("p1", {
    callouts: [
      { id: "c1", name: "Save", description: "", target: { x: 1, y: 1, width: 10, height: 10 }, marker: { x: 5, y: 5 } },
      { id: "c2", name: "", description: "Opens it.", target: { x: 1, y: 1, width: 10, height: 10 }, marker: { x: 5, y: 5 } },
    ],
    shapes: [arrow, text, marker],
  }));
  addPicture(project.tree, saving.id, picture("p2", { altText: "Never placed" }));
  addPicture(project.tree, saving.id, picture("p3", { altText: "A step picture", view: { kind: "crop", x: 0, y: 0, width: 600, height: 400 } }));
  const page = ensurePage(saving);
  const heading = makeBlock("heading");
  const para = makeBlock("paragraph"); (para as { text: unknown }).text = [{ text: "Press Save in {{PRODUCT}} {{MISSING}}." }];
  const pic = makeBlock("picture", { pictureId: "p1" });
  const proc = makeBlock("procedure"); (proc as { steps: unknown }).steps = [{ id: "s1", text: [{ text: "Click Save." }], pictureId: "p3" }, { id: "s2", text: [] }];
  const box = makeBlock("callout", { kind: "caution" });
  [heading, para, pic, proc, box].forEach((b) => addBlock(page, b));
  const intro = ensurePage(chapter);
  const introPara = makeBlock("paragraph"); (introPara as { text: unknown }).text = [{ text: "Welcome." }];
  addBlock(intro, introPara);
  return { project, ids: { chapter: chapter.id, saving: saving.id, empty: empty.id, heading: heading.id, pic: pic.id, proc: proc.id, box: box.id } };
}

const ofKind = (issues: Issue[], kind: string) => issues.filter((i) => i.kind === kind);

test("every kind of check is listed once, with where it belongs, how serious it is, and a title", () => {
  const ids = CHECK_KINDS.map((k) => k.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(CHECK_KINDS.every((k) => k.title.length > 10 && (k.group === "accessibility" || k.group === "book") && (k.severity === "problem" || k.severity === "note")));
  assert.equal(kindInfo("picture-unplaced").severity, "note");
  assert.equal(kindInfo("picture-alt").group, "accessibility");
});

test("a project with nothing wrong has nothing listed", () => {
  const project = createProject("Clean");
  const topic = addNode(project.tree, null, "Topic");
  const page = ensurePage(topic);
  const para = makeBlock("paragraph"); (para as { text: unknown }).text = [{ text: "Words." }];
  addBlock(page, para);
  assert.deepEqual(checkProject(project), []);
  assert.deepEqual(checkProject(createProject("Empty book")), [], "a book with no topics has nothing to check");
});

test("pictures that are on a page and have no description are listed, and ones that are not on a page are only a note", () => {
  const { project } = messy();
  const issues = checkProject(project, { hasFile: (f) => f !== "images/p2.png" });
  const alt = ofKind(issues, "picture-alt");
  assert.deepEqual(alt.map((i) => i.key), ["picture-alt:p1"], "p3 has a description; p2 is not placed so it is not asked for one");
  assert.match(alt[0].words, /^The picture "p1\.png" in "1\.1 Saving" has no description, so a screen reader has little to say about it\.$/);
  assert.match(alt[0].fix, /Edit description/);
  const unplaced = ofKind(issues, "picture-unplaced");
  assert.deepEqual(unplaced.map((i) => i.pictureId), ["p2"]);
  assert.match(unplaced[0].words, /"Never placed" is in "1\.1 Saving" but is not on its page, so it will not be in the book\./);
});

test("a picture whose file is missing is listed, and without a way to tell, that check is skipped", () => {
  const { project } = messy();
  const missing = ofKind(checkProject(project, { hasFile: (f) => f !== "images/p2.png" }), "missing-file");
  assert.deepEqual(missing.map((i) => i.pictureId), ["p2"]);
  assert.match(missing[0].words, /The file of the picture "Never placed" in "1\.1 Saving" is missing from the project\./);
  assert.equal(ofKind(checkProject(project), "missing-file").length, 0);
});

test("callouts with no name or no sentence, and marks with no alternative text or colours that are too close, are listed for placed pictures", () => {
  const { project } = messy();
  const issues = checkProject(project);
  assert.deepEqual(ofKind(issues, "callout-description").map((i) => i.key), ["callout-description:p1:c1"]);
  assert.match(ofKind(issues, "callout-description")[0].words, /^The callout A \("Save"\) on the picture "p1\.png" in "1\.1 Saving" has no sentence about it\.$/);
  assert.deepEqual(ofKind(issues, "callout-name").map((i) => i.key), ["callout-name:p1:c2"]);
  assert.match(ofKind(issues, "callout-name")[0].words, /^The callout B on the picture/);
  assert.equal(ofKind(issues, "mark-alt").length, 1, "the arrow; a text box and a marker do not need it");
  assert.match(ofKind(issues, "mark-alt")[0].words, /^Arrow on the picture "p1\.png" in "1\.1 Saving" has no alternative text/);
  const contrast = ofKind(issues, "mark-contrast");
  assert.equal(contrast.length, 2, "the text box with colours too close, and the marker whose colours were kept");
  assert.ok(contrast.some((i) => /^Text box on the picture .*Text on its fill: \d\.\d to 1, which is below the 4\.5 to 1 minimum/.test(i.words)));
  assert.ok(contrast.some((i) => /^Numbered marker on the picture .*kept although they are close to the picture behind it\. \(Kept on purpose\.\)$/.test(i.words)));
});

test("empty topics, empty blocks and empty steps are listed, and a chapter that only holds topics is fine", () => {
  const { project, ids } = messy();
  const issues = checkProject(project);
  assert.deepEqual(ofKind(issues, "empty-topic").map((i) => i.nodeId), [ids.empty]);
  assert.match(ofKind(issues, "empty-topic")[0].words, /^"1\.2 Nothing here" has nothing on its page\.$/);
  const blocks = ofKind(issues, "empty-block");
  assert.ok(blocks.some((i) => i.blockId === ids.heading && /^Block 1 \(heading\) of "1\.1 Saving" is empty\.$/.test(i.words)));
  assert.ok(blocks.some((i) => i.blockId === ids.box && /^Block 5 \(callout box, Caution\) of "1\.1 Saving" is empty\.$/.test(i.words)));
  assert.ok(blocks.some((i) => i.blockId === ids.proc && /^Step 2 of the procedure in block 4 of "1\.1 Saving" has no text\.$/.test(i.words)));
  const noPage = createProject("Chapters");
  const chapter = addNode(noPage.tree, null, "Chapter");
  addNode(noPage.tree, chapter.id, "Topic");
  assert.deepEqual(checkProject(noPage).map((i) => i.nodeId).filter((id) => id === chapter.id), [], "a chapter with topics under it and no page of its own is fine");
});

test("a variable used with no value or no definition is a problem, and one with a value that nothing uses is a note", () => {
  const { project } = messy();
  const issues = checkProject(project);
  assert.deepEqual(ofKind(issues, "variable-empty").map((i) => i.key), ["variable-empty:MISSING", "variable-empty:PRODUCT"]);
  assert.match(ofKind(issues, "variable-empty")[0].words, /^The variable \{\{MISSING\}\} is used in the book but has no value, so it would appear as \{\{MISSING\}\}\.$/);
  assert.deepEqual(ofKind(issues, "variable-unused").map((i) => i.key), ["variable-unused:VERSION"]);
  project.variables.PRODUCT = "Acme";
  project.variables.MISSING = "x";
  assert.equal(ofKind(checkProject(project), "variable-empty").length, 0);
});

test("a picture that would print too small is a note, and a crop or zoom takes it away", () => {
  const { project } = messy();
  const small = ofKind(checkProject(project), "print-small");
  assert.deepEqual(small.map((i) => i.pictureId), ["p1"], "p3 is cropped to 600 wide, so it prints at full size");
  assert.match(small[0].words, /will print at about 33 percent of its size on screen/);
  project.tree[0].children[0].pictures[0].view = { kind: "crop", x: 0, y: 0, width: 800, height: 450 };
  assert.deepEqual(ofKind(checkProject(project), "print-small"), []);
});

test("the list comes in reading order, topic by topic", () => {
  const { project } = messy();
  const issues = checkProject(project);
  const topics = issues.filter((i) => i.nodeId).map((i) => i.where);
  const firstSaving = topics.indexOf("1.1 Saving"), firstEmpty = topics.indexOf("1.2 Nothing here");
  assert.ok(firstSaving >= 0 && firstEmpty > firstSaving && topics.lastIndexOf("1.1 Saving") < firstEmpty);
  assert.ok(issues.slice(-3).every((i) => i.nodeId === null), "the variables come last");
});

test("the author can ignore one thing, all of a kind, and stop ignoring, and what is ignored is kept apart", () => {
  const { project } = messy();
  const issues = checkProject(project);
  let settings = emptyCheckSettings();
  assert.equal(splitIssues(issues, settings).active.length, issues.length);
  settings = ignoreIssue(settings, "picture-alt:p1");
  settings = ignoreIssue(settings, "picture-alt:p1");
  assert.deepEqual(settings.ignored, ["picture-alt:p1"], "twice is once");
  let split = splitIssues(issues, settings);
  assert.equal(split.ignored.length, 1);
  assert.ok(!split.active.some((i) => i.key === "picture-alt:p1"));
  settings = ignoreKind(settings, issues, "mark-contrast");
  assert.equal(settings.ignored.length, 3);
  split = splitIssues(issues, settings);
  assert.equal(split.ignored.length, 3);
  assert.equal(ofKind(split.active, "mark-contrast").length, 0);
  settings = unignore(settings, "picture-alt:p1");
  assert.ok(!settings.ignored.includes("picture-alt:p1"));
  // a new thing of an ignored kind found later still shows: only the keys on the list then were ignored
  const another = { ...issues.find((i) => i.kind === "mark-contrast")!, key: "mark-contrast:p9:new" };
  assert.ok(splitIssues([another], settings).active.length === 1);
});

test("the top of the list says in words how many things are to fix, how many are notes, and how many are ignored", () => {
  const { project } = messy();
  const { active, ignored } = splitIssues(checkProject(project), emptyCheckSettings());
  const problems = active.filter((i) => kindInfo(i.kind).severity === "problem").length;
  assert.equal(summaryWords(active, ignored), `${problems} things to fix and ${active.length - problems} notes.`);
  assert.equal(summaryWords([], []), "Nothing to fix.");
  assert.equal(summaryWords([], [active[0]]), "Nothing to fix. 1 thing is ignored.");
  assert.equal(summaryWords([active[0]], [active[1], active[2]]), "1 thing to fix. 2 things are ignored.");
  const note = active.find((i) => kindInfo(i.kind).severity === "note")!;
  assert.equal(summaryWords([note], []), "1 note.");
});

test("what the author ignored is saved with the project and cleaned when it is read", () => {
  assert.deepEqual(cleanChecks(undefined), { ignored: [] });
  assert.deepEqual(cleanChecks({ ignored: ["a", "a", 5, "", null, "b"] }), { ignored: ["a", "b"] });
  assert.deepEqual(cleanChecks({ ignored: "no" }), { ignored: [] });
  const p = createProject("Book");
  p.checks = { ignored: ["picture-alt:p1", "empty-topic:t1"] };
  addNode(p.tree, null, "Topic");
  const files = toFiles(p);
  assert.deepEqual(JSON.parse(files["project.json"]).checks, p.checks);
  assert.deepEqual(fromFiles(files).checks, p.checks);
  assert.ok(CURRENT_VERSION >= 10);
  const old = migrate({ version: 9, name: "Old", template: "empty", variables: {}, tree: [] });
  assert.equal(old.version, CURRENT_VERSION);
  assert.deepEqual(old.checks, { ignored: [] });
  const bad = migrate({ version: 10, name: "Bad", template: "empty", variables: {}, checks: { ignored: ["x", 3] }, tree: [] });
  assert.deepEqual(bad.checks, { ignored: ["x"] });
});
