import { AlertCircle, RotateCcw } from "lucide-react";
import { m } from "motion/react";
import type { ReactNode } from "react";
import { ease } from "@/design/motion";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-tile", className)} />;
}

/** Designed empty state: a quiet serif line, a supporting sentence, an optional action. */
export function EmptyState({
  title,
  body,
  action,
  art,
  className,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  art?: ReactNode;
  className?: string;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: ease.outExpo }}
      className={cn("mx-auto flex max-w-sm flex-col items-center px-6 py-16 text-center", className)}
    >
      {art ?? <EmptyArt />}
      <h2 className="display mt-6 text-display-sm text-balance">{title}</h2>
      {body && <p className="mt-3 text-[15px] leading-relaxed text-ink-2 text-pretty">{body}</p>}
      {action && <div className="mt-7">{action}</div>}
    </m.div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <EmptyState
      className={className}
      art={
        <div className="grid size-16 place-items-center rounded-full bg-surface-2">
          <AlertCircle className="size-6 text-danger" aria-hidden />
        </div>
      }
      title="That didn’t go to plan"
      body={message}
      action={
        onRetry && (
          <Button variant="outline" onClick={onRetry}>
            <RotateCcw className="size-4" aria-hidden /> Try again
          </Button>
        )
      }
    />
  );
}

function EmptyArt() {
  return (
    <svg width="96" height="72" viewBox="0 0 96 72" aria-hidden className="text-gold">
      <rect x="22" y="10" width="52" height="60" rx="10" fill="var(--wf-surface-2)" transform="rotate(-8 48 40)" />
      <rect x="22" y="6" width="52" height="60" rx="10" fill="var(--wf-surface)" stroke="var(--wf-line-strong)" />
      <circle cx="48" cy="30" r="9" fill="currentColor" opacity="0.5" />
      <rect x="34" y="46" width="28" height="3" rx="1.5" fill="var(--wf-line-strong)" />
      <rect x="38" y="53" width="20" height="3" rx="1.5" fill="var(--wf-line)" />
    </svg>
  );
}
