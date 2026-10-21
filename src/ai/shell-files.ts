// The real `ModelFiles`: asks the shell (src-tauri/src/models.rs) for everything that touches the disk or needs Windows. The tests use a stand-in with the same rules (tests/fake-model-files.ts).
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { MachineFacts, ModelFiles, ModelSizes } from "./download.ts";

export function createShellFiles(file: string): ModelFiles {
  return {
    facts: () => invoke<MachineFacts>("ai_machine_facts"),
    sizes: () => invoke<ModelSizes>("ai_model_files", { file }),
    // The piece goes as raw bytes; the file and the place for it go in the headers.
    append: (offset, bytes) => invoke<number>("ai_model_append", bytes, { headers: { file, offset: String(offset) } }),
    finish: () => invoke<void>("ai_model_finish", { file }),
    remove: (what) => invoke<void>("ai_model_remove", { file, what }),
    async hash(which, onProgress) {
      const stop = await listen<{ done: number; total: number }>("ai-hash-progress", (event) => onProgress(event.payload.done, event.payload.total));
      try {
        return await invoke<string>("ai_model_hash", { file, which });
      } finally {
        stop();
      }
    },
    saveRecord: (text) => invoke<void>("ai_model_save_record", { file, text }),
    writeLicence: (text) => invoke<void>("ai_model_write_licence", { file, text }),
    readLicence: () => invoke<string | null>("ai_model_read_licence", { file }),
  };
}
