import { defineConfig } from "drizzle-kit";

// Generates SQL migrations into ./migrations, which wrangler applies with `wrangler d1 migrations apply`.
export default defineConfig({
  dialect: "sqlite",
  schema: "./worker/db/schema.ts",
  out: "./migrations",
});
