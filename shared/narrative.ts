import { CATEGORY_LABELS, type Category } from "./domain";

/**
 * A short, warm "what your giving changed" paragraph, written on-device from the Patron's own data.
 * Deterministic per month so it doesn't shuffle on every visit.
 */
export interface NarrativeInput {
  monthName: string;
  gifts: { amountCents: number; firstName: string; city: string; country: string; category: Category; cleared: boolean }[];
  streakWeeks: number;
}

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function impactNarrative({ monthName, gifts, streakWeeks }: NarrativeInput): string {
  if (gifts.length === 0) {
    return `Your ${monthName} is still a blank page. Somewhere in the deck there’s a person one swipe away from a lighter month.`;
  }
  const total = gifts.reduce((s, g) => s + g.amountCents, 0);
  const people = [...new Map(gifts.map((g) => [g.firstName + g.city, g])).values()];
  const countries = new Set(gifts.map((g) => g.country));
  const cleared = people.filter((g) => g.cleared);
  const cat = Object.entries(
    gifts.reduce<Record<string, number>>((acc, g) => ((acc[g.category] = (acc[g.category] ?? 0) + g.amountCents), acc), {}),
  ).sort((a, b) => b[1] - a[1])[0]![0] as Category;
  const named = people.slice(0, 3).map((g) => `${g.firstName} in ${g.city}`);

  const opener =
    people.length === 1
      ? `In ${monthName} you gave ${usd(total)} to ${named[0]}.`
      : `In ${monthName} your ${gifts.length} gifts — ${usd(total)} in all — reached ${people.length} people across ${countries.size} ${countries.size === 1 ? "country" : "countries"}, including ${list(named)}.`;
  const middle = cleared.length
    ? ` You helped clear ${cleared.length === 1 ? `${cleared[0]!.firstName}’s debt completely` : `${cleared.length} debts completely`} — that’s mail they can open without dread.`
    : ` Most of it went to ${CATEGORY_LABELS[cat].toLowerCase()}, where a little momentum changes everything.`;
  const closer =
    streakWeeks >= 3
      ? ` And you’ve given ${streakWeeks} weeks in a row. Quietly, consistently — the best kind of generous.`
      : ` One more gift this week would start a streak.`;
  return opener + middle + closer;
}
