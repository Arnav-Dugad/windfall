import type { Impact } from "@/lib/api";

export interface PassData {
  name: string;
  totals: Impact["totals"];
  memberSince: number | null;
}

export const passGradient = "linear-gradient(155deg, color-mix(in oklab, var(--wf-accent) 80%, white) 0%, var(--wf-accent) 38%, #6e4cf5 100%)";

export function memberSinceLabel(ts: number | null) {
  return ts ? new Date(ts).toLocaleString("en-US", { month: "short", year: "numeric" }) : "Today";
}

/** Deterministic barcode bar widths (1–3) from the holder and totals — decorative, not scannable. */
export function barcode(seed: string, n = 54): number[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Array.from({ length: n }, () => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return 1 + ((h >>> 0) % 3);
  });
}
