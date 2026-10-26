import { prefersReducedMotion } from "@/lib/utils";

// Lazy facade: the particle engine is only downloaded the first time it's needed,
// and never runs for people who prefer reduced motion.

export function preloadEffects() {
  void import("./particles");
}

export async function fxCoinBurst(x: number, y: number, intensity = 1) {
  if (prefersReducedMotion()) return;
  const { coinBurst } = await import("./particles");
  coinBurst(x, y, intensity);
}

export async function fxConfetti() {
  if (prefersReducedMotion()) return;
  const { confetti } = await import("./particles");
  confetti();
}
