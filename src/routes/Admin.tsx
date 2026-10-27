import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Flag, Pause, Play, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useId, useMemo, useState } from "react";
import type { RequestCard } from "@shared/domain";
import { fraudSignals } from "@shared/fraud";
import { formatUSD } from "@shared/money";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { LargeTitle } from "@/components/ui/LargeTitle";
import { Segmented } from "@/components/ui/Segmented";
import { ease } from "@/design/motion";
import { useDocumentTitle, useIsModerator } from "@/lib/hooks";
import { moderate, moderationQueue, setReportStatus } from "@/lib/social";
import { toast } from "@/lib/toast";
import { useOpenStory } from "@/lib/useOpenStory";
import { cn, timeAgo } from "@/lib/utils";

type Tab = "reports" | "verify" | "signals";

/** Moderation queue: reports, verification review, and on-device fraud signals. Admins only (enforced by rules). */
export default function Admin() {
  useDocumentTitle("Moderation");
  const allowed = useIsModerator();
  if (allowed.isPending) return <main className="mx-auto max-w-3xl px-4 pt-10"><Skeleton className="h-64 rounded-[24px]" /></main>;
  if (!allowed.data)
    return (
      <EmptyState
        className="py-24"
        title="Moderators only"
        body="This queue is for the Give review team. Sign in with the demo moderator from the login page to explore it."
        action={<ButtonLink to="/login">Switch persona</ButtonLink>}
      />
    );
  return <Queue />;
}

