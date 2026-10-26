import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Category } from "../../shared/domain";
import { generosityIndex, givingStreakWeeks, weekIndex, weeklySeries } from "../../shared/impact";
import { getDb, schema } from "../db/client";
import type { AppEnv } from "../env";
import { requireRole, sessionOf } from "../lib/session";

const { gifts, requests, users } = schema;

export const patron = new Hono<AppEnv>();

patron.get("/impact", requireRole("patron"), async (c) => {
  const { userId } = sessionOf(c);
  const db = getDb(c.env.DB);

  const rows = await db
    .select({
      giftId: gifts.id,
      amountCents: gifts.amountCents,
      kind: gifts.kind,
      anonymous: gifts.anonymous,
      createdAt: gifts.createdAt,
      requestId: requests.id,
      firstName: requests.firstName,
      category: requests.category,
      country: requests.country,
      countryCode: requests.countryCode,
      city: requests.city,
      lat: requests.lat,
      lng: requests.lng,
      status: requests.status,
      avatarSeed: requests.avatarSeed,
    })
    .from(gifts)
    .innerJoin(requests, eq(requests.id, gifts.requestId))
    .where(and(eq(gifts.patronId, userId), eq(gifts.status, "settled")))
    .orderBy(desc(gifts.createdAt));

  const totalCents = rows.reduce((s, r) => s + r.amountCents, 0);
  const people = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!people.has(r.requestId)) people.set(r.requestId, r);
  const cleared = [...people.values()].filter((r) => r.status === "funded");
  const activeWeeks = new Set(rows.map((r) => weekIndex(r.createdAt))).size;

  const places = new Map<
    string,
    { city: string; country: string; countryCode: string; lat: number; lng: number; totalCents: number; people: Set<string> }
  >();
  for (const r of rows) {
    if (r.lat == null || r.lng == null) continue;
    const key = `${r.city}|${r.countryCode}`;
    const p = places.get(key) ?? {
      city: r.city,
      country: r.country,
      countryCode: r.countryCode,
      lat: r.lat,
      lng: r.lng,
      totalCents: 0,
      people: new Set<string>(),
    };
    p.totalCents += r.amountCents;
    p.people.add(r.firstName);
    places.set(key, p);
  }

  const byCategory = new Map<Category, number>();
  for (const r of rows) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amountCents);

  return c.json({
    totals: {
      totalCents,
      giftCount: rows.length,
      peopleHelped: people.size,
      debtsCleared: cleared.length,
      streakWeeks: givingStreakWeeks(rows.map((r) => r.createdAt)),
      countries: new Set(rows.map((r) => r.countryCode)).size,
      generosityIndex: generosityIndex({ peopleHelped: people.size, debtsCleared: cleared.length, activeWeeks }),
    },
    series: weeklySeries(rows, 26),
    places: [...places.values()]
      .map((p) => ({ ...p, people: [...p.people] }))
      .sort((a, b) => b.totalCents - a.totalCents),
    byCategory: [...byCategory.entries()].map(([category, totalCents]) => ({ category, totalCents })),
    recent: rows.slice(0, 8).map((r) => ({
      giftId: r.giftId,
      requestId: r.requestId,
      firstName: r.firstName,
      category: r.category,
      country: r.country,
      avatarSeed: r.avatarSeed,
      amountCents: r.amountCents,
      kind: r.kind,
      anonymous: r.anonymous,
      createdAt: r.createdAt,
      cleared: r.status === "funded",
    })),
    cleared: cleared.slice(0, 6).map((r) => ({ requestId: r.requestId, firstName: r.firstName, avatarSeed: r.avatarSeed })),
  });
});

patron.get("/leaderboard", requireRole("patron"), async (c) => {
  const { userId } = sessionOf(c);
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      patronId: gifts.patronId,
      displayName: users.displayName,
      avatarSeed: users.avatarSeed,
      anonymousByDefault: users.anonymousByDefault,
      amountCents: gifts.amountCents,
      createdAt: gifts.createdAt,
      requestId: gifts.requestId,
      status: requests.status,
    })
    .from(gifts)
    .innerJoin(users, eq(users.id, gifts.patronId))
    .innerJoin(requests, eq(requests.id, gifts.requestId))
    .where(eq(gifts.status, "settled"));

  type Agg = {
    displayName: string;
    avatarSeed: string;
    anonymous: boolean;
    totalCents: number;
    requests: Set<string>;
    funded: Set<string>;
    weeks: Set<number>;
  };
  const agg = new Map<string, Agg>();
  for (const r of rows) {
    const a: Agg = agg.get(r.patronId) ?? {
      displayName: r.displayName,
      avatarSeed: r.avatarSeed,
      anonymous: r.anonymousByDefault,
      totalCents: 0,
      requests: new Set<string>(),
      funded: new Set<string>(),
      weeks: new Set<number>(),
    };
    a.totalCents += r.amountCents;
    a.requests.add(r.requestId);
    if (r.status === "funded") a.funded.add(r.requestId);
    a.weeks.add(weekIndex(r.createdAt));
    agg.set(r.patronId, a);
  }

  const entries = [...agg.entries()]
    .map(([id, a]) => {
      const stats = { peopleHelped: a.requests.size, debtsCleared: a.funded.size, activeWeeks: a.weeks.size };
      const isYou = id === userId;
      return {
        id: a.anonymous && !isYou ? `anon_${a.avatarSeed.slice(-6)}` : id,
        displayName: a.anonymous ? (isYou ? "You (anonymous)" : "Anonymous Patron") : a.displayName,
        avatarSeed: a.anonymous ? "anonymous" : a.avatarSeed,
        anonymous: a.anonymous,
        isYou,
        totalCents: a.totalCents,
        ...stats,
        index: generosityIndex(stats),
      };
    })
    .sort((x, y) => y.index - x.index || y.totalCents - x.totalCents)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  return c.json({ entries });
});
