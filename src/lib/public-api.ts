import type { RequestCard } from "@shared/domain";
import type { RequestDoc } from "@shared/firestore";
import type { Stats } from "./api";

/**
 * Tiny Firestore REST client for the public landing page. These collections are world-readable under
 * firestore.rules, so the landing page can show live data without downloading the Firebase SDK.
 */
const PROJECT = "windfall-give-bb8b";
const KEY = "AIzaSyATxkXcTU37dYSbc87_QoZGNmtGh65quQo";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

type Value =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values?: Value[] } }
  | { mapValue: { fields?: Record<string, Value> } };

function decode(v: Value): unknown {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return Date.parse(v.timestampValue);
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decode);
  return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, decode(x)]));
}
const fields = (f: Record<string, Value> = {}) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, decode(v)]));

async function runQuery(structuredQuery: object): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const res = await fetch(`${BASE}:runQuery?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) throw new Error("Couldn’t load stories right now.");
  const rows = (await res.json()) as { document?: { name: string; fields: Record<string, Value> } }[];
  return rows.filter((r) => r.document).map((r) => ({ id: r.document!.name.split("/").pop()!, data: fields(r.document!.fields) }));
}

function toCard(id: string, d: Record<string, unknown>): RequestCard {
  const r = d as unknown as RequestDoc<number>;
  return {
    id,
    firstName: r.firstName,
    age: r.age,
    city: r.city,
    country: r.country,
    countryCode: r.countryCode,
    category: r.category,
    headline: r.headline,
    story: r.story,
    breakdown: r.breakdown,
    goalCents: r.goalCents,
    fundedCents: r.fundedCents,
    giftCount: r.giftCount,
    verification: r.verification,
    status: r.status,
    avatarSeed: r.avatarSeed,
    photoUrl: r.photoUrl,
    blurPhoto: r.blurPhoto,
    createdAt: r.createdAt,
    isDemo: r.isDemo,
  };
}

const activeWhere = { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "active" } } };

export const publicApi = {
  async stats(): Promise<Stats> {
    const res = await fetch(`${BASE}/stats/global?key=${KEY}`);
    if (!res.ok) return { totalCents: 0, giftCount: 0, debtsCleared: 0 };
    const d = fields(((await res.json()) as { fields: Record<string, Value> }).fields) as unknown as Stats;
    return { totalCents: d.totalCents, giftCount: d.giftCount, debtsCleared: d.debtsCleared };
  },

  /** Verified, active stories with the most momentum — the landing page's live deck. */
  async featured(): Promise<{ cards: RequestCard[] }> {
    const rows = await runQuery({
      from: [{ collectionId: "requests" }],
      where: activeWhere,
      orderBy: [{ field: { fieldPath: "giftCount" }, direction: "DESCENDING" }],
      limit: 16,
    });
    return { cards: rows.map((r) => toCard(r.id, r.data)).filter((c) => c.verification === "verified").slice(0, 10) };
  },

  /** A varied wall of faces: a day-stable shuffle of active stories (Firestore returns them by id). */
  async people(): Promise<{ cards: RequestCard[] }> {
    const rows = await runQuery({ from: [{ collectionId: "requests" }], where: activeWhere, limit: 160 });
    let seed = Math.floor(Date.now() / 86_400_000);
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const cards = rows.map((r) => toCard(r.id, r.data)).filter((c) => c.photoUrl);
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [cards[i], cards[j]] = [cards[j]!, cards[i]!];
    }
    return { cards: cards.slice(0, 40) };
  },
};
