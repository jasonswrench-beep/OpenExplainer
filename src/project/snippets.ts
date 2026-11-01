// Reuse (format version 19): snippets, conditions and targets. Nothing here touches a screen or a disk.
//
// A SNIPPET is a short piece of a page (a paragraph, a boxed note, a heading or a numbered procedure) that is written once and placed in many topics as a snippet block. Change the snippet and every topic
// that uses it changes. A snippet holds no pictures (a picture belongs to one topic) and no other snippet. It is typed as plain text in the Reuse window, in a form made for it (see `snippetToText`).
// A CONDITION is a name the author gives to content that is only for some readers or versions, such as "Administrators" or "Version 2". A block, a step or a whole topic can carry conditions. A TARGET is a
// named output, such as "Guide for students", that hides some of the conditions: an output made for a target leaves out everything that carries any condition the target hides. Without a target
// everything is in. `expandOutput` makes the project an output sees: snippets written out in place and the hidden content gone. The project itself is never changed by it.
import type { Project, TreeNode } from "./model.ts";
import { calloutLabel, CALLOUT_KINDS, cleanConditionIds, type Block, type CalloutKind, type ParagraphBlock, type Step } from "./page.ts";
import { newId } from "./ids.ts";
import { cleanRuns, formatMarks, parseMarks, plainText, TOPIC_ID } from "./text.ts";

export const MOST_SNIPPETS = 100;
export const MOST_CONDITIONS = 30;
export const MOST_TARGETS = 20;
export const MOST_SNIPPET_BLOCKS = 20;
export const MOST_NAME = 60;

/** The blocks a snippet can hold: no pictures and no other snippets. */
export type SnippetPart = Exclude<Block, { type: "picture" } | { type: "snippet" }>;

export interface Snippet {
  id: string;
  /** What the author calls it, such as "Back up first". Not shown in any output. At most 60 letters, each name once. */
  name: string;
  blocks: SnippetPart[];
}

export interface Condition {
  id: string;
  name: string;
}

export interface Target {
  id: string;
  name: string;
  /** The ids of the conditions this target hides. Content with any of them is left out of an output made for it. */
  hide: string[];
}

const oneLine = (text: unknown) => (typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, MOST_NAME) : "");
const idText = (v: unknown) => (typeof v === "string" && TOPIC_ID.test(v) ? v : newId());

// ---- Reading what is saved ---------------------------------------------------------------------------------

function cleanPart(raw: unknown): SnippetPart | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const id = idText(input.id);
  const conditions = cleanConditionIds(input.conditions);
  const base = conditions.length ? { conditions } : {};
  switch (input.type) {
    case "heading": return typeof input.text === "string" ? { id, type: "heading", text: input.text, ...base } : null;
    case "paragraph": return { id, type: "paragraph", text: cleanRuns(input.text), ...base };
    case "callout": return { id, type: "callout", kind: CALLOUT_KINDS.some((k) => k.id === input.kind) ? (input.kind as CalloutKind) : "design-tip", text: cleanRuns(input.text), ...base };
    case "procedure": {
      const steps: Step[] = [];
      for (const s of Array.isArray(input.steps) ? input.steps : []) {
        if (typeof s !== "object" || s === null) continue;
        const step = s as Record<string, unknown>;
        // A snippet's steps have no pictures: a picture belongs to one topic.
        const made: Step = { id: idText(step.id), text: cleanRuns(step.text) };
        const result = cleanRuns(step.result);
        if (result.length) made.result = result;
        const sc = cleanConditionIds(step.conditions);
        if (sc.length) made.conditions = sc;
        steps.push(made);
      }
      return { id, type: "procedure", steps, ...base };
    }
    default: return null;
  }
}

/** Snippets read from a file: each with a name that is not empty or repeated, an id, and only the kinds of block a snippet can hold. */
export function cleanSnippets(raw: unknown): Snippet[] {
  if (!Array.isArray(raw)) return [];
  const out: Snippet[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const name = oneLine(r.name);
    if (!name || out.some((s) => s.name.toLowerCase() === name.toLowerCase())) continue;
    const id = idText(r.id);
    if (out.some((s) => s.id === id)) continue;
    const blocks = (Array.isArray(r.blocks) ? r.blocks : []).map(cleanPart).filter((b): b is SnippetPart => b !== null).slice(0, MOST_SNIPPET_BLOCKS);
    out.push({ id, name, blocks });
    if (out.length >= MOST_SNIPPETS) break;
  }
  return out;
}

