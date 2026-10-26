import { and, asc, desc, eq, gte, lte, notExists, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { deckQuerySchema, id, reportSchema, swipeSchema } from "../../shared/schemas";
import { getDb, schema } from "../db/client";
import type { AppEnv } from "../env";
import { newId } from "../lib/ids";
import { requireRole, sessionOf } from "../lib/session";
import { toCard, toDetail } from "../lib/serialize";
import { valid } from "../lib/validate";

const { requests, swipes, gifts, requestUpdates } = schema;

export const deck = new Hono<AppEnv>();

/** Mock verification: "pending" documents become "verified" once their review time has passed. */
export async function settleVerifications(d1: D1Database) {
  await d1
    .prepare(
      `UPDATE requests SET verification = 'verified' WHERE verification = 'pending' AND verification_at <= ?1`,
    )
    .bind(Date.now())
    .run();
}

deck.get("/deck", requireRole("patron"), valid("query", deckQuerySchema), async (c) => {
  const { userId } = sessionOf(c);
  const q = c.req.valid("query");
  const db = getDb(c.env.DB);
  c.executionCtx.waitUntil(settleVerifications(c.env.DB));

  const where = and(
    eq(requests.status, "active"),
    notExists(
      db
        .select({ one: sql`1` })
        .from(swipes)
        .where(and(eq(swipes.patronId, userId), eq(swipes.requestId, requests.id))),
    ),
    notExists(
      db
        .select({ one: sql`1` })
        .from(gifts)
        .where(and(eq(gifts.patronId, userId), eq(gifts.requestId, requests.id), eq(gifts.status, "settled"))),
    ),
    q.category ? eq(requests.category, q.category) : undefined,
    q.country ? eq(requests.countryCode, q.country) : undefined,
    q.min !== undefined ? gte(requests.goalCents, q.min * 100) : undefined,
    q.max !== undefined ? lte(requests.goalCents, q.max * 100) : undefined,
    q.verified ? eq(requests.verification, "verified") : undefined,
  );

  const rows = await db
    .select()
    .from(requests)
    .where(where)
    .orderBy(
      q.sort === "closest"
        ? desc(sql`CAST(${requests.fundedCents} AS REAL) / ${requests.goalCents}`)
        : desc(requests.createdAt),
      asc(requests.id),
    )
    .limit(q.limit);

  return c.json({ cards: rows.map(toCard) });
});

deck.get("/countries", async (c) => {
  const rows = await getDb(c.env.DB)
    .selectDistinct({ code: requests.countryCode, name: requests.country })
    .from(requests)
    .where(eq(requests.status, "active"))
    .orderBy(asc(requests.country));
  return c.json({ countries: rows });
});

deck.get("/requests/:id", valid("param", z.object({ id })), async (c) => {
  const db = getDb(c.env.DB);
  const r = await db.query.requests.findFirst({ where: eq(requests.id, c.req.valid("param").id) });
  if (!r) throw new HTTPException(404, { message: "We couldn't find that story." });
  const updates = await db
    .select({
      id: requestUpdates.id,
      kind: requestUpdates.kind,
      body: requestUpdates.body,
      createdAt: requestUpdates.createdAt,
    })
    .from(requestUpdates)
    .where(eq(requestUpdates.requestId, r.id))
    .orderBy(desc(requestUpdates.createdAt));
  return c.json({ request: toDetail(r, updates) });
});

deck.post("/swipes", requireRole("patron"), valid("json", swipeSchema), async (c) => {
  const { userId } = sessionOf(c);
  const { requestId, action } = c.req.valid("json");
  await getDb(c.env.DB)
    .insert(swipes)
    .values({ patronId: userId, requestId, action, createdAt: Date.now() })
    .onConflictDoUpdate({ target: [swipes.patronId, swipes.requestId], set: { action, createdAt: Date.now() } });
  return c.json({ ok: true });
});

/** Undo a pass/save, or remove from "Maybe later". */
deck.delete("/swipes/:id", requireRole("patron"), valid("param", z.object({ id })), async (c) => {
  const { userId } = sessionOf(c);
  await getDb(c.env.DB)
    .delete(swipes)
    .where(and(eq(swipes.patronId, userId), eq(swipes.requestId, c.req.valid("param").id)));
  return c.json({ ok: true });
});

/** "Show me everyone again": clears passes (keeps saves). */
deck.post("/deck/reset", requireRole("patron"), async (c) => {
  const { userId } = sessionOf(c);
  await getDb(c.env.DB)
    .delete(swipes)
    .where(and(eq(swipes.patronId, userId), eq(swipes.action, "pass")));
  return c.json({ ok: true });
});

deck.get("/saved", requireRole("patron"), async (c) => {
  const { userId } = sessionOf(c);
  const rows = await getDb(c.env.DB)
    .select({ r: requests, savedAt: swipes.createdAt })
    .from(swipes)
    .innerJoin(requests, eq(requests.id, swipes.requestId))
    .where(and(eq(swipes.patronId, userId), eq(swipes.action, "save")))
    .orderBy(desc(swipes.createdAt));
  return c.json({ saved: rows.map(({ r, savedAt }) => ({ ...toCard(r), savedAt })) });
});

deck.post("/reports", valid("json", reportSchema), async (c) => {
  const s = c.get("session");
  const body = c.req.valid("json");
  const db = getDb(c.env.DB);
  const exists = await db.query.requests.findFirst({ where: eq(requests.id, body.requestId), columns: { id: true } });
  if (!exists) throw new HTTPException(404, { message: "We couldn't find that story." });
  await db.insert(schema.reports).values({
    id: newId("rpt"),
    requestId: body.requestId,
    reporterId: s?.userId ?? null,
    reason: body.reason,
    note: body.note ?? null,
  });
  return c.json({ ok: true });
});
