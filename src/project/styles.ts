// Named styles: a set of colours saved under a name (for example "Warning", a red box with white lettering) and applied to marks again later. A style is a set of
// colours, so applying one copies those colours onto the mark: the mark does not stay linked to the style, which keeps every picture complete by itself. The project keeps
// the styles. The contrast checker applies to a style as it does to a mark: it warns and never stops. Everything here works without a screen.
import { checkContrast, normalizeHex, TEXT_MIN, type ContrastCheck } from "./contrast.ts";
import { newId } from "./ids.ts";
import type { Shape } from "./shapes.ts";

export interface NamedStyle {
  id: string;
  name: string;
  /** The fill of a text box or a rectangle, or the colour of a marker. `null` for none. */
  fill: string | null;
  /** The outline of a text box or a rectangle, or the colour of an arrow. */
  outline: string;
  /** The colour of the words of a text box. */
  textColor: string;
}

export const MOST_NAME = 40;

/** The colours a mark holds, as a style would, or `null` when it holds none that a style keeps. */
export function coloursOf(shape: Shape): Omit<NamedStyle, "id" | "name"> {
  switch (shape.kind) {
    case "arrow": return { fill: null, outline: shape.color, textColor: "#000000" };
    case "text": return { fill: shape.fill, outline: shape.outline, textColor: shape.textColor };
    case "rectangle": return { fill: shape.fill, outline: shape.outline, textColor: "#000000" };
    case "marker": return { fill: shape.color, outline: shape.color, textColor: "#000000" };
  }
}

/** Puts a style's colours on a mark (a copy: the mark is not linked to the style). */
export function applyStyle(shape: Shape, style: NamedStyle): void {
  switch (shape.kind) {
    case "arrow": shape.color = style.outline; break;
    case "text": shape.fill = style.fill; shape.outline = style.outline; shape.textColor = style.textColor; break;
    case "rectangle": shape.fill = style.fill; shape.outline = style.outline; break;
    case "marker": shape.color = style.fill ?? style.outline; break;
  }
}

export type NameCheck = { ok: true; name: string } | { ok: false; message: string };

/** Checks a style's name: something is written, it is not too long, and no other style has it (capitals do not matter). `exceptId` is the style being renamed. */
export function checkStyleName(input: string, styles: NamedStyle[], exceptId?: string): NameCheck {
  const name = input.replace(/\s+/g, " ").trim();
  if (name === "") return { ok: false, message: "Give the style a name, such as Warning." };
  if (name.length > MOST_NAME) return { ok: false, message: `A style name can be at most ${MOST_NAME} letters. This one has ${name.length}.` };
  if (styles.some((s) => s.id !== exceptId && s.name.toLowerCase() === name.toLowerCase())) return { ok: false, message: `There is already a style called "${name}". Choose another name, or delete that style first.` };
  return { ok: true, name };
}

/** A new style with a name and the colours of a mark. `null` when the name is not allowed. */
export function styleFromShape(shape: Shape, input: string, styles: NamedStyle[]): NamedStyle | null {
  const checked = checkStyleName(input, styles);
  return checked.ok ? { id: newId(), name: checked.name, ...coloursOf(shape) } : null;
}

export function deleteStyle(styles: NamedStyle[], id: string): boolean {
  const at = styles.findIndex((s) => s.id === id);
  if (at < 0) return false;
  styles.splice(at, 1);
  return true;
}

/** The contrast of a style's own colours: its words on its fill. The same check a mark gets. */
export function styleChecks(style: NamedStyle): ContrastCheck[] {
  const out = style.fill ? checkContrast("Text on the style's fill", style.textColor, style.fill, TEXT_MIN) : null;
  return out ? [out] : [];
}

/** The styles a project can keep: each with a name, real colours and its own id; a repeated name (capitals aside) is dropped. */
export function cleanStyles(raw: unknown): NamedStyle[] {
  if (!Array.isArray(raw)) return [];
  const out: NamedStyle[] = [];
  const seenIds = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const input = item as Record<string, unknown>;
    const checked = checkStyleName(typeof input.name === "string" ? input.name : "", out);
    if (!checked.ok) continue;
    let id = typeof input.id === "string" && input.id.length > 0 ? input.id : newId();
    if (seenIds.has(id)) id = newId();
    seenIds.add(id);
    out.push({
      id,
      name: checked.name,
      fill: input.fill === null || input.fill === undefined ? null : normalizeHex(input.fill),
      outline: normalizeHex(input.outline) ?? "#C62828",
      textColor: normalizeHex(input.textColor) ?? "#000000",
    });
  }
  return out;
}
