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
    // Three pages: the app, the small Cancel window shown while a capture runs, and the full-screen page for choosing a rectangle.
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        "capture-bar": resolve(__dirname, "capture-bar.html"),
        selection: resolve(__dirname, "selection.html"),
      },
    },
  },
});
