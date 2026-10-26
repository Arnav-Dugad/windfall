import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";

/** zValidator that answers 400 with the first human-readable issue. */
export function valid<T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      const where = issue?.path.join(".");
      return c.json({ error: issue ? `${where ? `${where}: ` : ""}${issue.message}` : "Invalid input" }, 400);
    }
  });
}
