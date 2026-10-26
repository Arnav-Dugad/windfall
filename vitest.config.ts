import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests run in Node (no Workers runtime needed): pure logic + the ledger SQL against node:sqlite.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
