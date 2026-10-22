import test from "node:test";
import assert from "node:assert/strict";
import { addNode, createProject, type Picture, type Project } from "../src/project/model.ts";
import { findCallout, type SentenceDraft } from "../src/project/drafts.ts";
import { buildMessages, checkSentence, cluesFor, draftCallouts, isRealName, reportWords, type Clues } from "../src/ai/drafting.ts";
import { AiError } from "../src/ai/types.ts";
import type { Answer, AskOptions, ChatMessage } from "../src/ai/types.ts";

function clickPicture(): Picture {
  return {
    id: "p1",
    file: "images/p1.png",
    width: 800,
    height: 600,
    altText: "The Save as window",
    source: { kind: "click", capturedAt: "2026-10-21T10:00:00.000Z" },
    click: { x: 60, y: 30, button: "left", target: { name: "Save", role: "button", acceleratorKey: "Ctrl+S", accessKey: "Alt+S", description: "Saves the active document.", bounds: { x: 20, y: 10, width: 80, height: 40 } } },
    callouts: [
      { id: "c-save", name: "Save", description: "", target: { x: 20, y: 10, width: 80, height: 40 }, marker: { x: 5, y: 5 } },
      { id: "c-close", name: "Close", description: "Closes the window.", target: { x: 200, y: 10, width: 80, height: 40 }, marker: { x: 190, y: 5 } },
      { id: "c-blank", name: "", description: "", target: { x: 300, y: 10, width: 80, height: 40 }, marker: { x: 290, y: 5 } },
      { id: "c-place", name: "Button1", description: "", target: { x: 400, y: 10, width: 80, height: 40 }, marker: { x: 390, y: 5 } },
    ],
  };
}

function book(): { project: Project; topicId: string } {
  const project = createProject("Drafting");
  const chapter = addNode(project.tree, null, "Getting started");
  const topic = addNode(project.tree, chapter.id, "Saving your work");
  topic.pictures.push(clickPicture(), {
    id: "p2", file: "images/p2.png", width: 800, height: 600, altText: "", source: { kind: "import", capturedAt: "2026-10-21T10:00:00.000Z" },
    callouts: [{ id: "c-open", name: "Open", description: "", target: { x: 20, y: 10, width: 80, height: 40 }, marker: { x: 5, y: 5 } }],
  });
  return { project, topicId: topic.id };
}

const place = (project: Project, pictureId: string, calloutId: string) => findCallout(project.tree, pictureId, calloutId)!;

test("a name is real unless it is empty, a number, only punctuation or a placeholder", () => {
  for (const good of ["Save", "OK", "Font size", "File menu", "Page setup", "Ctrl+S shortcut"]) assert.ok(isRealName(good), good);
  for (const bad of ["", " ", "A", "12", "...", "Button1", "button", "Pane", "pane 3", "Unknown", "Window", "Edit2", "Group", "Title bar", "Custom"]) assert.ok(!isRealName(bad), bad);
});

test("the clues for the callout made from the click are rich, and say where in the book it is", () => {
  const { project } = book();
  const clues = cluesFor(project, place(project, "p1", "c-save"));
  assert.equal(clues.draftable, true);
  assert.deepEqual(clues.lines, [
    "Topic: Saving your work (chapter: Getting started)",
    'Item: button named "Save"',
    "Keyboard shortcut: Ctrl+S",
    "Access key: Alt+S",
    'Windows describes it as: "Saves the active document."',
    'Other items on the same picture: "Close"',
    'Sentences already written for this picture: "Close": "Closes the window."',
  ]);
  assert.deepEqual(clues.names.sort(), ["Close", "Save"]);
});

test("a callout the author drew, or on a picture with no click, gets only its name and the picture's other names, and what Windows said about the click is not given to the wrong callout", () => {
  const { project } = book();
  const open = cluesFor(project, place(project, "p2", "c-open"));
  assert.equal(open.draftable, true);
  assert.deepEqual(open.lines, ["Topic: Saving your work (chapter: Getting started)", 'Item: named "Open"', "Other items on the same picture: none"]);
  // On the click picture, "Close" is not the clicked item, so none of the click's details are in its clues.
  project.tree[0].children[0].pictures[0].callouts![1].description = "";
  const close = cluesFor(project, place(project, "p1", "c-close"));
  assert.ok(!close.lines.some((l) => /Ctrl\+S|Windows describes|Access key/.test(l)), close.lines.join(" | "));
});

