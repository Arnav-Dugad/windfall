import type { Transition } from "motion/react";

/**
 * Motion tokens. Springs are physical (stiffness/damping/mass) so they stay smooth at any
 * refresh rate and inherit gesture velocity. Durations/easings mirror tokens.css.
 */
export const ease = {
  outExpo: [0.16, 1, 0.3, 1],
  liquid: [0.65, 0, 0.35, 1],
  soft: [0.32, 0.72, 0, 1],
} as const;

export const duration = { fast: 0.14, base: 0.24, slow: 0.52, liquid: 1.1 } as const;

export const spring = {
  /** Card snapping back to center — a little overshoot so it feels alive. */
  snapBack: { type: "spring", stiffness: 420, damping: 22, mass: 0.9 },
  /** Card leaving the deck after a flick. Low damping keeps the throw's momentum. */
  fling: { type: "spring", stiffness: 160, damping: 26, mass: 1 },
  /** Cards behind the top card stepping forward. */
  stack: { type: "spring", stiffness: 300, damping: 30, mass: 0.8 },
  /** Bottom sheets and dialogs. */
  sheet: { type: "spring", stiffness: 380, damping: 38, mass: 1 },
  /** Shared-layout transitions (card → story). */
  layout: { type: "spring", stiffness: 260, damping: 32, mass: 1 },
  /** Small UI affordances: chips, toggles, magnetic buttons. */
  snappy: { type: "spring", stiffness: 520, damping: 34, mass: 0.6 },
  gentle: { type: "spring", stiffness: 160, damping: 24, mass: 1 },
} satisfies Record<string, Transition>;

export const swipe = {
  /** Distance (px) past which a release commits the swipe. */
  distanceThreshold: 120,
  /** Velocity (px/s) past which a flick commits regardless of distance. */
  velocityThreshold: 650,
  /** Max rotation (deg) at full horizontal drag. */
  maxRotate: 14,
  /** 3D tilt (deg) at full drag. */
  maxTilt: 8,
  /** Stack depth visuals for the cards behind the top card. */
  stack: [
    { scale: 1, y: 0, opacity: 1 },
    { scale: 0.95, y: 14, opacity: 1 },
    { scale: 0.9, y: 28, opacity: 1 },
  ],
} as const;

export const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-10% 0px" },
  transition: { duration: 0.8, ease: ease.outExpo },
} as const;
