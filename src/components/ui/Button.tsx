import { m, type HTMLMotionProps } from "motion/react";
import { forwardRef, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import { spring } from "@/design/motion";
import { useMagnetic } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ink" | "accent" | "positive" | "outline" | "ghost" | "quiet" | "glass";
type Size = "sm" | "md" | "lg";

// Apple-style pills: filled blue for the main action, tinted grey for secondary, glass over imagery.
const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  ink: "bg-ink text-on-ink hover:bg-ink/85",
  accent: "bg-accent text-on-accent shadow-glow hover:bg-accent-hover",
  positive: "bg-positive text-white hover:brightness-[1.05]",
  outline: "bg-fill text-ink hover:bg-fill-2",
  ghost: "bg-transparent text-accent-ink hover:bg-fill",
  quiet: "bg-fill text-ink hover:bg-fill-2",
  glass: "glass text-ink hover:brightness-[1.03]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[14px] gap-1.5 rounded-full",
  md: "h-11 px-5 text-[15px] gap-2 rounded-full",
  lg: "h-[52px] px-7 text-[17px] gap-2.5 rounded-full",
};

const base =
  "press relative inline-flex shrink-0 select-none items-center justify-center font-semibold tracking-[-0.016em] whitespace-nowrap disabled:opacity-40 ring-focus";

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
    <m.button
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
    </m.button>
  );
});

function MagneticInner({ children }: { children: ReactNode }) {
  const { ref, style } = useMagnetic<HTMLSpanElement>(0.22);
  return (
    <m.span ref={ref} style={style} className="inline-flex items-center gap-[inherit] -m-4 p-4">
      {children}
    </m.span>
  );
}

/** Magnetic wrapper: the whole button drifts toward the pointer on desktop. */
export function Magnetic({ children, className, strength = 0.3 }: { children: ReactNode; className?: string; strength?: number }) {
  const { ref, style } = useMagnetic<HTMLDivElement>(strength);
  return (
    <m.div ref={ref} style={style} className={cn("inline-flex", className)}>
      {children}
    </m.div>
  );
}

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonProps & { label: string; tone?: "surface" | "plain" }
>(function IconButton({ label, className, tone = "surface", size = "md", children, ...props }, ref) {
  const dims = size === "lg" ? "size-14" : size === "sm" ? "size-9" : "size-11";
  return (
    <m.button
      ref={ref}
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.92 }}
      transition={spring.snappy}
      className={cn(
        "press inline-flex items-center justify-center rounded-full text-ink ring-focus disabled:opacity-40",
        tone === "surface" ? "glass-thick shadow-sm hover:brightness-[1.04]" : "hover:bg-fill",
        dims,
        className,
      )}
      {...props}
    >
      {children}
    </m.button>
  );
});
