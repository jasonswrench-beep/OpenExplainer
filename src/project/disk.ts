// Reads and writes a project folder using Tauri's file and dialog plugins.
import { open } from "@tauri-apps/plugin-dialog";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { fromFiles, PROJECT_FILE, STRUCTURE_FILE, toFiles } from "./files.ts";
import type { Project } from "./model.ts";

export async function chooseFolder(title: string): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false, title });
  return typeof picked === "string" ? picked : null;
}

function join(folder: string, name: string): string {
  return folder.replace(/[\\/]+$/, "") + "/" + name;
}

export async function saveProject(folder: string, project: Project): Promise<void> {
  if (!(await exists(folder))) await mkdir(folder, { recursive: true });
  const files = toFiles(project);
  for (const [name, text] of Object.entries(files)) {
    await writeTextFile(join(folder, name), text);
  }
}

export async function loadProject(folder: string): Promise<Project> {
  if (!(await exists(join(folder, PROJECT_FILE)))) {
    throw new Error("That folder does not contain an OpenExplainer project.");
  }
  const files: Record<string, string> = {};
  for (const name of [PROJECT_FILE, STRUCTURE_FILE]) {
    files[name] = await readTextFile(join(folder, name));
  }
  return fromFiles(files);
}
