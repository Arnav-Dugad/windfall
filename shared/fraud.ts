import type { RequestCard } from "./domain";

/**
 * Lightweight fraud signals for the moderation queue (runs on the moderator's device):
 * near-duplicate stories, reused photos, odd breakdowns and goal outliers. Signals are hints for a human
 * reviewer, never automatic judgements.
 */
export interface FraudSignal {
  requestId: string;
  score: number;
  reasons: string[];
}

function shingles(text: string, n = 5): Set<string> {
  const w = text.toLowerCase().replace(/[^a-z0-9à-ÿ\s]/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
}

const VAGUE = /\b(misc|miscellaneous|other|expenses|stuff|various|general|costs?)\b/i;

export function fraudSignals(cards: (RequestCard & { seekerId?: string })[]): FraudSignal[] {
  const out = new Map<string, FraudSignal>();
  const add = (id: string, score: number, reason: string) => {
    const s = out.get(id) ?? { requestId: id, score: 0, reasons: [] };
    s.score += score;
    if (!s.reasons.includes(reason)) s.reasons.push(reason);
    out.set(id, s);
  };

  // Near-duplicate stories (different requests, ≥ 45% shared 5-word shingles).
  const sh = cards.map((c) => ({ c, s: shingles(c.story) }));
  for (let i = 0; i < sh.length; i++) {
    for (let j = i + 1; j < sh.length; j++) {
      const sim = jaccard(sh[i]!.s, sh[j]!.s);
      if (sim >= 0.45) {
        const pct = Math.round(sim * 100);
        add(sh[i]!.c.id, 3, `Story ${pct}% similar to ${sh[j]!.c.firstName}’s`);
        add(sh[j]!.c.id, 3, `Story ${pct}% similar to ${sh[i]!.c.firstName}’s`);
      }
    }
  }

  // The same photo on more than one request.
  const byPhoto = new Map<string, RequestCard[]>();
  for (const c of cards) if (c.photoUrl) byPhoto.set(c.photoUrl, [...(byPhoto.get(c.photoUrl) ?? []), c]);
  for (const group of byPhoto.values()) if (group.length > 1) for (const c of group) add(c.id, 4, `Photo reused on ${group.length} requests`);

  // Goal outliers per category (> 4× the category median) and odd breakdowns.
  const byCat = new Map<string, number[]>();
  for (const c of cards) byCat.set(c.category, [...(byCat.get(c.category) ?? []), c.goalCents]);
  for (const c of cards) {
    const med = median(byCat.get(c.category) ?? []);
    if (med && c.goalCents > med * 4) add(c.id, 2, `Goal is ${Math.round(c.goalCents / med)}× the typical ${c.category.replace("_", " ")} request`);
    const items = c.breakdown;
    const biggest = Math.max(...items.map((b) => b.amountCents));
    if (items.length >= 2 && biggest / c.goalCents > 0.97) add(c.id, 1, "One line item is almost the entire goal");
    if (items.some((b) => VAGUE.test(b.label) && b.amountCents / c.goalCents > 0.4)) add(c.id, 2, "Large vague line item (e.g. “misc”)");
    if (items.length >= 3 && new Set(items.map((b) => b.amountCents)).size === 1) add(c.id, 1, "Every line item is identical");
    if (c.verification === "unverified" && c.goalCents >= 10_000_000) add(c.id, 2, "Unverified request over $100K");
    if (c.story.length < 140) add(c.id, 1, "Very short story");
  }

  return [...out.values()].filter((s) => s.score >= 2).sort((a, b) => b.score - a.score);
}
