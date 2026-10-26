import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, schema } from "../db/client";
import type { AppEnv } from "../env";
import { toCard } from "../lib/serialize";

export const publicRoutes = new Hono<AppEnv>();

/** Platform-wide totals for the landing-page ticker. */
publicRoutes.get("/stats", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT
       (SELECT COALESCE(SUM(amount_cents), 0) FROM gifts WHERE status = 'settled') AS totalCents,
       (SELECT COUNT(*) FROM gifts WHERE status = 'settled') AS giftCount,
       (SELECT COUNT(*) FROM requests WHERE gift_count > 0) AS peopleHelped,
       (SELECT COUNT(*) FROM requests WHERE status = 'funded') AS debtsCleared,
       (SELECT COUNT(*) FROM requests WHERE status = 'active') AS activeRequests`,
  ).first<{ totalCents: number; giftCount: number; peopleHelped: number; debtsCleared: number; activeRequests: number }>();
  c.header("Cache-Control", "public, max-age=10");
  return c.json(row ?? { totalCents: 0, giftCount: 0, peopleHelped: 0, debtsCleared: 0, activeRequests: 0 });
});

/** A handful of verified, active stories for the landing page's live demo deck. */
publicRoutes.get("/featured", async (c) => {
  const rows = await getDb(c.env.DB)
    .select()
    .from(schema.requests)
    .where(and(eq(schema.requests.status, "active"), eq(schema.requests.verification, "verified")))
    .orderBy(desc(schema.requests.giftCount))
    .limit(8);
  c.header("Cache-Control", "public, max-age=30");
  return c.json({ cards: rows.map(toCard) });
});
