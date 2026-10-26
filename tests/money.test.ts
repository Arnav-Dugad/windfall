import { describe, expect, it } from "vitest";
import {
  centsToSlider,
  clampGift,
  formatCompactUSD,
  formatUSD,
  formatUSDWhole,
  progress,
  remainingCents,
  sliderToCents,
  snapCents,
} from "../shared/money";

describe("money", () => {
  it("computes remaining and progress without going out of bounds", () => {
    expect(remainingCents(10_000, 2_500)).toBe(7_500);
    expect(remainingCents(10_000, 12_000)).toBe(0);
    expect(progress(10_000, 2_500)).toBe(0.25);
    expect(progress(10_000, 20_000)).toBe(1);
    expect(progress(0, 100)).toBe(0);
  });

  it("clamps gifts to what is still needed", () => {
    expect(clampGift(5_000, 10_000, 8_000)).toBe(2_000);
    expect(clampGift(1_000, 10_000, 0)).toBe(1_000);
    expect(clampGift(-5, 10_000, 0)).toBe(0);
    expect(clampGift(Number.NaN, 10_000, 0)).toBe(0);
    expect(clampGift(1_000, 10_000, 10_000)).toBe(0);
  });

  it("formats USD", () => {
    expect(formatUSD(1_240_000)).toBe("$12,400");
    expect(formatUSD(1_250)).toBe("$12.50");
    expect(formatUSDWhole(82_254)).toBe("$823");
    expect(formatCompactUSD(100_000)).toBe("$1K");
    expect(formatCompactUSD(1_250_000)).toBe("$12.5K");
    expect(formatCompactUSD(10_000_000)).toBe("$100K");
    expect(formatCompactUSD(150_000_000)).toBe("$1.5M");
  });

  it("maps the slider logarithmically and round-trips", () => {
    const min = 10_000;
    const max = 10_000_000;
    expect(sliderToCents(0, min, max)).toBe(min);
    expect(sliderToCents(1, min, max)).toBe(max);
    const mid = sliderToCents(0.5, min, max);
    expect(mid).toBeGreaterThan(200_000);
    expect(mid).toBeLessThan(500_000);
    expect(centsToSlider(sliderToCents(0.3, min, max), min, max)).toBeCloseTo(0.3, 1);
  });

  it("snaps to friendly steps", () => {
    expect(snapCents(12_345)).toBe(12_000); // $123.45 → $120
    expect(snapCents(1_234_567)).toBe(1_250_000); // $12,345.67 → nearest $500 → $12,500
    expect(snapCents(456_789)).toBe(460_000); // $4,567.89 → nearest $100 → $4,600
  });
});
