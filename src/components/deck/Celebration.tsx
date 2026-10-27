import { AnimatePresence, m } from "motion/react";
import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";
import type { RequestCard } from "@shared/domain";
import { formatUSD } from "@shared/money";
import { fxConfetti } from "@/components/effects";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ease, spring } from "@/design/motion";
import { possessive } from "@/lib/utils";

/** Full-screen "you cleared it" moment. The portrait shares a layoutId with the card/sheet it came from. */
export function Celebration({
  card,
  onClose,
  onViewStory,
}: {
  card: RequestCard | null;
  onClose: () => void;
  onViewStory?: (card: RequestCard) => void;
}) {
  useEffect(() => {
    if (!card) return;
    const t = setTimeout(() => void fxConfetti(), 260);
    return () => clearTimeout(t);
  }, [card]);

  const [now] = useState(() => Date.now());
  const days = card ? Math.max(1, Math.round((now - card.createdAt) / 86_400_000)) : 0;

  return (
    <Dialog.Root open={!!card} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {card && (
          <Dialog.Portal forceMount>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <m.div
                className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-canvas/95 px-6 outline-none backdrop-blur-xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              >
                <m.div
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-1/2 size-[80vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ background: "radial-gradient(closest-side, color-mix(in oklab, var(--wf-accent) 28%, transparent), transparent)" }}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 1.4, ease: ease.outExpo }}
                />
                <div className="relative flex max-w-xl flex-col items-center text-center">
                  <m.div
                    layoutId={`art-${card.id}`}
                    transition={spring.layout}
                    className="size-36 overflow-hidden rounded-[40px] shadow-glow sm:size-44"
                  >
                    <Avatar seed={card.avatarSeed} name={card.firstName} photoUrl={card.photoUrl} blur={card.blurPhoto} shape="card" className="size-full" />
                  </m.div>
                  <m.p
                    className="eyebrow mt-8 text-positive-ink"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35, duration: 0.6, ease: ease.outExpo }}
                  >
                    Fully funded
                  </m.p>
                  <Dialog.Title asChild>
                    <m.h2
                      className="display mt-3 text-display-lg text-balance"
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.45, duration: 0.8, ease: ease.outExpo }}
                    >
                      You cleared <em className="accent-sheen not-italic">{possessive(card.firstName)}</em> debt.
                    </m.h2>
                  </Dialog.Title>
                  <m.p
                    className="mt-5 text-[16px] text-ink-2 text-pretty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7, duration: 0.6 }}
                  >
                    <span className="num">{formatUSD(card.goalCents)}</span> from{" "}
                    <span className="num">{card.giftCount}</span> {card.giftCount === 1 ? "Patron" : "Patrons"} in{" "}
                    <span className="num">{days}</span> {days === 1 ? "day" : "days"}. {card.firstName} will hear about it
                    tonight.
                  </m.p>
                  <m.div
                    className="mt-9 flex flex-col gap-3 sm:flex-row"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.85, duration: 0.6, ease: ease.outExpo }}
                  >
                    <Button size="lg" magnetic onClick={onClose} autoFocus>
                      Keep swiping
                    </Button>
                    {onViewStory && (
                      <Button size="lg" variant="outline" onClick={() => onViewStory(card)}>
                        Read {possessive(card.firstName)} story
                      </Button>
                    )}
                  </m.div>
                  <p className="mt-6 text-[12px] text-ink-3">Demo — {card.firstName} is a fictional person.</p>
                </div>
              </m.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
