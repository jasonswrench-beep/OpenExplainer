import test from "node:test";
import assert from "node:assert/strict";
import { addNode, addPicture, createProject, CURRENT_VERSION, ensurePage, numbering, type Picture, type Project } from "../src/project/model.ts";
import { addBlock, makeBlock, type Step } from "../src/project/page.ts";
import { migrate } from "../src/project/migrate.ts";
import { fromFiles, toFiles } from "../src/project/files.ts";
import { buildJsonExport, readJsonExport } from "../src/export/json.ts";
import {
  buildBookIndex, cleanIndex, cleanTerm, groupOf, indexSummary, setTermLines, suggestedTerms, SYMBOLS_HEADING, termKey, termLines, updateBookIndex, updateTopicIndex,
} from "../src/project/book-index.ts";

const picture = (id: string): Picture => ({
  id, file: `images/${id}.png`, width: 1920, height: 1080, altText: id, source: { kind: "click", capturedAt: "t" },
  callouts: [
    { id: "c1", name: "Save button", description: "Saves.", target: { x: 10, y: 10, width: 50, height: 20 }, marker: { x: 5, y: 5 } },
    { id: "c2", name: "", description: "No name yet.", target: { x: 100, y: 10, width: 50, height: 20 }, marker: { x: 95, y: 5 } },
  ],
});
const run = (text: string, mark?: "control" | "bold") => ({ text, ...(mark ? { mark } : {}) });

function book(): { project: Project; ids: { chapter: string; saving: string; printing: string; empty: string } } {
  const project = createProject("Index test");
  project.variables = { PRODUCT: "Acme Draw", VERSION: "", COMPANY: "" };
  const chapter = addNode(project.tree, null, "Getting started");
  const saving = addNode(project.tree, chapter.id, "Saving your work");
  const printing = addNode(project.tree, null, "Printing");
  const empty = addNode(project.tree, null, "Nothing here");
  addPicture(project.tree, saving.id, picture("p1"));
  addPicture(project.tree, saving.id, picture("unplaced"));
  const page = ensurePage(saving);
  const heading = makeBlock("heading"); (heading as { text: string }).text = "Saving a copy.";
  const para = makeBlock("paragraph"); (para as { text: unknown }).text = [run("Press "), run("Save", "control"), run(" in {{PRODUCT}}, then "), run("File menu", "control"), run(" and "), run("always", "bold"), run(".")];
  const proc = makeBlock("procedure"); (proc as { steps: Step[] }).steps = [
    { id: "s1", text: [run("Click "), run("Save As", "control"), run(".")], result: [run("The "), run("Save As", "control"), run(" box opens.")] },
    { id: "s2", text: [run("Click "), run("{{UNSET}}", "control"), run(" and "), run("  ", "control"), run("x", "control")] },
  ];
  const note = makeBlock("callout", { kind: "caution" }); (note as { text: unknown }).text = [run("Do not close "), run("Save", "control"), run(" early.")];
  [heading, para, makeBlock("picture", { pictureId: "p1" }), proc, note].forEach((b) => addBlock(page, b));
  const p2 = makeBlock("paragraph"); (p2 as { text: unknown }).text = [run("Choose "), run("Print", "control"), run(" and "), run("save", "control"), run(".")];
  addBlock(ensurePage(printing), p2);
  return { project, ids: { chapter: chapter.id, saving: saving.id, printing: printing.id, empty: empty.id } };
}

const node = (project: Project, id: string) => {
  const find = (nodes: Project["tree"]): Project["tree"][number] | null => { for (const n of nodes) { if (n.id === id) return n; const f = find(n.children); if (f) return f; } return null; };
  return find(project.tree)!;
};

test("a term is tidied, and what is not an index term is refused", () => {
  assert.equal(cleanTerm("  Save   As. "), "Save As");
  assert.equal(cleanTerm("Save,"), "Save");
  assert.equal(cleanTerm("{{PRODUCT}} menu", { PRODUCT: "Acme Draw" }), "Acme Draw menu", "variables are filled in");
  assert.equal(cleanTerm("{{UNSET}} menu"), null, "an unfilled variable is not a term");
  for (const bad of ["", "  ", "x", "42", "...", "a".repeat(61)]) assert.equal(cleanTerm(bad), null, JSON.stringify(bad));
  assert.equal(cleanTerm("É"), null, "one letter is too short");
  assert.equal(cleanTerm("Éclair"), "Éclair");
  assert.equal(termKey("  Save   As "), termKey("save as"));
});

