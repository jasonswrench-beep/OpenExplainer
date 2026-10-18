// Reads and writes a project file using Tauri's file and dialog plugins.
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { EXTENSION, fileNameFor, packProject, unpackProject } from "./package.ts";
import type { Project } from "./model.ts";

const filters = [{ name: "OpenExplainer project", extensions: [EXTENSION] }];

export async function chooseSavePath(projectName: string): Promise<string | null> {
  const picked = await save({ title: "Save project", defaultPath: fileNameFor(projectName), filters });
  if (!picked) return null;
  return picked.toLowerCase().endsWith(`.${EXTENSION}`) ? picked : `${picked}.${EXTENSION}`;
}

export async function chooseOpenPath(): Promise<string | null> {
  const picked = await open({ title: "Open project", multiple: false, directory: false, filters });
  return typeof picked === "string" ? picked : null;
}

export async function saveProject(path: string, project: Project): Promise<void> {
  await writeFile(path, packProject(project));
}

export async function loadProject(path: string): Promise<Project> {
  return unpackProject(await readFile(path));
}
