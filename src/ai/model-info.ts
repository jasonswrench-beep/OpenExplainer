// The one built-in model, pinned to the exact file that was audited (docs/local-ai-plan.md section 5). The commit and the SHA-256 mean the app can only ever accept that file, not whatever the
// publisher puts there later. Changing the file is changing this table, then the audit.

export interface ModelInfo {
  /** A short name for the author. */
  title: string;
  /** Plain words on what it is. */
  summary: string;
  /** The repository the file is downloaded from, the exact commit of it, and the file. */
  repo: string;
  commit: string;
  file: string;
  bytes: number;
  sha256: string;
  /** The model it was squeezed from. */
  originalRepo: string;
  licenceName: string;
  licenceHolder: string;
  /** Where the licence text is, pinned to a commit like the model, so it can be kept next to the model and shown. */
  licenceRepo: string;
  licenceCommit: string;
  licenceBytes: number;
  licenceSha256: string;
  /** The web site the files come from. Only a test sets this (to a stand-in server); the real model always comes from Hugging Face. */
  hub?: string;
}

const HUB = "https://huggingface.co";

export const BUILTIN_MODEL: ModelInfo = {
  title: "Qwen 3.5, 4 billion parameters (Q4_K_M)",
  summary: "a small language model from Alibaba Cloud (Qwen), squeezed into a smaller file by Unsloth so it runs on an ordinary PC",
  repo: "unsloth/Qwen3.5-4B-GGUF",
  commit: "e87f176479d0855a907a41277aca2f8ee7a09523",
  file: "Qwen3.5-4B-Q4_K_M.gguf",
  bytes: 2_740_937_888,
  sha256: "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4",
  originalRepo: "Qwen/Qwen3.5-4B",
  licenceName: "Apache License 2.0",
  licenceHolder: "Alibaba Cloud",
  licenceRepo: "Qwen/Qwen3.5-4B",
  licenceCommit: "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a",
  licenceBytes: 11_544,
  licenceSha256: "bbedc3fda3305820b977265f01b8619d87570a6739de3a5582c3464840f1e57a",
};

/** The address the model file is downloaded from: a commit, never a branch, so it cannot change under us. */
export function modelUrl(model: ModelInfo = BUILTIN_MODEL): string {
  return `${model.hub ?? HUB}/${model.repo}/resolve/${model.commit}/${model.file}`;
}

/** The address of the licence text that goes with the model. */
export function licenceUrl(model: ModelInfo = BUILTIN_MODEL): string {
  return `${model.hub ?? HUB}/${model.licenceRepo}/raw/${model.licenceCommit}/LICENSE`;
}

/** The page the model can be looked at on, for the author. */
export function modelPageUrl(model: ModelInfo = BUILTIN_MODEL): string {
  return `${model.hub ?? HUB}/${model.repo}/tree/${model.commit}`;
}

/** A size in words: "2.7 GB", "672 MB". Decimal units, like the download site. */
export function sizeInWords(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}
