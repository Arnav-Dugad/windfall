import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, CircleCheckBig, Heart, MessageCircle, TrendingUp } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { LargeTitle } from "@/components/ui/LargeTitle";
import { Progress } from "@/components/ui/Progress";
import { ease } from "@/design/motion";
import { useDocumentTitle, useNow } from "@/lib/hooks";
import { activity, markActivitySeen, type ActivityItem } from "@/lib/social";
import { useOpenStory } from "@/lib/useOpenStory";
import { cn, timeAgo } from "@/lib/utils";
import { notificationsEnabled, setNotificationsEnabled } from "@/lib/notify";

const KIND = {
  milestone: { icon: TrendingUp, tone: "bg-accent text-white" },
  update: { icon: MessageCircle, tone: "bg-fill-2 text-ink" },
  thanks: { icon: Heart, tone: "bg-[#ff375f] text-white" },
  cleared: { icon: CircleCheckBig, tone: "bg-positive text-white" },
} as const;

/** Quiet notifications from the people you follow (giving follows them automatically). */
export default function Activity() {
  useDocumentTitle("Activity");
  const qc = useQueryClient();
  const now = useNow(60_000);
  const openStory = useOpenStory();
  const q = useQuery({ queryKey: ["activity"], queryFn: activity, staleTime: 30_000 });

  // Mark as seen a moment after the list is on screen, so the unread dots are visible first.
  const seen = useMutation({
    mutationFn: markActivitySeen,
    onSuccess: () => setTimeout(() => void qc.invalidateQueries({ queryKey: ["activity"] }), 2500),
  });
  const items = q.data?.items;
  const unread = q.data?.unread ?? 0;
  useEffect(() => {
    if (!items || !unread || seen.isPending || seen.isSuccess) return;
    const t = setTimeout(() => seen.mutate(items), 1600);
    return () => clearTimeout(t);
  }, [items, unread, seen]);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-12 sm:px-6">
      <LargeTitle title="Activity" subtitle="Milestones, thank-yous and updates from the people you’ve helped and follow." actions={<NotifyToggle />} />

      {q.isPending ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-[22px]" />
          ))}
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !items?.length ? (
        <EmptyState
          title="It’s quiet here"
          body="When you give to someone — or tap Follow on their story — you’ll hear when they hit a milestone, post an update or say thank you."
          action={<ButtonLink to="/discover">Meet someone</ButtonLink>}
        />
      ) : (
        <ul className="mt-6 space-y-2.5">
          <AnimatePresence initial={false}>
            {items.map((it, i) => (
              <Row key={it.id} item={it} index={i} now={now} onOpen={() => openStory(it.card)} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </main>
  );
}

function Row({ item, index, now, onOpen }: { item: ActivityItem; index: number; now: number; onOpen: () => void }) {
  const k = KIND[item.kind];
  return (
    <m.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 10) * 0.04, duration: 0.5, ease: ease.outExpo }}>
      <button
        onClick={onOpen}
        className={cn("press glass-thick squircle flex w-full items-start gap-3.5 rounded-[22px] p-3.5 text-left shadow-card ring-focus", item.unread && "ring-1 ring-accent/30")}
      >
        <div className="relative shrink-0">
          <Avatar seed={item.card.avatarSeed} name={item.card.firstName} photoUrl={item.card.photoUrl} className="size-12" />
          <span className={cn("absolute -right-1 -bottom-1 grid size-5.5 place-items-center rounded-full ring-2 ring-surface", k.tone)}>
            <k.icon className="size-3" aria-hidden strokeWidth={2.5} />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{item.title}</p>
            {item.at > 0 && <span className="shrink-0 text-[12px] text-ink-3">{timeAgo(item.at, now)}</span>}
            {item.unread && (
              <span className="size-2 shrink-0 self-center rounded-full bg-accent">
                <span className="sr-only">Unread</span>
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[14px] text-ink-2">{item.body}</p>
          {(item.kind === "milestone" || item.kind === "cleared") && <Progress value={item.pct} size="sm" accent={item.card.accent} className="mt-2.5" />}
        </div>
      </button>
    </m.li>
  );
}

function NotifyToggle() {
  const [on, setOn] = useState(notificationsEnabled);
  if (typeof Notification === "undefined") return null;
  return (
    <Button
      variant={on ? "quiet" : "outline"}
      size="sm"
      onClick={async () => {
        await setNotificationsEnabled(!on);
        setOn(notificationsEnabled());
      }}
    >
      {on ? <BellRing className="size-4" aria-hidden /> : <Bell className="size-4" aria-hidden />}
      {on ? "Alerts on" : "Get alerts"}
    </Button>
  );
}
