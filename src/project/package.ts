// A saved project is ONE file named after the project, such as Test1.openexplainer.
// Inside it are the files described in docs/format-spec.md, and a picture file for each picture.
import { fromFiles, toFiles } from "./files.ts";
import { pictureFiles, type Project } from "./model.ts";
import { unzip, zip } from "./zip.ts";

export const EXTENSION = "openexplainer";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The picture files held in memory, by their path inside the package. */
export type Assets = Map<string, Uint8Array>;

export function packProject(project: Project, assets: Assets = new Map()): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(toFiles(project))) files[name] = encoder.encode(text);
  // Only pictures the project still uses are saved, so removed pictures do not pile up.
  for (const file of pictureFiles(project.tree)) {
    const bytes = assets.get(file);
    if (bytes) files[file] = bytes;
  }
  return zip(files);
}

export async function unpackProject(bytes: Uint8Array): Promise<{ project: Project; assets: Assets; missing: string[] }> {
  const files: Record<string, string> = {};
  const assets: Assets = new Map();
  for (const [name, data] of Object.entries(await unzip(bytes))) {
    if (name.startsWith("images/")) assets.set(name, data);
    else files[name] = decoder.decode(data);
  }
  const project = fromFiles(files);
  const missing = [...pictureFiles(project.tree)].filter((file) => !assets.has(file));
  return { project, assets, missing };
}

/** A safe file name from a project name: no characters Windows refuses. */
export function fileNameFor(projectName: string): string {
  const clean = projectName.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled project";
  return `${clean}.${EXTENSION}`;
}
