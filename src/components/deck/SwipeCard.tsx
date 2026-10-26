import { m } from "motion/react";
import { CATEGORY_LABELS, type RequestCard } from "@shared/domain";
import { formatUSD, progress, remainingCents } from "@shared/money";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, DemoBadge, VerificationBadge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { spring } from "@/design/motion";
import { cn } from "@/lib/utils";

/** The face of a Seeker's story. Pure presentation — dragging lives in SwipeDeck. */
export function SwipeCard({ card, className, interactive = true }: { card: RequestCard; className?: string; interactive?: boolean }) {
  const pct = progress(card.goalCents, card.fundedCents);
  const remaining = remainingCents(card.goalCents, card.fundedCents);

  return (
    <article
      className={cn(
        "card-surface relative flex h-full w-full flex-col overflow-hidden select-none",
        "[transform-style:preserve-3d]",
        className,
      )}
      aria-label={`${card.firstName}, ${card.city}. ${card.headline}`}
    >
      <m.div
        layoutId={interactive ? `art-${card.id}` : undefined}
        transition={spring.layout}
        className="relative h-[52%] shrink-0 overflow-hidden rounded-t-card"
      >
        <Avatar
          seed={card.avatarSeed}
          name={card.firstName}
          photoUrl={card.photoUrl}
          blur={card.blurPhoto}
          shape="card"
          className="absolute inset-0 rounded-none"
        />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-4">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="glass">{CATEGORY_LABELS[card.category]}</Badge>
            {card.verification !== "unverified" && <VerificationBadge status={card.verification} tone="glass" />}
          </div>
          {card.isDemo && <DemoBadge label="Demo" className="bg-white/70 backdrop-blur-md dark:bg-black/40" />}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/10 to-transparent" />
      </m.div>

      <div className="flex min-h-0 flex-1 flex-col px-5 pt-4 pb-5 sm:px-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="display text-[2.1rem] leading-none tracking-[-0.01em]">
            {card.firstName}
            {card.age ? <span className="text-ink-3">, {card.age}</span> : null}
          </h2>
          <span className="truncate text-[13px] text-ink-3">
            {card.city}, {card.country}
          </span>
        </div>
        <p className="mt-2.5 line-clamp-2 text-[16px] leading-snug text-ink text-pretty">{card.headline}</p>
        <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-ink-3 md:line-clamp-3 [@media(max-height:720px)]:hidden">{card.story}</p>

        <div className="mt-auto pt-4">
          <div className="mb-2 flex items-baseline justify-between text-[13px]">
            <span className="num font-medium text-ink">
              {formatUSD(card.fundedCents)} <span className="font-normal text-ink-3">of {formatUSD(card.goalCents)}</span>
            </span>
            <span className="num text-ink-3">{remaining > 0 ? `${formatUSD(remaining)} to go` : "Cleared"}</span>
          </div>
          <Progress value={pct} label={`${Math.round(pct * 100)}% funded`} />
        </div>
      </div>
    </article>
  );
}
