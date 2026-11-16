// A guide's steps as a script for OpenStage Studio (list item 2): the file Studio's player performs to make a narrated video of the same task.
// The format is Studio's own, "openstage-studio-script" version 2 (its docs/script-format.md and docs/accessibility-driver.md); this file only writes
// it. Nothing is guessed: a step's words become its narration, the item that was clicked is found by its kind and name, and what the author has to
// say (which program, which demo project, the goal) is asked for and never made up.
//
// What Studio can do with a step decides what is written:
// * a click on a named item becomes a click found by its role and name (the accessibility driver, which needs no hook in the program);
// * a click with no name that can be kept (a text box, a list item) cannot be found by Studio's player, which needs a control name or an id, so it is only spoken and counted;
// * a step with no click is only spoken (a one second wait), because a guide's step holds words, not typing;
// * a right-click or double-click is sent as a click, and counted.
import { guideTasks, type Guide } from "../project/guides.ts";
import { expandVariables, type Project } from "../project/model.ts";
import { plainText } from "../project/text.ts";

export const STUDIO_FORMAT = "openstage-studio-script";
export const STUDIO_VERSION = 2;
/** Studio's limits (its validator): a title, the number of steps. */
export const STUDIO_MOST_STEPS = 200;
export const STUDIO_MOST_TITLE = 100;

export interface StudioOptions {
  /** The program the guide is about, as the viewer sees it on the title card. */
  programName: string;
  programVersion?: string;
  /** A demo project in the program's demo library, by name. Never a path. */
  demoProject: string;
  /** One line: what the viewer can do after watching. */
  goal: string;
}

export interface StudioStep {
  action: "click" | "wait";
  fallback?: { role?: string; name?: string };
  value?: string;
  narration?: string;
  silent?: boolean;
  expect?: string;
  chapter?: string;
}

export interface StudioScript {
  format: typeof STUDIO_FORMAT;
  version: typeof STUDIO_VERSION;
  title: string;
  goal: string;
  program: { id: string; name: string; version?: string };
  driver: "accessibility";
  startState: { demoProject: string; note: string };
  steps: StudioStep[];
}

export type StudioResult = { ok: true; script: StudioScript; text: string; notes: string[] } | { ok: false; message: string };

/** The words OpenExplainer uses for a kind of clicked item, and Studio's for the same (its accessibility driver's roles). Others are found by name alone. */
const STUDIO_ROLES: Record<string, string> = {
  button: "button",
  "split button": "button",
  "check box": "checkbox",
  "combo box": "combobox",
  "text box": "textbox",
  link: "link",
  "list item": "listitem",
  "menu item": "menuitem",
  "radio button": "radio",
  slider: "slider",
  tab: "tab",
  "tree item": "treeitem",
};

/** A short stable name for a program: lower case letters, digits and hyphens, as Studio's validator asks. */
export function programId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63).replace(/-+$/g, "");
  return slug || "program";
}