test("the first pass is the topic's title, the control names in its text and the names of the callouts on its pictures, each once", () => {
  const { project, ids } = book();
  assert.deepEqual(suggestedTerms(node(project, ids.saving), project.variables), ["Saving your work", "Save", "File menu", "Save As", "Save button"], "control names in steps, results and boxes too; a callout with no name and a picture not on the page add nothing; bold is not a term; and the heading \"Saving a copy\" is not a term");
  assert.deepEqual(suggestedTerms(node(project, ids.printing), project.variables), ["Printing", "Print", "save"], "'save' is its own spelling here, found in another topic");
  assert.deepEqual(suggestedTerms(node(project, ids.empty)), [], "a topic with nothing on its page suggests nothing");
  assert.deepEqual(suggestedTerms(node(project, ids.chapter)), [], "a chapter with no page of its own too");
});

test("an update adds what is new, keeps the author's own terms, does not bring back what was taken out, and drops what the book no longer supports", () => {
  const { project, ids } = book();
  const saving = node(project, ids.saving);
  const first = updateTopicIndex(saving, project.variables);
  assert.deepEqual(first.added, ["Saving your work", "Save", "File menu", "Save As", "Save button"]);
  assert.deepEqual(first.dropped, []);
  assert.ok(saving.index!.terms.every((t) => t.by === "software"));
  // the author edits: adds a term of their own, takes out "File menu", retypes "Save As" as "Save as..."
  setTermLines(saving, ["Saving your work", "Save", "Save button", "Backups", "Save as copy"], project.variables);
  assert.deepEqual(saving.index!.terms.map((t) => [t.text, t.by]), [["Saving your work", "software"], ["Save", "software"], ["Save button", "software"], ["Backups", "author"], ["Save as copy", "author"]]);
  assert.deepEqual(saving.index!.removed!.sort(), ["file menu", "save as"], "what the author took out is remembered");
  // the book changes: a new control name appears, and "Save button" no longer exists
  const para = saving.page!.blocks.find((b) => b.type === "paragraph")!;
  (para as { text: unknown }).text = [run("Press "), run("Save", "control"), run(" and "), run("File menu", "control"), run(" and "), run("Duplicate", "control")];
  saving.pictures[0].callouts = [];
  const second = updateTopicIndex(saving, project.variables);
  assert.deepEqual(second.added, ["Duplicate"], "the new control name is added, and 'File menu' stays out because the author took it out");
  assert.deepEqual(second.dropped, ["Save button"], "a software term the book no longer supports goes");
  const texts = saving.index!.terms.map((t) => t.text);
  assert.ok(texts.includes("Backups") && texts.includes("Save as copy"), "the author's own terms stay, even though nothing in the book supports them");
  assert.ok(!texts.includes("File menu") && !texts.includes("Save As"));
  // writing a taken-out term again makes it the author's
  setTermLines(saving, [...termLines(saving), "File menu"], project.variables);
  assert.equal(saving.index!.terms.find((t) => t.text === "File menu")!.by, "author");
  assert.ok(!saving.index!.removed!.includes("file menu"));
  // an update does nothing more the second time
  assert.deepEqual(updateTopicIndex(saving, project.variables), { added: [], dropped: [] });
});

test("the lines the author edits become terms: blanks, repeats and unusable lines go, and a term left alone keeps its place", () => {
  const { project, ids } = book();
  const printing = node(project, ids.printing);
  updateTopicIndex(printing, project.variables);
  assert.deepEqual(termLines(printing), ["Printing", "Print", "save"]);
  setTermLines(printing, ["Printing", "", "  ", "print", "PRINT", "x", "Page setup", "Page  setup"], project.variables);
  assert.deepEqual(printing.index!.terms.map((t) => [t.text, t.by]), [["Printing", "software"], ["print", "author"], ["Page setup", "author"]], "'print' is the author's own spelling now; repeats and 'x' went");
  assert.deepEqual(printing.index!.removed, ["save"]);
  setTermLines(printing, [], project.variables);
  assert.deepEqual(printing.index, { terms: [], removed: ["save", "printing"] }, "everything taken out leaves only a note of the software's terms that were removed");
  // nothing left at all: the index is left off the topic
  const clean = book();
  setTermLines(node(clean.project, clean.ids.empty), []);
  assert.equal(node(clean.project, clean.ids.empty).index, undefined);
});

