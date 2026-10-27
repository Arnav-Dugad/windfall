import {
  animate,
  AnimatePresence,
  m,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
  type PanInfo,
} from "motion/react";
import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, type ReactNode } from "react";
import type { RequestCard } from "@shared/domain";
import { spring, swipe } from "@/design/motion";
import { cn, haptic } from "@/lib/utils";
import { SwipeCard } from "./SwipeCard";

export type SwipeDir = "left" | "right" | "up" | "down";

export interface SwipeDeckHandle {
  /** Programmatic swipe (buttons / keyboard): flings the top card out, then calls onSwipe. */
  swipe: (dir: SwipeDir) => void;
}

interface SwipeDeckProps {
  /** The queue; the first card is on top. Parent removes it in onSwipe. */
  cards: RequestCard[];
  onSwipe: (card: RequestCard, dir: SwipeDir) => void;
  onOpen?: (card: RequestCard) => void;
  /** A card re-entering the deck after undo, and the side it left from. */
  returning?: { id: string; from: SwipeDir } | null;
  /** "x" limits dragging to horizontal so the page can still scroll vertically (landing page). */
  axis?: "both" | "x";
  interactive?: boolean;
  empty?: ReactNode;
  className?: string;
}

type CardHandle = { fling: (dir: SwipeDir, velocity?: { x: number; y: number }) => void };

function exitTarget(dir: SwipeDir) {
  const w = typeof window === "undefined" ? 1200 : window.innerWidth;
  const h = typeof window === "undefined" ? 900 : window.innerHeight;
  switch (dir) {
    case "right":
      return { x: w * 0.75 + 260, y: 40 };
    case "left":
      return { x: -(w * 0.75 + 260), y: 40 };
    case "up":
      return { x: 0, y: -(h + 200) };
    case "down":
      return { x: 0, y: h * 0.5 };
  }
}

export const SwipeDeck = forwardRef<SwipeDeckHandle, SwipeDeckProps>(function SwipeDeck(
  { cards, onSwipe, onOpen, returning, axis = "both", interactive = true, empty, className },
  ref,
) {
  // Handles are keyed by card id: an exiting card unmounting later must not clobber the new top card's handle.
  const handles = useRef(new Map<string, CardHandle>());
  const flinging = useRef(false);
  // Shared drag progress (0..1) so the cards behind can lean in as the top card leaves.
  const topProgress = useMotionValue(0);

  const commit = (card: RequestCard, dir: SwipeDir) => {
    flinging.current = false;
    topProgress.set(0);
    haptic(dir === "up" ? [12, 40, 18] : 12);
    onSwipe(card, dir);
  };

  useImperativeHandle(ref, () => ({
    swipe: (dir) => {
      const top = cards[0];
      const handle = top && handles.current.get(top.id);
      if (!top || !handle || flinging.current) return;
      flinging.current = true;
      handle.fling(dir);
      commit(top, dir);
    },
  }));

  const visible = cards.slice(0, 3);

  return (
    <div className={cn("relative isolate h-full w-full [perspective:1400px]", className)}>
      <AnimatePresence initial={false}>
        {visible.map((card, depth) => (
          <DeckCard
            key={card.id}
            card={card}
            depth={depth}
            axis={axis}
            interactive={interactive}
            topProgress={topProgress}
            returningFrom={returning?.id === card.id ? returning.from : undefined}
            register={(h) => {
              if (h) handles.current.set(card.id, h);
              else handles.current.delete(card.id);
            }}
            onCommit={(dir) => commit(card, dir)}
            onOpen={onOpen}
          />
        ))}
      </AnimatePresence>
      {cards.length === 0 && <div className="absolute inset-0">{empty}</div>}
    </div>
  );
});

