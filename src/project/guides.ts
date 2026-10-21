// Short step-by-step guides (format version 11). A guide is a few pages for one task, or for several: no chapters, no index, no contents. It is made of topics that are already in the book
// (`tasks`), so material is written once: the guide takes each topic's numbered steps, with their pictures, and the boxed notes between them. The guide only says which topics, in what order,
// which of two layouts it uses, and any step that uses the other layout. Nothing of the text is copied, so editing a topic changes the book and every guide made from it.
//   Picture on top: one picture across the page, with the step's words below it.
//   Pictures on the left: the picture and its zoomed focus stacked on the left, with the words beside them.
// Nothing here needs a screen or the disk.
import type { Picture, Project, TreeNode } from "./model.ts";
import { newId } from "./ids.ts";
import type { CalloutKind, Step } from "./page.ts";
import type { Run } from "./text.ts";
import type { PictureView } from "./views.ts";

export type GuideLayout = "top" | "left";

export const GUIDE_LAYOUTS: { id: GuideLayout; name: string; words: string }[] = [
  { id: "top", name: "Picture on top", words: "One picture across the page, with the words of the step below it. Best for wide windows and full-screen web pages." },
  { id: "left", name: "Pictures on the left", words: "The picture and a zoomed close-up of the clicked spot stacked on the left, with the words of the step beside them. Best for steps that need a wide view and a detail." },
];

export interface Guide {
  id: string;
  /** The guide's title, on its first page. */
  name: string;
  /** The topics whose steps make up the guide, in order (ids of topics in the book). One topic is one task. */
  tasks: string[];
  /** The layout of every step that has none of its own. */
  layout: GuideLayout;
  /** Steps that use the other layout, by the step's id. A step is not listed when it follows the guide. */
  stepLayouts?: Record<string, GuideLayout>;
  /** Show a zoomed focus on the clicked spot with each picture that has a click and is shown whole: under it, or beside it in the left layout. */
  zoomFocus: boolean;
}

export const DEFAULT_GUIDE_NAME = "New guide";

export function newGuide(name: string = DEFAULT_GUIDE_NAME, tasks: string[] = []): Guide {
  return { id: newId(), name, tasks: [...new Set(tasks)], layout: "top", zoomFocus: true };
}

/** What is wrong with a guide's name, in plain words, or `null` if it is fine. */
export function checkGuideName(name: string): string | null {
  return name.trim() ? null : "Give the guide a name. It is the title on its first page.";
}

// ---- Finding the topics a guide can use ----------------------------------------------------

const walk = (nodes: TreeNode[], into: TreeNode[] = []): TreeNode[] => {
  for (const node of nodes) {
    into.push(node);
    walk(node.children, into);
  }
  return into;
};

/** How many numbered steps are on a topic's page. */
export function stepCount(node: TreeNode): number {
  return (node.page?.blocks ?? []).reduce((total, block) => total + (block.type === "procedure" ? block.steps.length : 0), 0);
}

/** The topics a guide can be made of: those with at least one numbered step, in the order of the book. */
export function topicsWithSteps(tree: TreeNode[]): TreeNode[] {
  return walk(tree).filter((node) => stepCount(node) > 0);
}

/** A chapter's topics as a guide's tasks: the chapter itself (if it has steps) and every topic under it that has steps, in order. */
export function tasksFromChapter(tree: TreeNode[], chapterId: string): string[] {
  const chapter = walk(tree).find((node) => node.id === chapterId);
  return chapter ? walk([chapter]).filter((node) => stepCount(node) > 0).map((node) => node.id) : [];
}

// ---- Changing a guide ------------------------------------------------------------------------

/** Adds a topic as the last task. Returns false if it is already one, or is not in the book. */
export function addTask(guide: Guide, tree: TreeNode[], topicId: string): boolean {
  if (guide.tasks.includes(topicId) || !walk(tree).some((node) => node.id === topicId)) return false;
  guide.tasks.push(topicId);
  return true;
}

export function removeTask(guide: Guide, topicId: string): boolean {
  const at = guide.tasks.indexOf(topicId);
  if (at < 0) return false;
  guide.tasks.splice(at, 1);
  return true;
}

export function moveTask(guide: Guide, topicId: string, by: -1 | 1): boolean {
  const at = guide.tasks.indexOf(topicId);
  const to = at + by;
  if (at < 0 || to < 0 || to >= guide.tasks.length) return false;
  [guide.tasks[at], guide.tasks[to]] = [guide.tasks[to], guide.tasks[at]];
  return true;
}

/** Which layout a step uses: its own if it has one, else the guide's. */
export function layoutOf(guide: Guide, stepId: string): GuideLayout {
  return guide.stepLayouts?.[stepId] ?? guide.layout;
}

/** Gives a step its own layout, or (with `null`, or the layout the guide already has) lets it follow the guide again. */
export function setStepLayout(guide: Guide, stepId: string, layout: GuideLayout | null): void {
  if (layout === null || layout === guide.layout) {
    if (guide.stepLayouts) {
      delete guide.stepLayouts[stepId];
      if (Object.keys(guide.stepLayouts).length === 0) delete guide.stepLayouts;
    }
    return;
  }
  (guide.stepLayouts ??= {})[stepId] = layout;
}

