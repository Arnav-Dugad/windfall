import { useQuery } from "@tanstack/react-query";
import { ChevronRight, UsersRound } from "lucide-react";
import { m } from "motion/react";
import { Link } from "react-router";
import { formatCompactUSD } from "@shared/money";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { LargeTitle } from "@/components/ui/LargeTitle";
import { ease } from "@/design/motion";
import { useDocumentTitle, useMe } from "@/lib/hooks";
import { listCircles } from "@/lib/social";

/** Giving Circles: friends pooling gifts toward one person, with a live shared bar. */
export default function Circles() {
  useDocumentTitle("Giving Circles");
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ["circles"], queryFn: listCircles, staleTime: 30_000 });
  const uid = me?.user?.id;
  const mine = q.data?.filter((c) => uid && c.members[uid]) ?? [];
  const others = q.data?.filter((c) => !uid || !c.members[uid]) ?? [];

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 sm:px-6">
      <LargeTitle
        title="Giving Circles"
        subtitle="Pool gifts with friends toward one person’s debt, and watch the bar fill together in real time. Start one from any story."
      />

      {q.isPending ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-[24px]" />
          ))}
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState title="No circles yet" body="Open any story and tap “Start a Giving Circle” to invite friends." action={<ButtonLink to="/discover">Find someone</ButtonLink>} />
      ) : (
        <>
          {mine.length > 0 && <Group title="Your circles" circles={mine} />}
          <Group title={mine.length ? "Open circles" : "Join a circle"} circles={others} />
        </>
      )}
    </main>
  );
}

function Group({ title, circles }: { title: string; circles: Awaited<ReturnType<typeof listCircles>> }) {
  if (!circles.length) return null;
  return (
    <section className="mt-8">
      <h2 className="eyebrow mb-3">{title}</h2>
      <ul className="space-y-2.5">
        {circles.map((c, i) => {
          const members = Object.values(c.members);
          return (
            <m.li key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.5, ease: ease.outExpo }}>
              <Link to={`/circles/${c.id}`} className="press glass-thick squircle flex items-center gap-4 rounded-[24px] p-3.5 shadow-card ring-focus">
                <div className="relative shrink-0">
                  <Avatar seed={c.requestId} name={c.requestName} photoUrl={c.photoUrl} shape="card" className="size-16 rounded-[18px]" />
                  <span className="absolute -right-1.5 -bottom-1.5 grid size-6 place-items-center rounded-full bg-accent text-white ring-2 ring-surface">
                    <UsersRound className="size-3.5" aria-hidden />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold">{c.name}</p>
                  <p className="truncate text-[13.5px] text-ink-2">
                    For {c.requestName} · {members.length} {members.length === 1 ? "member" : "members"}
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-accent num">{formatCompactUSD(c.raisedCents)} raised together</p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
              </Link>
            </m.li>
          );
        })}
      </ul>
    </section>
  );
}
