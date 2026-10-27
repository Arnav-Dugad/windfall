import type { Category, RequestCard } from "./domain";
import { remainingCents } from "./money";

/**
 * Smart deck: learns which categories and regions a Patron gives to (and their chosen "causes"), but
 * never filters anyone out — every fourth card is an exploration pick from outside their preferences.
 */
export interface GivingProfile {
  categories: Partial<Record<Category, number>>;
  countries: Record<string, number>;
  causes: { categories: string[]; countries: string[] };
}

export function buildProfile(
  gifts: { category: Category; countryCode: string }[],
  causes: GivingProfile["causes"] = { categories: [], countries: [] },
): GivingProfile {
  const categories: GivingProfile["categories"] = {};
  const countries: Record<string, number> = {};
  for (const g of gifts) {
    categories[g.category] = (categories[g.category] ?? 0) + 1;
    countries[g.countryCode] = (countries[g.countryCode] ?? 0) + 1;
  }
  return { categories, countries, causes };
}

/** 0..~3: how well a card matches the profile. */
export function affinity(card: RequestCard, p: GivingProfile): number {
  const total = Object.values(p.categories).reduce((a, b) => a + (b ?? 0), 0) || 1;
  const countryTotal = Object.values(p.countries).reduce((a, b) => a + b, 0) || 1;
  let s = ((p.categories[card.category] ?? 0) / total) * 1.2 + ((p.countries[card.countryCode] ?? 0) / countryTotal) * 0.6;
  if (p.causes.categories.includes(card.category)) s += 1;
  if (p.causes.countries.includes(card.countryCode)) s += 0.8;
  return s;
}

/** Momentum: stories close to cleared, verified, and recently posted get a gentle lift. */
function momentum(card: RequestCard, now: number): number {
  const pct = card.fundedCents / Math.max(1, card.goalCents);
  const ageDays = (now - card.createdAt) / 86_400_000;
  return pct * 0.6 + (card.verification === "verified" ? 0.25 : 0) + Math.max(0, 0.3 - ageDays / 200);
}

export function rankForYou(cards: RequestCard[], p: GivingProfile, now = Date.now(), seed = 1): RequestCard[] {
  let s = seed >>> 0 || 1;
  const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const scored = cards.map((c) => ({ c, score: affinity(c, p) + momentum(c, now) + rand() * 0.35, fit: affinity(c, p) }));
  const preferred = scored.filter((x) => x.fit > 0.15).sort((a, b) => b.score - a.score);
  const explore = scored.filter((x) => x.fit <= 0.15).sort((a, b) => b.score - a.score);
  const out: RequestCard[] = [];
  // Interleave: three matches, then one discovery — so nobody outside your causes is invisible.
  while (preferred.length || explore.length) {
    for (let i = 0; i < 3 && preferred.length; i++) out.push(preferred.shift()!.c);
    if (explore.length) out.push(explore.shift()!.c);
  }
  return out;
}

/** "Closest to cleared within your budget": stories you could finish outright, smallest remainder first. */
export function finishers(cards: RequestCard[], budgetCents: number, limit = 3): { card: RequestCard; remaining: number }[] {
  return cards
    .filter((c) => c.status === "active")
    .map((card) => ({ card, remaining: remainingCents(card.goalCents, card.fundedCents) }))
    .filter((x) => x.remaining > 0 && x.remaining <= budgetCents)
    .sort((a, b) => b.card.fundedCents / b.card.goalCents - a.card.fundedCents / a.card.goalCents || a.remaining - b.remaining)
    .slice(0, limit);
}
