import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { m } from "motion/react";
import type { RequestCard } from "@shared/domain";
import { formatCompactUSD, formatUSD } from "@shared/money";
import { finishers } from "@shared/rank";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Feedback";
import { Progress } from "@/components/ui/Progress";
import { ease } from "@/design/motion";
import { activeCards, getPrefs } from "@/lib/social";

/**
 * "Closest to cleared within your budget": stories this Patron could finish outright, with the exact amount.
 */
export function FinishPanel({ onFinish, onOpen, excludeIds }: { onFinish: (card: RequestCard) => void; onOpen: (card: RequestCard) => void; excludeIds?: Set<string> }) {
  const prefs = useQuery({ queryKey: ["prefs"], queryFn: getPrefs, staleTime: 60_000 });
  const cards = useQuery({ queryKey: ["active-cards"], queryFn: activeCards, staleTime: 30_000 });
  const budget = prefs.data?.budgetCents ?? 500_000;
  const list = cards.data ? finishers(cards.data.filter((c) => !excludeIds?.has(c.id)), budget, 3) : [];

  return (
    <section aria-labelledby="finish-h" className="glass-thick rounded-[26px] p-4 shadow-card">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-positive text-white">
          <Sparkles className="size-3.5" aria-hidden />
        </span>
        <h2 id="finish-h" className="text-[15px] font-semibold">
          Finish a debt
        </h2>
        <span className="ml-auto rounded-full bg-fill px-2 py-0.5 text-[12px] font-semibold text-ink-2 num">≤ {formatCompactUSD(budget)}</span>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-3">Closest to cleared within your budget.</p>
      <ul className="mt-3 space-y-2">
        {cards.isPending
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-[18px]" />)
          : list.length === 0
            ? <li className="py-3 text-[13.5px] text-ink-3">No one fits this budget right now — try raising it in Settings.</li>
            : list.map(({ card, remaining }, i) => (
                <m.li key={card.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.5, ease: ease.outExpo }} className="rounded-[18px] bg-surface p-2.5 shadow-sm dark:bg-surface-2">
                  <div className="flex items-center gap-2.5">
                    <button onClick={() => onOpen(card)} className="press shrink-0 rounded-full ring-focus" aria-label={`Read ${card.firstName}’s story`}>
                      <Avatar seed={card.avatarSeed} name={card.firstName} photoUrl={card.photoUrl} className="size-10" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">
                        {card.firstName} <span className="font-normal text-ink-3">· {card.city}</span>
                      </p>
                      <Progress value={card.fundedCents / card.goalCents} size="sm" accent={card.accent} className="mt-1.5" />
                    </div>
                    <Button size="sm" variant="positive" onClick={() => onFinish(card)} aria-label={`Clear ${card.firstName}’s debt with ${formatUSD(remaining)}`}>
                      {formatCompactUSD(remaining)}
                    </Button>
                  </div>
                </m.li>
              ))}
      </ul>
    </section>
  );
}
