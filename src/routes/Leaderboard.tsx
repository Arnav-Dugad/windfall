import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { Switch } from "radix-ui";
import { useEffect, useId, useMemo, useState } from "react";
import { formatCompactUSD } from "@shared/money";
import { Avatar } from "@/components/ui/Avatar";
import { ErrorState, Skeleton } from "@/components/ui/Feedback";
import { LargeTitle } from "@/components/ui/LargeTitle";
import { toast } from "@/lib/toast";
import { spring } from "@/design/motion";
import { api, type LeaderboardEntry } from "@/lib/api";
import { useDocumentTitle, useMe } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const RANKS_KEY = "give.leaderboard.ranks";

function readRanks(): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(RANKS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : null;
  } catch {
    return null;
  }
}
function writeRanks(entries: LeaderboardEntry[]) {
  try {
    localStorage.setItem(RANKS_KEY, JSON.stringify(Object.fromEntries(entries.map((e) => [e.id, e.rank]))));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Rank changes since your last visit: render the previous order first, then let the rows spring into the
 * new order (Motion layout), with a ▲n / ▼n badge that fades after a few seconds.
 */
function useRankReplay(entries: LeaderboardEntry[] | undefined) {
  const [prev] = useState(readRanks);
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"prev" | "live" | "settled">(prev && !reduce ? "prev" : "live");
  useEffect(() => {
    if (!entries) return;
    writeRanks(entries);
    const timers = [phase === "prev" ? setTimeout(() => setPhase("live"), 700) : undefined, setTimeout(() => setPhase("settled"), 5200)];
    return () => timers.forEach((t) => t && clearTimeout(t));
    // Runs once per data load; the phase only moves forward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const rows = useMemo(() => {
    if (!entries) return [];
    const withPrev = entries.map((e) => ({ ...e, prevRank: prev?.[e.id] ?? null }));
    if (phase !== "prev") return withPrev;
    return [...withPrev].sort((a, b) => (a.prevRank ?? a.rank + 0.5) - (b.prevRank ?? b.rank + 0.5));
  }, [entries, prev, phase]);
  return { rows, phase };
}

export default function Leaderboard() {
  useDocumentTitle("Generosity Index");
  const q = useQuery({ queryKey: ["leaderboard"], queryFn: api.leaderboard });
  const { data: me } = useMe();
  const qc = useQueryClient();
  const anonId = useId();
  const { rows, phase } = useRankReplay(q.data?.entries);

  const setAnonymous = async (v: boolean) => {
    const { user } = await api.updateProfile(v);
    qc.setQueryData(["me"], { user });
    await qc.invalidateQueries({ queryKey: ["leaderboard"] });
    toast({ message: v ? "You now appear as Anonymous Patron" : "Your name is shown on the index", tone: "accent" });
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
      <LargeTitle
        title="Generosity Index"
        eyebrow="Leaderboard"
        subtitle={
          <>
            Not who gave the most — who showed up. The index rewards breadth and follow-through:{" "}
            <span className="text-ink">10 points per person helped, 25 per debt cleared, 5 per week you gave.</span>
          </>
        }
      />

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
          {rows.map((e, i) => (
            <m.li
              key={e.id}
              layout="position"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.gentle, delay: phase === "prev" ? Math.min(i, 10) * 0.035 : 0, layout: { type: "spring", stiffness: 170, damping: 24, mass: 1 } }}
              className={cn(
                "flex items-center gap-4 rounded-tile px-4 py-3.5 sm:px-5",
                e.isYou ? "bg-accent-soft shadow-[inset_0_0_0_1px_var(--wf-accent)]" : "bg-surface hairline",
              )}
              aria-current={e.isYou ? "true" : undefined}
            >
              <span className="relative w-8 text-center">
                <span className={cn("display text-[1.9rem] leading-none num", e.rank <= 3 ? "text-accent-ink" : "text-ink-3")}>{phase === "prev" && e.prevRank ? e.prevRank : e.rank}</span>
                <AnimatePresence>
                  {phase === "live" && e.prevRank && e.prevRank !== e.rank && <RankDelta delta={e.prevRank - e.rank} />}
                </AnimatePresence>
              </span>
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

function RankDelta({ delta }: { delta: number }) {
  const up = delta > 0;
  return (
    <m.span
      initial={{ opacity: 0, y: up ? 6 : -6, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 420, damping: 26 }}
      className={cn(
        "num absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-px text-[10.5px] font-bold whitespace-nowrap",
        up ? "bg-positive text-white" : "bg-danger/90 text-white",
      )}
      aria-label={up ? `Up ${delta}` : `Down ${-delta}`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(delta)}
    </m.span>
  );
}