export function cleanConditions(raw: unknown): Condition[] {
  if (!Array.isArray(raw)) return [];
  const out: Condition[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const name = oneLine(r.name);
    const id = idText(r.id);
    if (!name || out.some((c) => c.name.toLowerCase() === name.toLowerCase() || c.id === id)) continue;
    out.push({ id, name });
    if (out.length >= MOST_CONDITIONS) break;
  }
  return out;
}

export function cleanTargets(raw: unknown, conditions: Condition[]): Target[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set(conditions.map((c) => c.id));
  const out: Target[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const name = oneLine(r.name);
    const id = idText(r.id);
    if (!name || out.some((t) => t.name.toLowerCase() === name.toLowerCase() || t.id === id)) continue;
    out.push({ id, name, hide: cleanConditionIds(r.hide).filter((c) => known.has(c)) });
    if (out.length >= MOST_TARGETS) break;
  }
  return out;
}

function eachNode(tree: TreeNode[], visit: (node: TreeNode) => void): void {
  for (const node of tree) {
    visit(node);
    eachNode(node.children, visit);
  }
}

/** Takes conditions that are not the project's off every topic, block and step (and tidies the lists), so a leftover id never hides anything. */
export function cleanTreeConditions(tree: TreeNode[], conditions: Condition[]): TreeNode[] {
  const known = new Set(conditions.map((c) => c.id));
  const keep = (ids: string[] | undefined) => (ids ?? []).filter((id) => known.has(id));
  const fix = (nodes: TreeNode[]): TreeNode[] =>
    nodes.map((node) => {
      const { conditions: own, ...rest } = node;
      const mine = keep(own);
      const page = node.page ? { ...node.page, blocks: node.page.blocks.map((b) => cleanBlockConditions(b, keep)) } : undefined;
      return { ...rest, ...(mine.length ? { conditions: mine } : {}), ...(page ? { page } : {}), children: fix(node.children ?? []) };
    });
  return fix(tree);
}

function cleanBlockConditions(block: Block, keep: (ids: string[] | undefined) => string[]): Block {
  const { conditions, ...rest } = block as Block & { conditions?: string[] };
  const mine = keep(conditions);
  const out = { ...rest, ...(mine.length ? { conditions: mine } : {}) } as Block;
  if (out.type === "procedure") {
    out.steps = out.steps.map((s) => {
      const { conditions: sc, ...others } = s;
      const keptSteps = keep(sc);
      return { ...others, ...(keptSteps.length ? { conditions: keptSteps } : {}) } as Step;
    });
  }
  return out;
}

// ---- The text form of a snippet ------------------------------------------------------------------------------

/**
 * A snippet as the plain text it is edited in. Blocks are separated by a blank line. `# words` is a heading. `> Caution: words` is a boxed note (the label is one of the box names). Lines that start `1.`,
 * `2.` and so on are the steps of a numbered procedure, and a line that starts with `Result:` after a step is that step's result. Anything else is a paragraph. Words use the same marks as the page editor
 * (`**bold**`, `*italic*`, `[[Control name]]`, `[words](#topic-id)`).
 */
export function snippetToText(blocks: SnippetPart[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "heading": return `# ${block.text}`;
        case "paragraph": return formatMarks(block.text);
        case "callout": return `> ${calloutLabel(block.kind)}: ${formatMarks(block.text)}`;
        case "procedure": return block.steps.map((s, i) => `${i + 1}. ${formatMarks(s.text)}${s.result?.length ? `\nResult: ${formatMarks(s.result)}` : ""}`).join("\n");
      }
    })
    .join("\n\n");
}

const BOX_BY_LABEL = new Map<string, CalloutKind>(CALLOUT_KINDS.map((k) => [k.label.toLowerCase(), k.id]));