/** Looks like a file path or a drive, which a demo project's name must not (Studio refuses them). */
export function looksLikePath(text: string): boolean {
  return /[\\/:]/.test(text) || /^[.~]/.test(text);
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

/** The asked-for details, checked, in the words a person can act on. `null` when they are fine. */
export function checkStudioOptions(options: StudioOptions): string | null {
  if (flat(options.programName) === "") return "Type the name of the program the guide is about, as it should be on the video's title card.";
  if (flat(options.goal) === "") return "Type the goal: one line saying what a viewer can do after watching.";
  const demo = flat(options.demoProject);
  if (demo === "") return "Type the name of the demo project the video starts from. It is a name in the program's own demo library.";
  if (looksLikePath(demo)) return `"${demo}" looks like a file path. Studio wants the name of a demo project, never a path.`;
  return null;
}

/**
 * The script for a guide. Every step of the guide's tasks, in order, is a step of the script; each task starts a chapter of the video. A guide with no steps,
 * more than 200, or a title that is too long is refused in words, as is a missing program, goal or demo project.
 */
export function studioScript(project: Pick<Project, "tree" | "variables">, guide: Guide, options: StudioOptions): StudioResult {
  const problem = checkStudioOptions(options);
  if (problem) return { ok: false, message: problem };
  if (flat(guide.name).length > STUDIO_MOST_TITLE) return { ok: false, message: `The guide's name is longer than ${STUDIO_MOST_TITLE} characters, which Studio's title card cannot hold. Shorten it in Guides first.` };
  const steps: StudioStep[] = [];
  let unnamed = 0;
  let noClick = 0;
  let doubles = 0;
  let others = 0;
  for (const task of guideTasks(project, guide)) {
    let first = true;
    for (const item of task.items) {
      if (item.type !== "step") continue;
      // The book's variables are filled in, as they are in every other output.
      const said = (runs: Parameters<typeof plainText>[0]) => flat(expandVariables(plainText(runs), project.variables));
      const words = said(item.step.text);
      const result = item.step.result ? said(item.step.result) : "";
      const click = item.picture?.click;
      // Studio can only click an item it can find by its name, so a click with no name that was kept is only spoken, like a step with no click.
      const name = click?.target?.name;
      const step: StudioStep = click && name ? { action: "click" } : { action: "wait", value: "1" };
      if (click && name) {
        const role = click.target?.role ? STUDIO_ROLES[click.target.role] : undefined;
        step.fallback = { ...(role ? { role } : {}), name };
        if (click.double) doubles++;
        else if (click.button !== "left") others++;
      } else if (click) {
        unnamed++;
      } else {
        noClick++;
      }
      if (words) step.narration = words;
      else step.silent = true;
      if (result) step.expect = result;
      if (first) {
        step.chapter = flat(task.node.title).slice(0, 80) || undefined;
        if (!step.chapter) delete step.chapter;
        first = false;
      }
      steps.push(step);
    }
  }
  if (steps.length === 0) return { ok: false, message: "This guide has no steps, so there is nothing to make a script of. Add tasks with numbered steps to it in Guides." };
  if (steps.length > STUDIO_MOST_STEPS) return { ok: false, message: `This guide has ${steps.length} steps, and Studio's script holds at most ${STUDIO_MOST_STEPS}. Make the guide shorter, or two guides.` };
  const name = flat(options.programName);
  const version = flat(options.programVersion ?? "");
  const script: StudioScript = {
    format: STUDIO_FORMAT,
    version: STUDIO_VERSION,
    title: flat(guide.name),
    goal: flat(options.goal),
    program: { id: programId(name), name, ...(version ? { version } : {}) },
    driver: "accessibility",
    startState: { demoProject: flat(options.demoProject), note: "Made from an OpenExplainer guide. Check each step in Studio's review before recording." },
    steps,
  };
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const notes: string[] = [];
  if (unnamed) notes.push(`${plural(unnamed, "click is", "clicks are")} on an item whose name is not kept (a text box, a list item, a tab), so Studio could not find ${unnamed === 1 ? "it" : "them"}: ${unnamed === 1 ? "it is" : "they are"} only spoken (a one second pause). Name the control in Studio's review to make ${unnamed === 1 ? "it" : "them"} a click.`);
  if (noClick) notes.push(`${plural(noClick, "step has", "steps have")} no click, so ${noClick === 1 ? "it is" : "they are"} only spoken (a one second pause). A guide's step holds words, not typing.`);
  if (doubles + others) notes.push(`${plural(doubles + others, "step was", "steps were")} a double-click or a right-click; Studio's script has only a click, so ${doubles + others === 1 ? "it was" : "they were"} written as one.`);
  notes.push("The narration is the step's own words. Studio warns about narration of more than two sentences.");
  return { ok: true, script, text: `${JSON.stringify(script, null, 2)}\n`, notes };
}

/** A file name for the script: the guide's name, kept to letters, digits and spaces. */
export function studioFileName(guideName: string): string {
  const name = flat(guideName).replace(/[\\/:*?"<>|]+/g, "").trim() || "guide";
  return `${name}.studio-script.json`;
}
