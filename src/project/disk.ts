// Reads and writes a project file using Tauri's file and dialog plugins.
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { EXTENSION, fileNameFor, packProject, unpackProject } from "./package.ts";
import type { Project } from "./model.ts";
import type { Assets } from "./package.ts";

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

export async function saveProject(path: string, project: Project, assets: Assets): Promise<void> {
  await writeFile(path, packProject(project, assets));
}

export async function loadProject(path: string) {
  return unpackProject(await readFile(path));
}

/** Lets the author pick one or more PNG or JPEG pictures, and reads them. */
export async function chooseImages(): Promise<{ name: string; bytes: Uint8Array }[]> {
  const picked = await open({
    title: "Choose pictures to import",
    multiple: true,
    directory: false,
    filters: [{ name: "Pictures (PNG or JPEG)", extensions: ["png", "jpg", "jpeg"] }],
  });
  const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
  const out: { name: string; bytes: Uint8Array }[] = [];
  for (const path of paths) out.push({ name: path.split(/[\\/]/).pop() ?? path, bytes: await readFile(path) });
  return out;
}

const zipFilters = [{ name: "Zip file", extensions: ["zip"] }];

/** Asks where to save an export (a zip file). `null` if cancelled. */
export async function chooseExportPath(suggestedName: string): Promise<string | null> {
  const picked = await save({ title: "Save the export", defaultPath: suggestedName, filters: zipFilters });
  if (!picked) return null;
  return picked.toLowerCase().endsWith(".zip") ? picked : `${picked}.zip`;
}

/** Asks which export (a zip file) to import. `null` if cancelled. */
export async function chooseImportPath(): Promise<string | null> {
  const picked = await open({ title: "Import an export", multiple: false, directory: false, filters: zipFilters });
  return typeof picked === "string" ? picked : null;
}

export async function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
  await writeFile(path, bytes);
}

export async function readBytes(path: string): Promise<Uint8Array> {
  return readFile(path);
}
