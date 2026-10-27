import { BadgeCheck } from "lucide-react";
import { m } from "motion/react";
import type { RequestCard } from "@shared/domain";
import { CATEGORY_LABELS } from "@shared/domain";
import { formatCompactUSD, remainingCents } from "@shared/money";
import { Avatar } from "@/components/ui/Avatar";
import { Progress } from "@/components/ui/Progress";
import { ease, spring } from "@/design/motion";

/** Portrait tile used by Search and Circles: photo-first, with a glass caption and the portrait's accent. */
export function PersonTile({ card, onOpen, index = 0, shared = true }: { card: RequestCard; onOpen: (c: RequestCard) => void; index?: number; shared?: boolean }) {
  const rem = remainingCents(card.goalCents, card.fundedCents);
  return (
    <m.li
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.035, duration: 0.55, ease: ease.outExpo }}
      className="list-none"
    >
      <button onClick={() => onOpen(card)} className="press squircle group relative block aspect-[4/5] w-full overflow-hidden rounded-[26px] bg-fill text-left shadow-card ring-focus" aria-label={`${card.firstName}, ${card.city}: ${card.headline}`}>
        <m.div layoutId={shared ? `art-${card.id}` : undefined} transition={spring.layout} className="absolute inset-0">
          <Avatar seed={card.avatarSeed} name={card.firstName} photoUrl={card.photoUrl} blur={card.blurPhoto} shape="card" className="size-full transition-transform duration-700 ease-(--ease-out-expo) group-hover:scale-[1.04]" />
        </m.div>
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/25 to-transparent" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 p-3.5 text-white">
          <p className="flex items-center gap-1 text-[15px] font-semibold">
            {card.firstName}
            {card.verification === "verified" && <BadgeCheck className="size-4 text-white/90" aria-label="Verified" />}
          </p>
          <p className="truncate text-[12.5px] text-white/75">
            {card.city} · {CATEGORY_LABELS[card.category]}
          </p>
          <Progress value={card.fundedCents / card.goalCents} size="sm" onPhoto accent={card.accent} className="mt-2" />
          <p className="mt-1.5 text-[12px] font-medium text-white/85 num">{formatCompactUSD(rem)} to go</p>
        </div>
      </button>
    </m.li>
  );
}
