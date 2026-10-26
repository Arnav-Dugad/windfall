import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Plus } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router";
import type { RequestCard } from "@shared/domain";
import { formatUSD, formatUSDWhole, progress } from "@shared/money";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, VerificationBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { Progress } from "@/components/ui/Progress";
import { Ticker } from "@/components/ui/Ticker";
import { ease } from "@/design/motion";
import { api } from "@/lib/api";
import { useDocumentTitle, useMe } from "@/lib/hooks";
import { timeAgo } from "@/lib/utils";
import { STATUS_BADGE } from "./status";

export default function SeekerDashboard() {
  useDocumentTitle("My requests");
  const { data: me } = useMe();
  // Live: funding progress refreshes while the page is open.
  const q = useQuery({ queryKey: ["my-requests"], queryFn: api.myRequests, refetchInterval: 5000 });
  const name = me?.user?.displayName && me.user.displayName !== "New Seeker" ? me.user.displayName : null;

  return (
    <main className="mx-auto max-w-5xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Seeker</p>
          <h1 className="display mt-4 text-display-lg">{name ? `Hello, ${name}.` : "Hello."}</h1>
          <p className="mt-3 max-w-lg text-[16px] text-ink-2 text-pretty">
            Your requests, the people backing them, and the notes you send back — all in one quiet place.
          </p>
        </div>
        <ButtonLink to="/seeker/new" variant="primary">
          <Plus className="size-4" aria-hidden /> New request
        </ButtonLink>
      </div>

      {q.isPending ? (
        <div className="mt-10 space-y-4">
          <Skeleton className="h-48 rounded-card" />
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.requests.length === 0 ? (
        <EmptyState
          title="Tell your story, on your terms"
          body="It takes about five minutes. Only your first name is ever shown, and you can pause or close your request at any time."
          action={
            <ButtonLink to="/seeker/new" size="lg">
              Start your request
            </ButtonLink>
          }
        />
      ) : (
        <ul className="mt-10 space-y-4">
          {q.data.requests.map((r, i) => (
            <motion.li key={r.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.6, ease: ease.outExpo }}>
              <RequestRow r={r} />
            </motion.li>
          ))}
        </ul>
      )}
    </main>
  );
}

function RequestRow({ r }: { r: RequestCard }) {
  const pct = progress(r.goalCents, r.fundedCents);
  const s = STATUS_BADGE[r.status];
  return (
    <Link to={`/seeker/requests/${r.id}`} className="card-surface group grid gap-6 p-5 transition-transform duration-(--duration-base) hover:-translate-y-0.5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-6 ring-focus">
      <Avatar seed={r.avatarSeed} name={r.firstName} photoUrl={r.photoUrl} blur={r.blurPhoto} shape="card" className="hidden size-24 rounded-[22px] sm:block" />
      <div className="min-w-0">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={s.tone}>{s.label}</Badge>
          <VerificationBadge status={r.verification} />
        </div>
        <p className="display mt-3 text-[1.6rem] leading-tight text-balance">“{r.headline}”</p>
        <p className="mt-1 text-[13px] text-ink-3">Posted {timeAgo(r.createdAt)}</p>
        <Progress className="mt-4" value={pct} />
      </div>
      <div className="flex items-end justify-between gap-6 sm:block sm:text-right">
        <div>
          <p className="display text-[2.2rem] leading-none">
            <Ticker value={r.fundedCents} format={formatUSDWhole} />
          </p>
          <p className="mt-1 text-[13px] text-ink-2 num">
            of {formatUSD(r.goalCents)} · {r.giftCount} {r.giftCount === 1 ? "gift" : "gifts"}
          </p>
        </div>
        <span className="mt-4 inline-flex items-center gap-1 text-[14px] font-medium text-ink-2 transition-colors group-hover:text-ink">
          Manage <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
