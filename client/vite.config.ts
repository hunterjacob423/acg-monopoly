import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The board definition lives outside client/ so the server and the UI
    // cannot drift apart on prices and rents.
    alias: { "@shared": here("../src/shared") },
  },
  server: {
    fs: { allow: [here("..")] },
  },
});
