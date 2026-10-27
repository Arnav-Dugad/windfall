import { m } from "motion/react";
import { duration, ease } from "@/design/motion";
import { cn } from "@/lib/utils";

/** Funding bar with a liquid fill: a slow ease, blue while in progress, green once cleared. */
export function Progress({
  value,
  className,
  label,
  size = "md",
  onPhoto,
}: {
  value: number;
  className?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  /** Light track + white fill for use over photographs. */
  onPhoto?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value));
  const done = pct >= 1;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
      aria-label={label ?? "Funding progress"}
      className={cn(
        onPhoto ? "relative overflow-hidden rounded-full bg-white/25" : "relative overflow-hidden rounded-full bg-fill",
        size === "sm" ? "h-1" : size === "lg" ? "h-2.5" : "h-1.5",
        className,
      )}
    >
      <m.div
        className={cn(
          "absolute inset-y-0 left-0 w-full origin-left rounded-full",
          done ? "bg-positive" : onPhoto ? "bg-white" : "bg-gradient-to-r from-accent/80 to-accent",
        )}
        initial={false}
        animate={{ scaleX: pct }}
        transition={{ duration: duration.liquid, ease: ease.liquid }}
      />
    </div>
  );
}
