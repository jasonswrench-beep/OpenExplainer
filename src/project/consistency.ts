// The consistency check (part 6c of docs/local-ai-plan.md): three plain rules that read the book and need no AI, so they work with AI help off, are exact and instant, and say the exact words and place like the rest of the book check.
// A real-model try (2026-10-22) showed a small model judging text against rules is wrong more often than right, so none of this asks one.
//
//   1. A control named in a step or paragraph (marked [[like this]]) that differs from the name the program showed when it was clicked ("Save as" written, "Save as..." captured).
//   2. A step whose first word does not suit the kind of control it names ("Press" for a button, "Click" for a menu item).
//   3. A word or phrase on the author's Words to avoid list.
//
// Each finding is a note the author can ignore (the check only ever advises), and each is worked out from the book every time and never stored. Everything here works without a screen.
import { letterFor } from "./callouts.ts";
import { isRealName } from "./click-item.ts";
import type { Picture, Project, TreeNode } from "./model.ts";
import type { AvoidWord } from "./avoid-words.ts";
import { calloutLabel, type Block, type Step } from "./page.ts";
import { plainText, type Run } from "./text.ts";

export type ConsistencyKind = "control-name" | "step-verb" | "avoid-word";

export interface ConsistencyIssue {
  key: string;
  kind: ConsistencyKind;
  nodeId: string;
  where: string;
  pictureId?: string;
  blockId?: string;
  words: string;
  fix: string;
}

const squeeze = (text: string): string => text.replace(/\s+/g, " ").trim();

/** A control's name with what does not matter taken off: the access-key mark (&), a closing "..." or ":" and capitals, so "Save as" and "&Save As..." are the same control. */
export function normalName(name: string): string {
  return squeeze(name.replace(/&(?=[\p{L}\p{N}])/gu, "").replace(/[.…:\s]+$/u, "")).toLowerCase();
}

// ---- What the program called its controls ---------------------------------------------------------------------------------------

export interface KnownControl {
  /** The exact names Windows gave this control when it was clicked, and how many pictures had each. */
  names: Map<string, number>;
  /** The kinds of item it was ("button", "menu item"). */
  roles: Set<string>;
}

/** Controls by `normalName`. */
export type KnownControls = Map<string, KnownControl>;

/** Every control the book has a click picture of, with its captured name and kind. A name Windows gave that is only a placeholder, and a password box, are left out. */
export function knownControls(project: Project): KnownControls {
  const known: KnownControls = new Map();
  const visit = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      for (const picture of node.pictures) {
        const target = picture.click?.target;
        if (!target || target.password || !target.name || !isRealName(target.name)) continue;
        const name = squeeze(target.name);
        const key = normalName(name);
        if (key === "") continue;
        const entry = known.get(key) ?? { names: new Map<string, number>(), roles: new Set<string>() };
        entry.names.set(name, (entry.names.get(name) ?? 0) + 1);
        if (target.role) entry.roles.add(target.role);
        known.set(key, entry);
      }
      visit(node.children);
    }
  };
  visit(project.tree);
  return known;
}

/** The name captured most often for a control. */
const usualName = (control: KnownControl): string => [...control.names].sort((a, b) => b[1] - a[1])[0][0];

// ---- Which verb suits which control ---------------------------------------------------------------------------------------------

/** Verbs a step may start with, so a step that starts with anything else ("In the window, click Save.") is not judged. */
const ACTION_VERBS = new Set(["click", "choose", "select", "press", "tick", "check", "open", "tap", "hit", "push", "pick"]);

/**
 * For each kind of item, the action verbs that suit it. The first is the one the Drafts procedure writes (a test keeps them the same). A double-click or right-click is never judged: it is deliberate.
 */
