// Pure impact math shared by the API and unit tests.

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Week index counted from the Unix epoch, aligned to Mondays. */
/** First millisecond of a weekIndex() week (Monday 00:00 UTC). */
export function weekStart(week: number): number {
  return week * WEEK_MS - 3 * 24 * 60 * 60 * 1000;
}

export function weekIndex(ts: number): number {
  // 1970-01-01 was a Thursday; shift so weeks start on Monday.
  return Math.floor((ts + 3 * 24 * 60 * 60 * 1000) / WEEK_MS);
}

/**
 * Consecutive weeks with at least one gift, counting back from this week.
 * A streak survives the current week being empty so far (it counts from last week).
 */
export function givingStreakWeeks(giftTimestamps: number[], now = Date.now()): number {
  const weeks = new Set(giftTimestamps.map(weekIndex));
  let w = weekIndex(now);
  if (!weeks.has(w)) w -= 1;
  let streak = 0;
  while (weeks.has(w)) {
    streak += 1;
    w -= 1;
  }
  return streak;
}

/**
 * Generosity Index rewards breadth and follow-through over raw size, so a Patron who helps
 * many people consistently can outrank one enormous cheque.
 */
export function generosityIndex(s: { peopleHelped: number; debtsCleared: number; activeWeeks: number }): number {
  return s.peopleHelped * 10 + s.debtsCleared * 25 + s.activeWeeks * 5;
}

/** Totals per week for the last `weeks` weeks (oldest first), for the giving-over-time chart. */
export function weeklySeries(
  gifts: { createdAt: number; amountCents: number }[],
  weeks: number,
  now = Date.now(),
): { weekStart: number; totalCents: number }[] {
  const current = weekIndex(now);
  const buckets = new Map<number, number>();
  for (const g of gifts) {
    const w = weekIndex(g.createdAt);
    if (current - w < weeks && w <= current) buckets.set(w, (buckets.get(w) ?? 0) + g.amountCents);
  }
  const out: { weekStart: number; totalCents: number }[] = [];
  for (let w = current - weeks + 1; w <= current; w++) {
    out.push({ weekStart: w * WEEK_MS - 3 * 24 * 60 * 60 * 1000, totalCents: buckets.get(w) ?? 0 });
  }
  return out;
}
