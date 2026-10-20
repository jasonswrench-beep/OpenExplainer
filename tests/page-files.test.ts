import test from "node:test";
import assert from "node:assert/strict";
import { addNode, addPicture, createProject, CURRENT_VERSION, ensurePage, type Picture, type Project } from "../src/project/model.ts";
import { addBlock, makeBlock, makeStep, type ProcedureBlock } from "../src/project/page.ts";
import { fromFiles, toFiles, topicFile } from "../src/project/files.ts";
import { packProject, unpackProject } from "../src/project/package.ts";
import { migrate } from "../src/project/migrate.ts";
import { parseMarks } from "../src/project/text.ts";

const picture = (id: string): Picture => ({ id, file: `images/${id}.png`, width: 10, height: 10, altText: "A picture", source: { kind: "import", capturedAt: "t" } });

function bookWithPages(): { project: Project; chapterId: string; topicId: string; emptyId: string } {
  const project = createProject("Book");
  const chapter = addNode(project.tree, null, "Chapter");
  const topic = addNode(project.tree, chapter.id, "Topic");
  const empty = addNode(project.tree, chapter.id, "Nothing here");
  addPicture(project.tree, topic.id, picture("p1"));
  const chapterPage = ensurePage(chapter);
  const heading = makeBlock("heading");
  if (heading.type === "heading") heading.text = "Overview";
  addBlock(chapterPage, heading);
  const page = ensurePage(topic);
  const paragraph = makeBlock("paragraph");
  if (paragraph.type === "paragraph") paragraph.text = parseMarks("Press **Save** or [[File > Open]].");
  addBlock(page, paragraph);
  addBlock(page, makeBlock("picture", { pictureId: "p1" }));
  const procedure = makeBlock("procedure") as ProcedureBlock;
  procedure.steps = [{ ...makeStep(), text: parseMarks("Open the *File* menu."), pictureId: "p1", result: parseMarks("The menu opens.") }, { ...makeStep(), text: parseMarks("Choose [[Save]].") }];
  addBlock(page, procedure);
  const callout = makeBlock("callout", { kind: "caution" });
  if (callout.type === "callout") callout.text = parseMarks("Save first.");
  addBlock(page, callout);
  ensurePage(empty); // an empty page
  return { project, chapterId: chapter.id, topicId: topic.id, emptyId: empty.id };
}

test("each page with something on it is saved in its own file, and the structure file holds no page text", () => {
  const { project, chapterId, topicId, emptyId } = bookWithPages();
  const files = toFiles(project);
  assert.deepEqual(Object.keys(files).sort(), ["project.json", "structure.json", topicFile(chapterId), topicFile(topicId)].sort());
  assert.ok(!(emptyId in files) && !Object.keys(files).includes(topicFile(emptyId)), "an empty page is not saved");
  assert.ok(!files["structure.json"].includes('"page"') && !files["structure.json"].includes("Press "), "structure.json stays small");
  const topic = JSON.parse(files[topicFile(topicId)]);
  assert.equal(topic.version, CURRENT_VERSION);
  assert.deepEqual(topic.blocks.map((b: { type: string }) => b.type), ["paragraph", "picture", "procedure", "callout"]);
  assert.deepEqual(topic.blocks[0].text[1], { text: "Save", mark: "bold" });
});

test("the project comes back with every page exactly as it was, and the empty page is simply none", () => {
  const { project, topicId, emptyId } = bookWithPages();
  const back = fromFiles(toFiles(project));
  const find = (tree: Project["tree"], id: string): Project["tree"][number] | undefined => tree.flatMap((n) => [n, ...n.children]).find((n) => n.id === id);
  assert.deepEqual(find(back.tree, topicId)?.page, find(project.tree, topicId)?.page);
  assert.equal(find(back.tree, emptyId)?.page, undefined);
  assert.equal(back.version, CURRENT_VERSION);
});

test("pages are saved inside the project file and come back, and a removed topic leaves no page behind", async () => {
  const { project, topicId } = bookWithPages();
  const assets = new Map([["images/p1.png", new Uint8Array([1, 2, 3])]]);
  const back = await unpackProject(packProject(project, assets));
  assert.deepEqual(back.project.tree[0].children[0].page, project.tree[0].children[0].page);
  assert.deepEqual(back.missing, []);
  // the topic is deleted: its page file is not written any more
  project.tree[0].children = project.tree[0].children.filter((n) => n.id !== topicId);
  assert.ok(!(topicFile(topicId) in toFiles(project)));
});

test("a page that points at a picture the topic no longer has loses that picture, not the page", () => {
  const { project, topicId } = bookWithPages();
  const files = toFiles(project);
  const structure = JSON.parse(files["structure.json"]);
  structure.tree[0].children[0].pictures = []; // the picture is gone from the topic
  files["structure.json"] = JSON.stringify(structure);
  const back = fromFiles(files);
  const topic = back.tree[0].children.find((n) => n.id === topicId)!;
  assert.deepEqual(topic.page!.blocks.map((b) => b.type), ["paragraph", "procedure", "callout"], "the picture block goes");
  assert.equal((topic.page!.blocks[1] as ProcedureBlock).steps[0].pictureId, undefined);
});

test("a page file from a different save is refused, and so is a damaged one, in plain words", () => {
  const { project, topicId } = bookWithPages();
  const files = toFiles(project);
  const mismatched = { ...files, [topicFile(topicId)]: files[topicFile(topicId)].replace(`"version": ${CURRENT_VERSION}`, `"version": ${CURRENT_VERSION - 1}`) };
  assert.throws(() => fromFiles(mismatched), /do not match each other/);
  const damaged = { ...files, [topicFile(topicId)]: "{ not json" };
  assert.throws(() => fromFiles(damaged), /The page of the topic "Topic" is damaged, so the project was not opened\. Nothing was changed\./);
});

test("a page file for a topic that is not in the project is ignored", () => {
  const { project } = bookWithPages();
  const files = { ...toFiles(project), [topicFile("someoneelse")]: JSON.stringify({ version: CURRENT_VERSION, blocks: [{ id: "a", type: "heading", text: "x" }] }) };
  assert.doesNotThrow(() => fromFiles(files));
});

test("a topic whose id is not a safe file name has its page left out rather than written somewhere odd", () => {
  const project = createProject("Book");
  const topic = addNode(project.tree, null, "Odd");
  topic.id = "../evil";
  addBlock(ensurePage(topic), makeBlock("paragraph"));
  const files = toFiles(project);
  assert.deepEqual(Object.keys(files).sort(), ["project.json", "structure.json"]);
});

test("a version 4 project opens in the current format with no pages", () => {
  const v4 = { version: 4, name: "Old", template: "empty", variables: {}, highlight: undefined, tree: [{ id: "a", title: "A", status: "captured", pictures: [], children: [] }] };
  const up = migrate(JSON.parse(JSON.stringify(v4)));
  assert.equal(up.version, CURRENT_VERSION);
  assert.equal(up.tree[0].page, undefined);
  const files = { "project.json": JSON.stringify({ version: 4, name: "Old", template: "empty", variables: {} }), "structure.json": JSON.stringify({ version: 4, tree: v4.tree }) };
  assert.equal(fromFiles(files).tree[0].title, "A");
});
