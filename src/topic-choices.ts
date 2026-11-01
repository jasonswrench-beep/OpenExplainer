// The list of topics a link or a See also list can go to (format version 17), and narrowing it by what the author types. Pure, so it is tested without a screen; the dialog is in src/links-dialog.ts.
import { numbering, type Project, type TreeNode } from "./project/model.ts";
import { fillVariables } from "./render/html.ts";

export interface TopicChoice {
  id: string;
  /** What is shown and read: the number and the title, such as "4.2 Adding a text box". */
  label: string;
}

/** Every topic of the book with its number and title, in reading order. `leave` is a topic that is not offered (the one the link or the list is in). */
export function topicChoices(project: Project, leave?: string): TopicChoice[] {
  const numbers = numbering(project.tree);
  const out: TopicChoice[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.id !== leave) out.push({ id: node.id, label: `${numbers.get(node.id) ?? ""} ${fillVariables(node.title, project.variables)}`.trim() });
      walk(node.children);
    }
  };
  walk(project.tree);
  return out;
}

/** The choices whose words contain all of what was typed, ignoring capitals. Nothing typed gives them all. */
export function narrowChoices(choices: TopicChoice[], typed: string): TopicChoice[] {
  const parts = typed.toLowerCase().split(/\s+/).filter(Boolean);
  return parts.length === 0 ? choices : choices.filter((c) => parts.every((p) => c.label.toLowerCase().includes(p)));
}