export const SUITS: Record<string, string[]> = {
  button: ["click"],
  "split button": ["click"],
  "menu item": ["choose"],
  menu: ["open", "click", "choose"],
  "menu bar": ["click", "choose"],
  "check box": ["tick", "select", "check"],
  "radio button": ["select", "choose"],
  "combo box": ["open", "click", "select", "choose"],
  "text box": ["click", "select"],
  tab: ["click", "select", "choose"],
  "tab list": ["click", "select", "choose"],
  link: ["click", "select"],
  "list item": ["select", "choose"],
  "tree item": ["select", "choose"],
  "data item": ["select", "choose"],
  slider: ["click"],
  "spin box": ["click"],
  "header item": ["click"],
};

const capital = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

function firstWord(runs: Run[]): string {
  return plainText(runs).trim().match(/^\p{L}[\p{L}-]*/u)?.[0].toLowerCase() ?? "";
}

/** What kind of item a control is, if the book says so without doubt: from the click pictures of the same name, or from the step's own click picture. */
function roleOf(name: string, known: KnownControls, picture: Picture | undefined, controlCount: number): string | null {
  const key = normalName(name);
  const roles = new Set<string>(known.get(key)?.roles ?? []);
  const target = picture?.click?.target;
  if (target?.role && !target.password) {
    const pictureName = target.name && isRealName(target.name) ? normalName(target.name) : null;
    if (pictureName === key || (pictureName === null && controlCount === 1)) roles.add(target.role);
  }
  return roles.size === 1 ? [...roles][0] : null;
}

// ---- Words to avoid ---------------------------------------------------------------------------------------------------------------

const MASK = "";

/** A word or phrase on its own (not inside a longer word), whatever the capitals. */
function avoidPattern(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu");
}

/** A short piece of the text around a match, so the author can see where it is. */
function excerpt(text: string, at: number, length: number): string {
  const from = Math.max(0, at - 28);
  const to = Math.min(text.length, at + length + 28);
  return `${from > 0 ? "…" : ""}${text.slice(from, to).replace(/\s+/g, " ").trim()}${to < text.length ? "…" : ""}`;
}

interface Place {
  id: string;
  /** Where it is, in words ("block 2 (paragraph)"). */
  label: string;
  /** The words. */
  real: string;
  /** The same, with the words of control names blanked, so a control called "File" is not found as the word file. */
  masked: string;
  pictureId?: string;
  blockId?: string;
}

function placeOfRuns(id: string, label: string, runs: Run[], extra: { pictureId?: string; blockId?: string } = {}): Place {
  let real = "";
  let masked = "";
  for (const run of runs) {
    real += run.text;
    masked += run.mark === "control" ? MASK.repeat(run.text.length) : run.text;
  }
  return { id, label, real, masked, ...extra };
}

const placeOfText = (id: string, label: string, text: string, extra: { pictureId?: string; blockId?: string } = {}): Place => ({ id, label, real: text, masked: text, ...extra });

function blockName(block: Block, i: number): string {
  return `block ${i + 1} (${block.type === "callout" ? `callout box, ${calloutLabel(block.kind)}` : block.type})`;
}

/** Every place in a topic where words are written for the reader, except control names and callout names. */
function placesOf(node: TreeNode): Place[] {
  const out: Place[] = [placeOfText("title", "the title", node.title)];
  (node.page?.blocks ?? []).forEach((block, i) => {
    const at = blockName(block, i);
    if (block.type === "heading") out.push(placeOfText(block.id, at, block.text, { blockId: block.id }));
    else if (block.type === "paragraph" || block.type === "callout") out.push(placeOfRuns(block.id, at, block.text, { blockId: block.id }));
    else if (block.type === "procedure") {
      block.steps.forEach((step, s) => {
        out.push(placeOfRuns(`${block.id}:${step.id}`, `step ${s + 1} of ${at}`, step.text, { blockId: block.id }));
        if (step.result) out.push(placeOfRuns(`${block.id}:${step.id}:result`, `the result line of step ${s + 1} of ${at}`, step.result, { blockId: block.id }));
      });
    }
  });
  for (const picture of node.pictures) {
    const label = picture.altText.trim() || picture.source.originalName || picture.file;
    if (picture.altText.trim()) out.push(placeOfText(`alt:${picture.id}`, `the description of the picture "${label}"`, picture.altText, { pictureId: picture.id }));
    (picture.callouts ?? []).forEach((callout, c) => {
      if (callout.description.trim()) out.push(placeOfText(`callout:${picture.id}:${callout.id}`, `the sentence of callout ${letterFor(c)} on the picture "${label}"`, callout.description, { pictureId: picture.id }));
    });
  }
  return out;
}

