// The assistant tools that change the book's settings, its guides and a picture's view: set_book_settings, update_guide, delete_guide and set_picture_view.
// Before these, an assistant had to have the saved file edited by hand to set the zoom for print, the click circle, the writing style or a guide's layout.
import test from "node:test";
import assert from "node:assert/strict";
import { Session, type McpFiles } from "../src/mcp/session.ts";
import { createTools } from "../src/mcp/tools.ts";
import { addNode, addPicture, createProject, ensurePage, type Picture } from "../src/project/model.ts";
import { makeBlock } from "../src/project/page.ts";

const FOLDER = "C:\\Docs\\OE";

function setup() {
  const store = new Map<string, Uint8Array>();
  const files: McpFiles = {
    read: async (p) => store.get(p.toLowerCase())!, write: async (p, b) => { store.set(p.toLowerCase(), b); }, exists: async (p) => store.has(p.toLowerCase()), list: async () => [], makeFolder: async () => {}, append: async () => {},
  };
  const session = new Session({ enabled: true, folder: FOLDER, allowFullScreen: false }, files);
  const project = createProject("Settings test");
  const chapter = addNode(project.tree, null, "Getting started");
  const saving = addNode(project.tree, chapter.id, "Saving");
  const closing = addNode(project.tree, chapter.id, "Closing");
  for (const node of [saving, closing]) {
    const page = ensurePage(node);
    const procedure = makeBlock("procedure");
    (procedure as { steps: unknown }).steps = [{ id: `s-${node.id}`, text: [{ text: "Click Save." }] }];
    page.blocks.push(procedure);
  }
  const picture = (id: string, extra: Partial<Picture> = {}): Picture => ({ id, file: `images/${id}.png`, width: 1000, height: 1600, altText: "", source: { kind: "import", capturedAt: "t", originalName: `${id}.png` }, ...extra });
  addPicture(project.tree, saving.id, picture("tall"));
  addPicture(project.tree, saving.id, picture("clicked", { width: 1000, height: 600, click: { x: 500, y: 300, button: "left" } }));
  session.project = project;
  session.filePath = `${FOLDER}\\settings.openexplainer`;
  const tools = createTools({ session, exporter: async () => ({ bytes: new Uint8Array([1]), extension: "pdf", notes: [] }) });
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await tools.find((t) => t.name === name)!.handler(args).catch((e: Error) => ({ content: [{ type: "text" as const, text: e.message }], isError: true }));
    return { text: result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n"), isError: result.isError === true };
  };
  return { call, project, session, ids: { chapter: chapter.id, saving: saving.id, closing: closing.id }, store };
}

test("set_book_settings sets the zoom, the automatic zoom, both click circles, the writing style and the words to avoid, and saves", async () => {
  const { call, project, store } = setup();
  const r = await call("set_book_settings", {
    zoom_book_percent: 45, zoom_guide_percent: 35, auto_zoom_for_print: true,
    click_circle_book: { show: true, size_percent: 4, colour: "orange", see_through_percent: 30 },
    click_circle_guide: { colour: "#abc" },
    writing_style: "Speak to the reader as you.\r\nKeep sentences short.  ",
    words_to_avoid: ["utilize => use", "simply", "  "],
  });
  assert.equal(r.isError, false, r.text);
  assert.deepEqual(project.zoom, { book: { size: 45 }, guide: { size: 35 } });
  assert.equal(project.paper.autoZoom, true);
  assert.deepEqual(project.highlight.book, { show: true, size: 4, color: "#FF9800", seeThrough: 30 });
  assert.deepEqual(project.highlight.guide, { show: true, size: 3, color: "#AABBCC", seeThrough: 40 }, "only the colour of the guide's circle changed");
  assert.equal(project.writingStyle, "Speak to the reader as you.\nKeep sentences short.");
  assert.deepEqual(project.avoidWords, [{ avoid: "utilize", use: "use" }, { avoid: "simply", use: "" }]);
  assert.ok(store.has(`${FOLDER}\\settings.openexplainer`.toLowerCase()), "it was saved at once");
  assert.match(r.text, /Set: zoom for the book, zoom for a quick guide, automatic zoom for print, click circle book, click circle guide, writing style, words to avoid\./);
  // clearing
  await call("set_book_settings", { writing_style: "", words_to_avoid: [], auto_zoom_for_print: false });
  assert.equal(project.writingStyle, "");
  assert.deepEqual(project.avoidWords, []);
  assert.equal(project.paper.autoZoom, false);
});

test("a mistake in set_book_settings is explained and changes nothing, even when other settings in the same call were fine", async () => {
  const { call, project } = setup();
  const before = JSON.stringify([project.zoom, project.paper, project.highlight, project.writingStyle, project.avoidWords]);
  for (const [args, words] of [
    [{ zoom_book_percent: 5 }, /zoom_book_percent must be a number from 10 to 100/],
    [{ zoom_guide_percent: "half" }, /zoom_guide_percent must be a number/],
    [{ auto_zoom_for_print: "yes" }, /auto_zoom_for_print must be true or false/],
    [{ click_circle_book: { size_percent: 50 } }, /click_circle_book\.size_percent must be a number from 1 to 20/],
    [{ click_circle_book: { colour: "chartreuse" } }, /click_circle_book\.colour must be six hex digits/],
    [{ click_circle_guide: { see_through_percent: 101 } }, /see_through_percent must be a number from 0 to 100/],
    [{ click_circle_guide: "big" }, /click_circle_guide must be an object/],
    [{ writing_style: "x".repeat(2001) }, /writing_style can be up to 2000 letters; this is 2001/],
    [{ words_to_avoid: "file" }, /words_to_avoid must be a list/],
    [{}, /Nothing to change/],
  ] as [Record<string, unknown>, RegExp][]) {
    const r = await call("set_book_settings", { zoom_book_percent: 60, ...args, ...(Object.keys(args).length === 0 ? { zoom_book_percent: undefined } : {}) });
    assert.ok(r.isError && words.test(r.text), `${JSON.stringify(args)} -> ${r.text}`);
  }
  assert.equal(JSON.stringify([project.zoom, project.paper, project.highlight, project.writingStyle, project.avoidWords]), before, "nothing changed");
});

