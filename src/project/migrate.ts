// Turns a project of any older version into the current version.
// Every change to the saved format bumps CURRENT_VERSION and adds a step here.
import { CURRENT_VERSION, type Project } from "./model.ts";

type Raw = { version?: unknown; [key: string]: unknown };

const steps: Record<number, (raw: Raw) => Raw> = {
  // Example for the future: 1: (raw) => ({ ...raw, version: 2, newField: "" }),
};

export function migrate(input: unknown): Project {
  if (typeof input !== "object" || input === null) throw new Error("This is not an OpenExplainer project.");
  let raw = input as Raw;
  if (typeof raw.version !== "number") throw new Error("This project has no version number, so it cannot be opened safely.");
  if (raw.version > CURRENT_VERSION) {
    throw new Error(`This project was saved by a newer OpenExplainer (format ${raw.version}). Update OpenExplainer to open it.`);
  }
  while ((raw.version as number) < CURRENT_VERSION) {
    const step = steps[raw.version as number];
    if (!step) throw new Error(`There is no way to upgrade project format ${raw.version}.`);
    raw = step(raw);
  }
  return raw as unknown as Project;
}