test("thin clues mean no draft, with the reason in words: no name and no description, or a name that is only a placeholder", () => {
  const { project } = book();
  const blank = cluesFor(project, place(project, "p1", "c-blank"));
  assert.equal(blank.draftable, false);
  assert.equal(blank.whyNot, "has no name, and Windows gave no description of it");
  const placeholder = cluesFor(project, place(project, "p1", "c-place"));
  assert.equal(placeholder.draftable, false);
  assert.match(placeholder.whyNot!, /has the name "Button1", which does not say what it is/);
  assert.deepEqual(blank.lines, [], "and nothing is sent");
  // A click item with no name but a real description from Windows can be drafted from the description.
  const p = project.tree[0].children[0].pictures[0];
  p.callouts![0].name = "";
  p.click!.target = { role: "button", description: "Saves the active document.", bounds: { x: 20, y: 10, width: 80, height: 40 } };
  const described = cluesFor(project, place(project, "p1", "c-save"));
  assert.equal(described.draftable, true);
  assert.ok(described.lines.includes("Item: button with no name") && described.lines.includes('Windows describes it as: "Saves the active document."'));
  // A description of fewer than three words is not enough.
  p.click!.target = { role: "button", description: "Saves it", bounds: { x: 20, y: 10, width: 80, height: 40 } };
  assert.equal(cluesFor(project, place(project, "p1", "c-save")).draftable, false);
});

test("nothing at all is drafted for a password box", () => {
  const { project } = book();
  const p = project.tree[0].children[0].pictures[0];
  p.click!.target = { password: true };
  const clues = cluesFor(project, place(project, "p1", "c-save"));
  assert.equal(clues.draftable, false);
  assert.match(clues.whyNot!, /password box/);
  assert.deepEqual(clues.lines, []);
});

test("the message to the model has the rules, the clues and, only if there are any, the author's notes; no picture and no file name", () => {
  const { project } = book();
  const clues = cluesFor(project, place(project, "p1", "c-save"));
  const without = buildMessages(clues, "  ");
  assert.equal(without.length, 2);
  assert.equal(without[0].role, "system");
  assert.ok(!/Notes from the author/.test(without[0].content));
  assert.match(without[0].content, /One plain sentence of 6 to 20 words/);
  assert.match(without[0].content, /Do not name or describe any other control/);
  assert.match(without[1].content, /^Topic: Saving your work \(chapter: Getting started\)\nItem: button named "Save"/);
  assert.match(without[1].content, /Write the sentence\.$/);
  const withNotes = buildMessages(clues, "Say click for buttons.");
  assert.match(withNotes[0].content, /Notes from the author about the writing style:\nSay click for buttons\./);
  const text = JSON.stringify(withNotes);
  assert.ok(!/images\/|\.png|altText|The Save as window/.test(text), "no picture, no file name, no description of the picture");
});

const richClues = (): Clues => ({ draftable: true, lines: ["Topic: Saving your work (chapter: Getting started)", 'Item: button named "Save"', "Keyboard shortcut: Ctrl+S", 'Windows describes it as: "Saves the active document."', 'Other items on the same picture: "Close"'], names: ["Save", "Close"] });

test("an answer is kept only if it is one plain sentence with nothing in it that is not in the clues", () => {
  const clues = richClues();
  const ok = (raw: string) => checkSentence(raw, clues);
  assert.deepEqual(ok("Saves your work to a file."), { ok: true, text: "Saves your work to a file." });
  assert.deepEqual(ok("  Saves your work to a file  "), { ok: true, text: "Saves your work to a file." }, "a missing full stop is added");
  assert.deepEqual(ok("Click Save to keep your work. "), { ok: true, text: "Click Save to keep your work." }, "a name from the clues is fine");
  assert.deepEqual(ok("**Click** the `Save` button to keep your work."), { ok: true, text: "Click the Save button to keep your work." }, "formatting marks are taken off");
  assert.deepEqual(ok("- Press Ctrl+S to save the active document."), { ok: true, text: "Press Ctrl+S to save the active document." }, "a bullet is taken off, and a shortcut from the clues is fine");
  assert.deepEqual(ok("Closes the window you are in."), { ok: true, text: "Closes the window you are in." });
  const refused: Array<[string, RegExp]> = [
    ["NEEDS INFO", /not enough to go on/],
    ["needs info.", /not enough to go on/],
    ["Saves it.\nAnd more.", /more than one line/],
    ['Click "Save" to keep your work.', /quotation marks/],
    ["Click “Save” to keep your work.", /quotation marks/],
    ["Saves.", /too short/],
    ["Saves it", /too short/],
    [Array.from({ length: 31 }, () => "word").join(" "), /too long/],
    ["Saves your work. Then it closes the window.", /more than one sentence/],
    ["Click Save to put your work in the Documents folder.", /mentioned "Documents", which is not in the capture/],
    ["Opens the Settings page for this item.", /mentioned "Settings"/],
    ["Click Save, then Confirm the change.", /mentioned "Confirm"/],
  ];
  for (const [raw, why] of refused) {
    const r = ok(raw);
    assert.equal(r.ok, false, raw);
    assert.match((r as { why: string }).why, why, raw);
  }
});

