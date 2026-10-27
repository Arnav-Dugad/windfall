import { BadgeCheck, Clock, FlaskConical } from "lucide-react";
import type { ReactNode } from "react";
import type { Verification } from "@shared/domain";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "positive" | "ink" | "glass";

const tones: Record<Tone, string> = {
  neutral: "bg-fill text-ink-2",
  accent: "bg-accent-soft text-accent-ink",
  positive: "bg-positive-soft text-positive-ink",
  ink: "bg-ink text-on-ink",
  glass: "glass-photo",
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
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold tracking-[-0.005em] whitespace-nowrap",
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
      <Badge tone={tone ?? "positive"} icon={<BadgeCheck className="size-3.5" aria-hidden />}>
        Verified
      </Badge>
    );
  if (status === "pending")
    return (
      <Badge tone={tone ?? "accent"} icon={<Clock className="size-3.5" aria-hidden />}>
        Verification pending
      </Badge>
    );
  return <Badge tone={tone ?? "neutral"}>Unverified</Badge>;
}

/** Always-visible marker that everything on screen is invented. */
export function DemoBadge({ className, label = "Demo data", tone = "neutral" }: { className?: string; label?: string; tone?: Tone }) {
  return (
    <Badge
      tone={tone}
      className={cn("text-[11.5px]", className)}
      icon={<FlaskConical className="size-3" aria-hidden />}
    >
      {label}
    </Badge>
  );
}
