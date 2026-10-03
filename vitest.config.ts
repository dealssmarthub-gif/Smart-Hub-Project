import path from "node:path";
import { defineConfig } from "vitest/config";

// Standalone config (no TanStack Start / Nitro plugins): tests run the app's
// store, engines and services directly in Node.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // Don't load .env: tests run in demo mode (no Supabase), deterministically.
  envDir: path.resolve(__dirname, "tests/env"),
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 20_000,
  },
});
