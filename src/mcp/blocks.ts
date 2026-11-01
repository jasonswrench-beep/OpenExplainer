// How a topic's page looks to an assistant, and how what it writes becomes a page. Text is written the way the editor takes it: `**bold**`, `*italic*` and `[[Control name]]` for the label of a
// button or menu, so an assistant needs no other format. A page is a list of blocks: a heading, a paragraph, a picture of the topic's, a numbered procedure (steps, each with an optional picture
// and a result line) and a callout box. Anything wrong is said in plain words with where it is, so the assistant can put it right. Nothing here needs a screen or the disk.
import { entries } from "../project/callouts.ts";
import { describeClick } from "../project/clicks.ts";
import type { Picture, TreeNode } from "../project/model.ts";
import { CALLOUT_KINDS, cleanPage, type Block, type CalloutKind, type Page, type Step } from "../project/page.ts";
import { newId } from "../project/ids.ts";
import { formatMarks, parseMarks } from "../project/text.ts";

export const BLOCK_HELP =
  "A block is one of: {type:'heading', text}, {type:'paragraph', text}, {type:'picture', picture_id}, {type:'procedure', steps:[{text, picture_id?, result?}]} or {type:'callout', kind, text}. " +
  `Text can use **bold**, *italic*, [[Control name]] (the label of a button or menu, exactly as it appears on screen) and [words](#topic-id) for a link to another topic (get_outline gives the ids). A callout kind is one of: ${CALLOUT_KINDS.map((k) => k.id).join(", ")}. ` +
  "A picture_id is one of the topic's pictures (see get_topic). {type:'snippet', snippet:'Name'} uses a snippet of the book (list_snippets), written out in its place in every output. " +
  "Any block, and any step, can carry conditions: [names], such as {type:'paragraph', text:'...', conditions:['Administrators']}; an output made for a target that hides one of them leaves it out.";

const kinds = new Set<string>(CALLOUT_KINDS.map((k) => k.id));

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** Names for the ids a page holds: the conditions and the snippets of the book. */
export interface ReuseNames {
  conditionName(id: string): string | undefined;
  snippetName(id: string): string | undefined;
}

/** The page as an assistant reads it. With `names`, conditions and snippets are said by name. */
export function pageToJson(page: Page | undefined, names?: ReuseNames): Json[] {
  const named = (ids: string[] | undefined) => (ids ?? []).map((id) => names?.conditionName(id) ?? id);
  return (page?.blocks ?? []).map((block): Json => {
    const json = blockJson(block, names);
    if (block.conditions?.length) json.conditions = named(block.conditions);
    if (block.type === "procedure" && Array.isArray(json.steps)) block.steps.forEach((s, i) => { if (s.conditions?.length) (json.steps as Json[])[i].conditions = named(s.conditions); });
    return json;
  });
}

function blockJson(block: Block, names?: ReuseNames): Json {
    switch (block.type) {
      case "heading": return { id: block.id, type: "heading", text: block.text };
      case "paragraph": return { id: block.id, type: "paragraph", text: formatMarks(block.text) };
      case "picture": return { id: block.id, type: "picture", picture_id: block.pictureId };
      case "snippet": return { id: block.id, type: "snippet", snippet: names?.snippetName(block.snippetId) ?? block.snippetId, snippet_id: block.snippetId };
      case "callout": return { id: block.id, type: "callout", kind: block.kind, text: formatMarks(block.text) };
      case "procedure":
        return {
          id: block.id, type: "procedure",
          steps: block.steps.map((s) => ({ id: s.id, text: formatMarks(s.text), ...(s.pictureId ? { picture_id: s.pictureId } : {}), ...(s.result?.length ? { result: formatMarks(s.result) } : {}) })),
        };
    }
}

/** What was clicked, as far as Windows said (never what was typed; a password box says only that it was one). */
function clickedItem(target: NonNullable<Picture["click"]>["target"]): Json {
  if (!target) return {};
  if (target.password) return { password_box: true };
  const out: Json = {};
  if (target.name) out.name = target.name;
  if (target.role) out.kind = target.role;
  if (target.acceleratorKey) out.shortcut = target.acceleratorKey;
  if (target.accessKey) out.access_key = target.accessKey;
  if (target.description) out.description = target.description;
  return out;
}

/** One of the topic's pictures as an assistant reads it: what it is, what was clicked, and its callouts, so it can write the steps. */
export function pictureToJson(picture: Picture): Json {
  const click = picture.click;
  return {
    id: picture.id,
    alt_text: picture.altText,
    width: picture.width,
    height: picture.height,
    source: picture.source.kind,
    ...(click ? { click: { words: describeClick(click), x: click.x, y: click.y, button: click.button, ...(click.double ? { double: true } : {}), ...(click.target ? { clicked_item: clickedItem(click.target) } : {}) } } : {}),
    callouts: entries(picture).map((e, i) => ({ id: picture.callouts![i].id, letter: e.letter, name: picture.callouts![i].name, description: picture.callouts![i].description })),
  };
}

