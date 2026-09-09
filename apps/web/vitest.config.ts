import { defineConfig } from "vitest/config";

// Separate from vite.config.ts: vitest ships its own vite type surface, and
// mixing it with @vitejs/plugin-react's fails typechecking.
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
