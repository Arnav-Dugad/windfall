import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { PublicUser } from "../../shared/domain";
import { demoLoginSchema, profileSchema } from "../../shared/schemas";
import { DEMO_PATRONS, DEMO_SEEKER } from "../../shared/seed/personas";
import { getDb, schema } from "../db/client";
import type { AppEnv } from "../env";
import { newId } from "../lib/ids";
import { endSession, requireRole, sessionOf, startSession } from "../lib/session";
import { valid } from "../lib/validate";

export const auth = new Hono<AppEnv>();

function toPublicUser(u: typeof schema.users.$inferSelect): PublicUser {
  return {
    id: u.id,
    role: u.role,
    displayName: u.displayName,
    avatarSeed: u.avatarSeed,
    anonymousByDefault: u.anonymousByDefault,
    isDemo: u.isDemo,
  };
}

auth.get("/personas", (c) =>
  c.json({
    patrons: DEMO_PATRONS.map(({ persona, displayName, blurb, anonymousByDefault }) => ({
      persona,
      displayName,
      blurb,
      anonymousByDefault,
    })),
    seekers: [
      { persona: "maya", displayName: "Maya", blurb: "Ceramics teacher with a live, part-funded medical request." },
      { persona: "new", displayName: "A new Seeker", blurb: "Start fresh and walk through the request flow." },
    ],
  }),
);

/** One-click demo login. Patrons map to seeded personas; "new" Seekers get a fresh account. */
auth.post("/demo", valid("json", demoLoginSchema), async (c) => {
  const { role, persona } = c.req.valid("json");
  const db = getDb(c.env.DB);
  let userId: string;

  if (role === "patron") {
    const p = DEMO_PATRONS.find((x) => x.persona === persona) ?? DEMO_PATRONS[0]!;
    userId = p.id;
  } else if (persona === "new") {
    userId = newId("usr");
    await db.insert(schema.users).values({
      id: userId,
      role: "seeker",
      displayName: "New Seeker",
      avatarSeed: userId,
      isDemo: true,
    });
  } else {
    userId = DEMO_SEEKER.userId;
  }

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) throw new HTTPException(503, { message: "Demo data isn't seeded yet. Run the seed script." });
  await startSession(c, { userId: user.id, role: user.role });
  return c.json({ user: toPublicUser(user) });
});

auth.get("/me", async (c) => {
  const s = c.get("session");
  if (!s) return c.json({ user: null });
  const user = await getDb(c.env.DB).query.users.findFirst({ where: eq(schema.users.id, s.userId) });
  if (!user) {
    endSession(c);
    return c.json({ user: null });
  }
  return c.json({ user: toPublicUser(user) });
});

auth.patch("/me", requireRole("patron"), valid("json", profileSchema), async (c) => {
  const { userId } = sessionOf(c);
  const { anonymousByDefault } = c.req.valid("json");
  const db = getDb(c.env.DB);
  await db.update(schema.users).set({ anonymousByDefault }).where(eq(schema.users.id, userId));
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  return c.json({ user: user ? toPublicUser(user) : null });
});

auth.post("/logout", (c) => {
  endSession(c);
  return c.json({ ok: true });
});
