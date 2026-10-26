import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { clampGift, remainingCents } from "../../shared/money";
import { giftSchema, id } from "../../shared/schemas";
import { getDb, schema } from "../db/client";
import type { AppEnv } from "../env";
import { newId } from "../lib/ids";
import { giftStatements, reversalStatements } from "../lib/ledger";
import { paymentProvider } from "../lib/payments";
import { requireRole, sessionOf } from "../lib/session";
import { toCard } from "../lib/serialize";
import { valid } from "../lib/validate";

export const UNDO_WINDOW_MS = 2 * 60 * 1000;

export const gifts = new Hono<AppEnv>();
gifts.use(requireRole("patron"));

gifts.post("/", valid("json", giftSchema), async (c) => {
  const { userId } = sessionOf(c);
  const body = c.req.valid("json");
  const db = getDb(c.env.DB);

  const req = await db.query.requests.findFirst({ where: eq(schema.requests.id, body.requestId) });
  if (!req) throw new HTTPException(404, { message: "We couldn't find that story." });
  if (req.status !== "active") {
    throw new HTTPException(409, {
      message: req.status === "funded" ? `${req.firstName} is already fully funded.` : "This request isn't accepting gifts right now.",
    });
  }

  const remaining = remainingCents(req.goalCents, req.fundedCents);
  const amountCents = body.kind === "clear" ? remaining : clampGift(body.amountCents ?? 0, req.goalCents, req.fundedCents);
  if (amountCents <= 0) throw new HTTPException(400, { message: "Choose an amount to give." });

  const giftId = newId("gft");
  const provider = paymentProvider(c.env);
  const { reference } = await provider.charge({
    giftId,
    amountCents,
    patronId: userId,
    requestId: req.id,
  });

  const now = Date.now();
  const results = await c.env.DB.batch([
    ...giftStatements(c.env.DB, {
      giftId,
      requestId: req.id,
      patronId: userId,
      amountCents,
      kind: amountCents >= remaining ? "clear" : body.kind,
      anonymous: body.anonymous,
      paymentRef: reference,
      now,
    }),
    // Giving to someone removes them from "Maybe later".
    c.env.DB.prepare(`DELETE FROM swipes WHERE patron_id = ?1 AND request_id = ?2`).bind(userId, req.id),
  ]);

  if (results[0]?.meta.changes !== 1) {
    await provider.refund(reference);
    throw new HTTPException(409, { message: "Someone just gave to this story — take another look at what's left." });
  }

  const updated = await db.query.requests.findFirst({ where: eq(schema.requests.id, req.id) });
  return c.json({
    gift: { id: giftId, amountCents, createdAt: now, undoUntil: now + UNDO_WINDOW_MS },
    request: toCard(updated!),
    cleared: updated!.status === "funded",
  });
});

gifts.post("/:id/reverse", valid("param", z.object({ id })), async (c) => {
  const { userId } = sessionOf(c);
  const db = getDb(c.env.DB);
  const gift = await db.query.gifts.findFirst({
    where: and(eq(schema.gifts.id, c.req.valid("param").id), eq(schema.gifts.patronId, userId)),
  });
  if (!gift) throw new HTTPException(404, { message: "Gift not found." });
  if (gift.status === "reversed") return c.json({ ok: true });

  const now = Date.now();
  const results = await c.env.DB.batch(
    reversalStatements(c.env.DB, {
      giftId: gift.id,
      patronId: userId,
      requestId: gift.requestId,
      amountCents: gift.amountCents,
      notBefore: now - UNDO_WINDOW_MS,
      now,
    }),
  );
  if (results[0]?.meta.changes !== 1) {
    throw new HTTPException(409, { message: "The undo window for this gift has closed." });
  }
  if (gift.paymentRef) await paymentProvider(c.env).refund(gift.paymentRef);

  const updated = await db.query.requests.findFirst({ where: eq(schema.requests.id, gift.requestId) });
  return c.json({ ok: true, request: updated ? toCard(updated) : null });
});
