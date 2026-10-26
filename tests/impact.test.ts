import { describe, expect, it } from "vitest";
import { generosityIndex, givingStreakWeeks, weekIndex, weeklySeries } from "../shared/impact";

const DAY = 86_400_000;
// Wednesday 2026-10-21 12:00 UTC
const NOW = Date.UTC(2026, 9, 21, 12);

describe("impact", () => {
  it("aligns weeks to Mondays", () => {
    const monday = Date.UTC(2026, 9, 19, 0, 0, 1);
    const sunday = Date.UTC(2026, 9, 18, 23, 59);
    expect(weekIndex(monday)).toBe(weekIndex(NOW));
    expect(weekIndex(sunday)).toBe(weekIndex(NOW) - 1);
  });

  it("counts consecutive giving weeks and tolerates an empty current week", () => {
    expect(givingStreakWeeks([], NOW)).toBe(0);
    expect(givingStreakWeeks([NOW, NOW - 7 * DAY, NOW - 14 * DAY], NOW)).toBe(3);
    // Nothing yet this week, but the last two weeks count.
    expect(givingStreakWeeks([NOW - 7 * DAY, NOW - 14 * DAY], NOW)).toBe(2);
    // A gap breaks it.
    expect(givingStreakWeeks([NOW, NOW - 21 * DAY], NOW)).toBe(1);
  });

  it("weights breadth over size in the Generosity Index", () => {
    expect(generosityIndex({ peopleHelped: 3, debtsCleared: 1, activeWeeks: 2 })).toBe(30 + 25 + 10);
    const manySmall = generosityIndex({ peopleHelped: 10, debtsCleared: 0, activeWeeks: 6 });
    const oneHuge = generosityIndex({ peopleHelped: 1, debtsCleared: 1, activeWeeks: 1 });
    expect(manySmall).toBeGreaterThan(oneHuge);
  });

  it("buckets gifts into a fixed-length weekly series, oldest first", () => {
    const s = weeklySeries(
      [
        { createdAt: NOW, amountCents: 100 },
        { createdAt: NOW - DAY, amountCents: 50 },
        { createdAt: NOW - 7 * DAY, amountCents: 25 },
        { createdAt: NOW - 400 * DAY, amountCents: 999 },
      ],
      4,
      NOW,
    );
    expect(s).toHaveLength(4);
    expect(s.map((w) => w.totalCents)).toEqual([0, 0, 25, 150]);
    expect(s[3]!.weekStart).toBeLessThanOrEqual(NOW);
    expect(s[1]!.weekStart - s[0]!.weekStart).toBe(7 * DAY);
  });
});
