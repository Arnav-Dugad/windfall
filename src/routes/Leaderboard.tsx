import { useQuery, useQueryClient } from "@tanstack/react-query";
import { m } from "motion/react";
import { Switch } from "radix-ui";
import { useId } from "react";
import { formatCompactUSD } from "@shared/money";
import { Avatar } from "@/components/ui/Avatar";
import { ErrorState, Skeleton } from "@/components/ui/Feedback";
import { toast } from "@/lib/toast";
import { spring } from "@/design/motion";
import { api } from "@/lib/api";
import { useDocumentTitle, useMe } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export default function Leaderboard() {
  useDocumentTitle("Generosity Index");
  const q = useQuery({ queryKey: ["leaderboard"], queryFn: api.leaderboard });
  const { data: me } = useMe();
  const qc = useQueryClient();
  const anonId = useId();

  const setAnonymous = async (v: boolean) => {
    const { user } = await api.updateProfile(v);
    qc.setQueryData(["me"], { user });
    await qc.invalidateQueries({ queryKey: ["leaderboard"] });
    toast({ message: v ? "You now appear as Anonymous Patron" : "Your name is shown on the index", tone: "accent" });
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
      <p className="eyebrow">Leaderboard</p>
      <h1 className="display mt-4 text-display-lg">Generosity Index</h1>
      <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink-2 text-pretty">
        Not who gave the most — who showed up. The index rewards breadth and follow-through:{" "}
        <span className="text-ink">10 points per person helped, 25 per debt cleared, 5 per week you gave.</span>
      </p>

      <div className="mt-8 flex items-center justify-between gap-4 rounded-tile bg-surface-2 px-5 py-4">
        <label htmlFor={anonId} className="text-[14.5px]">
          <span className="block font-medium">Appear anonymously</span>
          <span className="text-[13px] text-ink-2">Your rank stays; your name becomes “Anonymous Patron”.</span>
        </label>
        <Switch.Root
          id={anonId}
          checked={me?.user?.anonymousByDefault ?? false}
          onCheckedChange={(v) => void setAnonymous(v)}
          className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-ink ring-focus"
        >
          <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-surface shadow-sm transition-transform duration-(--duration-base) ease-(--ease-out-expo) data-[state=checked]:translate-x-[22px]" />
        </Switch.Root>
      </div>

      {q.isPending ? (
        <div className="mt-8 space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[72px]" />
          ))}
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <ol className="mt-8 space-y-1.5" aria-label="Patrons ranked by Generosity Index">
          {q.data.entries.map((e, i) => (
            <m.li
              key={e.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.gentle, delay: Math.min(i, 10) * 0.035 }}
              className={cn(
                "flex items-center gap-4 rounded-tile px-4 py-3.5 sm:px-5",
                e.isYou ? "bg-accent-soft shadow-[inset_0_0_0_1px_var(--wf-accent)]" : "bg-surface hairline",
              )}
              aria-current={e.isYou ? "true" : undefined}
            >
              <span className={cn("display w-8 text-center text-[1.9rem] leading-none num", e.rank <= 3 ? "text-accent-ink" : "text-ink-3")}>{e.rank}</span>
              <Avatar seed={e.avatarSeed} name={e.anonymous ? undefined : e.displayName} photoUrl={e.photo} className="size-10 shrink-0" monogram={!e.anonymous} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{e.displayName}</p>
                <p className="text-[12.5px] text-ink-2 num">
                  {e.peopleHelped} helped · {e.debtsCleared} cleared · {e.activeWeeks} wks
                  <span className="hidden sm:inline"> · {formatCompactUSD(e.totalCents)} given</span>
                </p>
              </div>
              <div className="text-right">
                <p className="display text-[1.7rem] leading-none num">{e.index}</p>
                <p className="text-[11px] tracking-[0.08em] text-ink-3 uppercase">index</p>
              </div>
            </m.li>
          ))}
        </ol>
      )}
      <p className="mt-8 text-center text-[12.5px] text-ink-3">All Patrons and totals are demo data.</p>
    </main>
  );
}
