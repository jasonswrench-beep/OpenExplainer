// What can be translated in a book: every piece of reader-facing text, each with a name that stays the same while the thing stays the same, so a translation made from an export finds its place again.
// A unit is either plain words (a title, a picture's description, a callout's name) or words with marks (a paragraph, a box, a step). `translatableUnits(project)` lists them for a project, each with a
// way to put a translation in its place, so the same list is used to write the file for a translator and to read it back into a copy of the book. Nothing here changes a project until a unit's
// `apply` is called, and nothing needs a screen. See docs/exports.md ("Translation").
import type { Block, Step } from "../project/page.ts";
import type { Picture, Project, TreeNode } from "../project/model.ts";
import type { Run } from "../project/text.ts";

export interface Unit {
  /** Its name, such as `block:abc123` or `callout:picture:callout:name`. */
  id: string;
  /** Where it is, in words, for the translator. */
  note: string;
  /** Plain words, or words with marks. */
  source: string | Run[];
  /** Puts a translation in its place: plain words for a plain unit, runs for a marked one. */
  apply(target: string | Run[]): void;
}

const plainOf = (runs: Run[]) => runs.map((r) => r.text).join("");

/** Every translatable unit of a project, in reading order. A unit with no words is not listed. */
export function translatableUnits(project: Project): Unit[] {
  const units: Unit[] = [];
  const plain = (id: string, note: string, get: () => string, set: (words: string) => void) => {
    const source = get();
    if (source.trim() !== "") units.push({ id, note, source, apply: (target) => set(typeof target === "string" ? target : plainOf(target)) });
  };
  const marked = (id: string, note: string, get: () => Run[], set: (runs: Run[]) => void) => {
    const source = get();
    if (plainOf(source).trim() !== "") units.push({ id, note, source: structuredClone(source), apply: (target) => set(typeof target === "string" ? [{ text: target }] : target) });
  };
  const blocks = (list: Block[], idOf: (kind: string, id: string) => string, where: string) => {
    for (const block of list) {
      if (block.type === "paragraph") marked(idOf("block", block.id), `${where}: paragraph`, () => block.text, (r) => { block.text = r; });
      else if (block.type === "callout") marked(idOf("block", block.id), `${where}: boxed note`, () => block.text, (r) => { block.text = r; });
      else if (block.type === "heading") plain(idOf("block", block.id), `${where}: heading`, () => block.text, (w) => { block.text = w; });
      else if (block.type === "procedure") {
        block.steps.forEach((step: Step, i) => {
          marked(idOf("step", step.id), `${where}: step ${i + 1}`, () => step.text, (r) => { step.text = r; });
          if (step.result) marked(idOf("step", `${step.id}:result`), `${where}: result of step ${i + 1}`, () => step.result ?? [], (r) => { step.result = r; });
        });
      }
    }
  };
  const picture = (p: Picture, where: string) => {
    plain(`picture:${p.id}:alt`, `${where}: description of a picture`, () => p.altText, (w) => { p.altText = w; });
    (p.callouts ?? []).forEach((c, i) => {
      const letter = String.fromCharCode(65 + (i % 26));
      plain(`callout:${p.id}:${c.id}:name`, `${where}: name of callout ${letter} on a picture`, () => c.name, (w) => { c.name = w; });
      plain(`callout:${p.id}:${c.id}:description`, `${where}: sentence about callout ${letter} on a picture`, () => c.description, (w) => { c.description = w; });
    });
    for (const s of p.shapes ?? []) {
      plain(`shape:${p.id}:${s.id}:alt`, `${where}: alternative text of a mark drawn on a picture`, () => s.alt ?? "", (w) => { s.alt = w; });
      if (s.kind === "text") plain(`shape:${p.id}:${s.id}:text`, `${where}: words in a text box drawn on a picture`, () => s.text, (w) => { s.text = w; });
    }
  };
  const topic = (nodes: TreeNode[], numbers: string[]) => {
    nodes.forEach((node, index) => {
      const number = [...numbers, String(index + 1)].join(".");
      const where = `${number}`;
      plain(`topic:${node.id}:title`, `${where}: title`, () => node.title, (w) => { node.title = w; });
      blocks(node.page?.blocks ?? [], (kind, id) => `${kind}:${id}`, where);
      for (const p of node.pictures) picture(p, where);
      (node.index?.terms ?? []).forEach((term, i) => plain(`index:${node.id}:${i}`, `${where}: index term`, () => term.text, (w) => { term.text = w; }));
      topic(node.children, [...numbers, String(index + 1)]);
    });
  };

  plain("project:name", "the book's title", () => project.name, (w) => { project.name = w; });
  plain("look:header", "the words at the top of each page", () => project.look.header, (w) => { project.look.header = w; });
  plain("look:footer", "the words at the bottom of each page", () => project.look.footer, (w) => { project.look.footer = w; });
  const logo = project.look.logo;
  if (logo) plain("look:logo-alt", "the description of the logo", () => logo.alt, (w) => { logo.alt = w; });
  topic(project.tree, []);
  for (const snippet of project.snippets) blocks(snippet.blocks, (kind, id) => `snippet:${snippet.id}:${kind}:${id}`, `snippet "${snippet.name}"`);
  for (const guide of project.guides) plain(`guide:${guide.id}:name`, "the title of a guide", () => guide.name, (w) => { guide.name = w; });
  return units;
}

