import { m, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * iOS large title: a big bold heading that shrinks and fades as the page scrolls, handing off to a compact
 * title centered in the glass nav bar (mobile — on desktop the bar holds the primary nav instead).
 */
export function LargeTitle({
  title,
  eyebrow,
  subtitle,
  actions,
  className,
}: {
  title: string;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const { scrollY } = useScroll();
  const scale = useTransform(scrollY, [0, 64], [1, 0.84]);
  const opacity = useTransform(scrollY, [0, 48], [1, 0]);
  const y = useTransform(scrollY, [0, 64], [0, -6]);
  const compact = useTransform(scrollY, [36, 64], [0, 1]);
  const compactY = useTransform(scrollY, [36, 64], [6, 0]);

  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4 pt-6 pb-2 sm:pt-10", className)}>
      <m.div style={{ scale, opacity, y }} className="min-w-0 origin-bottom-left">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="display text-[2.15rem] leading-[1.05] font-bold tracking-[-0.025em] sm:text-[2.75rem]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-xl text-[15px] text-ink-2 text-pretty">{subtitle}</p>}
      </m.div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
      {typeof document !== "undefined" &&
        createPortal(
          <m.div aria-hidden style={{ opacity: compact, y: compactY }} className="pointer-events-none fixed inset-x-0 top-0 z-[41] flex h-14 items-center justify-center md:hidden">
            <span className="max-w-[46vw] truncate text-[16px] font-semibold tracking-[-0.01em]">{title}</span>
          </m.div>,
          document.body,
        )}
    </header>
  );
}

/** A headline whose variable font weight eases from 500 to 700 as it scrolls into view. */
export function WeightHeading({ as: Tag = "h2", className, children }: { as?: "h1" | "h2" | "h3"; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center 55%"] });
  const weight = useTransform(scrollYProgress, [0, 1], [500, 700]);
  const tracking = useTransform(scrollYProgress, [0, 1], ["-0.01em", "-0.028em"]);
  const MTag = m[Tag];
  return (
    <MTag ref={ref} style={{ fontWeight: weight, letterSpacing: tracking }} className={className}>
      {children}
    </MTag>
  );
}
