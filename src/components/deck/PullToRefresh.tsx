import { m, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/utils";

/**
 * iOS-style pull-to-refresh for touch devices: pull down from the top of the page; a coin spins with the
 * pull, then keeps spinning while the deck reloads.
 */
export function PullToRefresh({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const pull = useMotionValue(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<number | null>(null);
  const armed = useRef(false);
  const rotate = useTransform(pull, [0, 90], [0, 540]);
  const opacity = useTransform(pull, [0, 30, 70], [0, 0.6, 1]);
  const y = useTransform(pull, (p) => Math.min(p, 90) * 0.7);

  useEffect(() => {
    const down = (e: TouchEvent) => {
      if (window.scrollY > 0 || refreshing) return;
      const t = e.target as HTMLElement;
      if (t.closest("[data-no-ptr], [role=dialog], article")) return; // don't hijack card drags or sheets
      start.current = e.touches[0]!.clientY;
    };
    const move = (e: TouchEvent) => {
      if (start.current === null) return;
      const d = e.touches[0]!.clientY - start.current;
      if (d <= 0) return pull.set(0);
      pull.set(Math.min(120, d * 0.55));
      if (pull.get() > 80 && !armed.current) {
        armed.current = true;
        haptic(8);
      }
    };
    const up = async () => {
      if (start.current === null) return;
      start.current = null;
      if (armed.current) {
        armed.current = false;
        setRefreshing(true);
        pull.set(70);
        await onRefresh().catch(() => undefined);
        setRefreshing(false);
      }
      pull.set(0);
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [onRefresh, pull, refreshing]);

  return (
    <m.div aria-hidden style={{ y, opacity }} className="pointer-events-none fixed inset-x-0 top-16 z-30 flex justify-center">
      <m.div
        style={{ rotateY: refreshing ? undefined : rotate }}
        animate={refreshing ? { rotateY: [0, 360] } : undefined}
        transition={refreshing ? { repeat: Infinity, duration: 0.8, ease: "linear" } : undefined}
        className="size-9 rounded-full shadow-lg [background:radial-gradient(circle_at_35%_30%,#fff6c9,#f2c94c_45%,#c89211_100%)] [box-shadow:inset_0_0_0_2px_rgba(255,255,255,.55),0_6px_16px_rgba(200,146,17,.4)]"
      />
      {refreshing && <span className="sr-only">Refreshing</span>}
    </m.div>
  );
}
