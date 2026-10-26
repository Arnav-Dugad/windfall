import type { DeckFilters } from "./api";

/** Filters other than category that are currently narrowing the deck (for the badge on the Filters button). */
export function activeFilterCount(f: DeckFilters) {
  return [f.country, f.min ?? f.max, f.verified || undefined, f.sort === "closest" || undefined].filter((v) => v !== undefined).length;
}
