import { AnimatePresence, m } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { spring } from "@/design/motion";
import { subscribeAnnouncements } from "@/lib/announce";
import { dismissToast, getToasts, subscribeToasts, type Toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const dot: Record<NonNullable<Toast["tone"]>, string> = {
  neutral: "bg-ink-3",
  gold: "bg-gold",
  sage: "bg-sage",
  danger: "bg-danger",
};

export function Toaster() {
  const list = useSyncExternalStore(subscribeToasts, getToasts, getToasts);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-8">
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <m.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={spring.snappy}
            className="pointer-events-auto flex min-h-12 max-w-md items-center gap-3 rounded-full bg-ink py-2 pr-2 pl-5 text-[14px] text-on-ink shadow-float"
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", dot[t.tone ?? "neutral"])} aria-hidden />
            <span className="py-1">{t.message}</span>
            {t.action ? (
              <button
                onClick={() => {
                  t.action!.onClick();
                  dismissToast(t.id);
                }}
                className="ml-1 h-8 rounded-full bg-on-ink/12 px-3.5 text-[13px] font-medium text-on-ink transition-colors hover:bg-on-ink/20 ring-focus"
              >
                {t.action.label}
              </button>
            ) : (
              <span className="w-2" />
            )}
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Polite live region for screen-reader announcements (gifts, passes, undo). */
export function LiveAnnouncer() {
  const [msg, setMsg] = useState("");
  useEffect(
    () =>
      subscribeAnnouncements((m) => {
        setMsg("");
        requestAnimationFrame(() => setMsg(m));
      }),
    [],
  );
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {msg}
    </div>
  );
}
