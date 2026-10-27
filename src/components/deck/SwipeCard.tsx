import { m } from "motion/react";
import { BadgeCheck, MapPin } from "lucide-react";
import { CATEGORY_LABELS, type RequestCard } from "@shared/domain";
import { formatUSD, progress, remainingCents } from "@shared/money";
import { Avatar } from "@/components/ui/Avatar";
import { Progress } from "@/components/ui/Progress";
import { spring } from "@/design/motion";
import { cn } from "@/lib/utils";

/**
 * The face of a Seeker's story: a full-bleed portrait with glass chrome, like an iOS widget.
 * Pure presentation — dragging lives in SwipeDeck.
 */
export function SwipeCard({
  card,
  className,
  interactive = true,
  priority = false,
}: {
  card: RequestCard;
  className?: string;
  interactive?: boolean;
  priority?: boolean;
}) {
  const pct = progress(card.goalCents, card.fundedCents);
  const remaining = remainingCents(card.goalCents, card.fundedCents);

  return (
    <article
      className={cn(
        "squircle relative isolate h-full w-full overflow-hidden rounded-card bg-surface-2 shadow-card select-none",
        "[transform-style:preserve-3d]",
        className,
      )}
      aria-label={`${card.firstName}, ${card.city}. ${card.headline}`}
    >
      {/* "Now Playing" treatment: a blurred, saturated copy of the portrait fills the card… */}
      {card.photoUrl && (
        <img
          src={card.photoUrl}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 size-full scale-125 object-cover blur-2xl saturate-150"
          loading={priority ? "eager" : "lazy"}
        />
      )}
      {/* …and the sharp portrait sits on top, dissolving into it so faces are never covered by text. */}
      <m.div
        layoutId={interactive ? `art-${card.id}` : undefined}
        transition={spring.layout}
        className="absolute inset-x-0 top-0 h-[74%] overflow-hidden rounded-t-card [mask-image:linear-gradient(to_bottom,black_62%,transparent)]"
      >
        <Avatar
          seed={card.avatarSeed}
          name={card.firstName}
          photoUrl={card.photoUrl}
          blur={card.blurPhoto}
          shape="card"
          priority={priority}
          className="absolute inset-0 rounded-none"
        />
      </m.div>

      {/* Legibility scrims: a light one at the top for chips, a deep one under the text. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/30 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-black/75 via-black/40 to-transparent" />

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-4">
        <div className="flex flex-wrap gap-1.5">
          <span className="glass-photo inline-flex h-7 items-center rounded-full px-3 text-[12.5px] font-semibold">{CATEGORY_LABELS[card.category]}</span>
          {card.verification === "verified" && (
            <span className="glass-photo inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold">
              <BadgeCheck className="size-3.5 text-[#64d2ff]" aria-hidden /> Verified
            </span>
          )}
        </div>
        {card.isDemo && <span className="glass-photo inline-flex h-7 items-center rounded-full px-2.5 text-[11.5px] font-semibold">Demo</span>}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-5">
        <div className="px-1">
          <h2 className="display text-[2rem] leading-none drop-shadow-sm">
            {card.firstName}
            {card.age ? <span className="font-normal text-white/75">, {card.age}</span> : null}
          </h2>
          <p className="mt-1.5 flex items-center gap-1 text-[13.5px] font-medium text-white/80">
            <MapPin className="size-3.5" aria-hidden />
            {card.city}, {card.country}
          </p>
          <p className="mt-2.5 line-clamp-2 text-[16px] leading-snug font-medium text-pretty">{card.headline}</p>
        </div>

        <div className="glass-photo mt-4 rounded-[20px] px-4 py-3">
          <div className="mb-2 flex items-baseline justify-between text-[13px]">
            <span className="num font-semibold">
              {formatUSD(card.fundedCents)} <span className="font-normal text-white/70">of {formatUSD(card.goalCents)}</span>
            </span>
            <span className="num font-medium text-white/80">{remaining > 0 ? `${formatUSD(remaining)} to go` : "Cleared"}</span>
          </div>
          <Progress value={pct} onPhoto accent={card.accent} label={`${Math.round(pct * 100)}% funded`} />
        </div>
      </div>
    </article>
  );
}
