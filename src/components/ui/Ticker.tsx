import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Counts up to `value` with an expo ease. Writes to textContent directly (no React re-render per frame).
 * Starts when scrolled into view; respects reduced motion.
 */
export function Ticker({
  value,
  format,
  className,
  duration = 1.4,
  from,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
  duration?: number;
  /** Start value; defaults to 0 on first run and the previous value afterwards. */
  from?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<number | null>(from ?? null);
  const inView = useInView(ref, { once: true, margin: "-5% 0px" });
  const reduced = useReducedMotion();
  const formatRef = useRef(format);
  useLayoutEffect(() => {
    formatRef.current = format;
  });
  const [initialText] = useState(() => format(from ?? 0));

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    const start = prev.current ?? 0;
    prev.current = value;
    if (reduced || start === value) {
      el.textContent = formatRef.current(value);
      return;
    }
    const controls = animate(start, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = formatRef.current(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [value, inView, reduced, duration]);

  return (
    <span ref={ref} className={cn("num", className)} aria-label={format(value)}>
      {initialText}
    </span>
  );
}
