import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Rust's build folder is locked while compiling, so Vite must not watch it.
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: { target: "es2022", outDir: "dist" },
});
