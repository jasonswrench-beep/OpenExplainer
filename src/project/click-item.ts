// Small shared rules about a click picture and its callouts: is a name a real one, and is a callout the one made from the click (so what Windows said about the clicked item is about it)?
// Used by the AI's callout sentences (src/ai/drafting.ts) and by the procedure steps made from clicks (src/project/procedure-draft.ts). Nothing here touches a screen.
import type { Callout, CalloutRect } from "./callouts.ts";
import type { Picture } from "./model.ts";

/** Names that are not names: a number, only punctuation, or what a program calls a part of itself when it has no better word. */
const PLACEHOLDER = /^(button|pane|window|item|unknown|static|text|edit|group|custom|tab|document|image|icon|list|menu|toolbar|panel|label|control|element|dialog|titlebar|title bar|client|screen|area|box|field|view|frame)\s*\d*$/i;

/** Does this name say what the thing is? */
export function isRealName(name: string): boolean {
  const n = name.replace(/\s+/g, " ").trim();
  if (n.length < 2) return false;
  if (/^[\d\W_]+$/.test(n)) return false;
  return !PLACEHOLDER.test(n);
}

const area = (r: CalloutRect) => r.width * r.height;

/** How much of the smaller of two rectangles is covered by the other, from 0 to 1. */
export function overlap(a: CalloutRect, b: CalloutRect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.max(1, Math.min(area(a), area(b)));
}

/** Is this callout the one made from the click? Its outline covers the clicked item's outline, or (with no outline) it holds the pointer. */
export function isClickItem(picture: Picture, callout: Callout): boolean {
  const click = picture.click;
  if (!click) return false;
  const bounds = click.target?.bounds;
  if (bounds) return overlap(callout.target, bounds) >= 0.5;
  const t = callout.target;
  return click.x >= t.x && click.x <= t.x + t.width && click.y >= t.y && click.y <= t.y + t.height;
}
