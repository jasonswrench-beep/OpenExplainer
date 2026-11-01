import test from "node:test";
import assert from "node:assert/strict";
import { CURRENT_VERSION, addNode, createProject, type Picture, type Project } from "../src/project/model.ts";
import { DRAFTS_FILE, PROJECT_FILE, STRUCTURE_FILE, fromFiles, toFiles } from "../src/project/files.ts";
import { MOST_CLUE_LINES, MOST_STYLE, acceptDraft, addDraft, cleanDrafts, cleanWritingStyle, draftCount, draftRows, findCallout, pruneDrafts, rejectDraft, type SentenceDraft, type SentenceRow } from "../src/project/drafts.ts";

const texts = (drafts: { kind: string }[]) => (drafts as SentenceDraft[]).map((d) => d.text);
import { checkProject } from "../src/project/checks.ts";
import { migrate } from "../src/project/migrate.ts";
import { buildJsonExport, readJsonExport } from "../src/export/json.ts";
import { packProject, unpackProject } from "../src/project/package.ts";

function picture(id: string, calloutNames: string[], described: Record<string, string> = {}): Picture {
  return {
    id,
    file: `images/${id}.png`,
    width: 800,
    height: 600,
    altText: "A window",
    source: { kind: "click", capturedAt: "2026-10-21T10:00:00.000Z" },
    callouts: calloutNames.map((name, i) => ({ id: `${id}-c${i}`, name, description: described[`${id}-c${i}`] ?? "", target: { x: 10 + i * 100, y: 10, width: 80, height: 30 }, marker: { x: 5, y: 5 } })),
  };
}

function book(): Project {
  const p = createProject("Drafts");
  const chapter = addNode(p.tree, null, "Getting started");
  const topic = addNode(p.tree, chapter.id, "Saving your work");
  topic.pictures.push(picture("p1", ["Save", "Close", ""], { "p1-c1": "Closes the window." }), picture("p2", ["Open"]));
  const other = addNode(p.tree, chapter.id, "Printing");
  other.pictures.push(picture("p3", ["Print"]));
  return p;
}

const draft = (pictureId: string, calloutId: string, text = "Saves your work to a file.", extra: Partial<SentenceDraft> = {}) => ({ kind: "callout-sentence" as const, pictureId, calloutId, text, clues: ['Item: button named "Save"'], madeAt: "2026-10-21T10:05:00.000Z", model: "Qwen3.5-4B-Q4_K_M.gguf", ...extra });

test("writing-style notes keep their lines, lose stray spaces, and stop at 2000 letters", () => {
  assert.equal(cleanWritingStyle("  Say click for buttons.  \r\nShort sentences.\r\n\r\n\r\n\r\nNo jargon.  "), "Say click for buttons.\nShort sentences.\n\nNo jargon.");
  assert.equal(cleanWritingStyle(undefined), "");
  assert.equal(cleanWritingStyle(7), "");
  assert.equal(cleanWritingStyle("x".repeat(5000)).length, MOST_STYLE);
});

test("a draft is found a callout, kept only for a callout that is there, and the newest one for a callout wins", () => {
  const p = book();
  assert.equal(findCallout(p.tree, "p1", "p1-c0")?.callout.name, "Save");
  assert.equal(findCallout(p.tree, "p1", "nope"), null);
  assert.equal(findCallout(p.tree, "nope", "p1-c0"), null);
  const a = addDraft(p, draft("p1", "p1-c0", "First version."))!;
  const b = addDraft(p, draft("p1", "p1-c0", "Second version."))!;
  assert.notEqual(a.id, b.id);
  assert.deepEqual(texts(p.drafts), ["Second version."], "one draft per callout");
  assert.equal(addDraft(p, draft("p1", "gone", "Hello there you.")), null, "no callout, no draft");
  assert.equal(addDraft(p, draft("p1", "p1-c2", "   ")), null, "no words, no draft");
  assert.equal(draftCount(p), 1);
});

