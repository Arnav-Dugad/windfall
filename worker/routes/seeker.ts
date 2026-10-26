import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { countryCentroid } from "../../shared/geo";
import { id, newRequestSchema, postUpdateSchema, updateRequestSchema } from "../../shared/schemas";
import { getDb, schema } from "../db/client";
import type { AppEnv } from "../env";
import { newId } from "../lib/ids";
import { requireRole, sessionOf } from "../lib/session";
import { toCard, toDetail } from "../lib/serialize";
import { valid } from "../lib/validate";
import { settleVerifications } from "./deck";

const { requests, gifts, users, requestUpdates, documents } = schema;
/** How long mock document review takes before "Pending" flips to "Verified". */
export const MOCK_REVIEW_MS = 20_000;

export const seeker = new Hono<AppEnv>();
seeker.use(requireRole("seeker"));

async function ownRequest(c: { env: AppEnv["Bindings"] }, userId: string, requestId: string) {
  const r = await getDb(c.env.DB).query.requests.findFirst({
    where: and(eq(requests.id, requestId), eq(requests.seekerId, userId)),
  });
  if (!r) throw new HTTPException(404, { message: "Request not found." });
  return r;
}

seeker.get("/requests", async (c) => {
  const { userId } = sessionOf(c);
  await settleVerifications(c.env.DB);
  const rows = await getDb(c.env.DB)
    .select()
    .from(requests)
    .where(eq(requests.seekerId, userId))
    .orderBy(desc(requests.createdAt));
  return c.json({ requests: rows.map(toCard) });
});

seeker.get("/requests/:id", valid("param", z.object({ id })), async (c) => {
  const { userId } = sessionOf(c);
  await settleVerifications(c.env.DB);
  const r = await ownRequest(c, userId, c.req.valid("param").id);
  const db = getDb(c.env.DB);
  const [updates, giftRows] = await Promise.all([
    db
      .select({ id: requestUpdates.id, kind: requestUpdates.kind, body: requestUpdates.body, createdAt: requestUpdates.createdAt })
      .from(requestUpdates)
      .where(eq(requestUpdates.requestId, r.id))
      .orderBy(desc(requestUpdates.createdAt)),
    db
      .select({
        id: gifts.id,
        amountCents: gifts.amountCents,
        kind: gifts.kind,
        anonymous: gifts.anonymous,
        createdAt: gifts.createdAt,
        patronName: users.displayName,
        patronSeed: users.avatarSeed,
      })
      .from(gifts)
      .innerJoin(users, eq(users.id, gifts.patronId))
      .where(and(eq(gifts.requestId, r.id), eq(gifts.status, "settled")))
      .orderBy(desc(gifts.createdAt))
      .limit(100),
  ]);
  return c.json({
    request: toDetail(r, updates),
    gifts: giftRows.map((g) => ({
      id: g.id,
      amountCents: g.amountCents,
      kind: g.kind,
      createdAt: g.createdAt,
      // Patrons who give anonymously are never revealed to Seekers.
      from: g.anonymous ? null : g.patronName,
      avatarSeed: g.anonymous ? "anonymous" : g.patronSeed,
    })),
  });
});

seeker.post("/requests", valid("json", newRequestSchema), async (c) => {
  const { userId } = sessionOf(c);
  const body = c.req.valid("json");
  const db = getDb(c.env.DB);
  const goalCents = body.breakdown.reduce((s, b) => s + b.amountCents, 0);
  const geo = countryCentroid(body.countryCode);
  const requestId = newId("req");
  const now = Date.now();

  await db.batch([
    db.insert(requests).values({
      id: requestId,
      seekerId: userId,
      firstName: body.firstName,
      age: body.age,
      city: body.city,
      country: body.country,
      countryCode: body.countryCode,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      category: body.category,
      headline: body.headline,
      story: body.story,
      breakdown: body.breakdown,
      goalCents,
      avatarSeed: `${body.firstName}-${requestId}`,
      photoKey: body.photoKey,
      blurPhoto: body.blurPhoto,
      verification: body.documentKey ? "pending" : "unverified",
      verificationAt: body.documentKey ? now + MOCK_REVIEW_MS : null,
      isDemo: true,
      createdAt: now,
    }),
    db.update(users).set({ displayName: body.firstName }).where(eq(users.id, userId)),
    ...(body.documentKey
      ? [db.update(documents).set({ requestId }).where(and(eq(documents.key, body.documentKey), eq(documents.ownerId, userId)))]
      : []),
    ...(body.photoKey
      ? [db.update(documents).set({ requestId }).where(and(eq(documents.key, body.photoKey), eq(documents.ownerId, userId)))]
      : []),
  ]);

  const created = await db.query.requests.findFirst({ where: eq(requests.id, requestId) });
  return c.json({ request: toCard(created!) }, 201);
});

seeker.patch("/requests/:id", valid("param", z.object({ id })), valid("json", updateRequestSchema), async (c) => {
  const { userId } = sessionOf(c);
  const r = await ownRequest(c, userId, c.req.valid("param").id);
  const patch = c.req.valid("json");
  if (patch.status && (r.status === "funded" || r.status === "closed")) {
    throw new HTTPException(409, { message: `This request is ${r.status} and can't be changed.` });
  }
  const db = getDb(c.env.DB);
  await db.update(requests).set(patch).where(eq(requests.id, r.id));
  const updated = await db.query.requests.findFirst({ where: eq(requests.id, r.id) });
  return c.json({ request: toCard(updated!) });
});

seeker.post(
  "/requests/:id/updates",
  valid("param", z.object({ id })),
  valid("json", postUpdateSchema),
  async (c) => {
    const { userId } = sessionOf(c);
    const r = await ownRequest(c, userId, c.req.valid("param").id);
    const body = c.req.valid("json");
    const update = { id: newId("upd"), requestId: r.id, kind: body.kind, body: body.body, createdAt: Date.now() };
    await getDb(c.env.DB).insert(requestUpdates).values(update);
    return c.json({ update: { id: update.id, kind: update.kind, body: update.body, createdAt: update.createdAt } }, 201);
  },
);

/** Attach a proof document to an existing request and start (mock) review. */
seeker.post(
  "/requests/:id/document",
  valid("param", z.object({ id })),
  valid("json", z.object({ documentKey: z.string().max(200).nullable() })),
  async (c) => {
    const { userId } = sessionOf(c);
    const r = await ownRequest(c, userId, c.req.valid("param").id);
    const db = getDb(c.env.DB);
    const { documentKey } = c.req.valid("json");
    if (documentKey) {
      await db
        .update(documents)
        .set({ requestId: r.id })
        .where(and(eq(documents.key, documentKey), eq(documents.ownerId, userId)));
    }
    await db
      .update(requests)
      .set({ verification: "pending", verificationAt: Date.now() + MOCK_REVIEW_MS })
      .where(eq(requests.id, r.id));
    const updated = await db.query.requests.findFirst({ where: eq(requests.id, r.id) });
    return c.json({ request: toCard(updated!) });
  },
);
