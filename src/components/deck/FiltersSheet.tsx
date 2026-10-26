import { useQuery } from "@tanstack/react-query";
import { Switch } from "radix-ui";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { api, type DeckFilters } from "@/lib/api";
import { cn } from "@/lib/utils";

const RANGES: { label: string; min?: number; max?: number }[] = [
  { label: "Any amount" },
  { label: "Under $10K", max: 10_000 },
  { label: "$10K – $50K", min: 10_000, max: 50_000 },
  { label: "$50K+", min: 50_000 },
];

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
    <Sheet open={open} onOpenChange={onOpenChange} title="Filters" description="Shape who you meet next.">
      {/* Sheet content mounts on open, so the draft always starts from the applied filters. */}
      <FiltersForm filters={filters} onApply={onApply} onOpenChange={onOpenChange} />
    </Sheet>
  );
}

function FiltersForm({ filters, onApply, onOpenChange }: { filters: DeckFilters; onApply: (f: DeckFilters) => void; onOpenChange: (o: boolean) => void }) {
  const [draft, setDraft] = useState(filters);
  const countries = useQuery({ queryKey: ["countries"], queryFn: api.countries, staleTime: 5 * 60_000 });
  const verifiedId = useId();
  const countryId = useId();

  return (
      <div className="space-y-7 pb-1">
        <fieldset>
          <legend className="eyebrow mb-3">Order</legend>
          <Segmented
            value={draft.sort ?? "newest"}
            options={[
              { value: "newest", label: "Newest" },
              { value: "closest", label: "Closest to cleared" },
            ]}
            onChange={(v) => setDraft((d) => ({ ...d, sort: v as "newest" | "closest" }))}
          />
        </fieldset>

        <fieldset>
          <legend className="eyebrow mb-3">Amount needed</legend>
          <div className="grid grid-cols-2 gap-2">
            {RANGES.map((r) => {
              const active = draft.min === r.min && draft.max === r.max;
              return (
                <button
                  key={r.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setDraft((d) => ({ ...d, min: r.min, max: r.max }))}
                  className={cn(
                    "h-11 rounded-full text-[14px] font-medium transition-colors ring-focus num",
                    active ? "bg-ink text-on-ink" : "text-ink-2 shadow-[inset_0_0_0_1px_var(--wf-line-strong)] hover:text-ink",
                  )}
                >
                  {r.label}
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
            className="h-12 w-full appearance-none rounded-control bg-surface-2 px-4 text-[15px] ring-focus"
          >
            <option value="">Anywhere</option>
            {countries.data?.countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-4">
          <label htmlFor={verifiedId} className="text-[15px]">
            <span className="block font-medium">Verified only</span>
            <span className="text-[13px] text-ink-2">Documents reviewed by Windfall (mock review in this demo).</span>
          </label>
          <Switch.Root
            id={verifiedId}
            checked={!!draft.verified}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, verified: v || undefined }))}
            className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-ink ring-focus"
          >
            <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-surface shadow-sm transition-transform duration-(--duration-base) ease-(--ease-out-expo) data-[state=checked]:translate-x-[22px]" />
          </Switch.Root>
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="ghost" className="flex-1" onClick={() => setDraft({ category: draft.category, sort: "newest" })}>
            Reset
          </Button>
          <Button
            className="flex-[2]"
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            Show stories
          </Button>
        </div>
      </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-10 rounded-full text-[14px] font-medium transition-all duration-(--duration-base) ring-focus",
            value === o.value ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