/** The text of a snippet as blocks. Returns the blocks and anything that could not be used, in words. */
export function snippetFromText(source: string): { blocks: SnippetPart[]; problems: string[] } {
  const problems: string[] = [];
  const blocks: SnippetPart[] = [];
  for (const chunk of source.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;
    const first = lines[0].trim();
    if (first.startsWith("# ")) {
      blocks.push({ id: newId(), type: "heading", text: first.slice(2).trim() });
    } else if (first.startsWith(">")) {
      const body = first.replace(/^>\s*/, "");
      const colon = body.indexOf(":");
      const kind = colon > 0 ? BOX_BY_LABEL.get(body.slice(0, colon).trim().toLowerCase()) : undefined;
      if (!kind && colon > 0) problems.push(`"${body.slice(0, colon).trim()}" is not the name of a box, so that note is a Design Tip. The boxes are: ${CALLOUT_KINDS.map((k) => k.label).join(", ")}.`);
      blocks.push({ id: newId(), type: "callout", kind: kind ?? "design-tip", text: parseMarks(kind ? body.slice(colon + 1).trim() : body) });
    } else if (/^\d+\.\s/.test(first)) {
      const steps: Step[] = [];
      for (const line of lines) {
        const step = /^\d+\.\s+(.*)$/.exec(line.trim());
        const result = /^Result:\s*(.*)$/i.exec(line.trim());
        if (step) steps.push({ id: newId(), text: parseMarks(step[1]) });
        else if (result && steps.length) steps[steps.length - 1].result = parseMarks(result[1]);
        else if (steps.length) steps[steps.length - 1].text = parseMarks(`${formatMarks(steps[steps.length - 1].text)} ${line.trim()}`);
      }
      blocks.push({ id: newId(), type: "procedure", steps });
    } else {
      blocks.push({ id: newId(), type: "paragraph", text: parseMarks(lines.map((l) => l.trim()).join(" ")) } as ParagraphBlock);
    }
  }
  if (blocks.length > MOST_SNIPPET_BLOCKS) problems.push(`A snippet holds up to ${MOST_SNIPPET_BLOCKS} blocks, so the rest were left out.`);
  return { blocks: blocks.slice(0, MOST_SNIPPET_BLOCKS), problems };
}

/** A short line about a snippet for a list: its first words. */
export function snippetGist(snippet: Snippet): string {
  const first = snippet.blocks[0];
  if (!first) return "Empty";
  const words = first.type === "heading" ? first.text : first.type === "procedure" ? `${first.steps.length} ${first.steps.length === 1 ? "step" : "steps"}: ${plainText(first.steps[0]?.text ?? [])}` : plainText(first.text);
  return words.length > 70 ? `${words.slice(0, 70)}...` : words;
}

// ---- Changing the lists --------------------------------------------------------------------------------------

/** Adds a snippet or changes the one with this name (ignoring capitals), keeping its id. Returns it. Throws, saying why, when the name is empty or there are too many. */
export function setSnippet(project: Project, name: string, blocks: SnippetPart[]): Snippet {
  const clean = oneLine(name);
  if (!clean) throw new Error("A snippet needs a name.");
  const existing = project.snippets.find((s) => s.name.toLowerCase() === clean.toLowerCase());
  if (existing) { existing.blocks = blocks.slice(0, MOST_SNIPPET_BLOCKS); return existing; }
  if (project.snippets.length >= MOST_SNIPPETS) throw new Error(`A book can have up to ${MOST_SNIPPETS} snippets.`);
  const made: Snippet = { id: newId(), name: clean, blocks: blocks.slice(0, MOST_SNIPPET_BLOCKS) };
  project.snippets.push(made);
  return made;
}

/** Where a snippet is used: the topics with a snippet block of it, and how many blocks. */
export function snippetUses(tree: TreeNode[], snippetId: string): { node: TreeNode; count: number }[] {
  const out: { node: TreeNode; count: number }[] = [];
  eachNode(tree, (node) => {
    const count = (node.page?.blocks ?? []).filter((b) => b.type === "snippet" && b.snippetId === snippetId).length;
    if (count) out.push({ node, count });
  });
  return out;
}

/** Deletes a snippet. Where it was used the blocks stay as ordinary blocks (a copy of what the snippet said), so no page loses words. Returns how many places were turned into ordinary blocks. */
export function deleteSnippet(project: Project, snippetId: string): number {
  const snippet = project.snippets.find((s) => s.id === snippetId);
  if (!snippet) throw new Error("There is no snippet with that id.");
  let places = 0;
  eachNode(project.tree, (node) => {
    if (!node.page) return;
    const next: Block[] = [];
    for (const block of node.page.blocks) {
      if (block.type === "snippet" && block.snippetId === snippetId) {
        places++;
        next.push(...writeOut(snippet, block));
      } else next.push(block);
    }
    node.page.blocks = next;
  });
  project.snippets = project.snippets.filter((s) => s.id !== snippetId);
  return places;
}

