import { useMutation } from "@tanstack/react-query";
import { Check, Lock, Users } from "lucide-react";
import { AnimatePresence, m, useSpring, useTransform } from "motion/react";
import { Slider, Switch } from "radix-ui";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { RequestCard } from "@shared/domain";
import {
  centsToSlider,
  clampGift,
  formatCompactUSD,
  formatUSD,
  formatUSDWhole,
  PRESET_GIFTS_CENTS,
  progress,
  remainingCents,
  sliderToCents,
} from "@shared/money";
import { fxCoinBurst } from "@/components/effects";
import { flyCoin } from "@/components/effects/flyCoin";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { Sheet } from "@/components/ui/Sheet";
import { Ticker } from "@/components/ui/Ticker";
import { ease, spring } from "@/design/motion";
import { announce } from "@/lib/announce";
import { api, type GiftResult } from "@/lib/api";
import { useNow } from "@/lib/hooks";
import { shareLink } from "@/lib/share";
import { createMatch } from "@/lib/social";
import { toast } from "@/lib/toast";
import { cn, haptic } from "@/lib/utils";

type Choice = { kind: "preset"; cents: number } | { kind: "clear" } | { kind: "custom" };

export function GiveSheet({
  card,
  open,
  anonymousDefault,
  onCancel,
  onGiven,
  onDone,
  onUndone,
  doneLabel = "Keep swiping",
  circleId,
  matchId,
  context,
  suggestedCents,
}: {
  card: RequestCard | null;
  open: boolean;
  anonymousDefault: boolean;
  /** Give as part of a Giving Circle (counts toward the circle's shared bar). */
  circleId?: string | null;
  /** Give in response to a "match my gift" link. */
  matchId?: string | null;
  /** Shown above the form, e.g. "Giving with Nurses Circle". */
  context?: React.ReactNode;
  /** Preselected amount (e.g. the gift being matched). */
  suggestedCents?: number;
  /** Closed without giving — the card should return to the deck. */
  onCancel: () => void;
  /** Gift recorded. If it cleared the debt, the parent should celebrate. */
  onGiven: (result: GiftResult) => void;
  /** Closed after a successful gift. */
  onDone: () => void;
  /** The gift was undone from the confirmation (the sheet then closes). */
  onUndone?: (giftId: string, request: RequestCard | null) => void;
  /** Label for the confirmation's close button ("Keep swiping" on the deck, "Done" elsewhere). */
  doneLabel?: string;
}) {
  const [result, setResult] = useState<GiftResult | null>(null);
  // Each time the sheet opens it starts fresh (state adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setResult(null);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) (result ? onDone : onCancel)();
      }}
      title={card ? (result ? "Thank you." : `Give to ${card.firstName}`) : ""}
      description={
        card
          ? result
            ? `Your gift is on its way to ${card.firstName}.`
            : `${formatUSD(remainingCents(card.goalCents, card.fundedCents))} still needed`
          : undefined
      }
    >
      {card &&
        (result ? (
          <GiftConfirmed
            card={card}
            result={result}
            onDone={onDone}
            doneLabel={doneLabel}
            onUndone={(request) => {
              onUndone?.(result.gift.id, request);
              onDone();
            }}
          />
        ) : (
          <GiveForm
            card={card}
            circleId={circleId}
            matchId={matchId}
            context={context}
            suggestedCents={suggestedCents}
            anonymousDefault={anonymousDefault}
            onGiven={(r) => {
              setResult(r);
              onGiven(r);
            }}
          />
        ))}
    </Sheet>
  );
}

