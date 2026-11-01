// The things an AI assistant can ask OpenExplainer to do over MCP: make and open a project in the folder the author chose, read the outline and a topic, add topics, write a topic's page, name and
// describe the callouts on its pictures, set index terms, check the book, save, and export in any kind. Each does what its description says and answers in plain words; a call that cannot be
// done says why, and changes nothing. Every change is saved at once (the assistant may never think to). The capture tools are in `src/mcp/capture-tools.ts`.
import { buildBookIndex, indexSummary, setTermLines, updateBookIndex } from "../project/book-index.ts";
import { countLinksTo, linkLossWords, linksInBlocks, setSeeAlso, subtreeIds, topicIds } from "../project/links.ts";
import { addCallout, addCalloutFromClick, clipToPicture, letterFor, MOST_TEXT, placeMarker, removeCallout, type Callout } from "../project/callouts.ts";
import { checkProject, splitIssues, summaryWords } from "../project/checks.ts";
import { avoidWordsFromLines, MOST_AVOID_WORDS } from "../project/avoid-words.ts";
import { MOST_STYLE } from "../project/drafts.ts";
import { addTask, GUIDE_LAYOUTS, guideSummary, newGuide, setGuideLayout, tasksFromChapter, type GuideLayout } from "../project/guides.ts";
import { COLOR_PRESETS, normalizeColor, SEE_THROUGH_LIMITS, SIZE_LIMITS, type HighlightKind } from "../project/highlight.ts";
import { readImageInfo } from "../project/image.ts";
import { cleanLook, FONTS, lookWords, MOST_LOOK_TEXT, PAGE_SIZES } from "../project/look.ts";
import { normalizeHex } from "../project/contrast.ts";
import { newId } from "../project/ids.ts";
import { addNode, cleanVariableName, createProject, findNode, moveNode, numbering, removeNode, setPictureView, STATUSES, TEMPLATES, type Picture, type Project, type Status, type TreeNode } from "../project/model.ts";
import { ZOOM_LIMITS, viewWords } from "../project/views.ts";
import { fileNameFor } from "../project/package.ts";
import { EXPORT_EXTENSION, type ExportKind, type MadeExport } from "../export/make.ts";
import { BLOCK_HELP, blocksFromJson, pageFromBlocks, pictureToJson, topicToJson, type ReuseLookup, type ReuseNames } from "./blocks.ts";
import { conditionIds, conditionNames, deleteSnippet, setConditionNames, setSnippet, setTargetList, snippetFromText, snippetToText, snippetUses } from "../project/snippets.ts";
import { keepPicture } from "./capture-tools.ts";
import { baseName, folderOf, projectFile, resolveInside, PROJECT_EXTENSION } from "./paths.ts";
import { failed, text, type ToolDef, type ToolResult } from "./protocol.ts";
import type { Session } from "./session.ts";

export interface ToolDeps {
  session: Session;
  /** Makes an export of the open project (src/export/make.ts, with the app's drawing and printing). */
  exporter(kind: ExportKind, options: { guideId?: string; comments?: boolean; targetId?: string }): Promise<MadeExport>;
}

type Args = Record<string, unknown>;

/** The biggest picture file import_picture takes, so a mistake cannot fill a project. */
const MOST_PICTURE_BYTES = 30 * 1048576;

export const INSTRUCTIONS =
  "OpenExplainer makes still-image tutorials and how-to books from screen captures. Work like this: create_project (or open_project), add_topic for each chapter and topic, then fill each topic with set_page. " +
  "Text uses **bold**, *italic* and [[Control name]] for the label of a button or menu exactly as it appears on screen. Numbered procedures hold steps; each step may have one of the topic's pictures and a result line. " +
  "To document a program: list_windows, capture_window for a screen, or start_click_capture (naming the window), then use the program yourself, then stop_click_capture. Each click becomes a picture with a note of what was clicked; " +
  "view_picture shows you a picture and get_topic lists them. Capture is one window at a time. " +
  "Name and describe the callouts on a picture with describe_picture, and give every picture a plain description (alt_text) for readers who cannot see it. Never write about a control that is not in the capture. " +
  "[words](#topic-id) in text is a link to another topic and set_see_also lists topics to read next. " +
  "A window, region or brought-in picture (import_picture) has no click, so add_callout puts a callout round a part of it you name in pixels, and delete_callout takes one off. move_topic moves a chapter or topic, with its pictures, to another place. " +
  "set_picture_view crops a tall or wide picture to the part that matters; set_book_settings sets the zoom, the click circle, the writing style and the words to avoid; update_guide and delete_guide change guides. " +
  "Every change is saved as it is made. When the book is ready, run check_book, update_index, and export_book (help-site, json, markdown, word, pdf, guide-word, guide-pdf). " +
  "You can only use files inside the folder the author chose for MCP.";

// ---- Reading what the assistant sent ------------------------------------------------------------------------

function string(args: Args, name: string, optional = false): string {
  const value = args[name];
  if (typeof value === "string" && value.trim() !== "") return value;
  if (optional && (value === undefined || value === null || value === "")) return "";
  throw new Error(`${name} is needed, as text.`);
}

const optionalString = (args: Args, name: string): string | undefined => {
  const value = string(args, name, true);
  return value === "" ? undefined : value;
};

const schema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const str = (description: string) => ({ type: "string", description });
const json = (value: unknown): ToolResult => text(JSON.stringify(value, null, 2));

function topic(project: Project, id: string): TreeNode {
  const node = findNode(project.tree, id);
  if (!node) throw new Error(`There is no topic with the id "${id}". get_outline lists the topics and their ids.`);
  return node;
}

/** What a page can say about the book's snippets and conditions: by name, for an assistant. */
const reuseOf = (project: Project): ReuseLookup => ({
  snippetId: (nameOrId) => project.snippets.find((s) => s.id === nameOrId || s.name.toLowerCase() === nameOrId.trim().toLowerCase())?.id,
  conditionIds: (names) => conditionIds(project, names),
});
const namesOf = (project: Project): ReuseNames => ({
  conditionName: (id) => project.conditions.find((c) => c.id === id)?.name,
  snippetName: (id) => project.snippets.find((s) => s.id === id)?.name,
});

/** Refuses blocks with a link to a topic that is not in the book, saying which, so nothing is changed. */
function refuseUnknownLinks(project: Project, blocks: Parameters<typeof linksInBlocks>[0]): void {
  const ids = topicIds(project.tree);
  const bad = linksInBlocks(blocks).find((l) => !ids.has(l.topic));
  if (bad) throw new Error(`The link "${bad.words}" goes to a topic that is not in the book (id ${bad.topic}). get_outline lists the topics and their ids. Write a link as [words](#topic-id).`);
}

