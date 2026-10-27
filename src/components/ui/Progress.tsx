import { m } from "motion/react";
import type { CSSProperties } from "react";
import { duration, ease } from "@/design/motion";
import { cn } from "@/lib/utils";

/**
 * Funding bar with a liquid fill: a slow ease, blue (or the card's portrait accent) while in progress,
 * and green with a sheen + soft bloom once it fills to the brim.
 */
export function Progress({
  value,
  className,
  label,
  size = "md",
  onPhoto,
  accent,
  coinTarget,
}: {
  value: number;
  className?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  /** Light track for use over photographs. */
  onPhoto?: boolean;
  /** Per-card accent colour (hex) pulled from the portrait. */
  accent?: string | null;
  /** Marks this bar as the landing spot for the flying coin. */
  coinTarget?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value));
  const done = pct >= 1;
  const fill: CSSProperties | undefined = !done && accent ? { background: accent } : undefined;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
      aria-label={label ?? "Funding progress"}
      data-coin-target={coinTarget || undefined}
      className={cn("relative rounded-full", done && "bloom", className)}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-full",
          onPhoto ? "bg-white/25" : "bg-fill",
          size === "sm" ? "h-1" : size === "lg" ? "h-2.5" : "h-1.5",
        )}
      >
        <m.div
          className={cn(
            "absolute inset-y-0 left-0 w-full origin-left overflow-hidden rounded-full",
            done ? "liquid-sheen bg-positive" : onPhoto && !accent ? "bg-white" : "bg-gradient-to-r from-accent/80 to-accent",
          )}
          style={fill}
          initial={false}
          animate={{ scaleX: pct }}
          transition={{ duration: duration.liquid, ease: ease.liquid }}
        />
      </div>
    </div>
  );
}
