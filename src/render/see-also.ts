// The See also list of a topic as HTML (format version 17): the other topics the author chose, each as a link with its number and title. In the book the numbers are plain words after the link,
// as for a link in the text; where a link is not possible (a guide) nothing is written. Nothing here needs a screen.
import type { TreeNode } from "../project/model.ts";
import { esc, fillVariables, type RenderContext } from "./html.ts";

/** The See also section of a topic, or nothing when it has no list or no topic of the list is in the book. `level` is the heading level of the topic's own title. */
export function seeAlsoHtml(ctx: RenderContext, node: TreeNode, level: number): string {
  const links = ctx.topicLinks;
  if (!links || !node.seeAlso?.length) return "";
  const titles = new Map<string, string>();
  const collect = (nodes: TreeNode[]) => nodes.forEach((n) => { titles.set(n.id, n.title); collect(n.children); });
  collect(ctx.project.tree);
  const items = node.seeAlso
    .filter((id) => links.number(id) !== null && titles.has(id))
    .map((id) => {
      const number = links.number(id)!;
      const page = links.pages?.get(id);
      const after = links.showNumber ? `<span class="pv-ref"> (${esc(number)})${page !== undefined ? `, page ${esc(page)}` : ""}</span>` : "";
      return `<li><a class="topic-link" ${links.attrs(id)}>${esc(fillVariables(titles.get(id)!, ctx.project.variables))}</a>${after}</li>`;
    });
  if (items.length === 0) return "";
  const heading = Math.min(6, level + 1);
  return `\n<section class="pv-see-also"><h${heading}>See also</h${heading}><ul>${items.join("")}</ul></section>`;
}