function pictureOf(node: TreeNode, id: string): Picture {
  const picture = node.pictures.find((p) => p.id === id);
  if (!picture) throw new Error(`The topic "${node.title}" has no picture with the id "${id}". Its pictures are: ${node.pictures.map((p) => p.id).join(", ") || "none yet"}.`);
  return picture;
}

/** A number the assistant sent, kept only if it is in range. The words say what the range is, so a wrong value is never quietly changed. */
function numberIn(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be a number from ${min} to ${max}.`);
  return value;
}

/** A colour the assistant sent: six hex digits (with or without #), or the name of a ready-made colour. */
function colourOf(value: unknown, name: string): string {
  const preset = typeof value === "string" ? COLOR_PRESETS.find((c) => c.name.toLowerCase() === value.trim().toLowerCase()) : undefined;
  const code = preset?.code ?? normalizeColor(value);
  if (!code) throw new Error(`${name} must be six hex digits such as FFD600, or one of: ${COLOR_PRESETS.map((c) => c.name).join(", ")}.`);
  return code;
}

const circleSchema = (where: string) => ({
  type: "object",
  description: `The click circle drawn on click pictures in the ${where}. Give only what you want to change.`,
  properties: {
    show: { type: "boolean", description: "Whether the circle is drawn." },
    size_percent: { type: "number", description: `Its width as a percent of the picture's width, ${SIZE_LIMITS.min} to ${SIZE_LIMITS.max}.` },
    colour: str(`Six hex digits such as FFD600, or ${COLOR_PRESETS.map((c) => c.name).join(", ")}.`),
    see_through_percent: { type: "number", description: `How much shows through, ${SEE_THROUGH_LIMITS.min} (solid) to ${SEE_THROUGH_LIMITS.max} (cannot be seen).` },
  },
  additionalProperties: false,
});

function outline(nodes: TreeNode[], numbers: Map<string, string>): unknown[] {
  return nodes.map((n) => ({
    id: n.id, number: numbers.get(n.id), title: n.title, status: n.status, pictures: n.pictures.length, blocks: n.page?.blocks.length ?? 0, index_terms: n.index?.terms.length ?? 0,
    ...(n.children.length ? { children: outline(n.children, numbers) } : {}),
  }));
}