type Ask = (messages: ChatMessage[], options: AskOptions) => Promise<Answer>;

function job(project: Project, topicId: string, ask: Ask, extra: Partial<Parameters<typeof draftCallouts>[0]> = {}) {
  return { project, nodeId: topicId, ask, model: "Qwen3.5-4B-Q4_K_M.gguf", now: () => "2026-10-21T12:00:00.000Z", ...extra };
}

test("drafting writes a draft for each callout that has no sentence and enough to go on, leaves the rest alone, and changes nothing in the book itself", async () => {
  const { project, topicId } = book();
  project.writingStyle = "Say click for buttons.";
  const before = JSON.stringify(project.tree);
  const asked: Array<{ messages: ChatMessage[]; options: AskOptions }> = [];
  const progress: string[] = [];
  const ask: Ask = async (messages, options) => {
    asked.push({ messages, options });
    return { text: asked.length === 1 ? "Click Save to keep your work in a file." : "Opens a file from your computer.", truncated: false };
  };
  const report = await draftCallouts(job(project, topicId, ask, { onProgress: (d, t, w) => progress.push(`${d}/${t} ${w}`) }));
  assert.equal(report.made, 2);
  assert.equal(report.total, 2);
  assert.equal(asked.length, 2, "one request per callout, none for Close (it has a sentence) or the two that are too thin");
  assert.deepEqual(asked[0].options, { maxTokens: 90, temperature: 0.3, signal: undefined });
  assert.match(asked[0].messages[0].content, /Say click for buttons\./);
  assert.deepEqual(report.skipped.map((s) => s.callout), ["C", "D (Button1)"]);
  assert.match(report.skipped[0].why, /has no name/);
  assert.equal(report.thrownAway.length + report.alreadyWaiting, 0);
  assert.deepEqual((project.drafts as SentenceDraft[]).map((d) => [d.calloutId, d.text, d.model, d.madeAt]), [
    ["c-save", "Click Save to keep your work in a file.", "Qwen3.5-4B-Q4_K_M.gguf", "2026-10-21T12:00:00.000Z"],
    ["c-open", "Opens a file from your computer.", "Qwen3.5-4B-Q4_K_M.gguf", "2026-10-21T12:00:00.000Z"],
  ]);
  assert.ok((project.drafts[0] as SentenceDraft).clues.includes('Item: button named "Save"'), "each draft keeps the clues it was given");
  assert.equal(JSON.stringify(project.tree), before, "the book itself did not change");
  assert.deepEqual(progress, ["0/2 Drafting 1 of 2: callout A (Save) in 1.1 Saving your work", "1/2 Drafting 2 of 2: callout A (Open) in 1.1 Saving your work", "2/2 Finished."]);
  assert.deepEqual(reportWords(report), [
    "2 sentences were drafted. They wait in Drafts until you accept or reject each one.",
    "2 callouts were left alone because there is nothing in the capture to write from: callout C in 1.1 Saving your work (it has no name, and Windows gave no description of it); callout D (Button1) in 1.1 Saving your work (it has the name \"Button1\", which does not say what it is, and Windows gave no description of it). Give them names first.",
  ]);
});