/** What a topic looks like to an assistant: its place, its status, its page and its pictures. */
export function topicToJson(node: TreeNode, number: string, names?: ReuseNames): Json {
  return {
    id: node.id,
    number,
    title: node.title,
    status: node.status,
    ...(node.conditions?.length ? { conditions: node.conditions.map((id) => names?.conditionName(id) ?? id) } : {}),
    page: pageToJson(node.page, names),
    pictures: node.pictures.map(pictureToJson),
    index_terms: (node.index?.terms ?? []).map((t) => t.text),
    see_also: node.seeAlso ?? [],
    children: node.children.map((c) => ({ id: c.id, title: c.title })),
  };
}

function text(value: unknown, where: string): string {
  if (typeof value !== "string") throw new Error(`${where} needs its text as a string.`);
  return value;
}

/**
 * Blocks an assistant wrote, as blocks of a page. `pictureIds` are the topic's pictures, so a picture that is not the topic's is refused with its place named. Throws an error whose words say what is
 * wrong and where; nothing is changed by a call that throws.
 */
export interface ReuseLookup {
  /** The id of the snippet with this name (or this id), or `undefined`. */
  snippetId(nameOrId: string): string | undefined;
  /** The ids of conditions by name. Throws, saying which name is not a condition. */
  conditionIds(names: string[]): string[];
}

/** The names of the conditions a block carries, as the assistant wrote them. */
function conditionsOf(item: Json, where: string, reuse: ReuseLookup | undefined): string[] | undefined {
  if (item.conditions === undefined) return undefined;
  if (!Array.isArray(item.conditions) || item.conditions.some((c) => typeof c !== "string")) throw new Error(`${where} needs its conditions as a list of names.`);
  if (!reuse) throw new Error(`${where} has conditions, but this book has none yet. set_conditions makes them.`);
  const ids = reuse.conditionIds(item.conditions as string[]);
  return ids.length ? ids : undefined;
}

export function blocksFromJson(raw: unknown, pictureIds: Set<string>, reuse?: ReuseLookup): Block[] {
  if (!Array.isArray(raw)) throw new Error("blocks must be a list of blocks. " + BLOCK_HELP);
  const picture = (value: unknown, where: string): string => {
    if (typeof value !== "string" || !pictureIds.has(value)) throw new Error(`${where} names a picture that is not one of this topic's pictures. The topic's pictures are: ${[...pictureIds].join(", ") || "none yet"}.`);
    return value;
  };
  return raw.map((item, i): Block => {
    const block = blockFromJson(item, i, picture, reuse);
    const conditions = isObject(item) ? conditionsOf(item, `Block ${i + 1}`, reuse) : undefined;
    if (conditions) block.conditions = conditions;
    return block;
  });
}

function blockFromJson(item: unknown, i: number, picture: (value: unknown, where: string) => string, reuse: ReuseLookup | undefined): Block {
  {
    const where = `Block ${i + 1}`;
    if (!isObject(item)) throw new Error(`${where} must be an object. ${BLOCK_HELP}`);
    const id = newId();
    switch (item.type) {
      case "snippet": {
        const name = typeof item.snippet === "string" ? item.snippet : typeof item.snippet_id === "string" ? item.snippet_id : "";
        const snippetId = name ? reuse?.snippetId(name) : undefined;
        if (!snippetId) throw new Error(`${where} (snippet) needs the name of one of the book's snippets as snippet. list_snippets shows them.`);
        return { id, type: "snippet", snippetId };
      }
      case "heading": return { id, type: "heading", text: text(item.text, `${where} (heading)`) };
      case "paragraph": return { id, type: "paragraph", text: parseMarks(text(item.text, `${where} (paragraph)`)) };
      case "picture": return { id, type: "picture", pictureId: picture(item.picture_id, `${where} (picture)`) };
      case "callout": {
        if (typeof item.kind !== "string" || !kinds.has(item.kind)) throw new Error(`${where} (callout) needs a kind, one of: ${[...kinds].join(", ")}.`);
        return { id, type: "callout", kind: item.kind as CalloutKind, text: parseMarks(text(item.text, `${where} (callout)`)) };
      }
      case "procedure": {
        if (!Array.isArray(item.steps) || item.steps.length === 0) throw new Error(`${where} (procedure) needs a list of steps, each with its text.`);
        const steps = item.steps.map((s, n): Step => {
          const at = `${where} (procedure), step ${n + 1}`;
          if (!isObject(s)) throw new Error(`${at} must be an object with its text.`);
          const step: Step = { id: newId(), text: parseMarks(text(s.text, at)) };
          const stepConditions = conditionsOf(s, at, reuse);
          if (stepConditions) step.conditions = stepConditions;
          if (s.picture_id !== undefined && s.picture_id !== null && s.picture_id !== "") step.pictureId = picture(s.picture_id, at);
          if (typeof s.result === "string" && s.result.trim()) step.result = parseMarks(s.result);
          return step;
        });
        return { id, type: "procedure", steps };
      }
      default:
        throw new Error(`${where} has the type ${JSON.stringify(item.type)}, which is not one of heading, paragraph, picture, procedure, callout or snippet. ${BLOCK_HELP}`);
    }
  }
}

/** The page with these blocks, cleaned the same way a saved page is. */
export function pageFromBlocks(blocks: Block[], pictureIds: Set<string>): Page {
  return cleanPage({ blocks }, pictureIds);
}
