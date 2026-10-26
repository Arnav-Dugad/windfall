import { Moon, Sun } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { Link } from "react-router";
import { spring } from "@/design/motion";
import { useTheme } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { IconButton } from "./Button";

/** The Windfall mark: a single gold coin caught mid-fall. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <circle cx="16" cy="16" r="15" fill="var(--wf-ink)" />
      <circle cx="16" cy="18.5" r="6.5" fill="var(--wf-gold)" />
      <path d="M16 4.5v6" stroke="var(--wf-gold)" strokeWidth="1.6" strokeLinecap="round" opacity="0.65" />
      <path d="M11.5 7.5v3.5M20.5 7.5v3.5" stroke="var(--wf-gold)" strokeWidth="1.2" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

export function Logo({ to = "/", className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn("group inline-flex items-center gap-2.5 rounded-full ring-focus", className)} aria-label="Windfall home">
      <Mark className="transition-transform duration-(--duration-slow) ease-(--ease-out-expo) group-hover:-rotate-12" />
      <span className="display text-[1.6rem] leading-none tracking-[-0.01em]">Windfall</span>
    </Link>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <IconButton
      label={`Switch to ${next} mode`}
      tone="plain"
      size="sm"
      className={className}
      onClick={() => setTheme(next)}
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={theme}
          initial={{ opacity: 0, rotate: -60, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 60, scale: 0.6 }}
          transition={spring.snappy}
          className="grid place-items-center"
        >
          {theme === "dark" ? <Sun className="size-4.5" aria-hidden /> : <Moon className="size-4.5" aria-hidden />}
        </m.span>
      </AnimatePresence>
    </IconButton>
  );
}