function DeckCard({
  card,
  depth,
  axis,
  interactive,
  topProgress,
  returningFrom,
  register,
  onCommit,
  onOpen,
}: {
  card: RequestCard;
  depth: number;
  axis: "both" | "x";
  interactive: boolean;
  topProgress: MotionValue<number>;
  returningFrom?: SwipeDir;
  register: (handle: CardHandle | null) => void;
  onCommit: (dir: SwipeDir) => void;
  onOpen?: (card: RequestCard) => void;
}) {
  const isTop = depth === 0;
  const start = returningFrom ? exitTarget(returningFrom) : { x: 0, y: 0 };
  const x = useMotionValue(start.x);
  const y = useMotionValue(start.y);
  const gone = useRef(false);
  const armed = useRef<SwipeDir | null>(null);

  // Rotation + 3D tilt follow the drag offset.
  const rotate = useTransform(x, [-320, 0, 320], [-swipe.maxRotate, 0, swipe.maxRotate]);
  const rotateY = useTransform(x, [-320, 0, 320], [-swipe.maxTilt, 0, swipe.maxTilt]);
  const rotateX = useTransform(y, [-320, 0, 320], [swipe.maxTilt, 0, -swipe.maxTilt]);

  // Stamps fade and scale in with distance; "Clear it" only when the drag is mostly vertical.
  const giveOpacity = useTransform(x, [24, swipe.distanceThreshold], [0, 1]);
  const passOpacity = useTransform(x, [-24, -swipe.distanceThreshold], [0, 1]);
  const clearAmount = useTransform(() => Math.max(0, -y.get() - Math.abs(x.get()) * 0.6));
  const clearOpacity = useTransform(clearAmount, [24, swipe.distanceThreshold], [0, 1]);
  const giveScale = useTransform(giveOpacity, [0, 1], [0.7, 1]);
  const passScale = useTransform(passOpacity, [0, 1], [0.7, 1]);
  const clearScale = useTransform(clearOpacity, [0, 1], [0.7, 1]);

  // Behind cards lean forward as the top card is dragged away.
  const slot = swipe.stack[Math.min(depth, 2)]!;
  const prevSlot = swipe.stack[Math.max(0, Math.min(depth, 2) - 1)]!;
  const leanScale = useTransform(topProgress, [0, 1], [1, depth > 0 ? prevSlot.scale / slot.scale : 1]);
  const leanY = useTransform(topProgress, [0, 1], [0, depth > 0 ? prevSlot.y - slot.y : 0]);

  const dirFromOffset = (ox: number, oy: number, vx = 0, vy = 0): SwipeDir | null => {
    const up = axis === "both" && (-oy > swipe.distanceThreshold || -vy > swipe.velocityThreshold) && -oy > Math.abs(ox) * 0.8;
    if (up) return "up";
    if (ox > swipe.distanceThreshold || (vx > swipe.velocityThreshold && ox > 20)) return "right";
    if (ox < -swipe.distanceThreshold || (vx < -swipe.velocityThreshold && ox < -20)) return "left";
    return null;
  };

  const track = () => {
    if (!isTop || gone.current) return;
    const dist = Math.hypot(x.get(), Math.min(0, y.get()));
    topProgress.set(Math.min(1, dist / (swipe.distanceThreshold * 1.6)));
    const dir = dirFromOffset(x.get(), y.get());
    if (dir !== armed.current) {
      if (dir) haptic(6);
      armed.current = dir;
    }
  };
  useMotionValueEvent(x, "change", track);
  useMotionValueEvent(y, "change", track);

  const fling = useCallback(
    (dir: SwipeDir, velocity = { x: 0, y: 0 }) => {
      gone.current = true;
      const t = exitTarget(dir);
      animate(x, t.x, { ...spring.fling, velocity: velocity.x });
      animate(y, t.y, { ...spring.fling, velocity: velocity.y });
    },
    [x, y],
  );

  const registerRef = useRef(register);
  useLayoutEffect(() => {
    const reg = registerRef.current;
    reg({ fling });
    return () => reg(null);
  }, [fling]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const dir = dirFromOffset(info.offset.x, info.offset.y, info.velocity.x, info.velocity.y);
    if (dir) {
      fling(dir, info.velocity);
      onCommit(dir);
    } else {
      animate(x, 0, spring.snapBack);
      animate(y, 0, spring.snapBack);
    }
  };

  return (
    <m.div
      className="absolute inset-0 origin-bottom"
      style={{ zIndex: 10 - depth }}
      initial={returningFrom ? false : { opacity: 0, scale: slot.scale * 0.94, y: slot.y + 24 }}
      animate={{ opacity: slot.opacity, scale: slot.scale, y: slot.y }}
      exit={{ opacity: 1, zIndex: 20, transition: { duration: 0.6 } }}
      transition={spring.stack}
      // Behind cards are decorative until they reach the top: inert removes them from focus and the a11y tree.
      inert={!isTop}
    >
      <m.div className="h-full w-full" style={{ scale: leanScale, y: leanY }}>
        <m.div
          className={cn("relative h-full w-full origin-[50%_85%]", isTop && "cursor-grab active:cursor-grabbing")}
          style={{ x, y, rotate, rotateX, rotateY, touchAction: axis === "x" ? "pan-y" : "none" }}
          drag={isTop ? (axis === "x" ? "x" : true) : false}
          dragMomentum={false}
          dragElastic={1}
          onDragEnd={onDragEnd}
          onTap={() => isTop && !gone.current && onOpen?.(card)}
          animate={returningFrom ? { x: 0, y: 0 } : undefined}
          transition={spring.snapBack}
        >
          <SwipeCard card={card} interactive={interactive} priority={depth < 2} />
          {isTop && (
            <>
              <Stamp label="Give" tone="accent" opacity={giveOpacity} scale={giveScale} className="top-16 left-5 -rotate-[10deg]" />
              <Stamp label="Pass" tone="ink" opacity={passOpacity} scale={passScale} className="top-16 right-5 rotate-[10deg]" />
              <Stamp
                label="Clear it"
                tone="positive"
                opacity={clearOpacity}
                scale={clearScale}
                className="bottom-[34%] left-1/2 -translate-x-1/2"
              />
            </>
          )}
        </m.div>
      </m.div>
    </m.div>
  );
}

function Stamp({
  label,
  tone,
  opacity,
  scale,
  className,
}: {
  label: string;
  tone: "accent" | "ink" | "positive";
  opacity: MotionValue<number>;
  scale: MotionValue<number>;
  className?: string;
}) {
  const tones = {
    accent: "bg-accent text-white shadow-[0_8px_30px_-6px_rgb(0_113_227/0.7)]",
    ink: "bg-white/90 text-[#1d1d1f] shadow-[0_8px_30px_-6px_rgb(0_0_0/0.45)]",
    positive: "bg-positive text-white shadow-[0_8px_30px_-6px_rgb(52_199_89/0.7)]",
  };
  return (
    <div className={cn("pointer-events-none absolute", className)} aria-hidden>
      <m.div
        style={{ opacity, scale }}
        className={cn(
          "rounded-full px-5 py-2 text-[19px] font-bold tracking-[-0.01em] backdrop-blur-md",
          tones[tone],
        )}
      >
        {label}
      </m.div>
    </div>
  );
}
