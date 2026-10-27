import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Plus } from "lucide-react";
import { m } from "motion/react";
import { Link } from "react-router";
import type { RequestCard } from "@shared/domain";
import { formatUSD, formatUSDWhole, progress } from "@shared/money";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, VerificationBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { LargeTitle } from "@/components/ui/LargeTitle";
import { Progress } from "@/components/ui/Progress";
import { Ticker } from "@/components/ui/Ticker";
import { ease } from "@/design/motion";
import { api } from "@/lib/api";
import { useDocumentTitle, useMe } from "@/lib/hooks";
import { cn, timeAgo } from "@/lib/utils";
import { STATUS_BADGE } from "./status";

export default function SeekerDashboard() {
  useDocumentTitle("My requests");
  const { data: me } = useMe();
  // Live: funding progress refreshes while the page is open.
  const q = useQuery({ queryKey: ["my-requests"], queryFn: api.myRequests, refetchInterval: 5000 });
  const name = me?.user?.displayName && me.user.displayName !== "New Seeker" ? me.user.displayName : null;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
      <LargeTitle
        eyebrow="Seeker"
        title={name ? `Hello, ${name}.` : "Hello."}
        subtitle="Your requests, the people backing them, and the notes you send back — all in one quiet place."
        actions={
          <ButtonLink to="/seeker/new" variant="primary">
            <Plus className="size-4" aria-hidden /> New request
          </ButtonLink>
        }
      />

      {q.data && q.data.requests.length > 0 && <Summary requests={q.data.requests} />}

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
        <ul className="mt-6 space-y-4">
          {q.data.requests.map((r, i) => (
            <m.li key={r.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.6, ease: ease.outExpo }}>
              <RequestRow r={r} />
            </m.li>
          ))}
        </ul>
      )}
    </main>
  );
}

/** Widget row across every request: total raised, gifts, and how many are live. */
function Summary({ requests }: { requests: RequestCard[] }) {
  const raised = requests.reduce((s, r) => s + r.fundedCents, 0);
  const goal = requests.reduce((s, r) => s + r.goalCents, 0);
  const gifts = requests.reduce((s, r) => s + r.giftCount, 0);
  const live = requests.filter((r) => r.status === "active").length;
  const tiles = [
    { label: "Raised", value: <Ticker value={raised} format={formatUSDWhole} />, foot: <Progress value={goal ? raised / goal : 0} size="sm" className="mt-3" /> },
    { label: "Gifts", value: <span className="num">{gifts}</span>, foot: <p className="mt-2 text-[12.5px] text-ink-3">from Patrons worldwide</p> },
    { label: "Live now", value: <span className="num">{live}</span>, foot: <p className="mt-2 text-[12.5px] text-ink-3">of {requests.length} {requests.length === 1 ? "request" : "requests"}</p> },
  ];
  return (
    <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
      {tiles.map((t, i) => (
        <m.li
          key={t.label}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: i * 0.06, duration: 0.6, ease: ease.outExpo }}
          className={cn("card-surface squircle rounded-[24px] p-5", i === 0 && "col-span-2 sm:col-span-1")}
        >
          <p className="text-[13px] font-semibold text-ink-2">{t.label}</p>
          <p className="display mt-2 text-[2.2rem] leading-none">{t.value}</p>
          {t.foot}
        </m.li>
      ))}
    </ul>
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
        <Progress className="mt-4" value={pct} accent={r.accent} />
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