test("opening a project cleans its drafts: unknown kinds, missing callouts, empty text, repeated ids and long text", () => {
  const p = book();
  const long = "word ".repeat(200);
  const raw = [
    { id: "d1", ...draft("p1", "p1-c0", "Keeps this one.") },
    { id: "d1", ...draft("p2", "p2-c0", "Same id, new id.") },
    { id: "d3", ...draft("p1", "p1-c0", "Newer for the same callout.") },
    { id: "d4", ...draft("p1", "p1-c1", long, { clues: ["a", "", ...Array.from({ length: 30 }, (_, i) => `line ${i}`)] }) },
    { id: "d5", ...draft("p1", "gone", "No such callout.") },
    { id: "d6", ...draft("p1", "p1-c2", "") },
    { id: "d7", ...draft("p1", "p1-c2", "Odd kind."), kind: "poem" },
    "not an object",
    null,
    { id: "d8", pictureId: 5, calloutId: "p1-c2", kind: "callout-sentence", text: "Wrong kinds of value." },
  ];
  const kept = cleanDrafts(raw, p.tree);
  assert.deepEqual(texts(kept).sort(), ["Newer for the same callout.", "Same id, new id.", long.replace(/\s+/g, " ").trim().slice(0, 300)].sort());
  assert.equal(new Set(kept.map((d) => d.id)).size, kept.length, "each id once");
  const longOne = (kept as SentenceDraft[]).find((d) => d.calloutId === "p1-c1")!;
  assert.equal(longOne.text.length, 300);
  assert.equal(longOne.clues.length, MOST_CLUE_LINES, "the clue lines are limited, and empty ones dropped");
  assert.deepEqual(cleanDrafts("nothing", p.tree), []);
  assert.deepEqual(cleanDrafts(undefined, p.tree), []);
});

test("the review list is in the order of the book, says where each draft is, and leaves out a draft whose callout has gone", () => {
  const p = book();
  addDraft(p, draft("p3", "p3-c0", "Prints the page."));
  addDraft(p, draft("p1", "p1-c1", "Closes it."));
  addDraft(p, draft("p1", "p1-c2", "Does a thing."));
  addDraft(p, draft("p2", "p2-c0", "Opens a file."));
  const rows = draftRows(p);
  assert.deepEqual((rows as SentenceRow[]).map((r) => `${r.where} | ${r.pictureWords} | ${r.calloutWords} | ${r.now}`), [
    "1.1 Saving your work | picture 1 | B: Close | Closes the window.",
    "1.1 Saving your work | picture 1 | C | ",
    "1.1 Saving your work | picture 2 | A: Open | ",
    "1.2 Printing | picture 1 | A: Print | ",
  ]);
  assert.equal(draftCount(p), 4);
  // The callout goes: the draft no longer counts, and is dropped when asked.
  p.tree[0].children[0].pictures[0].callouts!.splice(2, 1);
  assert.equal(draftCount(p), 3);
  assert.equal(p.drafts.length, 4);
  pruneDrafts(p);
  assert.equal(p.drafts.length, 3);
});

test("accepting a draft makes it the callout's sentence, replacing what was there, and nothing else changes; an edited sentence is what is kept", () => {
  const p = book();
  const first = addDraft(p, draft("p1", "p1-c1", "Shuts the window."))!;
  const second = addDraft(p, draft("p1", "p1-c0", "Saves your work to a file."))!;
  const before = JSON.stringify(p.tree);
  const done = acceptDraft(p, first.id);
  assert.deepEqual(done, { ok: true, where: "1.1 Saving your work", words: "Accepted for callout B: Close in 1.1 Saving your work." });
  assert.equal(findCallout(p.tree, "p1", "p1-c1")!.callout.description, "Shuts the window.", "the old sentence was replaced");
  assert.deepEqual(p.drafts.map((d) => d.id), [second.id], "and the draft is gone");
  assert.equal(JSON.stringify(p.tree).replace("Shuts the window.", "Closes the window."), before, "nothing else changed");
  const edited = acceptDraft(p, second.id, ["  Saves   your work  as a file. "]);
  assert.equal(edited.ok, true);
  assert.equal(findCallout(p.tree, "p1", "p1-c0")!.callout.description, "Saves your work as a file.");
  assert.equal(p.drafts.length, 0);
});