function GiveForm({
  card,
  anonymousDefault,
  onGiven,
  circleId,
  matchId,
  context,
  suggestedCents,
}: {
  card: RequestCard;
  anonymousDefault: boolean;
  circleId?: string | null;
  matchId?: string | null;
  context?: React.ReactNode;
  suggestedCents?: number;
  onGiven: (r: GiftResult) => void;
}) {
  const remaining = remainingCents(card.goalCents, card.fundedCents);
  const presets = PRESET_GIFTS_CENTS.filter((c) => c < remaining);
  const minCents = Math.min(10_000, remaining);
  const [choice, setChoice] = useState<Choice>(() =>
    suggestedCents
      ? suggestedCents >= remaining
        ? { kind: "clear" }
        : presets.some((c) => c === suggestedCents)
          ? { kind: "preset", cents: suggestedCents }
          : { kind: "custom" }
      : presets[0]
        ? { kind: "preset", cents: presets[0] }
        : { kind: "clear" },
  );
  const [custom, setCustom] = useState(() => Math.min(suggestedCents ?? 250_000, remaining));
  const [anonymous, setAnonymous] = useState(anonymousDefault);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const anonId = useId();

  const amount =
    choice.kind === "clear" ? remaining : choice.kind === "preset" ? choice.cents : clampGift(custom, card.goalCents, card.fundedCents);
  const isClear = amount >= remaining;

  const give = useMutation({
    mutationFn: () =>
      api.give({ requestId: card.id, amountCents: amount, kind: isClear ? "clear" : "give", anonymous, circleId, matchId }),
    onSuccess: (r) => {
      const b = buttonRef.current?.getBoundingClientRect();
      if (b) {
        void fxCoinBurst(b.left + b.width / 2, b.top + b.height / 2, r.cleared ? 1.6 : 1);
        flyCoin({ x: b.left + b.width / 2, y: b.top + b.height / 2 }, { delay: 60 });
      }
      haptic([10, 30, 14]);
      announce(`You gave ${formatUSD(r.gift.amountCents)} to ${card.firstName}.${r.cleared ? " Their debt is fully cleared." : ""}`);
      onGiven(r);
    },
  });

  return (
    <div className="pb-1">
      {context && <div className="mb-4 flex items-center gap-2 rounded-full bg-accent-soft px-3.5 py-2 text-[13px] font-medium text-accent-ink">{context}</div>}
      <MiniCard card={card} />

      <div className="mt-6" role="radiogroup" aria-label="Gift amount">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {presets.map((c) => (
            <Chip key={c} active={choice.kind === "preset" && choice.cents === c} onClick={() => setChoice({ kind: "preset", cents: c })}>
              {formatCompactUSD(c)}
            </Chip>
          ))}
          <Chip active={choice.kind === "custom"} onClick={() => setChoice({ kind: "custom" })}>
            Custom
          </Chip>
          <Chip
            active={choice.kind === "clear"}
            onClick={() => setChoice({ kind: "clear" })}
            tone="positive"
            className={cn(presets.length === 3 && "col-span-2 sm:col-span-4", presets.length === 1 && "col-span-2")}
          >
            Clear it · {formatCompactUSD(remaining)}
          </Chip>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center">
        <AmountDisplay cents={amount} />
        <AnimatePresence initial={false}>
          {choice.kind === "custom" && (
            <m.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.32, ease: ease.outExpo }}
              className="w-full overflow-hidden"
            >
              <div className="px-1 pt-5 pb-1">
                <Slider.Root
                  value={[Math.round(centsToSlider(custom, minCents, remaining) * 1000)]}
                  onValueChange={([v]) => {
                    const next = sliderToCents((v ?? 0) / 1000, minCents, remaining);
                    if (next !== custom) haptic(4);
                    setCustom(next);
                  }}
                  max={1000}
                  step={1}
                  aria-label="Custom amount"
                  className="relative flex h-8 w-full touch-none items-center select-none"
                >
                  <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-line">
                    <Slider.Range className="absolute h-full rounded-full bg-gradient-to-r from-accent/60 to-accent" />
                  </Slider.Track>
                  <Slider.Thumb
                    aria-valuetext={formatUSD(custom)}
                    className="block size-7 rounded-full bg-surface shadow-[0_0_0_1px_var(--wf-line-strong),0_4px_14px_rgb(40_30_15/0.2)] transition-transform duration-(--duration-fast) hover:scale-105 active:scale-110 ring-focus"
                  />
                </Slider.Root>
                <div className="mt-1 flex justify-between text-[12px] text-ink-3 num">
                  <span>{formatUSD(minCents)}</span>
                  <span>{formatUSD(remaining)}</span>
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 rounded-tile bg-surface-2 px-4 py-3.5">
        <label htmlFor={anonId} className="text-[14px] leading-tight">
          <span className="block font-medium">Give anonymously</span>
          <span className="text-[13px] text-ink-2">
            {card.firstName} sees “Anonymous Patron”, and the leaderboard won’t show your name.
          </span>
        </label>
        <Switch.Root
          id={anonId}
          checked={anonymous}
          onCheckedChange={setAnonymous}
          className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong transition-colors duration-(--duration-base) data-[state=checked]:bg-ink ring-focus"
        >
          <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-surface shadow-sm transition-transform duration-(--duration-base) ease-(--ease-out-expo) data-[state=checked]:translate-x-[22px]" />
        </Switch.Root>
      </div>

      {give.error && (
        <p role="alert" className="mt-4 text-center text-[14px] text-danger">
          {give.error.message}
        </p>
      )}

      <Button
        ref={buttonRef}
        variant={isClear ? "positive" : "accent"}
        size="lg"
        magnetic
        className="mt-5 w-full"
        disabled={give.isPending || amount <= 0}
        onClick={() => give.mutate()}
      >
        {give.isPending ? (
          <span className="inline-flex items-center gap-2">
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            Sending…
          </span>
        ) : isClear ? (
          <>Clear {card.firstName}’s debt · {formatUSD(amount)}</>
        ) : (
          <>Give {formatUSD(amount)}</>
        )}
      </Button>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-[12.5px] text-ink-3">
        <Lock className="size-3" aria-hidden /> Demo mode — no real money moves.
      </p>
    </div>
  );
}

