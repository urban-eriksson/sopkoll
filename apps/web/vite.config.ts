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
    // REST API -> FastAPI dev server (server/, port 8002 to stay clear of the
    // other tenants on the shared box: snicksnack 8000, isabelle 8001).
    proxy: { "/api": { target: "http://localhost:8002" } },
  },
});