test("accepting is refused in words when there is nothing to accept, or no words", () => {
  const p = book();
  assert.deepEqual(acceptDraft(p, "nope"), { ok: false, words: "That draft is no longer waiting." });
  const d = addDraft(p, draft("p1", "p1-c0"))!;
  const empty = acceptDraft(p, d.id, ["   "]);
  assert.equal(empty.ok, false);
  assert.match((empty as { words: string }).words, /sentence is needed/);
  assert.equal(p.drafts.length, 1, "the draft is still waiting");
  p.tree[0].children[0].pictures[0].callouts!.splice(0, 1);
  const gone = acceptDraft(p, d.id);
  assert.equal(gone.ok, false);
  assert.match((gone as { words: string }).words, /callout this draft was for is gone/);
  assert.equal(p.drafts.length, 0, "and a draft for a callout that has gone is dropped");
});

test("rejecting a draft removes it and changes nothing else", () => {
  const p = book();
  const d = addDraft(p, draft("p1", "p1-c0"))!;
  const before = JSON.stringify(p.tree);
  assert.equal(rejectDraft(p, d.id), true);
  assert.equal(rejectDraft(p, d.id), false);
  assert.equal(p.drafts.length, 0);
  assert.equal(JSON.stringify(p.tree), before);
});

test("drafts.json exists only when there are drafts, the notes only when written, and both come back", () => {
  const p = book();
  assert.ok(CURRENT_VERSION >= 16, "drafts arrived in format 14 and have stayed");
  let files = toFiles(p);
  assert.ok(!(DRAFTS_FILE in files), "no drafts, no file");
  assert.ok(!("writingStyle" in JSON.parse(files[PROJECT_FILE])), "no notes, no entry");
  assert.ok(!("drafts" in JSON.parse(files[PROJECT_FILE])), "drafts are never in project.json");
  addDraft(p, draft("p1", "p1-c0", "Saves your work to a file."));
  p.writingStyle = "Say click for buttons.\nShort sentences.";
  files = toFiles(p);
  assert.ok(DRAFTS_FILE in files);
  const saved = JSON.parse(files[DRAFTS_FILE]);
  assert.equal(saved.version, CURRENT_VERSION);
  assert.equal(saved.drafts.length, 1);
  assert.ok(!files[STRUCTURE_FILE].includes("Saves your work to a file."), "the draft text is not in the tree");
  assert.equal(JSON.parse(files[PROJECT_FILE]).writingStyle, "Say click for buttons.\nShort sentences.");
  const back = fromFiles(files);
  assert.equal(back.version, CURRENT_VERSION);
  assert.equal(back.writingStyle, p.writingStyle);
  assert.deepEqual(back.drafts, p.drafts);
  // A callout that is not there any more takes its draft with it when the project is saved.
  p.tree[0].children[0].pictures[0].callouts!.splice(0, 1);
  assert.ok(!(DRAFTS_FILE in toFiles(p)));
});

