// Click notes: what a click-by-click capture records beside a picture.
// Everything here is checked on the way in and on the way out, so nothing outside the agreed list is ever kept,
// and a password box is never described beyond the fact that it was clicked.
import type { ClickButton, ClickInfo, ClickTarget, TreeNode } from "./model.ts";

const BUTTONS: ClickButton[] = ["left", "right", "middle"];

/** Windows can give very long names (a whole paragraph for some items). Anything longer is cut. */
export const MOST_TEXT = 300;

const number = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null);

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, MOST_TEXT);
  return trimmed === "" ? undefined : trimmed;
}

function cleanTarget(raw: unknown): ClickTarget | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const input = raw as Record<string, unknown>;
  // A password box: keep only the fact. Its name, role, description and outline are all dropped.
  if (input.password === true) return { password: true };
  const target: ClickTarget = {};
  const name = text(input.name);
  const role = text(input.role);
  const acceleratorKey = text(input.acceleratorKey);
  const accessKey = text(input.accessKey);
  const description = text(input.description);
  if (name) target.name = name;
  if (role) target.role = role;
  if (acceleratorKey) target.acceleratorKey = acceleratorKey;
  if (accessKey) target.accessKey = accessKey;
  if (description) target.description = description;
  const b = input.bounds as Record<string, unknown> | undefined;
  if (b && typeof b === "object") {
    const [x, y, width, height] = [number(b.x), number(b.y), number(b.width), number(b.height)];
    if (x !== null && y !== null && width !== null && height !== null && width > 0 && height > 0) target.bounds = { x, y, width, height };
  }
  return Object.keys(target).length > 0 ? target : undefined;
}

/**
 * A click note made only of the parts that belong in a project, or null when it is not a click note at all.
 * Anything extra is dropped (for example text that was in a box), and a password box is reduced to the fact that it was clicked.
 */
export function cleanClick(raw: unknown): ClickInfo | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const x = number(input.x);
  const y = number(input.y);
  if (x === null || y === null) return null;
  if (!BUTTONS.includes(input.button as ClickButton)) return null;
  const click: ClickInfo = { x, y, button: input.button as ClickButton };
  if (input.double === true) click.double = true;
  const target = cleanTarget(input.target);
  if (target) click.target = target;
  return click;
}

/**
 * A copy of the tree in which every click note has been cleaned. A note that is not valid is dropped and the picture is kept,
 * because the picture and its description are the author's work.
 */
export function cleanClicks(tree: TreeNode[]): TreeNode[] {
  const walk = (nodes: TreeNode[]): TreeNode[] =>
    nodes.map((node) => ({
      ...node,
      pictures: (node.pictures ?? []).map((picture) => {
        const { click, ...rest } = picture;
        const clean = click === undefined ? null : cleanClick(click);
        return clean ? { ...rest, click: clean } : rest;
      }),
      children: walk(node.children ?? []),
    }));
  return walk(tree);
}

/** A click said in plain words, for a screen reader and for the picture list. */
export function describeClick(click: ClickInfo): string {
  const how = click.double ? "Double-click" : click.button === "left" ? "Click" : click.button === "right" ? "Right-click" : "Middle-click";
  const target = click.target;
  if (target?.password) return `${how} on a password box.`;
  const kind = target?.role ?? "item";
  const named = target?.name ? ` "${target.name}"` : "";
  const keys: string[] = [];
  if (target?.acceleratorKey) keys.push(`shortcut ${target.acceleratorKey}`);
  if (target?.accessKey) keys.push(`access key ${target.accessKey}`);
  const extra = keys.length > 0 ? ` (${keys.join(", ")})` : "";
  if (!target) return `${how} at ${click.x} across and ${click.y} down.`;
  return `${how} on the ${kind}${named}${extra}.`;
}

/** The details of a click for the picture list, one plain sentence each: where it was, what Windows said about the item, and its outline. */
export function describeClickDetails(click: ClickInfo): string[] {
  const how = click.double ? "Double-click" : click.button === "left" ? "Click" : click.button === "right" ? "Right-click" : "Middle-click";
  const lines = [`${how} at ${click.x} across and ${click.y} down in the picture.`];
  const target = click.target;
  if (target?.password) return lines;
  if (target?.description) lines.push(`Windows describes it as "${target.description}".`);
  if (target?.bounds) lines.push(`Its outline is ${target.bounds.width} by ${target.bounds.height} pixels, ${target.bounds.x} across and ${target.bounds.y} down.`);
  return lines;
}