export function createTools(deps: ToolDeps): ToolDef[] {
  const { session } = deps;
  /** A tool that changes the project: its change is saved as soon as it is made. */
  const changes = (handler: (args: Args, project: Project) => Promise<string> | string): ToolDef["handler"] => async (args) => {
    const project = session.require();
    const said = await handler(args, project);
    const file = session.filePath ? await session.save() : null;
    return text(`${said}${file ? `\nSaved to ${file}.` : ""}`);
  };

  const tools: ToolDef[] = [
    {
      name: "list_projects",
      description: "Lists the OpenExplainer project files (.openexplainer) in the folder the author chose for MCP, and in the folders directly inside it.",
      inputSchema: schema({}),
      handler: async () => {
        const folder = session.settings.folder;
        const found: string[] = [];
        for (const entry of await session.files.list(folder)) {
          if (!entry.isDirectory && entry.name.toLowerCase().endsWith(PROJECT_EXTENSION)) found.push(entry.name);
          else if (entry.isDirectory) for (const inner of await session.files.list(`${folder}\\${entry.name}`)) if (!inner.isDirectory && inner.name.toLowerCase().endsWith(PROJECT_EXTENSION)) found.push(`${entry.name}\\${inner.name}`);
        }
        return json({ folder, projects: found.sort() });
      },
    },
    {
      name: "create_project",
      description: "Makes a new project and opens it: empty, or from a template (openstage-how-to-book has 15 chapters and an appendix, software-user-guide has four starter chapters). It is saved in the MCP folder as <name>.openexplainer unless a file name is given. Fails if that file exists.",
      inputSchema: schema({ name: str("The project's name, such as the name of the program being documented."), file: str("Optional file name inside the MCP folder (the .openexplainer ending is added)."), template: { type: "string", enum: TEMPLATES, description: "What to start from. Leave out for an empty project." } }, ["name"]),
      handler: async (args) => {
        const name = string(args, "name");
        const path = projectFile(session.settings.folder, optionalString(args, "file") ?? fileNameFor(name));
        if (!path) throw new Error("That file name is not inside the folder MCP may use.");
        if (await session.files.exists(path)) throw new Error(`There is already a project at ${path}. Use open_project to open it, or give another file name.`);
        const template = optionalString(args, "template") ?? "empty";
        if (!(TEMPLATES as string[]).includes(template)) throw new Error(`template must be one of: ${TEMPLATES.join(", ")}.`);
        await session.start(createProject(name, template as Project["template"]), path);
        return text(`Created and opened the project "${name}" at ${path}. Add chapters and topics with add_topic.`);
      },
    },
    {
      name: "open_project",
      description: "Opens an existing project file from the MCP folder, replacing the one that is open (which was already saved).",
      inputSchema: schema({ file: str("The file name or path, inside the MCP folder.") }, ["file"]),
      handler: async (args) => {
        const path = projectFile(session.settings.folder, string(args, "file"));
        if (!path) throw new Error("That file is not inside the folder MCP may use.");
        const missing = await session.open(path);
        const project = session.require();
        return text(`Opened "${project.name}" (${numbering(project.tree).size} topics).${missing.length ? ` ${missing.length} picture file(s) the project lists are missing from it.` : ""}`);
      },
    },
    {
      name: "get_outline",
      description: "The book's chapters and topics, nested, with each one's id, number, title, status and how much is on it. Use the ids with the other tools.",
      inputSchema: schema({}),
      handler: async () => {
        const project = session.require();
        const reuse = project.snippets.length || project.conditions.length || project.targets.length
          ? { reuse: { snippets: project.snippets.map((s) => s.name), conditions: project.conditions.map((c) => c.name), targets: project.targets.map((t) => ({ name: t.name, hides: conditionNames(project, t.hide) })) } }
          : {};
        return json({ project: project.name, file: session.filePath, variables: project.variables, topics: outline(project.tree, numbering(project.tree)), index: indexSummary(project.tree), ...reuse });
      },
    },
    {
      name: "get_topic",
      description: "One topic in full: its page as blocks, its pictures (what was clicked, its callouts and their names) and its index terms.",
      inputSchema: schema({ topic_id: str("The topic's id, from get_outline.") }, ["topic_id"]),
      handler: async (args) => {
        const project = session.require();
        const node = topic(project, string(args, "topic_id"));
        return json(topicToJson(node, numbering(project.tree).get(node.id) ?? "", namesOf(project)));
      },
    },
    {
      name: "add_topic",
      description: "Adds a chapter (no parent) or a topic (under a parent) at the end. Returns its id.",
      inputSchema: schema({ title: str("The title."), parent_id: str("The id of the chapter or topic to add it under. Leave out for a new chapter."), status: { type: "string", enum: STATUSES.map((s) => s.id), description: "Optional status." } }, ["title"]),
      handler: changes((args, project) => {
        const parent = optionalString(args, "parent_id");
        if (parent) topic(project, parent);
        const title = string(args, "title");
        const status = optionalString(args, "status");
        if (status && !STATUSES.some((s) => s.id === status)) throw new Error(`The status must be one of: ${STATUSES.map((s) => s.id).join(", ")}.`);
        const node = addNode(project.tree, parent ?? null, title);
        if (status) node.status = status as Status;
        return `Added "${node.title}" as ${numbering(project.tree).get(node.id)}. Its id is ${node.id}.`;
      }),
    },
    {
      name: "update_topic",
      description: "Changes a topic's title or status.",
      inputSchema: schema({ topic_id: str("The topic's id."), title: str("A new title."), status: { type: "string", enum: STATUSES.map((s) => s.id), description: "A new status." } }, ["topic_id"]),
      handler: changes((args, project) => {
        const node = topic(project, string(args, "topic_id"));
        const title = optionalString(args, "title");
        const status = optionalString(args, "status");
        if (!title && !status) throw new Error("Give a new title or a new status.");
        if (status && !STATUSES.some((s) => s.id === status)) throw new Error(`The status must be one of: ${STATUSES.map((s) => s.id).join(", ")}.`);
        if (title) node.title = title;
        if (status) node.status = status as Status;
        return `Updated "${node.title}".`;
      }),
    },
    {
      name: "delete_topic",
      description: "Deletes a topic and everything under it. It cannot be undone, so confirm must be true.",
      inputSchema: schema({ topic_id: str("The topic's id."), confirm: { type: "boolean", description: "Must be true." } }, ["topic_id", "confirm"]),
      handler: changes((args, project) => {
        if (args.confirm !== true) throw new Error("Nothing was deleted. Send confirm: true to delete the topic and everything under it.");
        const node = topic(project, string(args, "topic_id"));
        const gone = subtreeIds(node);
        const loss = linkLossWords(countLinksTo(project.tree, gone));
        removeNode(project.tree, node.id);
        project.guides = project.guides.map((g) => ({ ...g, tasks: g.tasks.filter((id) => id !== node.id) }));
        return `Deleted "${node.title}" and what was under it.${loss ? ` Elsewhere in the book, ${loss}` : ""}`;
      }),
    },
    {
      name: "move_topic",
      description:
        "Moves a chapter or topic, with everything under it, to be a chapter (leave parent_id out) or a topic under another chapter or topic, at a place in that list (position 1 is first; leave it out to put it last). " +
        "Its pictures, page, index terms and ids go with it, and a guide that uses it still does. Numbers such as 4.2 are worked out from the order, so they change.",
      inputSchema: schema({ topic_id: str("The topic's id."), parent_id: str("The id of the chapter or topic to move it under. Leave out to make it a chapter."), position: { type: "number", description: "Its place among its new neighbours, counting from 1. Leave out for last." } }, ["topic_id"]),
      handler: changes((args, project) => {
        const node = topic(project, string(args, "topic_id"));
        const parent = optionalString(args, "parent_id");
        if (parent) topic(project, parent);
        const position = args.position === undefined ? undefined : numberIn(args.position, "position", 1, 10000);
        moveNode(project.tree, node.id, parent ?? null, position);
        return `Moved "${node.title}". It is now ${numbering(project.tree).get(node.id)}.`;
      }),
    },
    {
      name: "set_page",
      description: `Replaces everything on a topic's page with these blocks. ${BLOCK_HELP}`,
      inputSchema: schema({ topic_id: str("The topic's id."), blocks: { type: "array", description: "The blocks, in order.", items: { type: "object" } } }, ["topic_id", "blocks"]),
      handler: changes((args, project) => {
        const node = topic(project, string(args, "topic_id"));
        const ids = new Set(node.pictures.map((p) => p.id));
        const written = blocksFromJson(args.blocks, ids, reuseOf(project));
        refuseUnknownLinks(project, written);
        node.page = pageFromBlocks(written, ids);
        if (node.page.blocks.length === 0) delete node.page;
        return `The page of "${node.title}" now has ${node.page?.blocks.length ?? 0} block(s).`;
      }),
    },
    {
      name: "append_blocks",
      description: `Adds blocks to the end of a topic's page. ${BLOCK_HELP}`,
      inputSchema: schema({ topic_id: str("The topic's id."), blocks: { type: "array", description: "The blocks to add.", items: { type: "object" } } }, ["topic_id", "blocks"]),
      handler: changes((args, project) => {
        const node = topic(project, string(args, "topic_id"));
        const ids = new Set(node.pictures.map((p) => p.id));
        const added = blocksFromJson(args.blocks, ids, reuseOf(project));
        refuseUnknownLinks(project, added);
        node.page = pageFromBlocks([...(node.page?.blocks ?? []), ...added], ids);
        return `Added ${added.length} block(s); the page of "${node.title}" now has ${node.page.blocks.length}.`;
      }),
    },
    {
      name: "describe_picture",
      description:
        "Gives a picture its plain description (alt_text) and names and describes its callouts. A callout's name is the label of the thing it points at; its description is one sentence about what it does. Use make_callout_from_click first for a click picture that has no callout yet.",
      inputSchema: schema({
        topic_id: str("The topic's id."), picture_id: str("The picture's id, from get_topic."), alt_text: str("What the picture shows, in a sentence or two."),
        callouts: { type: "array", description: "Callouts to rename or describe, by id.", items: schema({ id: str("The callout's id."), name: str("The label of the thing it points at."), description: str("One sentence about it.") }, ["id"]) },
      }, ["topic_id", "picture_id"]),
      handler: changes((args, project) => {
        const node = topic(project, string(args, "topic_id"));
        const picture = pictureOf(node, string(args, "picture_id"));
        const alt = optionalString(args, "alt_text");
        const found = (Array.isArray(args.callouts) ? args.callouts : []).map((item) => {
          const entry = (item ?? {}) as Args;
          const callout = (picture.callouts ?? []).find((c) => c.id === entry.id);
          if (!callout) throw new Error(`The picture has no callout with the id "${String(entry.id)}". Its callouts are: ${(picture.callouts ?? []).map((c) => c.id).join(", ") || "none"}.`);
          return { callout, entry };
        });
        if (alt !== undefined) picture.altText = alt;
        for (const { callout, entry } of found) {
          if (typeof entry.name === "string") callout.name = entry.name.trim();
          if (typeof entry.description === "string") callout.description = entry.description.trim();
        }
        const changed = found.length;
        return `Updated the picture${alt !== undefined ? " description" : ""}${changed ? ` and ${changed} callout(s)` : ""}. ${JSON.stringify(pictureToJson(picture))}`;
      }),
    },
    {
      name: "make_callout_from_click",
      description: "Adds a callout (lettered marker) to a click picture at the item that was clicked, named from what Windows said it was (or, when the click was on the window itself, a small box round the click with no name). Name and describe it afterwards with describe_picture.",
      inputSchema: schema({ topic_id: str("The topic's id."), picture_id: str("The picture's id.") }, ["topic_id", "picture_id"]),
      handler: changes((args, project) => {
        const picture = pictureOf(topic(project, string(args, "topic_id")), string(args, "picture_id"));
        const made = addCalloutFromClick(picture);
        if (!made) throw new Error("That picture has no click to make a callout from.");
        return `Added callout ${made.id}.`;
      }),
    },
    {
      name: "import_picture",
      description:
        "Brings a PNG or JPEG file from the MCP folder into a topic's list of pictures, as Import does in the program (it is not on the page until set_page uses it). Returns the picture's id. " +
        "Use it for a logo, a drawing or a picture made by another program. It has no click, so give it callouts with add_callout if it needs them, and a description with describe_picture or alt_text.",
      inputSchema: schema({ topic_id: str("The topic the picture goes into."), file: str("The picture file, inside the MCP folder."), alt_text: str("What the picture shows, if you know already.") }, ["topic_id", "file"]),
      handler: changes(async (args, project) => {
        const node = topic(project, string(args, "topic_id"));
        const path = resolveInside(session.settings.folder, string(args, "file"));
        if (!path) throw new Error("That file is not inside the folder MCP may use.");
        if (!(await session.files.exists(path))) throw new Error(`There is no file at ${path}.`);
        const bytes = await session.files.read(path);
        if (bytes.length > MOST_PICTURE_BYTES) throw new Error(`That file is ${Math.round(bytes.length / 1048576)} MB. A picture can be up to ${MOST_PICTURE_BYTES / 1048576} MB.`);
        const info = readImageInfo(bytes);
        if (!info) throw new Error("That file is not a PNG or JPEG picture. Only those two kinds can be brought in.");
        const kept = keepPicture(session, node, { bytes, width: info.width, height: info.height, extension: info.extension }, "import", { name: baseName(path), alt: optionalString(args, "alt_text") });
        return `Brought ${baseName(path)} into "${node.title}" as picture ${kept.id} (${kept.width} by ${kept.height}).`;
      }),
    },
    {
      name: "add_callout",
      description:
        "Adds a lettered callout to any picture, round the part it names: left, top, width and height in pixels from the picture's top left corner (get_topic gives the picture's size; view_picture shows it; a part that runs off the picture is cut to it). " +
        "Use it for a window, a region or a brought-in picture, which have no click to make a callout from. Give it a name (the label of the thing) and a one-sentence description, or fill them in later with describe_picture.",
      inputSchema: schema({
        topic_id: str("The topic's id."), picture_id: str("The picture's id."),
        left: { type: "number", description: "How far across the part starts." }, top: { type: "number", description: "How far down it starts." },
        width: { type: "number", description: "Its width." }, height: { type: "number", description: "Its height." },
        name: str("The label of the thing it points at."), description: str("One sentence about it."),
      }, ["topic_id", "picture_id", "left", "top", "width", "height"]),
      handler: changes((args, project) => {
        const picture = pictureOf(topic(project, string(args, "topic_id")), string(args, "picture_id"));
        const left = numberIn(args.left, "left", 0, picture.width - 1), top = numberIn(args.top, "top", 0, picture.height - 1);
        const target = clipToPicture({ x: left, y: top, width: numberIn(args.width, "width", 1, 100000), height: numberIn(args.height, "height", 1, 100000) }, picture);
        if (!target) throw new Error(`That part is not on the picture, which is ${picture.width} by ${picture.height} pixels.`);
        const callout: Callout = {
          id: newId(), name: (optionalString(args, "name") ?? "").trim().slice(0, MOST_TEXT), description: (optionalString(args, "description") ?? "").trim().slice(0, MOST_TEXT),
          target, marker: placeMarker(target, picture, (picture.callouts ?? []).map((c) => c.marker)),
        };
        addCallout(picture, callout);
        return `Added callout ${letterFor((picture.callouts?.length ?? 1) - 1)} (id ${callout.id}) round the part from ${target.x}, ${target.y}, ${target.width} wide and ${target.height} high.`;
      }),
    },
    {
      name: "list_snippets",
      description: "The book's snippets: each with its name, the text it is written in (see set_snippet) and the topics that use it.",
      inputSchema: schema({}),
      handler: async () => {
        const project = session.require();
        const numbers = numbering(project.tree);
        return json(project.snippets.map((s) => ({ name: s.name, text: snippetToText(s.blocks), used_in: snippetUses(project.tree, s.id).map((u) => `${numbers.get(u.node.id)} ${u.node.title}`) })));
      },
    },
    {
      name: "set_snippet",
      description:
        "Makes a snippet, or changes the one with this name: a piece of a page written once and used in many topics with a {type:'snippet', snippet:'Name'} block, so changing it once changes every topic. " +
        "The text has blocks separated by a blank line: '# words' is a heading; '> Caution: words' is a boxed note (the box names are Design Tip, Caution, Bright Idea, Power Tip, Time Saver, New in this version); lines '1. words', '2. words' are the steps of a numbered procedure, with a line 'Result: words' after a step for its result; anything else is a paragraph. " +
        "Words use **bold**, *italic*, [[Control name]] and [words](#topic-id). A snippet holds no pictures.",
      inputSchema: schema({ name: str("The snippet's name, up to 60 letters."), text: str("What the snippet says, in the form above.") }, ["name", "text"]),
      handler: changes((args, project) => {
        const { blocks, problems } = snippetFromText(string(args, "text"));
        if (blocks.length === 0) throw new Error("The text has nothing in it, so there is no snippet to keep. Delete a snippet with delete_snippet.");
        const made = setSnippet(project, string(args, "name"), blocks);
        return `The snippet "${made.name}" has ${made.blocks.length} block(s), used in ${snippetUses(project.tree, made.id).length} topic(s).${problems.length ? ` ${problems.join(" ")}` : ""}`;
      }),
    },
    {
      name: "delete_snippet",
      description: "Deletes a snippet. Where a topic used it, the words stay as ordinary blocks (a copy of what it said), so no page loses anything. It cannot be undone, so confirm must be true.",
      inputSchema: schema({ name: str("The snippet's name."), confirm: { type: "boolean", description: "Must be true." } }, ["name", "confirm"]),
      handler: changes((args, project) => {
        if (args.confirm !== true) throw new Error("Nothing was deleted. Send confirm: true to delete the snippet.");
        const id = reuseOf(project).snippetId(string(args, "name"));
        if (!id) throw new Error(`There is no snippet called "${string(args, "name")}". list_snippets shows them.`);
        const name = project.snippets.find((s) => s.id === id)!.name;
        const places = deleteSnippet(project, id);
        return `Deleted the snippet "${name}".${places ? ` ${places} place(s) that used it now hold ordinary blocks with the same words.` : ""}`;
      }),
    },
    {
      name: "set_conditions",
      description:
        "Sets the book's conditions: names for content that is only for some readers or versions, such as Administrators or Version 2. It replaces the list: a name that is already there keeps what carries it, and one left out is taken off everything and every target. " +
        "Put a condition on a block or step with conditions: [names] in set_page, and on a topic with set_topic_conditions.",
      inputSchema: schema({ names: { type: "array", items: { type: "string" }, description: "The condition names, up to 30, each once." } }, ["names"]),
      handler: changes((args, project) => {
        if (!Array.isArray(args.names) || args.names.some((n) => typeof n !== "string")) throw new Error("names must be a list of text.");
        const result = setConditionNames(project, args.names as string[]);
        return `The book has ${project.conditions.length} condition(s): ${project.conditions.map((c) => c.name).join(", ") || "none"}. ${result.added} added, ${result.removed} taken out.`;
      }),
    },
    {
      name: "set_targets",
      description: "Sets the book's targets: named outputs, such as 'Guide for students', each hiding some conditions. export_book with target: 'Guide for students' leaves out everything that carries any condition that target hides. It replaces the list.",
      inputSchema: schema({ targets: { type: "array", description: "The targets, up to 20.", items: schema({ name: str("The target's name."), hide: { type: "array", items: { type: "string" }, description: "The names of the conditions it hides." } }, ["name", "hide"]) } }, ["targets"]),
      handler: changes((args, project) => {
        if (!Array.isArray(args.targets)) throw new Error("targets must be a list.");
        const list = args.targets.map((t) => {
          const o = (t ?? {}) as Args;
          if (typeof o.name !== "string" || !Array.isArray(o.hide) || o.hide.some((h) => typeof h !== "string")) throw new Error("Each target needs a name and a list of condition names to hide.");
          return { name: o.name, hide: o.hide as string[] };
        });
        const count = setTargetList(project, list);
        return `The book has ${count} target(s): ${project.targets.map((t) => `${t.name} (hides ${conditionNames(project, t.hide).join(", ") || "nothing"})`).join("; ") || "none"}.`;
      }),
    },
    {
      name: "set_topic_conditions",
      description: "Puts conditions on a whole topic (the topic and what is under it are left out of an output made for a target that hides any of them). It replaces the topic's conditions; an empty list clears them.",
      inputSchema: schema({ topic_id: str("The topic's id."), conditions: { type: "array", items: { type: "string" }, description: "Condition names." } }, ["topic_id", "conditions"]),
      handler: changes((args, project) => {
        const node = topic(project, string(args, "topic_id"));
        if (!Array.isArray(args.conditions) || args.conditions.some((c) => typeof c !== "string")) throw new Error("conditions must be a list of condition names.");
        const ids = conditionIds(project, args.conditions as string[]);
        if (ids.length) node.conditions = ids; else delete node.conditions;
        return ids.length ? `"${node.title}" now carries: ${conditionNames(project, ids).join(", ")}.` : `"${node.title}" carries no conditions now.`;
      }),
    },
    {
      name: "set_see_also",
      description: "Sets a topic's See also list: the other topics worth reading next, listed under it in the book and the help site. It replaces the list. An empty list clears it. Use the topic ids from get_outline.",
      inputSchema: schema({ topic_id: str("The topic's id."), topic_ids: { type: "array", items: { type: "string" }, description: "The ids of the topics to list, in order, up to 12. None of them can be the topic itself." } }, ["topic_id", "topic_ids"]),
      handler: changes((args, project) => {
        const node = topic(project, string(args, "topic_id"));
        if (!Array.isArray(args.topic_ids) || args.topic_ids.some((id) => typeof id !== "string")) throw new Error("topic_ids must be a list of topic ids.");
        const count = setSeeAlso(project.tree, node.id, args.topic_ids as string[]);
        return count === 0 ? `The See also list of "${node.title}" is now empty.` : `"${node.title}" now has a See also list of ${count} topic(s).`;
      }),
    },
    {
      name: "delete_callout",
      description: "Takes one callout off a picture (the others are lettered again). Use it for a callout in the wrong place; the callout ids are in get_topic.",
      inputSchema: schema({ topic_id: str("The topic's id."), picture_id: str("The picture's id."), callout_id: str("The callout's id, from get_topic.") }, ["topic_id", "picture_id", "callout_id"]),
      handler: changes((args, project) => {
        const picture = pictureOf(topic(project, string(args, "topic_id")), string(args, "picture_id"));
        const id = string(args, "callout_id");
        if (!removeCallout(picture, id)) throw new Error(`The picture has no callout with the id "${id}". Its callouts are: ${(picture.callouts ?? []).map((c) => c.id).join(", ") || "none"}.`);
        return `Deleted the callout. The picture has ${picture.callouts?.length ?? 0} callout(s) now.`;
      }),
    },
    {
      name: "set_logo",
      description:
        "Sets the book's logo from a PNG or JPEG file in the MCP folder, or removes it. The logo goes on the title page of the PDF and Word file and in the help site's header. Give a plain description (alt_text) of what it shows, for readers who cannot see it. " +
        "Whether the book has a title page, and the fonts and accent colour, are set with set_book_settings (look).",
      inputSchema: schema({ file: str("The picture file, inside the MCP folder."), alt_text: str("What the logo shows."), remove: { type: "boolean", description: "True to remove the logo." } }),
      handler: changes(async (args, project) => {
        if (args.remove === true) {
          delete project.look.logo;
          return "Removed the logo.";
        }
        const path = resolveInside(session.settings.folder, string(args, "file"));
        if (!path) throw new Error("That file is not inside the folder MCP may use.");
        if (!(await session.files.exists(path))) throw new Error(`There is no file at ${path}.`);
        const bytes = await session.files.read(path);
        if (bytes.length > MOST_PICTURE_BYTES) throw new Error(`That file is ${Math.round(bytes.length / 1048576)} MB. A picture can be up to ${MOST_PICTURE_BYTES / 1048576} MB.`);
        const info = readImageInfo(bytes);
        if (!info) throw new Error("That file is not a PNG or JPEG picture. Only those two kinds can be used.");
        const file = `images/${newId()}.${info.extension}`;
        session.assets.set(file, bytes);
        project.look.logo = { file, width: info.width, height: info.height, alt: (optionalString(args, "alt_text") ?? "").trim().slice(0, 300) };
        return `The logo is now ${baseName(path)} (${info.width} by ${info.height}).${project.look.logo.alt ? "" : " It has no description yet: give alt_text, or the book check will say so."}`;
      }),
    },
    {
      name: "set_variables",
      description: "Sets project variables such as PRODUCT, VERSION and COMPANY. {{PRODUCT}} in any text is replaced by its value when the book is made.",
      inputSchema: schema({ values: { type: "object", description: "Variable names and their values.", additionalProperties: { type: "string" } } }, ["values"]),
      handler: changes((args, project) => {
        const values = (typeof args.values === "object" && args.values !== null ? args.values : {}) as Record<string, unknown>;
        const names: string[] = [];
        const checked: [string, string][] = [];
        for (const [raw, value] of Object.entries(values)) {
          const name = cleanVariableName(raw);
          if (!name || typeof value !== "string") throw new Error(`"${raw}" needs a name of capital letters, digits and underscores, and its value as text.`);
          checked.push([name, value]);
        }
        for (const [name, value] of checked) { project.variables[name] = value; names.push(name); }
        return `Set ${names.join(", ") || "nothing"}.`;
      }),
    },
    {
      name: "set_index_terms",
      description: "Sets the index terms of a topic, replacing its list. Terms from the software's first pass that you leave out are not brought back by update_index.",
      inputSchema: schema({ topic_id: str("The topic's id."), terms: { type: "array", items: { type: "string" }, description: "The terms, each 2 to 60 letters." } }, ["topic_id", "terms"]),
      handler: changes((args, project) => {
        const node = topic(project, string(args, "topic_id"));
        if (!Array.isArray(args.terms)) throw new Error("terms must be a list of text.");
        setTermLines(node, args.terms.map(String), project.variables);
        return `"${node.title}" has ${node.index?.terms.length ?? 0} index term(s).`;
      }),
    },
    {
      name: "update_index",
      description: "Makes the software's first pass of index terms for every topic (its title, control names and callout names) and brings it up to date, keeping terms you wrote and not bringing back what you took out.",
      inputSchema: schema({}),
      handler: changes((_args, project) => {
        const result = updateBookIndex(project.tree, project.variables);
        return `Updated: ${result.added} term(s) added and ${result.dropped} taken out, in ${result.topics} topic(s). The index now holds ${buildBookIndex(project, numbering(project.tree)).terms} term(s).`;
      }),
    },
    {
      name: "create_guide",
      description: "Makes a short step-by-step guide from a chapter's topics (those with numbered steps) or from a list of topics. Export it with export_book (guide-word or guide-pdf).",
      inputSchema: schema({
        name: str("The guide's name."), chapter_id: str("A chapter whose topics with steps become the tasks."), topic_ids: { type: "array", items: { type: "string" }, description: "Or a list of topic ids." },
        layout: { type: "string", enum: GUIDE_LAYOUTS.map((l) => l.id), description: "top (picture above its words) or left (pictures left of the words)." },
      }, ["name"]),
      handler: changes((args, project) => {
        const chapter = optionalString(args, "chapter_id");
        const ids = chapter ? tasksFromChapter(project.tree, topic(project, chapter).id) : [];
        const guide = newGuide(string(args, "name"), ids);
        for (const id of Array.isArray(args.topic_ids) ? args.topic_ids : []) if (!addTask(guide, project.tree, String(id))) throw new Error(`"${String(id)}" is not a topic of the book, or is listed twice.`);
        const layout = optionalString(args, "layout");
        if (layout) {
          if (!GUIDE_LAYOUTS.some((l) => l.id === layout)) throw new Error("layout must be top or left.");
          guide.layout = layout as GuideLayout;
        }
        project.guides.push(guide);
        return `Made the guide "${guide.name}" (${guideSummary(project, guide)}). Its id is ${guide.id}.`;
      }),
    },
    {
      name: "list_guides",
      description: "The project's guides with their ids.",
      inputSchema: schema({}),
      handler: async () => {
        const project = session.require();
        return json(project.guides.map((g) => ({ id: g.id, name: g.name, layout: g.layout, summary: guideSummary(project, g) })));
      },
    },
    {
      name: "update_guide",
      description: "Changes a guide: its name, its layout, whether each full picture gets a zoomed close-up, and its tasks. topic_ids, when given, is the whole new list of tasks in order, and replaces the old one.",
      inputSchema: schema({
        guide_id: str("The guide's id, from list_guides."), name: str("A new name."),
        layout: { type: "string", enum: GUIDE_LAYOUTS.map((l) => l.id), description: "top (picture above its words) or left (pictures left of the words). Steps that had their own layout keep it only if it differs." },
        close_ups: { type: "boolean", description: "Show a zoomed close-up of the clicked spot with each full picture that has a click." },
        topic_ids: { type: "array", items: { type: "string" }, description: "The topics that make up the guide, in order." },
      }, ["guide_id"]),
      handler: changes((args, project) => {
        const guide = project.guides.find((g) => g.id === string(args, "guide_id"));
        if (!guide) throw new Error(`There is no guide with the id "${String(args.guide_id)}". list_guides lists them.`);
        const done: string[] = [];
        const name = optionalString(args, "name");
        const layout = optionalString(args, "layout");
        if (layout !== undefined && !GUIDE_LAYOUTS.some((l) => l.id === layout)) throw new Error("layout must be top or left.");
        if (args.close_ups !== undefined && typeof args.close_ups !== "boolean") throw new Error("close_ups must be true or false.");
        let tasks: string[] | undefined;
        if (args.topic_ids !== undefined) {
          if (!Array.isArray(args.topic_ids)) throw new Error("topic_ids must be a list of topic ids.");
          tasks = args.topic_ids.map(String);
          const seen = new Set<string>();
          for (const id of tasks) {
            if (seen.has(id)) throw new Error(`"${id}" is listed twice.`);
            seen.add(id);
            if (!findNode(project.tree, id)) throw new Error(`"${id}" is not a topic of the book. get_outline lists the ids.`);
          }
        }
        if (name !== undefined) { guide.name = name; done.push("name"); }
        if (layout !== undefined) { setGuideLayout(guide, layout as GuideLayout); done.push("layout"); }
        if (typeof args.close_ups === "boolean") { guide.zoomFocus = args.close_ups; done.push("close-ups"); }
        if (tasks) { guide.tasks = tasks; done.push("tasks"); }
        if (done.length === 0) throw new Error("Nothing to change: give a name, layout, close_ups or topic_ids.");
        return `Changed the guide "${guide.name}" (${done.join(", ")}): ${guideSummary(project, guide)}.`;
      }),
    },
    {
      name: "delete_guide",
      description: "Deletes a guide. No topic and no picture is deleted with it. It cannot be undone, so confirm must be true.",
      inputSchema: schema({ guide_id: str("The guide's id, from list_guides."), confirm: { type: "boolean", description: "Must be true." } }, ["guide_id", "confirm"]),
      handler: changes((args, project) => {
        if (args.confirm !== true) throw new Error("confirm must be true to delete a guide.");
        const at = project.guides.findIndex((g) => g.id === string(args, "guide_id"));
        if (at < 0) throw new Error(`There is no guide with the id "${String(args.guide_id)}". list_guides lists them.`);
        const [gone] = project.guides.splice(at, 1);
        return `Deleted the guide "${gone.name}".`;
      }),
    },
    {
      name: "set_picture_view",
      description:
        "Chooses which part of a picture is shown in the book: the whole picture, a region (in pixels from the top left corner), or a zoom on the click (only for a click picture; its size is set with set_book_settings). The picture file is never cut. " +
        "Use it for a tall window that would waste most of a page, or a picture that would print too small to read.",
      inputSchema: schema({
        topic_id: str("The topic's id."), picture_id: str("The picture's id."),
        view: { type: "string", enum: ["whole", "region", "zoom"], description: "whole, region or zoom." },
        left: { type: "number", description: "For region: how far across it starts." }, top: { type: "number", description: "For region: how far down it starts." },
        width: { type: "number", description: "For region: its width." }, height: { type: "number", description: "For region: its height." },
      }, ["topic_id", "picture_id", "view"]),
      handler: changes((args, project) => {
        const node = topic(project, string(args, "topic_id"));
        const picture = pictureOf(node, string(args, "picture_id"));
        const view = string(args, "view");
        if (view === "whole") setPictureView(project.tree, node.id, picture.id, null);
        else if (view === "zoom") {
          if (!picture.click) throw new Error("That picture has no click to zoom in on. Only a picture from a click capture has one.");
          setPictureView(project.tree, node.id, picture.id, { kind: "zoom" });
        } else if (view === "region") {
          const left = numberIn(args.left, "left", 0, picture.width - 1), top = numberIn(args.top, "top", 0, picture.height - 1);
          const width = numberIn(args.width, "width", 1, picture.width - left), height = numberIn(args.height, "height", 1, picture.height - top);
          setPictureView(project.tree, node.id, picture.id, { kind: "crop", x: Math.round(left), y: Math.round(top), width: Math.round(width), height: Math.round(height) });
        } else throw new Error("view must be whole, region or zoom.");
        return `${viewWords(picture, project.zoom, "book") ?? "Picture view: the whole picture is shown."} (The picture is ${picture.width} by ${picture.height} pixels.)`;
      }),
    },
    {
      name: "set_book_settings",
      description:
        "Sets choices about the whole book. Give only what you want to change. zoom_book_percent and zoom_guide_percent are the width of a zoomed picture's part. auto_zoom_for_print zooms in on the click for any click picture that would print too small (PDF and Word). " +
        "click_circle_book and click_circle_guide are the circle drawn on click pictures. writing_style is notes about voice and wording for the built-in AI. words_to_avoid is the list the book check looks for.",
      inputSchema: schema({
        zoom_book_percent: { type: "number", description: `Width of a zoomed part in the book, as a percent of the picture's width, ${ZOOM_LIMITS.min} to ${ZOOM_LIMITS.max}.` },
        zoom_guide_percent: { type: "number", description: `The same for a quick guide, ${ZOOM_LIMITS.min} to ${ZOOM_LIMITS.max}.` },
        auto_zoom_for_print: { type: "boolean", description: "Zoom in on the click automatically when a click picture would print too small." },
        click_circle_book: circleSchema("book"), click_circle_guide: circleSchema("quick guide"),
        look: {
          type: "object", additionalProperties: false,
          description: "The look of the PDF, Word file and help site. Give only what you want to change. A logo is set with set_logo.",
          properties: {
            body_font: { type: "string", enum: FONTS.map((f) => f.id), description: "The font of the text." },
            heading_font: { type: "string", enum: FONTS.map((f) => f.id), description: "The font of the headings, contents and labels." },
            accent: str("The colour of headings and links as six hex digits such as 1F4E8C. Empty text means none. A colour too light for text on white is allowed and shows up in check_book."),
            cover: { type: "boolean", description: "Whether the book starts with a title page." },
            header: str(`The words at the top of each page after the first, up to ${MOST_LOOK_TEXT} letters. Empty means the book's title. Variables such as {{PRODUCT}} are filled in.`),
            footer: str(`The words at the bottom of each page, up to ${MOST_LOOK_TEXT} letters. Empty means none.`),
            page_size: { type: "string", enum: PAGE_SIZES.map((p) => p.id), description: "The paper size of the PDF and the Word file." },
          },
        },
        writing_style: str(`Notes for the AI about how the book should read, up to ${MOST_STYLE} letters. Empty text clears them.`),
        words_to_avoid: { type: "array", items: { type: "string" }, description: `Words or phrases the book should not use, up to ${MOST_AVOID_WORDS}: "file => document", or just "file". An empty list clears it.` },
      }),
      handler: changes((args, project) => {
        const done: string[] = [];
        // Everything is checked first, so a mistake changes nothing.
        const zoomBook = args.zoom_book_percent === undefined ? undefined : numberIn(args.zoom_book_percent, "zoom_book_percent", ZOOM_LIMITS.min, ZOOM_LIMITS.max);
        const zoomGuide = args.zoom_guide_percent === undefined ? undefined : numberIn(args.zoom_guide_percent, "zoom_guide_percent", ZOOM_LIMITS.min, ZOOM_LIMITS.max);
        if (args.auto_zoom_for_print !== undefined && typeof args.auto_zoom_for_print !== "boolean") throw new Error("auto_zoom_for_print must be true or false.");
        const circles: [HighlightKind, string, Record<string, unknown>][] = [];
        for (const [kind, key] of [["book", "click_circle_book"], ["guide", "click_circle_guide"]] as const) {
          const raw = args[key];
          if (raw === undefined) continue;
          if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`${key} must be an object such as { "show": true, "size_percent": 4 }.`);
          const given = raw as Record<string, unknown>;
          const next: Record<string, unknown> = {};
          if (given.show !== undefined) { if (typeof given.show !== "boolean") throw new Error(`${key}.show must be true or false.`); next.show = given.show; }
          if (given.size_percent !== undefined) next.size = numberIn(given.size_percent, `${key}.size_percent`, SIZE_LIMITS.min, SIZE_LIMITS.max);
          if (given.colour !== undefined) next.color = colourOf(given.colour, `${key}.colour`);
          if (given.see_through_percent !== undefined) next.seeThrough = numberIn(given.see_through_percent, `${key}.see_through_percent`, SEE_THROUGH_LIMITS.min, SEE_THROUGH_LIMITS.max);
          circles.push([kind, key, next]);
        }
        let lookNext: ReturnType<typeof cleanLook> | undefined;
        if (args.look !== undefined) {
          if (typeof args.look !== "object" || args.look === null || Array.isArray(args.look)) throw new Error("look must be an object such as { \"accent\": \"1F4E8C\", \"cover\": false }.");
          const given = args.look as Record<string, unknown>;
          const next: Record<string, unknown> = { ...project.look };
          const oneOf = (value: unknown, name: string, allowed: string[]) => { if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`look.${name} must be one of: ${allowed.join(", ")}.`); return value; };
          if (given.body_font !== undefined) next.bodyFont = oneOf(given.body_font, "body_font", FONTS.map((f) => f.id));
          if (given.heading_font !== undefined) next.headingFont = oneOf(given.heading_font, "heading_font", FONTS.map((f) => f.id));
          if (given.page_size !== undefined) next.pageSize = oneOf(given.page_size, "page_size", PAGE_SIZES.map((p) => p.id));
          if (given.accent !== undefined) {
            if (typeof given.accent !== "string") throw new Error("look.accent must be text: six hex digits such as 1F4E8C, or empty for none.");
            if (given.accent.trim() === "") next.accent = "";
            else { const code = normalizeHex(given.accent); if (!code) throw new Error("look.accent must be six hex digits such as 1F4E8C, or empty for none."); next.accent = code; }
          }
          if (given.cover !== undefined) { if (typeof given.cover !== "boolean") throw new Error("look.cover must be true or false."); next.cover = given.cover; }
          for (const [key, name] of [["header", "header"], ["footer", "footer"]] as const) {
            const value = given[key];
            if (value === undefined) continue;
            if (typeof value !== "string" || value.length > MOST_LOOK_TEXT) throw new Error(`look.${name} must be text of up to ${MOST_LOOK_TEXT} letters.`);
            next[name] = value;
          }
          lookNext = cleanLook(next);
        }
        let style: string | undefined;
        if (args.writing_style !== undefined) {
          if (typeof args.writing_style !== "string") throw new Error("writing_style must be text.");
          if (args.writing_style.length > MOST_STYLE) throw new Error(`writing_style can be up to ${MOST_STYLE} letters; this is ${args.writing_style.length}.`);
          style = args.writing_style;
        }
        let avoid: ReturnType<typeof avoidWordsFromLines> | undefined;
        if (args.words_to_avoid !== undefined) {
          if (!Array.isArray(args.words_to_avoid)) throw new Error("words_to_avoid must be a list of text.");
          if (args.words_to_avoid.length > MOST_AVOID_WORDS) throw new Error(`words_to_avoid can hold up to ${MOST_AVOID_WORDS} lines.`);
          avoid = avoidWordsFromLines(args.words_to_avoid.map(String).join("\n"));
        }
        if (zoomBook !== undefined) { project.zoom.book.size = zoomBook; done.push("zoom for the book"); }
        if (zoomGuide !== undefined) { project.zoom.guide.size = zoomGuide; done.push("zoom for a quick guide"); }
        if (typeof args.auto_zoom_for_print === "boolean") { project.paper.autoZoom = args.auto_zoom_for_print; done.push("automatic zoom for print"); }
        if (lookNext) { project.look = lookNext; done.push(`look (${lookWords(lookNext)})`); }
        for (const [kind, key, next] of circles) { Object.assign(project.highlight[kind], next); done.push(key.replace(/_/g, " ")); }
        if (style !== undefined) { project.writingStyle = style.replace(/\r\n?/g, "\n").trim(); done.push("writing style"); }
        if (avoid !== undefined) { project.avoidWords = avoid; done.push("words to avoid"); }
        if (done.length === 0) throw new Error("Nothing to change: give at least one setting.");
        return `Set: ${done.join(", ")}.`;
      }),
    },
    {
      name: "check_book",
      description: "The book check: pictures with no description, colours too close, callouts with no name, empty topics, missing files, variables with no value, pictures too small to read on paper. It only advises.",
      inputSchema: schema({}),
      handler: async () => {
        const project = session.require();
        const { active, ignored } = splitIssues(checkProject(project), project.checks);
        return json({ summary: summaryWords(active, ignored), things: active.slice(0, 100).map((i) => ({ kind: i.kind, where: i.where, what: i.words, how_to_fix: i.fix })), shown: Math.min(active.length, 100), total: active.length });
      },
    },
    {
      name: "save_project",
      description: "Saves the project (every change is already saved as it is made). With a file name, saves a copy there and carries on with that file.",
      inputSchema: schema({ file: str("Optional file name inside the MCP folder.") }),
      handler: async (args) => {
        session.require();
        const given = optionalString(args, "file");
        if (given) {
          const path = projectFile(session.settings.folder, given);
          if (!path) throw new Error("That file is not inside the folder MCP may use.");
          session.filePath = path;
        }
        return text(`Saved to ${await session.save()}.`);
      },
    },
    {
      name: "export_book",
      description:
        "Makes an export and saves it in the MCP folder. kind: help-site, json and markdown make a zip file; word and guide-word make a .docx; pdf and guide-pdf make a PDF. The guide kinds need guide_id from list_guides. The project is not changed.",
      inputSchema: schema({
        kind: { type: "string", enum: Object.keys(EXPORT_EXTENSION), description: "The kind of export." },
        file: str("The file to make, inside the MCP folder. Its ending (.zip, .docx or .pdf) is added if left off."), guide_id: str("For a guide kind: which guide."),
        include_comments: { type: "boolean", description: "For json: include the working comments." },
        target: str("For every kind but json: the name of a target (set_targets) to make it for. Content with a condition that target hides is left out. Without it nothing is left out."),
      }, ["kind", "file"]),
      handler: async (args) => {
        session.require();
        const kind = string(args, "kind") as ExportKind;
        if (!(kind in EXPORT_EXTENSION)) throw new Error(`kind must be one of: ${Object.keys(EXPORT_EXTENSION).join(", ")}.`);
        const extension = EXPORT_EXTENSION[kind];
        const full = resolveInside(session.settings.folder, string(args, "file"));
        if (!full) throw new Error("That file is not inside the folder MCP may use.");
        const path = full.toLowerCase().endsWith(`.${extension}`) ? full : `${full}.${extension}`;
        const targetName = optionalString(args, "target");
        const project = session.require();
        const target = targetName ? project.targets.find((t) => t.name.toLowerCase() === targetName.trim().toLowerCase()) : undefined;
        if (targetName && !target) throw new Error(`There is no target called "${targetName}" (${project.targets.map((t) => t.name).join(", ") || "none have been made; set_targets makes them"}).`);
        const made = await deps.exporter(kind, { guideId: optionalString(args, "guide_id"), comments: args.include_comments === true, ...(target ? { targetId: target.id } : {}) });
        await session.files.makeFolder(folderOf(path));
        await session.files.write(path, made.bytes);
        return text(`Made the ${kind} export: ${path} (${made.bytes.length} bytes, ${baseName(path)}).${made.notes.length ? `\nNot everything could be included:\n${made.notes.join("\n")}` : ""}`);
      },
    },
  ];
  return tools;
}

export { failed };
