import { Moon, Sun } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { Link } from "react-router";
import { spring } from "@/design/motion";
import { useTheme } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { IconButton } from "./Button";

/** The Windfall mark: an app-icon squircle with a coin caught mid-fall. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <defs>
        <linearGradient id="wf-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2997ff" />
          <stop offset="1" stopColor="#6e4cf5" />
        </linearGradient>
      </defs>
      <path d="M16 1c9.9 0 15 5.1 15 15s-5.1 15-15 15S1 25.9 1 16 6.1 1 16 1Z" fill="url(#wf-mark)" />
      <circle cx="16" cy="18.5" r="6.2" fill="#fff" />
      <path d="M16 5.5v5.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
      <path d="M11.5 8v3M20.5 8v3" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

export function Logo({ to = "/", className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn("group inline-flex items-center gap-2.5 rounded-full ring-focus", className)} aria-label="Windfall home">
      <Mark className="transition-transform duration-(--duration-slow) ease-(--ease-out-expo) group-hover:-rotate-6 group-hover:scale-105" />
      <span className="display text-[19px] leading-none tracking-[-0.02em]">Windfall</span>
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