/** Replaces the conditions with a new list of names, keeping the id of a name that was already there (so what carries it still carries it). Conditions that go are taken off everything and every target. */
export function setConditionNames(project: Project, names: string[]): { added: number; removed: number } {
  const wanted: string[] = [];
  for (const raw of names) {
    const name = oneLine(raw);
    if (name && !wanted.some((w) => w.toLowerCase() === name.toLowerCase())) wanted.push(name);
  }
  if (wanted.length > MOST_CONDITIONS) throw new Error(`A book can have up to ${MOST_CONDITIONS} conditions.`);
  const before = project.conditions;
  const next: Condition[] = wanted.map((name) => before.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? { id: newId(), name });
  const removed = before.filter((c) => !next.some((n) => n.id === c.id));
  project.conditions = next;
  if (removed.length) {
    project.tree = cleanTreeConditions(project.tree, next);
    project.targets = project.targets.map((t) => ({ ...t, hide: t.hide.filter((id) => next.some((n) => n.id === id)) }));
    project.snippets = project.snippets.map((s) => ({ ...s, blocks: s.blocks.map((b) => cleanBlockConditions(b, (ids) => (ids ?? []).filter((id) => next.some((n) => n.id === id))) as SnippetPart) }));
  }
  return { added: next.filter((n) => !before.some((b) => b.id === n.id)).length, removed: removed.length };
}

/** Replaces the targets. Each is a name and the names of the conditions it hides. Throws, saying why, for a condition that does not exist. */
export function setTargetList(project: Project, targets: { name: string; hide: string[] }[]): number {
  if (targets.length > MOST_TARGETS) throw new Error(`A book can have up to ${MOST_TARGETS} targets.`);
  const next: Target[] = [];
  for (const t of targets) {
    const name = oneLine(t.name);
    if (!name) throw new Error("A target needs a name.");
    if (next.some((n) => n.name.toLowerCase() === name.toLowerCase())) throw new Error(`There are two targets called "${name}".`);
    const hide = t.hide.map((c) => {
      const found = project.conditions.find((k) => k.name.toLowerCase() === c.trim().toLowerCase());
      if (!found) throw new Error(`The target "${name}" hides "${c}", which is not one of the conditions (${project.conditions.map((k) => k.name).join(", ") || "there are none yet"}).`);
      return found.id;
    });
    const existing = project.targets.find((x) => x.name.toLowerCase() === name.toLowerCase());
    next.push({ id: existing?.id ?? newId(), name, hide: hide.filter((h, i) => hide.indexOf(h) === i) });
  }
  project.targets = next;
  return next.length;
}

/** The ids of conditions by name. Throws, saying which name is not a condition. */
export function conditionIds(project: Project, names: string[]): string[] {
  return names.map((raw) => {
    const found = project.conditions.find((c) => c.name.toLowerCase() === raw.trim().toLowerCase());
    if (!found) throw new Error(`"${raw}" is not one of the conditions (${project.conditions.map((c) => c.name).join(", ") || "there are none yet"}). set_conditions makes them.`);
    return found.id;
  }).filter((id, i, all) => all.indexOf(id) === i);
}

/** The names of the conditions of some ids, for words. */
export function conditionNames(project: Project, ids: string[] | undefined): string[] {
  return (ids ?? []).map((id) => project.conditions.find((c) => c.id === id)?.name).filter((n): n is string => !!n);
}

// ---- What an output sees -------------------------------------------------------------------------------------

/** A snippet's blocks written out in place of one snippet block: fresh ids made from the placing block's, and the placing block's conditions added to each. */
function writeOut(snippet: Snippet, placing: { id: string; conditions?: string[] }): Block[] {
  return snippet.blocks.map((part) => {
    const copy = JSON.parse(JSON.stringify(part)) as Block;
    copy.id = `${placing.id}.${part.id}`;
    if (copy.type === "procedure") copy.steps.forEach((s) => { s.id = `${placing.id}.${s.id}`; });
    const merged = [...new Set([...(placing.conditions ?? []), ...(part.conditions ?? [])])];
    if (merged.length) (copy as Block).conditions = merged; else delete (copy as { conditions?: string[] }).conditions;
    return copy;
  });
}

const visible = (ids: string[] | undefined, hidden: Set<string>) => !(ids ?? []).some((id) => hidden.has(id));

