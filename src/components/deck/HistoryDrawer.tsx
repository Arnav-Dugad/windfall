import { ArrowUp, Bookmark, HandCoins, RotateCcw, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import type { RequestCard } from "@shared/domain";
import { formatUSD } from "@shared/money";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { spring } from "@/design/motion";
import { UNDO_WINDOW_MS } from "@/lib/api";
import { useNow } from "@/lib/hooks";
import { cn, timeAgo } from "@/lib/utils";
import type { SwipeDir } from "./SwipeDeck";

export interface HistoryEntry {
  key: string;
  card: RequestCard;
  dir: SwipeDir;
  giftId?: string;
  amountCents?: number;
  at: number;
}

const META: Record<SwipeDir, { label: string; icon: typeof X; tone: string }> = {
  left: { label: "Passed", icon: X, tone: "bg-fill text-ink-2" },
  right: { label: "Gave", icon: HandCoins, tone: "bg-accent text-white" },
  up: { label: "Cleared", icon: ArrowUp, tone: "bg-positive text-white" },
  down: { label: "Saved", icon: Bookmark, tone: "bg-accent-soft text-accent-ink" },
};

/** The last 20 decisions, each individually undoable (gifts within their 2-minute window). */
export function HistoryDrawer({
  open,
  onOpenChange,
  history,
  onUndo,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  history: HistoryEntry[];
  onUndo: (e: HistoryEntry) => void;
}) {
  const now = useNow(1000);
  const items = [...history].reverse().slice(0, 20);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Recent decisions" description="Undo any of your last 20 swipes. Gifts can be undone for 2 minutes.">
      {items.length === 0 ? (
        <p className="py-10 text-center text-[15px] text-ink-3">Nothing yet — your swipes will appear here.</p>
      ) : (
        <ul className="-mx-2 space-y-1 pb-2">
          <AnimatePresence initial={false}>
            {items.map((e) => {
              const meta = META[e.dir];
              const left = e.giftId ? UNDO_WINDOW_MS - (now - e.at) : Infinity;
              const canUndo = left > 0;
              return (
                <m.li
                  key={e.key}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={spring.snappy}
                  className="flex items-center gap-3 rounded-[18px] p-2"
                >
                  <div className="relative">
                    <Avatar seed={e.card.avatarSeed} name={e.card.firstName} photoUrl={e.card.photoUrl} className="size-12" />
                    <span className={cn("absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full ring-2 ring-surface", meta.tone)}>
                      <meta.icon className="size-3" aria-hidden strokeWidth={2.6} />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">
                      {meta.label} {e.card.firstName}
                      {e.amountCents ? <span className="num font-normal text-ink-2"> · {formatUSD(e.amountCents)}</span> : null}
                    </p>
                    <p className="text-[12.5px] text-ink-3">
                      {timeAgo(e.at, now)}
                      {e.giftId && canUndo ? ` · undo for ${Math.ceil(left / 1000)}s` : e.giftId ? " · final" : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="quiet" disabled={!canUndo} onClick={() => onUndo(e)} aria-label={`Undo: ${meta.label} ${e.card.firstName}`}>
                    <RotateCcw className="size-3.5" aria-hidden /> Undo
                  </Button>
                </m.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </Sheet>
  );
}
