// A saved project is ONE file named after the project, such as Test1.openexplainer.
// Inside it are the same files described in docs/format-spec.md.
import { fromFiles, toFiles } from "./files.ts";
import type { Project } from "./model.ts";
import { unzip, zip } from "./zip.ts";

export const EXTENSION = "openexplainer";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function packProject(project: Project): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(toFiles(project))) files[name] = encoder.encode(text);
  return zip(files);
}

export async function unpackProject(bytes: Uint8Array): Promise<Project> {
  const files: Record<string, string> = {};
  for (const [name, data] of Object.entries(await unzip(bytes))) files[name] = decoder.decode(data);
  return fromFiles(files);
}

/** A safe file name from a project name: no characters Windows refuses. */
export function fileNameFor(projectName: string): string {
  const clean = projectName.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled project";
  return `${clean}.${EXTENSION}`;
}
