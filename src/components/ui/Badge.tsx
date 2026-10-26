import { BadgeCheck, Clock, FlaskConical } from "lucide-react";
import type { ReactNode } from "react";
import type { Verification } from "@shared/domain";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "gold" | "sage" | "ink" | "glass";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  gold: "bg-gold-soft text-gold-ink",
  sage: "bg-sage-soft text-sage-ink",
  ink: "bg-ink text-on-ink",
  glass: "bg-white/70 text-[#1d1a15] backdrop-blur-md dark:bg-black/35 dark:text-[#f3efe7]",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  icon,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium tracking-[-0.005em] whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function VerificationBadge({ status, tone }: { status: Verification; tone?: Tone }) {
  if (status === "verified")
    return (
      <Badge tone={tone ?? "sage"} icon={<BadgeCheck className="size-3.5" aria-hidden />}>
        Verified
      </Badge>
    );
  if (status === "pending")
    return (
      <Badge tone={tone ?? "gold"} icon={<Clock className="size-3.5" aria-hidden />}>
        Verification pending
      </Badge>
    );
  return <Badge tone={tone ?? "neutral"}>Unverified</Badge>;
}

/** Always-visible marker that everything on screen is invented. */
export function DemoBadge({ className, label = "Demo data" }: { className?: string; label?: string }) {
  return (
    <Badge
      tone="gold"
      className={cn("uppercase tracking-[0.08em] text-[10.5px]", className)}
      icon={<FlaskConical className="size-3" aria-hidden />}
    >
      {label}
    </Badge>
  );
}
