// Integer-cents money helpers. Never use floats for balances.

export const MIN_GIFT_CENTS = 100; // $1
export const MAX_GIFT_CENTS = 100_000_000; // $1M per gift
export const PRESET_GIFTS_CENTS = [100_000, 1_000_000, 10_000_000] as const; // $1K, $10K, $100K

export function remainingCents(goalCents: number, fundedCents: number): number {
  return Math.max(0, goalCents - fundedCents);
}

export function progress(goalCents: number, fundedCents: number): number {
  if (goalCents <= 0) return 0;
  return Math.min(1, Math.max(0, fundedCents / goalCents));
}

/** Clamp a requested gift to what's still needed; returns 0 if nothing can be given. */
export function clampGift(requestedCents: number, goalCents: number, fundedCents: number): number {
  const rem = remainingCents(goalCents, fundedCents);
  if (!Number.isFinite(requestedCents) || requestedCents <= 0) return 0;
  return Math.min(Math.round(requestedCents), rem, MAX_GIFT_CENTS);
}

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** $12,400 (drops cents when whole). */
export function formatUSD(cents: number): string {
  return cents % 100 === 0 ? usd0.format(cents / 100) : usd2.format(cents / 100);
}

/** Whole dollars only — for count-up tickers so intermediate frames never show cents. */
export function formatUSDWhole(cents: number): string {
  return usd0.format(Math.round(cents / 100));
}

/** $12.4K / $1.2M — for chips and tight spaces. */
export function formatCompactUSD(cents: number): string {
  const d = cents / 100;
  if (d >= 1_000_000) return `$${trim(d / 1_000_000)}M`;
  if (d >= 1_000) return `$${trim(d / 1_000)}K`;
  return `$${Math.round(d)}`;
}

function trim(n: number): string {
  return n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, "");
}

/**
 * Slider mapping: logarithmic so $100 and $100K are both reachable with one thumb.
 * t ∈ [0,1] ↔ cents ∈ [min,max], snapped to friendly steps.
 */
export function sliderToCents(t: number, minCents: number, maxCents: number): number {
  if (maxCents <= minCents) return maxCents;
  const clamped = Math.min(1, Math.max(0, t));
  const raw = Math.exp(Math.log(minCents) + clamped * (Math.log(maxCents) - Math.log(minCents)));
  return Math.min(maxCents, Math.max(minCents, snapCents(raw)));
}

export function centsToSlider(cents: number, minCents: number, maxCents: number): number {
  if (maxCents <= minCents) return 1;
  const c = Math.min(maxCents, Math.max(minCents, cents));
  return (Math.log(c) - Math.log(minCents)) / (Math.log(maxCents) - Math.log(minCents));
}

/** Round to a "nice" increment relative to magnitude ($10 under $1K, $100 under $10K…). */
export function snapCents(cents: number): number {
  const d = cents / 100;
  const step = d < 1_000 ? 10 : d < 10_000 ? 100 : d < 100_000 ? 500 : 1_000;
  return Math.max(step, Math.round(d / step) * step) * 100;
}
