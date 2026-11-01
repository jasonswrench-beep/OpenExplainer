// Choosing topics to link to (format version 17): one topic for a link in the text, or up to a few for a topic's See also list. The list is every chapter and topic of the book with its number, a box above it narrows
// the list by what is typed, and everything is done by keyboard: Tab goes to the list, the arrow keys and Space choose, Enter or the button keeps the choice, Escape cancels. A choice is never changed until the
// author keeps it. Nothing here touches the project: the caller does that with what comes back.
import { open } from "./dialogs.ts";
import { MOST_SEE_ALSO } from "./project/links.ts";
import type { Project } from "./project/model.ts";
import { narrowChoices, topicChoices, type TopicChoice } from "./topic-choices.ts";

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Asks for one topic. Returns its id, or `null` if the author cancels. */
export async function chooseTopicDialog(project: Project, options: { heading: string; help: string; leave?: string }): Promise<string | null> {
  const choices = topicChoices(project, options.leave);
  const answer = await pick({ ...options, choices, chosen: [], multiple: false });
  return answer ? answer[0] ?? null : null;
}

/** Asks for the topics of a See also list. Returns the ids in the order of the book, or `null` if the author cancels. */
export async function chooseSeeAlsoDialog(project: Project, options: { heading: string; help: string; leave?: string; chosen: string[] }): Promise<string[] | null> {
  return pick({ ...options, choices: topicChoices(project, options.leave), multiple: true });
}

async function pick(options: { heading: string; help: string; choices: TopicChoice[]; chosen: string[]; multiple: boolean }): Promise<string[] | null> {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "lt-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="lt-title">${esc(options.heading)}</h2>
      <p class="help" id="lt-help">${esc(options.help)}</p>
      <p><label for="lt-find">Narrow the list by typing part of a title or a number</label><br><input id="lt-find" type="text" size="40" aria-describedby="lt-count" autocomplete="off"></p>
      <p id="lt-count" class="help" role="status"></p>
      <div id="lt-list" role="group" aria-labelledby="lt-title" aria-describedby="lt-help" class="topic-picker"></div>
      <p id="lt-chosen" class="help" role="status"></p>
      <p><button value="ok" id="lt-ok">${options.multiple ? "Keep these topics" : "Link to this topic"}</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  const find = dialog.querySelector<HTMLInputElement>("#lt-find")!;
  const count = dialog.querySelector<HTMLElement>("#lt-count")!;
  const list = dialog.querySelector<HTMLElement>("#lt-list")!;
  const summary = dialog.querySelector<HTMLElement>("#lt-chosen")!;
  const ok = dialog.querySelector<HTMLButtonElement>("#lt-ok")!;
  const kind = options.multiple ? "checkbox" : "radio";
  const chosen = new Set(options.chosen);
  let one = options.chosen[0] ?? "";

  const words = () => (options.multiple
    ? chosen.size === 0 ? "No topics chosen." : `${chosen.size} of at most ${MOST_SEE_ALSO} chosen.`
    : one ? "One topic chosen." : "No topic chosen yet.");
  const draw = () => {
    const shown = narrowChoices(options.choices, find.value);
    list.replaceChildren();
    for (const choice of shown) {
      const label = document.createElement("label");
      label.className = "topic-pick";
      const input = document.createElement("input");
      input.type = kind;
      input.name = "lt-topic";
      input.value = choice.id;
      input.checked = options.multiple ? chosen.has(choice.id) : one === choice.id;
      input.addEventListener("change", () => {
        if (options.multiple) {
          if (input.checked && chosen.size >= MOST_SEE_ALSO) {
            input.checked = false;
            summary.textContent = `A See also list holds at most ${MOST_SEE_ALSO} topics. Clear one first.`;
            return;
          }
          if (input.checked) chosen.add(choice.id); else chosen.delete(choice.id);
        } else one = choice.id;
        summary.textContent = words();
        ok.disabled = !options.multiple && !one;
      });
      label.append(input, ` ${choice.label}`);
      list.append(label, document.createElement("br"));
    }
    count.textContent = shown.length === 0 ? "No topic matches what you typed." : `${shown.length} ${shown.length === 1 ? "topic" : "topics"} shown.`;
  };
  find.addEventListener("input", draw);
  // Enter in the box narrows nothing more and does not close the dialog by accident; the buttons do that.
  find.addEventListener("keydown", (event) => { if (event.key === "Enter") event.preventDefault(); });
  dialog.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    dialog.close((event.submitter as HTMLButtonElement | null)?.value === "cancel" ? "cancel" : "ok");
  });
  draw();
  summary.textContent = words();
  ok.disabled = !options.multiple && !one;
  await open(dialog, find);
  if (dialog.returnValue !== "ok") return null;
  if (options.multiple) return options.choices.filter((c) => chosen.has(c.id)).map((c) => c.id);
  return one ? [one] : null;
}
