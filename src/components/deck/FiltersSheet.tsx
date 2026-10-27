import { useQuery } from "@tanstack/react-query";
import { Switch } from "radix-ui";
import { useId, useMemo, useState } from "react";
import type { RequestCard } from "@shared/domain";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { api, type DeckFilters } from "@/lib/api";
import { activeCards } from "@/lib/social";
import { cn } from "@/lib/utils";

const RANGES: { label: string; min?: number; max?: number }[] = [
  { label: "Any amount" },
  { label: "Under $10K", max: 10_000 },
  { label: "$10K – $50K", min: 10_000, max: 50_000 },
  { label: "$50K+", min: 50_000 },
];

const SORTS = [
  { value: "for_you", label: "For you" },
  { value: "newest", label: "Newest" },
  { value: "closest", label: "Closest" },
] as const;

/** Same predicate the deck uses, so the live counts match what "Show stories" returns (before swipes). */
function matches(c: RequestCard, f: DeckFilters) {
  return (
    (!f.category || c.category === f.category) &&
    (!f.country || c.countryCode === f.country) &&
    (f.min === undefined || c.goalCents >= f.min * 100) &&
    (f.max === undefined || c.goalCents <= f.max * 100) &&
    (!f.verified || c.verification === "verified")
  );
}

export function FiltersSheet({
  open,
  onOpenChange,
  filters,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  filters: DeckFilters;
  onApply: (f: DeckFilters) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Filters" description="Shape who you meet next." side="right">
      {/* Sheet content mounts on open, so the draft always starts from the applied filters. */}
      <FiltersForm filters={filters} onApply={onApply} onOpenChange={onOpenChange} />
    </Sheet>
  );
}

function FiltersForm({ filters, onApply, onOpenChange }: { filters: DeckFilters; onApply: (f: DeckFilters) => void; onOpenChange: (o: boolean) => void }) {
  const [draft, setDraft] = useState(filters);
  const countries = useQuery({ queryKey: ["countries"], queryFn: api.countries, staleTime: 5 * 60_000 });
  const cards = useQuery({ queryKey: ["active-cards"], queryFn: activeCards, staleTime: 30_000 });
  const verifiedId = useId();
  const countryId = useId();

  const count = useMemo(() => {
    const all = cards.data;
    return (f: DeckFilters) => (all ? all.filter((c) => matches(c, f)).length : null);
  }, [cards.data]);
  const total = count(draft);

  return (
    <div className="space-y-7 pb-1">
      <fieldset>
        <legend className="eyebrow mb-3">Order</legend>
        <div className="grid grid-cols-3 gap-1 rounded-full bg-fill p-1" role="radiogroup">
          {SORTS.map((o) => {
            const on = (draft.sort ?? "for_you") === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setDraft((d) => ({ ...d, sort: o.value }))}
                className={cn("press h-10 rounded-full text-[14px] font-medium transition-all duration-(--duration-base) ring-focus", on ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        {(draft.sort ?? "for_you") === "for_you" && <p className="mt-2 text-[12.5px] text-ink-3">Learns from your gifts and causes, with a few surprises mixed in.</p>}
      </fieldset>

      <fieldset>
        <legend className="eyebrow mb-3">Amount needed</legend>
        <div className="grid grid-cols-2 gap-2">
          {RANGES.map((r) => {
            const active = draft.min === r.min && draft.max === r.max;
            const n = count({ ...draft, min: r.min, max: r.max });
            return (
              <button
                key={r.label}
                type="button"
                aria-pressed={active}
                onClick={() => setDraft((d) => ({ ...d, min: r.min, max: r.max }))}
                className={cn(
                  "press flex h-11 items-center justify-center gap-1.5 rounded-full text-[14px] font-medium transition-colors ring-focus num",
                  active ? "bg-ink text-on-ink" : "text-ink-2 shadow-[inset_0_0_0_1px_var(--wf-line-strong)] hover:text-ink",
                )}
              >
                {r.label}
                {n !== null && <span className={cn("text-[12px] font-normal", active ? "opacity-70" : "text-ink-3")}>{n}</span>}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor={countryId} className="eyebrow mb-3 block">
          Country
        </label>
        <select
          id={countryId}
          value={draft.country ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, country: e.target.value || undefined }))}
          className="h-12 w-full appearance-none rounded-control bg-fill px-4 text-[15px] ring-focus"
        >
          <option value="">Anywhere ({count({ ...draft, country: undefined }) ?? "…"})</option>
          {countries.data?.countries.map((c) => {
            const n = count({ ...draft, country: c.code });
            return (
              <option key={c.code} value={c.code} disabled={n === 0}>
                {c.name}
                {n !== null ? ` (${n})` : ""}
              </option>
            );
          })}
        </select>
      </div>

      <div className="flex items-center justify-between gap-4">
        <label htmlFor={verifiedId} className="text-[15px]">
          <span className="block font-medium">
            Verified only <span className="num text-[13px] font-normal text-ink-3">{count({ ...draft, verified: true }) ?? ""}</span>
          </span>
          <span className="text-[13px] text-ink-2">Documents reviewed by Give (mock review in this demo).</span>
        </label>
        <Switch.Root
          id={verifiedId}
          checked={!!draft.verified}
          onCheckedChange={(v) => setDraft((d) => ({ ...d, verified: v || undefined }))}
          className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-positive ring-focus"
        >
          <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-(--duration-base) ease-(--ease-out-expo) data-[state=checked]:translate-x-[22px]" />
        </Switch.Root>
      </div>

      <div className="sticky bottom-0 -mx-6 flex gap-3 px-6 pt-1">
        <Button variant="ghost" className="flex-1" onClick={() => setDraft({ category: draft.category, sort: "for_you" })}>
          Reset
        </Button>
        <Button
          className="flex-[2]"
          disabled={total === 0}
          onClick={() => {
            onApply(draft);
            onOpenChange(false);
          }}
        >
          {total === null ? "Show stories" : total === 0 ? "No stories match" : `Show ${total} ${total === 1 ? "story" : "stories"}`}
        </Button>
      </div>
    </div>
  );
}
