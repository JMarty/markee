import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  // a Mermaid lustán betöltött darabjai nagyok, de csak diagramos dokumentumnál töltődnek be
  build: { target: "chrome120", outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 2000 },
});
