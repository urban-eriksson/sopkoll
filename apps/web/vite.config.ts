import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    // REST API -> FastAPI dev server (server/, port 8002 as on the box; the
    // korist-infra port map keeps 8000 and 8001 for snicksnack and isabelle).
    proxy: { "/api": { target: "http://localhost:8002" } },
  },
});
