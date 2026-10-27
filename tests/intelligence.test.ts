import { describe, expect, it } from "vitest";
import type { RequestCard } from "../shared/domain";
import { fraudSignals, jaccard } from "../shared/fraud";
import { impactNarrative } from "../shared/narrative";
import { affinity, buildProfile, finishers, rankForYou } from "../shared/rank";
import { parseQuery, searchCards } from "../shared/search";

const STORY =
  "I worked night shifts at the county hospital for nine years and took out loans to finish my nursing degree. When my mother got sick I covered her treatment and the interest kept growing every single month.";

let seq = 0;
function card(p: Partial<RequestCard> = {}): RequestCard {
  seq++;
  return {
    id: `r${seq}`,
    firstName: `Person${seq}`,
    age: 34,
    city: "Nairobi",
    country: "Kenya",
    countryCode: "KE",
    category: "medical",
    headline: "Hospital bills after surgery",
    // Unique filler per card so fixtures never look like duplicates of each other.
    story: Array.from({ length: 30 }, (_, i) => `w${seq}q${i}`).join(" "),
    breakdown: [
      { label: "Hospital bill", amountCents: 600_000 },
      { label: "Pharmacy", amountCents: 400_000 },
    ],
    goalCents: 1_000_000,
    fundedCents: 0,
    giftCount: 0,
    verification: "verified",
    status: "active",
    avatarSeed: `s${seq}`,
    photoUrl: `/people/p${seq}.webp`,
    blurPhoto: false,
    createdAt: Date.UTC(2026, 9, 1),
    isDemo: true,
    accent: null,
    ...p,
  };
}

describe("search: parseQuery", () => {
  it("understands “nurses in Kenya under $5K”", () => {
    const q = parseQuery("nurses in Kenya under $5K");
    expect(q.countryCodes).toEqual(["KE"]);
    expect(q.maxCents).toBe(500_000);
    expect(q.terms).toEqual(["nurse"]);
    expect(q.chips).toContain("Kenya");
    expect(q.chips).toContain("Under $5,000");
  });

  it("maps category words, demonyms, ranges and flags", () => {
    const q = parseQuery("verified medical bills for Mexicans over 20k close to cleared");
    expect(q.category).toBe("medical");
    expect(q.countryCodes).toEqual(["MX"]);
    expect(q.minCents).toBe(2_000_000);
    expect(q.verified).toBe(true);
    expect(q.closeToCleared).toBe(true);
  });

  it("parses plain dollar amounts and millions", () => {
    expect(parseQuery("rent under $2,500").maxCents).toBe(250_000);
    expect(parseQuery("business over 1m").minCents).toBe(100_000_000);
    expect(parseQuery("rent under $2,500").category).toBe("rent");
  });

  it("returns no filters for an empty query", () => {
    const q = parseQuery("   ");
    expect(q).toMatchObject({ countryCodes: [], terms: [], chips: [] });
    expect(q.category).toBeUndefined();
  });
});

describe("search: searchCards", () => {
  it("applies amount filters to the remaining amount, not the goal", () => {
    const almost = card({ goalCents: 2_000_000, fundedCents: 1_600_000 }); // $4K left of $20K
    const fresh = card({ goalCents: 2_000_000, fundedCents: 0 }); // $20K left
    const hits = searchCards([almost, fresh], parseQuery("under $5k"));
    expect(hits.map((c) => c.id)).toEqual([almost.id]);
  });

  it("matches free-text terms against the story and skips inactive requests", () => {
    const nurse = card({ story: STORY });
    const other = card({ story: "I run a small bakery and the oven broke during the busiest month of the year, so I borrowed money to fix it." });
    const funded = card({ status: "funded" });
    const hits = searchCards([nurse, other, funded], parseQuery("nurses in Kenya"));
    expect(hits.map((c) => c.id)).toEqual([nurse.id]);
  });

  it("filters by country, verification and sorts close-to-cleared first", () => {
    const a = card({ fundedCents: 200_000 });
    const b = card({ fundedCents: 900_000 });
    const c = card({ verification: "unverified", fundedCents: 950_000 });
    const d = card({ countryCode: "GB", country: "United Kingdom" });
    const hits = searchCards([a, b, c, d], parseQuery("verified kenya close to cleared"));
    expect(hits.map((x) => x.id)).toEqual([b.id, a.id]);
  });
});