test("answers that are no good are thrown away and counted, and the job goes on", async () => {
  const { project, topicId } = book();
  const answers: Array<Answer | AiError> = [
    { text: "NEEDS INFO", truncated: false },
    { text: "Opens the Documents folder.", truncated: false },
  ];
  // Two callouts can be drafted: add one more so there are three requests.
  project.tree[0].children[0].pictures[1].callouts!.push({ id: "c-new", name: "New", description: "", target: { x: 5, y: 5, width: 20, height: 20 }, marker: { x: 1, y: 1 } });
  answers.push(new AiError("bad-answer", "The model gave an empty answer."));
  let n = 0;
  const report = await draftCallouts(job(project, topicId, async () => {
    const a = answers[n++];
    if (a instanceof AiError) throw a;
    return a;
  }));
  assert.equal(n, 3, "all three were tried");
  assert.equal(report.made, 0);
  assert.deepEqual(report.thrownAway.map((t) => t.why), ["the model said there was not enough to go on", 'it mentioned "Documents", which is not in the capture', "The model gave an empty answer."]);
  assert.equal(project.drafts.length, 0);
  const words = reportWords(report);
  assert.equal(words[0], "No drafts were made.");
  assert.ok(words.some((w) => /3 answers were thrown away: callout A \(Save\) \(the model said there was not enough to go on\)/.test(w)), words.join(" / "));
  // An answer that ran out of room is not used either.
  const cut = await draftCallouts(job(project, topicId, async () => ({ text: "Saves your work to a", truncated: true })));
  assert.ok(cut.thrownAway.every((t) => /ran out of room/.test(t.why)) && cut.made === 0);
});

test("a problem with the model stops the job at once, keeps the drafts already made, and says why; so does Stop", async () => {
  const { project, topicId } = book();
  let n = 0;
  const report = await draftCallouts(job(project, topicId, async () => {
    if (++n === 2) throw new AiError("unreachable", "The model program did not answer.");
    return { text: "Click Save to keep your work in a file.", truncated: false };
  }));
  assert.equal(n, 2);
  assert.equal(report.made, 1);
  assert.deepEqual(report.stopped, { code: "unreachable", words: "The model program did not answer." });
  assert.equal(project.drafts.length, 1, "the first draft is kept");
  assert.ok(reportWords(report).includes("The model program did not answer."));
  // Stop before it starts, and during.
  const fresh = book();
  const controller = new AbortController();
  controller.abort();
  let asked = 0;
  const before = await draftCallouts(job(fresh.project, fresh.topicId, async () => { asked++; return { text: "x y z.", truncated: false }; }, { signal: controller.signal }));
  assert.deepEqual([asked, before.made, before.stopped?.code], [0, 0, "cancelled"]);
  assert.ok(reportWords(before).includes("The drafting was stopped."));
  const during = book();
  const c2 = new AbortController();
  const mid = await draftCallouts(job(during.project, during.topicId, async () => { c2.abort(); throw new AiError("cancelled", "Cancelled."); }, { signal: c2.signal }));
  assert.equal(mid.stopped?.code, "cancelled");
  // Something that is not an AiError is also said in words.
  const odd = book();
  const broke = await draftCallouts(job(odd.project, odd.topicId, async () => { throw new Error("disk exploded"); }));
  assert.equal(broke.stopped?.code, "failed");
  assert.match(broke.stopped!.words, /disk exploded/);
});

test("callouts that already have a draft waiting are left alone, and one picture can be drafted on its own", async () => {
  const { project, topicId } = book();
  let asked = 0;
  const ask: Ask = async () => { asked++; return { text: "Opens a file from your computer.", truncated: false }; };
  const only = await draftCallouts(job(project, topicId, ask, { pictureId: "p2" }));
  assert.equal(only.made, 1);
  assert.equal(asked, 1);
  assert.deepEqual((project.drafts as SentenceDraft[]).map((d) => d.pictureId), ["p2"]);
  const again = await draftCallouts(job(project, topicId, ask));
  assert.equal(again.alreadyWaiting, 1, "Open already has one");
  assert.equal(again.made, 1, "Save gets one");
  assert.equal(asked, 2);
  assert.ok(reportWords(again).includes("1 callout already has a draft waiting."));
  // Nothing left to do says so.
  const finished = book();
  for (const p of finished.project.tree[0].children[0].pictures) for (const c of p.callouts ?? []) c.description = "Already written.";
  const none = await draftCallouts(job(finished.project, finished.topicId, ask));
  assert.deepEqual(reportWords(none), ["Every callout here already has a sentence, so there was nothing to draft."]);
  assert.deepEqual((await draftCallouts(job(finished.project, "no-such-topic", ask))).total, 0);
});

test("a picture of a password box is never asked about", async () => {
  const { project, topicId } = book();
  project.tree[0].children[0].pictures[0].click!.target = { password: true };
  const messages: string[] = [];
  await draftCallouts(job(project, topicId, async (m) => { messages.push(JSON.stringify(m)); return { text: "Opens a file from your computer.", truncated: false }; }));
  assert.ok(!messages.some((m) => /Save|password|Ctrl/.test(m)), "nothing about the password picture reached the model");
});
