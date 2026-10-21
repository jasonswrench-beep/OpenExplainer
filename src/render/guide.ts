// A short step-by-step guide as HTML: the guide's title, then each task as a sheet with its steps. A step is a heading ("Step 3"), its picture with the step's number on the clicked
// spot, a zoomed close-up of that spot when the guide asks for one, and the words of the step, laid out in one of two ways:
//   top:  the picture across the page, the close-up under it, the words below.
//   left: the picture and its close-up stacked on the left, the words beside them.
// The words come from the book's own topics (nothing is copied), so this reads the same as the book and changes with it. The pictures use the quick-guide settings for the click circle and
// the zoom size. It is an approximation drawn as sheets, like the print preview; real page breaks are made when a guide is exported. Comments are never part of it. Nothing here needs a screen.
import { focusPicture, guideTasks, type Guide, type GuideStep } from "../project/guides.ts";
import { plainText } from "../project/text.ts";
import { boxHtml, esc, figureHtml, fillVariables, noteHtml, runsHtml, type RenderContext } from "./html.ts";

export interface GuidePreview {
  html: string;
  /** What the writer should look at, in words. */
  notes: string[];
}

function stepHtml(ctx: RenderContext, guide: Guide, item: GuideStep, where: string): string {
  const { step, picture } = item;
  const words = fillVariables(plainText(step.text), ctx.project.variables);
  const options = { stepNumber: item.number, altFallback: words };
  let pictures = "";
  if (picture) {
    const focus = focusPicture(picture, guide);
    const whole = figureHtml(ctx, picture, where, { ...options, noSmallNote: focus !== null });
    const close = focus ? `<div class="gd-closeup">${figureHtml(ctx, focus, where, { ...options, closeUp: true })}</div>` : "";
    pictures = `<div class="gd-pictures">${whole}${close}</div>`;
  }
  const result = step.result && step.result.length ? `<p class="pv-result"><strong>Result:</strong> ${runsHtml(ctx, step.result)}</p>` : "";
  const text = `<div class="gd-words"><p class="gd-step-text">${runsHtml(ctx, step.text)}</p>${result}</div>`;
  return `<section class="gd-step gd-step-${item.layout}${picture ? "" : " gd-step-nopicture"}" data-layout="${item.layout}"><h3 class="gd-step-heading">Step ${item.number}</h3>${pictures}${text}</section>`;
}

/** Writes a guide as it will print, approximately. */
export function renderGuide(base: RenderContext, guide: Guide): GuidePreview {
  const notes: string[] = [];
  // A guide's pictures follow the quick-guide settings for the click circle and the zoom size.
  const ctx: RenderContext = { ...base, place: "guide", onNote: (words) => { notes.push(words); base.onNote?.(words); } };
  const title = esc(fillVariables(guide.name, ctx.project.variables));
  const tasks = guideTasks(ctx.project, guide);
  const sheets = tasks.map((task, index) => {
    const taskTitle = fillVariables(task.node.title, ctx.project.variables);
    const where = `${guide.name}, ${task.node.title}`;
    const items = task.items.map((item) => (item.type === "step" ? stepHtml(ctx, guide, item, `${where}, step ${item.number}`) : boxHtml(ctx, item.kind, item.text))).join("\n");
    const empty = task.items.length === 0 ? noteHtml(ctx, `The topic "${task.node.title}" has no numbered steps, so nothing of it is in the guide.`, guide.name) : "";
    return `<section class="pv-sheet gd-sheet gd-task">${index === 0 ? `<h1 class="gd-title">${title}</h1>` : ""}<h2 class="gd-task-title">${esc(taskTitle)}</h2>\n${items}${empty}</section>`;
  });
  if (tasks.length === 0) {
    sheets.push(`<section class="pv-sheet gd-sheet"><h1 class="gd-title">${title}</h1>${noteHtml(ctx, "This guide has no tasks yet. Choose Guides, then add topics that have numbered steps.", guide.name)}</section>`);
  }
  return { html: `<div class="pv-book gd-guide">${sheets.join("\n")}</div>`, notes };
}