test("the book's index lists each term once, with every topic it is in, in alphabetical order under a heading for each letter", () => {
  const { project, ids } = book();
  assert.deepEqual(updateBookIndex(project.tree, project.variables), { topics: 2, added: 8, dropped: 0 });
  const numbers = numbering(project.tree);
  const index = buildBookIndex(project, numbers);
  assert.equal(index.terms, 7, "'save' and 'Save' are one term");
  assert.deepEqual(index.groups.map((g) => g.heading), ["F", "P", "S"]);
  const find = (text: string) => index.groups.flatMap((g) => g.entries).find((e) => e.text === text)!;
  assert.deepEqual(find("Save").topics.map((t) => [t.number, t.title]), [["1.1", "Saving your work"], ["2", "Printing"]], "the topics are in the order of the book, each once");
  assert.deepEqual(index.groups[2].entries.map((e) => e.text), ["Save", "Save As", "Save button", "Saving your work"], "alphabetical, without regard to capitals");
  assert.deepEqual(index.groups[1].entries.map((e) => e.text), ["Print", "Printing"]);
  assert.equal(indexSummary(project.tree), "7 terms in 2 topics");
  // the author's spelling wins over the software's for the same term
  setTermLines(node(project, ids.printing), ["Printing", "Print", "SAVE"], project.variables);
  const again = buildBookIndex(project, numbers);
  assert.equal(again.groups.flatMap((g) => g.entries).find((e) => termKey(e.text) === "save")!.text, "SAVE");
  // symbols and numbers come first
  setTermLines(node(project, ids.empty), ["3D view", "_hidden_ thing", "Zebra"], project.variables);
  const withSymbols = buildBookIndex(project, numbers);
  assert.equal(withSymbols.groups[0].heading, SYMBOLS_HEADING);
  assert.ok(withSymbols.groups[0].entries.some((e) => e.text === "3D view"));
  assert.equal(groupOf("Éclair"), "E", "accents are set aside");
  assert.equal(groupOf("42 things"), SYMBOLS_HEADING);
  assert.deepEqual(buildBookIndex(createProject("Empty"), new Map()), { groups: [], terms: 0 });
});

test("index terms are saved with the project, odd data is cleaned, an older project has none, and the JSON export carries them", async () => {
  const { project, ids } = book();
  assert.ok(CURRENT_VERSION >= 13, "index terms arrived in format 13");
  updateBookIndex(project.tree, project.variables);
  setTermLines(node(project, ids.printing), ["Printing", "Print", "Page setup"], project.variables);
  const back = fromFiles(toFiles(project));
  assert.deepEqual(node(back, ids.printing).index, node(project, ids.printing).index, "it comes back as it was");
  assert.equal(JSON.parse(toFiles(project)["project.json"]).version, CURRENT_VERSION);
  assert.equal(node(back, ids.empty).index, undefined, "a topic with no terms has no index in its file");
  const old = migrate({ version: 12, name: "Old", template: "empty", variables: {}, tree: [{ id: "a", title: "A", status: "not-started", pictures: [], children: [] }] });
  assert.equal(old.version, CURRENT_VERSION);
  assert.equal(old.tree[0].index, undefined);
  assert.equal(cleanIndex(null), null);
  assert.equal(cleanIndex({ terms: "nope" }), null);
  assert.deepEqual(cleanIndex({ terms: [{ text: " Save. ", by: "author" }, { text: "save", by: "software" }, { text: "x" }, 7, { by: "author" }, { text: "Open", by: "weird" }], removed: ["File Menu", "file menu", 3, "", "open"] }), { terms: [{ text: "Save", by: "author" }, { text: "Open", by: "software" }], removed: ["file menu"] }, "repeats go, a term's by is known or the software's, and a removed key that is a term again is dropped");
  const files = buildJsonExport(project, new Map());
  const book1 = JSON.parse(new TextDecoder().decode(files.files["book.json"]));
  assert.deepEqual(book1.tree[1].index.terms.map((t: { text: string }) => t.text), ["Printing", "Print", "Page setup"], "the JSON export has each topic's terms");
  const imported = await readJsonExport(files.files);
  assert.deepEqual(node(imported.project, ids.printing).index, node(project, ids.printing).index, "and reads them back");
});
