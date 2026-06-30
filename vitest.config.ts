import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Component tests opt into jsdom per-file via `// @vitest-environment jsdom`.
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // server-only throws when imported outside Next.js RSC context;
      // replace with an empty shim so route handler tests can import server modules.
      "server-only": fileURLToPath(new URL("./src/lib/fs/__mocks__/server-only.ts", import.meta.url)),
    },
  },
});