/**
 * The project as one output sees it: every snippet block written out in place, and everything that carries a condition the target hides left out (a hidden topic takes the topics under it with it, a
 * hidden step goes from its procedure, and a procedure left with no steps goes). With no target, nothing is hidden. The project that is passed in is not changed. A snippet block whose snippet is gone
 * is left out (the book check lists it).
 */
export function expandOutput(project: Project, targetId?: string | null): Project {
  const target = targetId ? project.targets.find((t) => t.id === targetId) : undefined;
  if (targetId && !target) throw new Error("There is no target with that id.");
  const hidden = new Set(target?.hide ?? []);
  const byId = new Map(project.snippets.map((s) => [s.id, s]));
  const blocksFor = (blocks: Block[]): Block[] => {
    const out: Block[] = [];
    for (const block of blocks) {
      if (!visible(block.conditions, hidden)) continue;
      if (block.type === "snippet") {
        const snippet = byId.get(block.snippetId);
        if (snippet) out.push(...writeOut(snippet, block).filter((b) => visible(b.conditions, hidden)).map(thin(hidden)).filter((b): b is Block => b !== null));
        continue;
      }
      const kept = thin(hidden)(block);
      if (kept) out.push(kept);
    }
    return out;
  };
  const walk = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .filter((n) => visible(n.conditions, hidden))
      .map((node) => ({ ...node, ...(node.page ? { page: { ...node.page, blocks: blocksFor(node.page.blocks) } } : {}), children: walk(node.children) }));
  const tree = walk(project.tree);
  const present = new Set<string>();
  eachNode(tree, (n) => present.add(n.id));
  return { ...project, tree, guides: project.guides.map((g) => ({ ...g, tasks: g.tasks.filter((id) => present.has(id)) })) };
}

/** A block without the steps the target hides; a procedure with none left is dropped (`null`). */
const thin = (hidden: Set<string>) => (block: Block): Block | null => {
  if (block.type !== "procedure") return block;
  const steps = block.steps.filter((s) => visible(s.conditions, hidden));
  return steps.length ? { ...block, steps } : null;
};

/** Does anything in the book carry this condition? For a note in the book check and a warning before one is removed. */
export function conditionUses(project: Project, conditionId: string): number {
  let count = 0;
  const mark = (ids: string[] | undefined) => { if ((ids ?? []).includes(conditionId)) count++; };
  eachNode(project.tree, (node) => {
    mark(node.conditions);
    for (const block of node.page?.blocks ?? []) {
      mark(block.conditions);
      if (block.type === "procedure") block.steps.forEach((s) => mark(s.conditions));
    }
  });
  for (const snippet of project.snippets) for (const b of snippet.blocks) { mark(b.conditions); if (b.type === "procedure") b.steps.forEach((s) => mark(s.conditions)); }
  return count;
}

/** What the Reuse window hands back: each snippet as its id, name and the text it is edited in. */
export interface ReuseChange {
  snippets: { id: string; name: string; text: string }[];
  conditions: Condition[];
  targets: Target[];
}

/**
 * Applies the Reuse window's choices to the project. A snippet that was taken out is deleted the way `deleteSnippet` does (where it was used the words stay as ordinary blocks). A snippet whose text did not change
 * keeps its blocks exactly (including any conditions on them); one that did is read from its text again. Conditions that were taken out are taken off every topic, block, step, snippet and target.
 * Returns how many places that used a deleted snippet now hold ordinary blocks.
 */
export function applyReuse(project: Project, change: ReuseChange): number {
  let places = 0;
  for (const old of [...project.snippets]) if (!change.snippets.some((s) => s.id === old.id)) places += deleteSnippet(project, old.id);
  const conditions = cleanConditions(change.conditions);
  const snippets: Snippet[] = [];
  for (const s of change.snippets) {
    const before = project.snippets.find((x) => x.id === s.id);
    const blocks = before && snippetToText(before.blocks) === s.text.replace(/\r\n?/g, "\n").trim() ? before.blocks : snippetFromText(s.text).blocks;
    snippets.push({ id: s.id, name: s.name, blocks });
  }
  const keep = (ids: string[] | undefined) => (ids ?? []).filter((id) => conditions.some((c) => c.id === id));
  project.snippets = cleanSnippets(snippets).map((s) => ({ ...s, blocks: s.blocks.map((b) => cleanBlockConditions(b, keep) as SnippetPart) }));
  project.conditions = conditions;
  project.targets = cleanTargets(change.targets, conditions);
  project.tree = cleanTreeConditions(project.tree, conditions);
  return places;
}
