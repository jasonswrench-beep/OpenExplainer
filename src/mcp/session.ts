// What an MCP session holds: the settings the author chose (whether MCP is on, which folder projects may be in, whether a whole screen may be captured), the way to read and write files
// (always inside that folder), and the project that is open. The real file access is the app's (src/mcp/main.ts); a test gives a pretend one, so all of this is tried without the app.
import type { Project } from "../project/model.ts";
import { packProject, unpackProject, type Assets } from "../project/package.ts";
import { folderOf, isInside, PROJECT_EXTENSION } from "./paths.ts";

/** What the author turned on for MCP. Everything is off to begin with. */
export interface McpSettings {
  enabled: boolean;
  /** Projects can only be opened and saved inside this folder. */
  folder: string;
  /** May an assistant capture a whole screen? Off: only one window at a time. */
  allowFullScreen: boolean;
}

export interface FileEntry {
  name: string;
  isDirectory: boolean;
}

/** Files, as an MCP session reaches them. Every path is checked to be inside the chosen folder before it gets here. */
export interface McpFiles {
  read(path: string): Promise<Uint8Array>;
  write(path: string, bytes: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(folder: string): Promise<FileEntry[]>;
  makeFolder(path: string): Promise<void>;
  /** Adds text to the end of a text file, making it if it is not there. */
  append(path: string, words: string): Promise<void>;
}

export class Session {
  project: Project | null = null;
  assets: Assets = new Map();
  /** Where the open project is saved, so every change can be saved as it is made. */
  filePath: string | null = null;

  readonly settings: McpSettings;
  readonly files: McpFiles;

  constructor(settings: McpSettings, files: McpFiles) {
    this.settings = settings;
    this.files = files;
  }

  /** The open project, or an error that says how to open one. */
  require(): Project {
    if (!this.project) throw new Error("No project is open. Use create_project to make one, or open_project to open one (list_projects shows what is in the folder).");
    return this.project;
  }

  /** Guards a path: only inside the folder the author chose. */
  inside(path: string): string {
    if (!isInside(path, this.settings.folder)) throw new Error(`That path is outside the folder MCP may use (${this.settings.folder}). Use a name inside it.`);
    return path;
  }

  /** Opens a project file. Returns the names of picture files the project lists but the file did not hold. */
  async open(path: string): Promise<string[]> {
    this.inside(path);
    if (!(await this.files.exists(path))) throw new Error(`There is no project file at ${path}. list_projects shows the projects in the folder.`);
    const loaded = await unpackProject(await this.files.read(path));
    this.project = loaded.project;
    this.assets = loaded.assets;
    this.filePath = path;
    return loaded.missing;
  }

  /** Makes the project open and saves it at once, so the file exists. */
  async start(project: Project, path: string): Promise<void> {
    this.inside(path);
    this.project = project;
    this.assets = new Map();
    this.filePath = path;
    await this.save();
  }

  /** Saves the open project where it was opened or made. */
  async save(): Promise<string> {
    const project = this.require();
    if (!this.filePath) throw new Error("The project has no file yet. Use save_project with a file name.");
    this.inside(this.filePath);
    if (!this.filePath.toLowerCase().endsWith(PROJECT_EXTENSION)) throw new Error(`A project file name ends in ${PROJECT_EXTENSION}.`);
    await this.files.makeFolder(folderOf(this.filePath));
    await this.files.write(this.filePath, packProject(project, this.assets));
    return this.filePath;
  }
}
