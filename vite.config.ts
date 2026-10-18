import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Rust's build folder is locked while compiling, so Vite must not watch it.
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    // Two pages: the app, and the small Cancel window shown while a capture runs.
    rollupOptions: { input: { main: resolve(__dirname, "index.html"), "capture-bar": resolve(__dirname, "capture-bar.html") } },
  },
});