function AmountDisplay({ cents }: { cents: number }) {
  const mv = useSpring(cents, { stiffness: 260, damping: 30 });
  useEffect(() => mv.set(cents), [cents, mv]);
  const text = useTransform(mv, (v) => formatUSD(Math.round(v / 100) * 100));
  return (
    <div className="text-center" aria-live="polite">
      <m.output className="display num block text-[3.6rem] leading-none tracking-[-0.02em]">{text}</m.output>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  tone = "accent",
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "accent" | "positive";
  className?: string;
}) {
  return (
    <m.button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={() => {
        haptic(6);
        onClick();
      }}
      whileTap={{ scale: 0.96 }}
      transition={spring.snappy}
      className={cn(
        "relative h-12 rounded-full text-[15px] font-medium num transition-colors duration-(--duration-fast) ring-focus",
        active ? "text-ink" : "text-ink-2 hover:text-ink",
        className,
      )}
    >
      {active && (
        <m.span
          layoutId="give-chip"
          transition={spring.snappy}
          className={cn(
            "absolute inset-0 rounded-full",
            tone === "positive" ? "bg-positive-soft shadow-[inset_0_0_0_1.5px_var(--wf-positive)]" : "bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--wf-accent)]",
          )}
        />
      )}
      {!active && <span className="absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_var(--wf-line-strong)]" />}
      <span className="relative">{children}</span>
    </m.button>
  );
}

/** `shared` links the portrait to the deck card / celebration via layoutId (off once the sheet changes height). */
export function MiniCard({ card, pct, shared = true }: { card: RequestCard; pct?: number; shared?: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <m.div layoutId={shared ? `art-${card.id}` : undefined} transition={spring.layout} className="size-16 shrink-0 overflow-hidden rounded-[18px]">
        <Avatar seed={card.avatarSeed} name={card.firstName} photoUrl={card.photoUrl} blur={card.blurPhoto} shape="card" className="size-full" full />
      </m.div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] text-ink-2">{card.headline}</p>
        <Progress className="mt-2.5" value={pct ?? progress(card.goalCents, card.fundedCents)} accent={card.accent} coinTarget />
      </div>
    </div>
  );
}

function GiftConfirmed({
  card,
  result,
  onDone,
  onUndone,
  doneLabel,
}: {
  card: RequestCard;
  result: GiftResult;
  onDone: () => void;
  onUndone: (request: RequestCard | null) => void;
  doneLabel: string;
}) {
  const now = useNow(1000);
  const left = Math.max(0, result.gift.undoUntil - now);
  const undo = useMutation({
    mutationFn: () => api.reverseGift(result.gift.id),
    onSuccess: (r) => {
      announce(`Gift undone. ${card.firstName}’s total is back to where it was.`);
      toast({ message: `Gift to ${card.firstName} undone`, tone: "accent" });
      onUndone(r.request);
    },
  });
  const before = progress(card.goalCents, card.fundedCents);
  const after = progress(result.request.goalCents, result.request.fundedCents);
  const [shown, setShown] = useState(before);
  useEffect(() => {
    const t = setTimeout(() => setShown(after), 180);
    return () => clearTimeout(t);
  }, [after]);
  const pctText = useMemo(() => Math.round(after * 100), [after]);

  return (
    <div className="pb-1">
      <MiniCard card={result.request} pct={shown} shared={false} />
      <div className="mt-7 text-center">
        <div className="mx-auto mb-4 grid size-11 place-items-center rounded-full bg-accent-soft text-accent-ink">
          <Check className="size-5" aria-hidden />
        </div>
        <p className="display text-[3.4rem] leading-none tracking-[-0.02em]">
          +<Ticker value={result.gift.amountCents} format={formatUSDWhole} duration={1.2} />
        </p>
        <p className="mt-3 text-[15px] text-ink-2 text-pretty">
          {card.firstName} is now <span className="num font-medium text-ink">{pctText}%</span> of the way there —{" "}
          <span className="num">{formatUSD(result.request.fundedCents)}</span> of{" "}
          <span className="num">{formatUSD(result.request.goalCents)}</span>.
        </p>
      </div>
      <div className="mt-7 grid gap-2.5">
        <Button className="w-full" size="lg" onClick={onDone}>
          {doneLabel}
        </Button>
        {!result.cleared && <MatchButton giftId={result.gift.id} name={card.firstName} />}
      </div>
      {undo.error && (
        <p role="alert" className="mt-3 text-center text-[13.5px] text-danger">
          {undo.error.message}
        </p>
      )}
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[12.5px] text-ink-3">
        {left > 0 ? (
          <>
            You can undo this for 2 minutes.
            <button onClick={() => undo.mutate()} disabled={undo.isPending} className="rounded font-semibold text-accent ring-focus disabled:opacity-60">
              {undo.isPending ? "Undoing…" : "Undo gift"}
            </button>
          </>
        ) : (
          "This gift is final."
        )}
      </p>
    </div>
  );
}

/** "Match my gift": a link a friend can open to give the same amount to the same person. */
function MatchButton({ giftId, name }: { giftId: string; name: string }) {
  const match = useMutation({
    mutationFn: () => createMatch(giftId),
    onSuccess: (id) => void shareLink(`/match/${id}`, "Match my gift on Give", `I just gave to ${name}. Will you match it?`),
  });
  return (
    <Button variant="outline" size="lg" className="w-full" disabled={match.isPending} onClick={() => match.mutate()}>
      <Users className="size-4" aria-hidden /> {match.isPending ? "Creating link…" : "Challenge a friend to match"}
    </Button>
  );
}
