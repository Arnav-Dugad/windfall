import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for pure logic run in Node; firestore.rules is tested separately against the emulator.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Security-rules tests need the Firestore emulator: npm run test:rules
    exclude: ["tests/rules/**", "node_modules/**"],
    environment: "node",
  },
});