test("update_guide changes a guide's name, layout, close-ups and tasks, and delete_guide removes it without touching any topic", async () => {
  const { call, project, ids } = setup();
  const made = await call("create_guide", { name: "Quick start", topic_ids: [ids.saving], layout: "left" });
  const id = /Its id is (\w+)/.exec(made.text)![1];
  const changed = await call("update_guide", { guide_id: id, name: "Quick start guide", layout: "top", close_ups: false, topic_ids: [ids.closing, ids.saving] });
  assert.equal(changed.isError, false, changed.text);
  const guide = project.guides[0];
  assert.deepEqual([guide.name, guide.layout, guide.zoomFocus, guide.tasks], ["Quick start guide", "top", false, [ids.closing, ids.saving]]);
  assert.match(changed.text, /\(name, layout, close-ups, tasks\): 2 tasks, 2 steps\./);
  for (const [args, words] of [
    [{ guide_id: "nope", name: "x" }, /There is no guide with the id "nope"/],
    [{ guide_id: id, layout: "diagonal" }, /layout must be top or left/],
    [{ guide_id: id, close_ups: "yes" }, /close_ups must be true or false/],
    [{ guide_id: id, topic_ids: [ids.saving, ids.saving] }, /listed twice/],
    [{ guide_id: id, topic_ids: ["nope"] }, /"nope" is not a topic of the book/],
    [{ guide_id: id }, /Nothing to change/],
  ] as [Record<string, unknown>, RegExp][]) {
    const r = await call("update_guide", args);
    assert.ok(r.isError && words.test(r.text), `${JSON.stringify(args)} -> ${r.text}`);
  }
  assert.deepEqual(guide.tasks, [ids.closing, ids.saving], "a refused change leaves the guide as it was");
  assert.match((await call("delete_guide", { guide_id: id, confirm: false })).text, /confirm must be true/);
  assert.equal(project.guides.length, 1);
  assert.match((await call("delete_guide", { guide_id: "nope", confirm: true })).text, /There is no guide with the id "nope"/);
  assert.match((await call("delete_guide", { guide_id: id, confirm: true })).text, /Deleted the guide "Quick start guide"/);
  assert.equal(project.guides.length, 0);
  assert.equal(project.tree[0].children.length, 2, "no topic was deleted with it");
});

test("set_picture_view crops a tall picture to a region, zooms on a click, and puts the whole picture back", async () => {
  const { call, project, ids } = setup();
  const tall = () => project.tree[0].children[0].pictures.find((p) => p.id === "tall")!;
  const region = await call("set_picture_view", { topic_id: ids.saving, picture_id: "tall", view: "region", left: 0, top: 100, width: 1000, height: 500 });
  assert.equal(region.isError, false, region.text);
  assert.deepEqual(tall().view, { kind: "crop", x: 0, y: 100, width: 1000, height: 500 });
  assert.match(region.text, /cropped to 1000 by 500 pixels, starting 0 across and 100 down/);
  assert.match(region.text, /The picture is 1000 by 1600 pixels/);
  for (const [args, words] of [
    [{ view: "region", left: 0, top: 0, width: 1001, height: 10 }, /width must be a number from 1 to 1000/],
    [{ view: "region", left: 0, top: 1600, width: 10, height: 10 }, /top must be a number from 0 to 1599/],
    [{ view: "region", left: 0, top: 0 }, /width must be a number/],
    [{ view: "zoom" }, /no click to zoom in on/],
    [{ view: "sideways" }, /view must be whole, region or zoom/],
  ] as [Record<string, unknown>, RegExp][]) {
    const r = await call("set_picture_view", { topic_id: ids.saving, picture_id: "tall", ...args });
    assert.ok(r.isError && words.test(r.text), `${JSON.stringify(args)} -> ${r.text}`);
  }
  assert.deepEqual(tall().view, { kind: "crop", x: 0, y: 100, width: 1000, height: 500 }, "a refused view changes nothing");
  const zoom = await call("set_picture_view", { topic_id: ids.saving, picture_id: "clicked", view: "zoom" });
  assert.equal(zoom.isError, false, zoom.text);
  assert.deepEqual(project.tree[0].children[0].pictures.find((p) => p.id === "clicked")!.view, { kind: "zoom" });
  assert.equal((await call("set_picture_view", { topic_id: ids.saving, picture_id: "tall", view: "whole" })).isError, false);
  assert.equal(tall().view, undefined, "the whole picture is shown again");
  assert.match((await call("set_picture_view", { topic_id: ids.saving, picture_id: "nope", view: "whole" })).text, /has no picture with the id "nope"/);
});
