import { X } from "lucide-react";
import { AnimatePresence, m, useDragControls } from "motion/react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { spring } from "@/design/motion";
import { useMediaQuery } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { IconButton } from "./Button";

/**
 * Accessible sheet (Radix Dialog): springs up from the bottom on mobile with drag-to-dismiss on the
 * grabber, and becomes a centered panel on larger screens.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  hideTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  hideTitle?: boolean;
}) {
  const desktop = useMediaQuery("(min-width: 640px)");
  const controls = useDragControls();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <m.div
                className="fixed inset-0 z-50 bg-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.24 }}
              />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
              <Dialog.Content asChild forceMount {...(description ? {} : { "aria-describedby": undefined })}>
                <m.div
                  className={cn(
                    "pointer-events-auto relative w-full max-w-lg bg-surface shadow-float outline-none",
                    "rounded-t-sheet pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:rounded-sheet sm:pb-6",
                    "max-h-[92dvh] overflow-y-auto overscroll-contain no-scrollbar",
                    className,
                  )}
                  initial={desktop ? { opacity: 0, scale: 0.96, y: 16 } : { y: "100%" }}
                  animate={desktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
                  exit={desktop ? { opacity: 0, scale: 0.97, y: 8 } : { y: "100%" }}
                  transition={spring.sheet}
                  drag={desktop ? false : "y"}
                  dragListener={false}
                  dragControls={controls}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.7 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.y > 110 || info.velocity.y > 600) onOpenChange(false);
                  }}
                >
                  {!desktop && (
                    <div
                      className="flex h-7 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
                      onPointerDown={(e) => controls.start(e)}
                      aria-hidden
                    >
                      <div className="h-1 w-10 rounded-full bg-line-strong" />
                    </div>
                  )}
                  <div className={cn("flex items-start justify-between gap-4 px-6", desktop ? "pt-6" : "pt-1")}>
                    <div className={cn(hideTitle && "sr-only")}>
                      <Dialog.Title className="display text-[1.9rem] leading-[1.05] tracking-[-0.01em] text-balance">
                        {title}
                      </Dialog.Title>
                      {description && (
                        <Dialog.Description className="mt-1.5 text-[14px] text-ink-2">{description}</Dialog.Description>
                      )}
                    </div>
                    <Dialog.Close asChild>
                      <IconButton label="Close" size="sm" tone="plain" className="-mr-2 shrink-0">
                        <X className="size-4.5" aria-hidden />
                      </IconButton>
                    </Dialog.Close>
                  </div>
                  <div className="px-6 pt-5">{children}</div>
                </m.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
