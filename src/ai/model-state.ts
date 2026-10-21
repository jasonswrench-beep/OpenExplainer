// What the built-in model's file is doing on this PC. The download (part 2 of docs/local-ai-plan.md) will ask the shell; until then the model is never there.
import type { ModelState } from "./settings.ts";

export async function modelState(): Promise<ModelState> {
  return "absent";
}
