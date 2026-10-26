import { motion } from "motion/react";
import { duration, ease } from "@/design/motion";
import { cn } from "@/lib/utils";

/** Funding bar with a liquid fill: a slow ease, a soft leading highlight, and sage once complete. */
export function Progress({
  value,
  className,
  label,
  size = "md",
}: {
  value: number;
  className?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
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
        "relative overflow-hidden rounded-full bg-line",
        size === "sm" ? "h-1" : size === "lg" ? "h-2.5" : "h-1.5",
        className,
      )}
    >
      <motion.div
        className={cn(
          "absolute inset-y-0 left-0 w-full origin-left rounded-full",
          done ? "bg-sage" : "bg-gradient-to-r from-gold/70 to-gold",
        )}
        initial={false}
        animate={{ scaleX: pct }}
        transition={{ duration: duration.liquid, ease: ease.liquid }}
      />
    </div>
  );
}
