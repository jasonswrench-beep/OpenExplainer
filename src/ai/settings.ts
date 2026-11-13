// The AI help settings: which answerer drafts text. Kept by the shell (src-tauri/src/ai.rs) in the app's config folder, not in a project. The starting choice is "none": everything in
// OpenExplainer works by hand, and nothing is drafted or sent anywhere until the author chooses otherwise.

export type AiChoice = "none" | "builtin" | "key";

export interface AiSettings {
  choice: AiChoice;
}

export const AI_CHOICES: readonly AiChoice[] = ["none", "builtin", "key"];

export const DEFAULT_AI_SETTINGS: AiSettings = { choice: "none" };

/** Settings as read from anywhere (a file, a message): anything missing or odd becomes the starting choice. */
export function cleanAiSettings(raw: unknown): AiSettings {
  const choice = raw && typeof raw === "object" ? (raw as { choice?: unknown }).choice : undefined;
  return typeof choice === "string" && (AI_CHOICES as readonly string[]).includes(choice) ? { choice: choice as AiChoice } : { ...DEFAULT_AI_SETTINGS };
}

/** What the built-in model's files are doing on this PC (src/ai/download.ts works it out). "unchecked" is a whole file that has not yet been checked against its fingerprint. */
export type ModelState = "absent" | "partial" | "unchecked" | "ready" | "damaged";

/** One plain sentence on where AI help stands, for the dialog and for what a screen reader is told. */
export function aiStatusWords(settings: AiSettings, model: ModelState): string {
  switch (settings.choice) {
    case "none":
      return "AI help is off. Everything works by hand, nothing is drafted and nothing is sent anywhere.";
    case "key":
      return "Using your own key for a hosted AI service is not built yet, so nothing can be drafted.";
    case "builtin":
      switch (model) {
        case "ready":
          return "AI help will use the built-in model on this PC.";
        case "partial":
          return "The built-in model is only partly downloaded, so nothing can be drafted yet.";
        case "unchecked":
          return "The built-in model file is on this PC but has not been checked yet, so nothing can be drafted until it is.";
        case "damaged":
          return "The built-in model file is damaged, so nothing can be drafted until it is downloaded again.";
        default:
          return "AI help will use the built-in model, but the model is not on this PC yet, so nothing can be drafted. Download it with the Download button.";
      }
  }
}
