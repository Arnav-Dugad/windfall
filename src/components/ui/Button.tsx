import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import { spring } from "@/design/motion";
import { useMagnetic } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type Variant = "primary" | "gold" | "sage" | "outline" | "ghost" | "quiet";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-on-ink shadow-sm hover:bg-ink/90",
  gold: "bg-gold text-[#16120b] shadow-glow hover:brightness-[1.04]",
  sage: "bg-sage text-[#0f1a12] hover:brightness-[1.04]",
  outline: "bg-transparent text-ink shadow-[inset_0_0_0_1px_var(--wf-line-strong)] hover:bg-surface-2",
  ghost: "bg-transparent text-ink hover:bg-surface-2",
  quiet: "bg-surface-2 text-ink hover:bg-line-strong",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm gap-1.5 rounded-full",
  md: "h-11 px-5 text-[15px] gap-2 rounded-full",
  lg: "h-14 px-7 text-base gap-2.5 rounded-full",
};

const base =
  "relative inline-flex shrink-0 select-none items-center justify-center font-medium tracking-[-0.01em] whitespace-nowrap transition-[background-color,filter,box-shadow,color] duration-(--duration-fast) disabled:opacity-45 ring-focus";

/** A router link that looks like a Button (never nest a <button> inside an <a>). */
export function ButtonLink({ variant = "primary", size = "md", className, ...props }: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={cn(base, "active:scale-[0.98]", variants[variant], sizes[size], className)} {...props} />;
}

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  size?: Size;
  magnetic?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, children, magnetic, ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.97 }}
      transition={spring.snappy}
      className={cn(
        base,
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {magnetic ? <MagneticInner>{children}</MagneticInner> : children}
    </motion.button>
  );
});

function MagneticInner({ children }: { children: ReactNode }) {
  const { ref, style } = useMagnetic<HTMLSpanElement>(0.22);
  return (
    <motion.span ref={ref} style={style} className="inline-flex items-center gap-[inherit] -m-4 p-4">
      {children}
    </motion.span>
  );
}

/** Magnetic wrapper: the whole button drifts toward the pointer on desktop. */
export function Magnetic({ children, className, strength = 0.3 }: { children: ReactNode; className?: string; strength?: number }) {
  const { ref, style } = useMagnetic<HTMLDivElement>(strength);
  return (
    <motion.div ref={ref} style={style} className={cn("inline-flex", className)}>
      {children}
    </motion.div>
  );
}

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonProps & { label: string; tone?: "surface" | "plain" }
>(function IconButton({ label, className, tone = "surface", size = "md", children, ...props }, ref) {
  const dims = size === "lg" ? "size-14" : size === "sm" ? "size-9" : "size-11";
  return (
    <motion.button
      ref={ref}
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.92 }}
      transition={spring.snappy}
      className={cn(
        "inline-flex items-center justify-center rounded-full text-ink transition-colors duration-(--duration-fast) ring-focus disabled:opacity-40",
        tone === "surface" ? "bg-surface shadow-sm hairline hover:bg-surface-2" : "hover:bg-surface-2",
        dims,
        className,
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
});
