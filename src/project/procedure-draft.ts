// A numbered procedure made from a topic's click pictures, by rules (part 5 of docs/local-ai-plan.md). No AI is used and none is needed: a click note says exactly what kind of item was clicked, with what button, and (for buttons,
// menus and similar controls) what it is called, so a step can be written exactly. A real-model try showed that a small model reading only words adds little to such a step, can make it worse, and invents typing, which a click capture
// never records. Where the control has no name the step says what it can ("Click the text box.") and is flagged, so the author fills the name in.
//
// One step for each click picture of the topic that is not already in a step on its page, in the order of the pictures. A draft is made from them (kept apart from the page, see drafts.ts); the author accepts it.
// Everything here works without a screen.
import { letterFor } from "./callouts.ts";
import { describeClick } from "./clicks.ts";
import { isClickItem, isRealName } from "./click-item.ts";
import { addDraft, procedureWaiting, type ProcedureDraft, type ProcedureStep } from "./drafts.ts";
import { findNode, type Picture, type Project } from "./model.ts";
import { formatMarks } from "./text.ts";

/** How a kind of item is spoken of: the verb for a plain click, what goes round the name, and what to say when there is no name. */
interface Wording {
  verb: string;
  before: string;
  after: string;
  noName: string;
}

const KINDS: Record<string, Wording> = {
  button: { verb: "Click", before: "", after: "", noName: "the button" },
  "split button": { verb: "Click", before: "", after: "", noName: "the split button" },
  "menu item": { verb: "Choose", before: "", after: "", noName: "the menu item" },
  menu: { verb: "Open", before: "the ", after: " menu", noName: "the menu" },
  "menu bar": { verb: "Click", before: "the ", after: " menu bar", noName: "the menu bar" },
  "check box": { verb: "Tick", before: "", after: "", noName: "the check box" },
  "radio button": { verb: "Select", before: "", after: "", noName: "the radio button" },
  "combo box": { verb: "Open", before: "the ", after: " list", noName: "the list" },
  "text box": { verb: "Click", before: "the ", after: " box", noName: "the text box" },
  tab: { verb: "Click", before: "the ", after: " tab", noName: "the tab" },
  "tab list": { verb: "Click", before: "the ", after: " tab", noName: "the tab" },
  link: { verb: "Click", before: "the ", after: " link", noName: "the link" },
  "list item": { verb: "Select", before: "", after: "", noName: "the item" },
  "tree item": { verb: "Select", before: "", after: "", noName: "the item" },
  "data item": { verb: "Select", before: "", after: "", noName: "the item" },
  slider: { verb: "Click", before: "the ", after: " slider", noName: "the slider" },
  "spin box": { verb: "Click", before: "the ", after: " box", noName: "the number box" },
  "header item": { verb: "Click", before: "the ", after: " heading", noName: "the heading" },
};

/** The flag put on a step whose control has no name. */
export const NO_NAME_FLAG = "No name was available for this control, so the step only says what kind of control it is. Add its name if it helps the reader.";

/** The name of the clicked control and where it came from: first the author's own callout on it, then the name Windows gave (kept only for some kinds of control). */
export function controlName(picture: Picture): { name: string; source: string } | null {
  const callouts = picture.callouts ?? [];
  for (let i = 0; i < callouts.length; i++) {
    const callout = callouts[i];
    if (isClickItem(picture, callout) && isRealName(callout.name)) return { name: callout.name.replace(/\s+/g, " ").trim(), source: `callout ${letterFor(i)}` };
  }
  const named = picture.click?.target?.name;
  return named && isRealName(named) ? { name: named.replace(/\s+/g, " ").trim(), source: "Windows" } : null;
}

/** The step for one click picture. `null` if the picture has no click note. */
export function stepFor(picture: Picture): ProcedureStep | null {
  const click = picture.click;
  if (!click) return null;
  if (click.target?.password) return { pictureId: picture.id, text: "Click the password box.", from: describeClick(click) };
  const found = controlName(picture);
  const role = click.target?.role ?? "";
  const wording: Wording = KINDS[role] ?? { verb: "Click", before: "", after: "", noName: role ? `the ${role}` : "the item shown" };
  const plain = !click.double && click.button === "left";
  const verb = plain ? wording.verb : click.double ? "Double-click" : click.button === "right" ? "Right-click" : "Middle-click";
  const text = found
    ? formatMarks([{ text: `${verb} ${wording.before}` }, { text: found.name, mark: "control" }, { text: `${wording.after}.` }])
    : `${verb} ${wording.noName}.`;
  const step: ProcedureStep = { pictureId: picture.id, text, from: `${describeClick(click)}${found ? ` Name taken from ${found.source}.` : ""}` };
  if (!found) step.flag = NO_NAME_FLAG;
  return step;
}

export type ProcedurePlan = { ok: true; steps: ProcedureStep[] } | { ok: false; words: string };

/** The steps for a topic: one for each click picture that is not already in a step on its page, in the order of the pictures. */
export function planProcedure(project: Project, nodeId: string): ProcedurePlan {
  const node = findNode(project.tree, nodeId);
  if (!node) return { ok: false, words: "That topic was not found." };
  const clicks = node.pictures.filter((p) => p.click);
  if (clicks.length === 0) return { ok: false, words: "This topic has no click pictures to make steps from. Capture clicks into it first." };
  const used = new Set<string>();
  for (const block of node.page?.blocks ?? []) if (block.type === "procedure") for (const step of block.steps) if (step.pictureId) used.add(step.pictureId);
  const steps = clicks.filter((p) => !used.has(p.id)).map(stepFor).filter((s): s is ProcedureStep => s !== null);
  if (steps.length === 0) return { ok: false, words: "Every click picture of this topic is already in a step on its page." };
  return { ok: true, steps };
}

export type ProcedureResult = { ok: true; draft: ProcedureDraft; flagged: number } | { ok: false; words: string };

/** Makes the procedure draft for a topic and puts it in the project's drafts. Does nothing, and says why, if one is already waiting or there is nothing to make it from. */
export function draftProcedure(project: Project, nodeId: string, now: string): ProcedureResult {
  if (procedureWaiting(project, nodeId)) return { ok: false, words: "A procedure draft is already waiting for this topic. Open Drafts and accept or reject it first." };
  const plan = planProcedure(project, nodeId);
  if (!plan.ok) return plan;
  const kept = addDraft(project, { kind: "procedure", nodeId, steps: plan.steps, madeAt: now, by: "rule" });
  if (!kept || kept.kind !== "procedure") return { ok: false, words: "The procedure could not be made." };
  return { ok: true, draft: kept, flagged: kept.steps.filter((s) => s.flag).length };
}