test("a project saved as format 13 opens as the current format with no notes and no drafts, and one with a damaged or mismatched drafts file is refused in words", () => {
  const p = book();
  const files = toFiles(p);
  const old: Record<string, string> = {
    [PROJECT_FILE]: JSON.stringify({ ...JSON.parse(files[PROJECT_FILE]), version: 13 }),
    [STRUCTURE_FILE]: JSON.stringify({ ...JSON.parse(files[STRUCTURE_FILE]), version: 13 }),
  };
  const opened = fromFiles(old);
  assert.equal(opened.version, CURRENT_VERSION);
  assert.equal(opened.writingStyle, "");
  assert.deepEqual(opened.drafts, []);
  assert.equal(opened.tree[0].children[0].pictures[0].callouts![0].name, "Save", "and the book is as it was");
  addDraft(p, draft("p1", "p1-c0"));
  const good = toFiles(p);
  assert.throws(() => fromFiles({ ...good, [DRAFTS_FILE]: "{ not json" }), /file of AI drafts is damaged/);
  assert.throws(() => fromFiles({ ...good, [DRAFTS_FILE]: JSON.stringify({ version: 13, drafts: [] }) }), /do not match/);
  assert.throws(() => fromFiles({ ...good, [DRAFTS_FILE]: "null" }), /do not match/);
  // A file with odd drafts in it is cleaned, not refused.
  const odd = fromFiles({ ...good, [DRAFTS_FILE]: JSON.stringify({ version: CURRENT_VERSION, drafts: [{ id: "x", kind: "callout-sentence", pictureId: "p1", calloutId: "gone", text: "Nope." }, 7] }) });
  assert.deepEqual(odd.drafts, []);
  // migrate() on its own gives the empty values and cleans what it is handed.
  const m = migrate({ version: 13, name: "M", template: "empty", variables: {}, writingStyle: 5, tree: [] });
  assert.deepEqual([m.version, m.writingStyle, m.drafts], [CURRENT_VERSION, "", []]);
});

test("a project that is saved and opened again has the same parts in the same order as a new one", () => {
  const p = book();
  const keys = (x: object) => Object.keys(x).join(",");
  assert.equal(keys(fromFiles(toFiles(p))), keys(p));
  p.writingStyle = "Notes.";
  addDraft(p, draft("p1", "p1-c0"));
  assert.equal(keys(fromFiles(toFiles(p))), keys(p));
  assert.equal(keys(createProject("New")), "version,name,template,variables,highlight,zoom,styles,checks,guides,paper,look,writingStyle,avoidWords,drafts,tree");
});

test("drafts survive being saved as a project file and opened again", async () => {
  const p = book();
  addDraft(p, draft("p1", "p1-c0", "Saves your work to a file."));
  addDraft(p, draft("p3", "p3-c0", "Prints the page."));
  p.writingStyle = "Use the second person.";
  const { project } = await unpackProject(packProject(p));
  assert.equal(project.writingStyle, "Use the second person.");
  assert.deepEqual(texts(project.drafts), ["Saves your work to a file.", "Prints the page."]);
});

test("drafts are never in the JSON export; the writing-style notes are, and come back on import", () => {
  const p = book();
  addDraft(p, draft("p1", "p1-c0", "A sentence nobody has accepted."));
  p.writingStyle = "Say click for buttons.";
  const { files } = buildJsonExport(p, new Map());
  const text = new TextDecoder().decode(files["book.json"]);
  assert.ok(!text.includes("A sentence nobody has accepted."), "the draft is not exported");
  assert.ok(!/"drafts"/.test(text));
  assert.ok(text.includes("Say click for buttons."));
  const back = readJsonExport(files);
  assert.equal(back.project.writingStyle, "Say click for buttons.");
  assert.deepEqual(back.project.drafts, []);
});

test("the book check notes each waiting draft, in words, and only while the callout is there", () => {
  const p = book();
  addDraft(p, draft("p1", "p1-c0"));
  // A placed picture is needed for the check to look at its callouts.
  p.tree[0].children[0].page = { blocks: [{ id: "b1", type: "picture", pictureId: "p1" }] } as never;
  const notes = checkProject(p).filter((i) => i.kind === "ai-draft");
  assert.equal(notes.length, 1);
  assert.match(notes[0].words, /A draft is waiting for callout A \("Save"\) .* It is not in the book until you accept it\./);
  assert.equal(notes[0].key, "ai-draft:p1:p1-c0");
  rejectDraft(p, p.drafts[0].id);
  assert.equal(checkProject(p).filter((i) => i.kind === "ai-draft").length, 0);
});
