// The things an AI assistant can ask OpenExplainer to do over MCP: make and open a project in the folder the author chose, read the outline and a topic, add topics, write a topic's page, name and
// describe the callouts on its pictures, set index terms, check the book, save, and export in any kind. Each does what its description says and answers in plain words; a call that cannot be
// done says why, and changes nothing. Every change is saved at once (the assistant may never think to). The capture tools are in `src/mcp/capture-tools.ts`.
import { buildBookIndex, indexSummary, setTermLines, updateBookIndex } from "../project/book-index.ts";
import { addCalloutFromClick } from "../project/callouts.ts";
import { checkProject, splitIssues, summaryWords } from "../project/checks.ts";
import { addTask, GUIDE_LAYOUTS, guideSummary, newGuide, tasksFromChapter, type GuideLayout } from "../project/guides.ts";
import { addNode, cleanVariableName, createProject, findNode, numbering, removeNode, STATUSES, type Picture, type Project, type Status, type TreeNode } from "../project/model.ts";
import { fileNameFor } from "../project/package.ts";
import { EXPORT_EXTENSION, type ExportKind, type MadeExport } from "../export/make.ts";
import { BLOCK_HELP, blocksFromJson, pageFromBlocks, pictureToJson, topicToJson } from "./blocks.ts";
import { baseName, folderOf, projectFile, resolveInside, PROJECT_EXTENSION } from "./paths.ts";
import { failed, text, type ToolDef, type ToolResult } from "./protocol.ts";
import type { Session } from "./session.ts";

export interface ToolDeps {
  session: Session;
  /** Makes an export of the open project (src/export/make.ts, with the app's drawing and printing). */
  exporter(kind: ExportKind, options: { guideId?: string; comments?: boolean }): Promise<MadeExport>;
}

type Args = Record<string, unknown>;

export const INSTRUCTIONS =
  "OpenExplainer makes still-image tutorials and how-to books from screen captures. Work like this: create_project (or open_project), add_topic for each chapter and topic, then fill each topic with set_page. " +
  "Text uses **bold**, *italic* and [[Control name]] for the label of a button or menu exactly as it appears on screen. Numbered procedures hold steps; each step may have one of the topic's pictures and a result line. " +
  "To document a program: list_windows, capture_window for a screen, or start_click_capture (naming the window), then use the program yourself, then stop_click_capture. Each click becomes a picture with a note of what was clicked; " +
  "view_picture shows you a picture and get_topic lists them. Capture is one window at a time. " +
  "Name and describe the callouts on a picture with describe_picture, and give every picture a plain description (alt_text) for readers who cannot see it. Never write about a control that is not in the capture. " +
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

function pictureOf(node: TreeNode, id: string): Picture {
  const picture = node.pictures.find((p) => p.id === id);
  if (!picture) throw new Error(`The topic "${node.title}" has no picture with the id "${id}". Its pictures are: ${node.pictures.map((p) => p.id).join(", ") || "none yet"}.`);
  return picture;
}

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
      description: "Makes a new, empty project and opens it. It is saved in the MCP folder as <name>.openexplainer unless a file name is given. Fails if that file exists.",
      inputSchema: schema({ name: str("The project's name, such as the name of the program being documented."), file: str("Optional file name inside the MCP folder (the .openexplainer ending is added).") }, ["name"]),
      handler: async (args) => {
        const name = string(args, "name");
        const path = projectFile(session.settings.folder, optionalString(args, "file") ?? fileNameFor(name));
        if (!path) throw new Error("That file name is not inside the folder MCP may use.");
        if (await session.files.exists(path)) throw new Error(`There is already a project at ${path}. Use open_project to open it, or give another file name.`);
        await session.start(createProject(name), path);
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
        return json({ project: project.name, file: session.filePath, variables: project.variables, topics: outline(project.tree, numbering(project.tree)), index: indexSummary(project.tree) });
      },
    },
    {
      name: "get_topic",
      description: "One topic in full: its page as blocks, its pictures (what was clicked, its callouts and their names) and its index terms.",
      inputSchema: schema({ topic_id: str("The topic's id, from get_outline.") }, ["topic_id"]),
      handler: async (args) => {
        const project = session.require();
        const node = topic(project, string(args, "topic_id"));
        return json(topicToJson(node, numbering(project.tree).get(node.id) ?? ""));
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
        removeNode(project.tree, node.id);
        project.guides = project.guides.map((g) => ({ ...g, tasks: g.tasks.filter((id) => id !== node.id) }));
        return `Deleted "${node.title}" and what was under it.`;
      }),
    },
    {
      name: "set_page",
      description: `Replaces everything on a topic's page with these blocks. ${BLOCK_HELP}`,
      inputSchema: schema({ topic_id: str("The topic's id."), blocks: { type: "array", description: "The blocks, in order.", items: { type: "object" } } }, ["topic_id", "blocks"]),
      handler: changes((args, project) => {
        const node = topic(project, string(args, "topic_id"));
        const ids = new Set(node.pictures.map((p) => p.id));
        node.page = pageFromBlocks(blocksFromJson(args.blocks, ids), ids);
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
        const added = blocksFromJson(args.blocks, ids);
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
      description: "Adds a callout (lettered marker) to a click picture at the item that was clicked, named from what Windows said it was. Name and describe it afterwards with describe_picture.",
      inputSchema: schema({ topic_id: str("The topic's id."), picture_id: str("The picture's id.") }, ["topic_id", "picture_id"]),
      handler: changes((args, project) => {
        const picture = pictureOf(topic(project, string(args, "topic_id")), string(args, "picture_id"));
        const made = addCalloutFromClick(picture);
        if (!made) throw new Error("That picture has no click to make a callout from.");
        return `Added callout ${made.id}.`;
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
      description: "Makes the software's first pass of index terms for every topic (its title, headings, control names and callout names) and brings it up to date, keeping terms you wrote and not bringing back what you took out.",
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
      }, ["kind", "file"]),
      handler: async (args) => {
        session.require();
        const kind = string(args, "kind") as ExportKind;
        if (!(kind in EXPORT_EXTENSION)) throw new Error(`kind must be one of: ${Object.keys(EXPORT_EXTENSION).join(", ")}.`);
        const extension = EXPORT_EXTENSION[kind];
        const full = resolveInside(session.settings.folder, string(args, "file"));
        if (!full) throw new Error("That file is not inside the folder MCP may use.");
        const path = full.toLowerCase().endsWith(`.${extension}`) ? full : `${full}.${extension}`;
        const made = await deps.exporter(kind, { guideId: optionalString(args, "guide_id"), comments: args.include_comments === true });
        await session.files.makeFolder(folderOf(path));
        await session.files.write(path, made.bytes);
        return text(`Made the ${kind} export: ${path} (${made.bytes.length} bytes, ${baseName(path)}).${made.notes.length ? `\nNot everything could be included:\n${made.notes.join("\n")}` : ""}`);
      },
    },
  ];
  return tools;
}

export { failed };