// ---- The check ---------------------------------------------------------------------------------------------------------------------

/**
 * The consistency notes for one topic, in the order they appear on its page (name and verb notes block by block), then the words to avoid. `where` is the topic's number and title.
 */
export function consistencyIssues(node: TreeNode, where: string, known: KnownControls, avoid: AvoidWord[]): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const base = { nodeId: node.id, where };
  const blocks = node.page?.blocks ?? [];

  const checkNames = (runs: Run[], at: string, blockId: string, keyOf: (key: string) => string) => {
    for (const run of runs) {
      if (run.mark !== "control") continue;
      const written = squeeze(run.text);
      const control = known.get(normalName(written));
      if (!control || control.names.has(written)) continue;
      const shown = usualName(control);
      issues.push({ ...base, blockId, key: keyOf(normalName(written)), kind: "control-name", words: `${capital(at)} of "${where}" writes the control as "${written}", but the program showed "${shown}" when it was clicked.`, fix: `Write it as "${shown}", the way the program shows it, or ignore this if you mean it.` });
    }
  };

  blocks.forEach((block, i) => {
    const at = blockName(block, i);
    if (block.type === "paragraph" || block.type === "callout") {
      checkNames(block.text, at, block.id, (key) => `control-name:${node.id}:${block.id}:${key}`);
    } else if (block.type === "procedure") {
      block.steps.forEach((step: Step, s) => {
        const stepAt = `step ${s + 1} of ${at}`;
        checkNames(step.text, stepAt, block.id, (key) => `control-name:${node.id}:${block.id}:${step.id}:${key}`);
        if (step.result) checkNames(step.result, `the result line of ${stepAt}`, block.id, (key) => `control-name:${node.id}:${block.id}:${step.id}:result:${key}`);

        const controls = step.text.filter((r) => r.mark === "control");
        const verb = firstWord(step.text);
        if (controls.length === 0 || !ACTION_VERBS.has(verb)) return;
        const name = squeeze(controls[0].text);
        const picture = node.pictures.find((p) => p.id === step.pictureId);
        const role = roleOf(name, known, picture, controls.length);
        const suits = role ? SUITS[role] : undefined;
        if (!role || !suits || suits.includes(verb)) return;
        issues.push({
          ...base,
          blockId: block.id,
          key: `step-verb:${node.id}:${block.id}:${step.id}`,
          kind: "step-verb",
          words: `${capital(stepAt)} of "${where}" starts with "${capital(verb)}" for the ${role} "${name}". The usual word for a ${role} is "${capital(suits[0])}".`,
          fix: `Start the step with "${capital(suits[0])}", or ignore this if you chose "${capital(verb)}" on purpose.`,
        });
      });
    }
  });

  if (avoid.length > 0) {
    const places = placesOf(node);
    for (const word of avoid) {
      const pattern = avoidPattern(word.avoid);
      for (const place of places) {
        const found = pattern.exec(place.masked);
        if (!found) continue;
        issues.push({
          ...base,
          ...(place.blockId ? { blockId: place.blockId } : {}),
          ...(place.pictureId ? { pictureId: place.pictureId } : {}),
          key: `avoid-word:${node.id}:${place.id}:${word.avoid.toLowerCase()}`,
          kind: "avoid-word",
          words: `${capital(place.label)} of "${where}" uses "${found[0]}", a word on your Words to avoid list: ${excerpt(place.real, found.index, found[0].length)}`,
          fix: word.use ? `Use "${word.use}" instead, or ignore this if it is right here.` : "Use another word, or ignore this if it is right here.",
        });
      }
    }
  }
  return issues;
}