function Queue() {
  const qc = useQueryClient();
  const id = useId();
  const openStory = useOpenStory();
  const [tab, setTab] = useState<Tab>("reports");
  const q = useQuery({ queryKey: ["moderation"], queryFn: moderationQueue });
  const signals = useMemo(() => (q.data ? fraudSignals(q.data.all.filter((c) => c.status === "active")) : []), [q.data]);
  const byId = useMemo(() => new Map(q.data?.all.map((c) => [c.id, c])), [q.data]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["moderation"] });

  const report = useMutation({ mutationFn: (v: { id: string; status: "resolved" | "dismissed" }) => setReportStatus(v.id, v.status), onSettled: refresh });
  const act = useMutation({
    mutationFn: (v: { id: string; patch: Parameters<typeof moderate>[1]; msg: string }) => moderate(v.id, v.patch).then(() => v.msg),
    onSuccess: (msg) => toast({ message: msg, tone: "positive" }),
    onError: (e) => toast({ message: e.message, tone: "danger" }),
    onSettled: () => {
      void refresh();
      void qc.invalidateQueries({ queryKey: ["active-cards"] });
    },
  });

  const open = q.data?.reports.filter((r) => (r.status ?? "open") === "open") ?? [];
  const counts = { reports: open.length, verify: q.data?.pending.length ?? 0, signals: signals.length };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
      <LargeTitle eyebrow="Trust & safety" title="Moderation" subtitle="Everything here is demo data; actions change the live demo for everyone." />
      <div className="sticky top-14 z-20 -mx-4 bg-canvas/75 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <Segmented
          id={id}
          value={tab}
          onChange={setTab}
          options={[
            { value: "reports", label: `Reports ${counts.reports || ""}`.trim() },
            { value: "verify", label: `Verification ${counts.verify || ""}`.trim() },
            { value: "signals", label: `Signals ${counts.signals || ""}`.trim() },
          ]}
        />
      </div>

      {q.isPending ? (
        <div className="mt-4 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-[22px]" />)}</div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <ul className="mt-4 space-y-2.5">
          <AnimatePresence initial={false} mode="popLayout">
            {tab === "reports" &&
              (open.length === 0 ? (
                <Empty key="e1" text="No open reports. Nice." />
              ) : (
                open.map((r) => {
                  const c = byId.get(r.requestId);
                  return (
                    <Item key={r.id} card={c} onOpen={openStory} icon={<Flag className="size-3.5" aria-hidden />} tone="bg-[#ff9f0a]" title={r.reason} meta={`${timeAgo(r.createdAt)}${r.note ? ` · “${r.note}”` : ""}`}>
                      <Button size="sm" variant="quiet" onClick={() => report.mutate({ id: r.id, status: "dismissed" })}>
                        <X className="size-3.5" aria-hidden /> Dismiss
                      </Button>
                      {c && c.status === "active" && (
                        <Button size="sm" variant="outline" onClick={() => (act.mutate({ id: c.id, patch: { status: "paused" }, msg: `${c.firstName}’s story is paused` }), report.mutate({ id: r.id, status: "resolved" }))}>
                          <Pause className="size-3.5" aria-hidden /> Pause story
                        </Button>
                      )}
                      <Button size="sm" onClick={() => report.mutate({ id: r.id, status: "resolved" })}>
                        Resolve
                      </Button>
                    </Item>
                  );
                })
              ))}
            {tab === "verify" &&
              (q.data.pending.length === 0 ? (
                <Empty key="e2" text="Nothing waiting for review." />
              ) : (
                q.data.pending.map((c) => (
                  <Item key={c.id} card={c} onOpen={openStory} icon={<ShieldCheck className="size-3.5" aria-hidden />} tone="bg-accent" title={`${c.firstName} · ${formatUSD(c.goalCents)} goal`} meta={c.headline}>
                    <Button size="sm" variant="quiet" onClick={() => act.mutate({ id: c.id, patch: { verification: "unverified" }, msg: "Marked as unverified" })}>
                      Needs more
                    </Button>
                    <Button size="sm" variant="positive" onClick={() => act.mutate({ id: c.id, patch: { verification: "verified" }, msg: `${c.firstName} is verified` })}>
                      <BadgeCheck className="size-3.5" aria-hidden /> Verify
                    </Button>
                  </Item>
                ))
              ))}
            {tab === "signals" &&
              (signals.length === 0 ? (
                <Empty key="e3" text="No unusual patterns right now." />
              ) : (
                signals.map((s) => {
                  const c = byId.get(s.requestId);
                  return (
                    <Item key={s.requestId} card={c} onOpen={openStory} icon={<ShieldAlert className="size-3.5" aria-hidden />} tone={s.score >= 4 ? "bg-danger" : "bg-[#ff9f0a]"} title={`Risk score ${s.score}`} meta={s.reasons.join(" · ")}>
                      {c && c.status === "active" ? (
                        <Button size="sm" variant="outline" onClick={() => act.mutate({ id: c.id, patch: { status: "paused" }, msg: `${c.firstName}’s story is paused for review` })}>
                          <Pause className="size-3.5" aria-hidden /> Pause for review
                        </Button>
                      ) : c ? (
                        <Button size="sm" variant="quiet" onClick={() => act.mutate({ id: c.id, patch: { status: "active" }, msg: "Story is live again" })}>
                          <Play className="size-3.5" aria-hidden /> Resume
                        </Button>
                      ) : null}
                    </Item>
                  );
                })
              ))}
          </AnimatePresence>
        </ul>
      )}
      <p className="mt-6 text-center text-[12.5px] text-ink-3">Signals are computed on this device from duplicate stories, reused photos, outlier goals and vague breakdowns.</p>
    </main>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <m.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-16 text-center text-[15px] text-ink-3">
      {text}
    </m.li>
  );
}

function Item({ card, onOpen, icon, tone, title, meta, children }: { card?: RequestCard; onOpen: (c: RequestCard) => void; icon: React.ReactNode; tone: string; title: string; meta: string; children: React.ReactNode }) {
  return (
    <m.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }} transition={{ duration: 0.45, ease: ease.outExpo }} className="glass-thick squircle rounded-[22px] p-3.5 shadow-card">
      <div className="flex items-start gap-3">
        <button onClick={() => card && onOpen(card)} disabled={!card} className="press relative shrink-0 rounded-[14px] ring-focus" aria-label={card ? `Open ${card.firstName}’s story` : "Story removed"}>
          {card ? <Avatar seed={card.avatarSeed} name={card.firstName} photoUrl={card.photoUrl} shape="card" className="size-14 rounded-[14px]" /> : <div className="size-14 rounded-[14px] bg-fill" />}
          <span className={cn("absolute -right-1 -bottom-1 grid size-5.5 place-items-center rounded-full text-white ring-2 ring-surface", tone)}>{icon}</span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold capitalize">{title}</p>
          <p className="text-[13px] text-ink-2">{card ? `${card.firstName}, ${card.city} · ${card.status}` : "Story no longer exists"}</p>
          <p className="mt-1 line-clamp-2 text-[13px] text-ink-3">{meta}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">{children}</div>
    </m.li>
  );
}
