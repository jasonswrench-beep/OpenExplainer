// Where an assistant may open and save things: only inside the folder the author named in the MCP settings. These rules are about names only (they never touch the disk), so they are tried on
// their own. Windows paths are not case sensitive, so they are compared without regard to capitals, and `/` and `\` mean the same. Before a file is touched, src/mcp/main.ts also
// follows the path through links and junctions (the shell's mcp_real_path) and checks where it really leads with `isInside` again.

/** A path with one kind of slash, no repeated or trailing slashes. */
export function normalizePath(path: string): string {
  return path.replace(/\//g, "\\").replace(/\\+/g, "\\").replace(/(.)\\$/, "$1");
}

const hasParentStep = (path: string) => normalizePath(path).split("\\").some((part) => part === "..");

/** Is `path` the folder or something inside it? A path with `..` in it is never inside, whatever it would lead to. */
export function isInside(path: string, folder: string): boolean {
  if (!folder.trim() || hasParentStep(path)) return false;
  const p = normalizePath(path).toLowerCase();
  const f = normalizePath(folder).toLowerCase();
  return p === f || p.startsWith(`${f}\\`);
}

const absolute = (path: string) => /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");

/** What a file name or path an assistant gave means: relative to the folder, or a full path, and in either case inside it. `null` when it is not inside. */
export function resolveInside(folder: string, given: string): string | null {
  const name = given.trim();
  if (!name || name.includes("\0")) return null;
  const full = normalizePath(absolute(name) ? name : `${folder}\\${name}`);
  return isInside(full, folder) ? full : null;
}

export const PROJECT_EXTENSION = ".openexplainer";

/** The path of a project file: inside the folder, with the project's extension added if it was left off. */
export function projectFile(folder: string, given: string): string | null {
  const full = resolveInside(folder, given);
  if (!full) return null;
  return full.toLowerCase().endsWith(PROJECT_EXTENSION) ? full : `${full}${PROJECT_EXTENSION}`;
}

/** The file name without its folder. */
export function baseName(path: string): string {
  const n = normalizePath(path);
  return n.slice(n.lastIndexOf("\\") + 1);
}

/** The folder a file is in. */
export function folderOf(path: string): string {
  const n = normalizePath(path);
  return n.slice(0, Math.max(0, n.lastIndexOf("\\")));
}