describe("rank", () => {
  it("builds a profile from gifts and scores affinity with causes", () => {
    const p = buildProfile(
      [
        { category: "medical", countryCode: "KE" },
        { category: "medical", countryCode: "KE" },
        { category: "rent", countryCode: "US" },
      ],
      { categories: ["student_loans"], countries: ["BR"] },
    );
    expect(p.categories.medical).toBe(2);
    expect(p.countries.KE).toBe(2);
    const med = affinity(card({ category: "medical", countryCode: "KE" }), p);
    const cause = affinity(card({ category: "student_loans", countryCode: "BR" }), p);
    const none = affinity(card({ category: "emergency", countryCode: "JP" }), p);
    expect(med).toBeGreaterThan(none);
    expect(cause).toBeGreaterThan(1.5);
    expect(none).toBe(0);
  });

  it("interleaves an exploration card after every three preferred cards and keeps everyone", () => {
    const pref = Array.from({ length: 6 }, () => card({ category: "medical", countryCode: "KE" }));
    const explore = Array.from({ length: 3 }, () => card({ category: "emergency", countryCode: "JP" }));
    const p = buildProfile([], { categories: ["medical"], countries: [] });
    const out = rankForYou([...explore, ...pref], p, Date.UTC(2026, 9, 27), 42);
    expect(out).toHaveLength(9);
    expect(new Set(out.map((c) => c.id)).size).toBe(9);
    expect(out[3]!.category).toBe("emergency");
    expect(out[7]!.category).toBe("emergency");
    expect(out.slice(0, 3).every((c) => c.category === "medical")).toBe(true);
  });

  it("is deterministic for a given seed", () => {
    const cards = Array.from({ length: 8 }, () => card());
    const p = buildProfile([]);
    const a = rankForYou(cards, p, 0, 7).map((c) => c.id);
    const b = rankForYou(cards, p, 0, 7).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it("finishers: only stories clearable within budget, closest first", () => {
    const close = card({ goalCents: 1_000_000, fundedCents: 950_000 }); // $500 left
    const mid = card({ goalCents: 1_000_000, fundedCents: 700_000 }); // $3K left
    const far = card({ goalCents: 1_000_000, fundedCents: 0 }); // $10K left
    const done = card({ goalCents: 1_000_000, fundedCents: 1_000_000, status: "funded" });
    const out = finishers([far, mid, done, close], 500_000);
    expect(out.map((x) => x.card.id)).toEqual([close.id, mid.id]);
    expect(out[0]!.remaining).toBe(50_000);
    expect(finishers([far, mid, close], 500_000, 1)).toHaveLength(1);
  });
});

describe("fraud signals", () => {
  it("jaccard handles empty and identical sets", () => {
    expect(jaccard(new Set(), new Set(["a"]))).toBe(0);
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
  });

  it("flags duplicated stories and reused photos on both requests", () => {
    const a = card({ story: STORY, photoUrl: "/people/same.webp" });
    const b = card({ story: a.story, photoUrl: "/people/same.webp" });
    const clean = card();
    const sig = fraudSignals([a, b, clean]);
    const ids = sig.map((s) => s.requestId);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(ids).not.toContain(clean.id);
    const sa = sig.find((s) => s.requestId === a.id)!;
    expect(sa.reasons.some((r) => r.includes("similar"))).toBe(true);
    expect(sa.reasons.some((r) => r.includes("Photo reused"))).toBe(true);
  });

  it("flags vague breakdowns with an outlier goal", () => {
    const normal = Array.from({ length: 5 }, () => card());
    const odd = card({
      goalCents: 9_000_000,
      breakdown: [
        { label: "Misc", amountCents: 8_000_000 },
        { label: "Rent", amountCents: 1_000_000 },
      ],
    });
    const s = fraudSignals([...normal, odd]).find((x) => x.requestId === odd.id);
    expect(s).toBeDefined();
    expect(s!.score).toBeGreaterThanOrEqual(4);
    expect(s!.reasons.join(" ")).toMatch(/vague/);
    expect(s!.reasons.join(" ")).toMatch(/typical/);
  });

  it("stays quiet for ordinary requests", () => {
    expect(fraudSignals(Array.from({ length: 6 }, () => card()))).toEqual([]);
  });
});

describe("impact narrative", () => {
  it("has a gentle empty state", () => {
    expect(impactNarrative({ monthName: "October", gifts: [], streakWeeks: 0 })).toMatch(/October is still a blank page/);
  });

  it("summarises totals, people, countries, clears and streaks", () => {
    const text = impactNarrative({
      monthName: "October",
      streakWeeks: 4,
      gifts: [
        { amountCents: 50_000, firstName: "Amara", city: "Lagos", country: "Nigeria", category: "medical", cleared: true },
        { amountCents: 25_000, firstName: "Theo", city: "Lyon", country: "France", category: "rent", cleared: false },
        { amountCents: 25_000, firstName: "Amara", city: "Lagos", country: "Nigeria", category: "medical", cleared: true },
      ],
    });
    expect(text).toContain("3 gifts");
    expect(text).toContain("$1,000");
    expect(text).toContain("2 people across 2 countries");
    expect(text).toContain("Amara in Lagos and Theo in Lyon");
    expect(text).toContain("Amara’s debt completely");
    expect(text).toContain("4 weeks in a row");
  });

  it("uses the single-gift opener and suggests a streak", () => {
    const text = impactNarrative({
      monthName: "May",
      streakWeeks: 1,
      gifts: [{ amountCents: 10_000, firstName: "Sol", city: "Lima", country: "Peru", category: "student_loans", cleared: false }],
    });
    expect(text).toMatch(/^In May you gave \$100 to Sol in Lima\./);
    expect(text).toContain("student loans");
    expect(text).toContain("start a streak");
  });
});