/** The guide's layout was changed: steps that had their own layout keep it only if it differs from the new one, so a step never says what the guide already says. */
export function setGuideLayout(guide: Guide, layout: GuideLayout): void {
  guide.layout = layout;
  if (guide.stepLayouts) {
    for (const [id, own] of Object.entries(guide.stepLayouts)) if (own === layout) delete guide.stepLayouts[id];
    if (Object.keys(guide.stepLayouts).length === 0) delete guide.stepLayouts;
  }
}

// ---- What a guide is made of ---------------------------------------------------------------------

/** One step of a guide: the step, its number (it starts again at 1 for each numbered list), its picture and the layout it uses. */
export interface GuideStep {
  type: "step";
  number: number;
  step: Step;
  picture?: Picture;
  layout: GuideLayout;
}

export interface GuideBox {
  type: "box";
  kind: CalloutKind;
  text: Run[];
}

/** A task: a topic, with its steps and boxed notes in page order. Other blocks (paragraphs, headings, loose pictures) belong to the book and are not in a guide. */
export interface GuideTask {
  node: TreeNode;
  items: (GuideStep | GuideBox)[];
}

/** The tasks of a guide, taken from the book as it is now. A task whose topic is gone is left out. */
export function guideTasks(project: Pick<Project, "tree">, guide: Guide): GuideTask[] {
  const byId = new Map(walk(project.tree).map((node) => [node.id, node]));
  const tasks: GuideTask[] = [];
  for (const id of guide.tasks) {
    const node = byId.get(id);
    if (!node) continue;
    const items: GuideTask["items"] = [];
    for (const block of node.page?.blocks ?? []) {
      if (block.type === "callout") items.push({ type: "box", kind: block.kind, text: block.text });
      if (block.type !== "procedure") continue;
      block.steps.forEach((step, i) => {
        const picture = step.pictureId ? node.pictures.find((p) => p.id === step.pictureId) : undefined;
        items.push({ type: "step", number: i + 1, step, picture, layout: layoutOf(guide, step.id) });
      });
    }
    tasks.push({ node, items });
  }
  return tasks;
}

/** Every step of a guide, in order. */
export function guideSteps(project: Pick<Project, "tree">, guide: Guide): GuideStep[] {
  return guideTasks(project, guide).flatMap((task) => task.items.filter((item): item is GuideStep => item.type === "step"));
}

/** "2 tasks, 7 steps" in words, for the guide list. */
export function guideSummary(project: Pick<Project, "tree">, guide: Guide): string {
  const tasks = guideTasks(project, guide);
  const steps = tasks.reduce((total, task) => total + task.items.filter((i) => i.type === "step").length, 0);
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  return `${plural(tasks.length, "task")}, ${plural(steps, "step")}`;
}

/**
 * The zoomed focus that goes with a step's picture: the same picture zoomed in on the click, or `null` when there is none to show (the guide does not ask for one, the picture has no click, or the
 * author has already chosen a crop or a zoom for it, which is respected as it is).
 */
export function focusPicture(picture: Picture, guide: Pick<Guide, "zoomFocus">): Picture | null {
  if (!guide.zoomFocus || !picture.click || picture.view) return null;
  const view: PictureView = { kind: "zoom" };
  return { ...picture, view };
}

// ---- Cleaning what is read from or written to a file -----------------------------------------------

const LAYOUT_IDS = new Set<string>(GUIDE_LAYOUTS.map((l) => l.id));
const isLayout = (value: unknown): value is GuideLayout => typeof value === "string" && LAYOUT_IDS.has(value);
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Guides made only of what belongs in one: a name, tasks that are topics of the book (each once), a known layout, and step layouts that are known. Anything else is dropped. */
export function cleanGuides(raw: unknown, tree: TreeNode[]): Guide[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set(walk(tree).map((node) => node.id));
  const seen = new Set<string>();
  const guides: Guide[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const input = item as Record<string, unknown>;
    let id = typeof input.id === "string" && SAFE_ID.test(input.id) ? input.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    const name = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 200) : DEFAULT_GUIDE_NAME;
    const tasks = [...new Set((Array.isArray(input.tasks) ? input.tasks : []).filter((t): t is string => typeof t === "string" && known.has(t)))];
    const guide: Guide = { id, name, tasks, layout: isLayout(input.layout) ? input.layout : "top", zoomFocus: input.zoomFocus !== false };
    if (typeof input.stepLayouts === "object" && input.stepLayouts !== null && !Array.isArray(input.stepLayouts)) {
      const own: Record<string, GuideLayout> = {};
      for (const [stepId, layout] of Object.entries(input.stepLayouts as Record<string, unknown>)) {
        if (SAFE_ID.test(stepId) && isLayout(layout) && layout !== guide.layout) own[stepId] = layout;
      }
      if (Object.keys(own).length > 0) guide.stepLayouts = own;
    }
    guides.push(guide);
  }
  return guides;
}
