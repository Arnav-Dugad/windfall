import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Share, UsersRound } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { RequestCard } from "@shared/domain";
import { formatUSD, remainingCents } from "@shared/money";
import { fxConfetti } from "@/components/effects";
import { GiveSheet } from "@/components/deck/GiveSheet";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { Ticker } from "@/components/ui/Ticker";
import { duration, ease, spring } from "@/design/motion";
import { useDocumentTitle, useMe } from "@/lib/hooks";
import { thumbUrl } from "@/lib/photos";
import { shareLink } from "@/lib/share";
import { joinCircle, watchCircle, type Circle as CircleT } from "@/lib/social";
import { useOpenStory } from "@/lib/useOpenStory";

/** One Giving Circle, live: everyone's gifts land on the same bar as they happen. */
export default function Circle() {
  const { id = "" } = useParams();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const openStory = useOpenStory();
  const [state, setState] = useState<{ circle: CircleT; request: RequestCard } | null | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [giving, setGiving] = useState(false);
  useDocumentTitle(state?.circle.name ?? "Giving Circle");

  useEffect(() => watchCircle(id, setState, setError), [id]);

  // Someone in the circle just gave: a small celebration for everyone watching.
  const [lastGift, setLastGift] = useState<string | null>(null);
  const gift = state?.circle.lastGiftId ?? null;
  if (gift !== lastGift) {
    if (lastGift !== null && gift) void fxConfetti();
    setLastGift(gift);
  }

  const join = useMutation({ mutationFn: () => joinCircle(id) });
  const refresh = () => {
    for (const k of ["impact", "stats", "leaderboard", "circles", "activity", "active-cards"]) void qc.invalidateQueries({ queryKey: [k] });
  };
  const uid = me?.user?.id;

  if (error) return <ErrorState error={error} className="py-24" />;
  if (state === undefined)
    return (
      <main className="mx-auto max-w-2xl px-4 pt-8 sm:px-6">
        <Skeleton className="h-[420px] rounded-[32px]" />
      </main>
    );
  if (state === null) return <EmptyState title="This circle has closed" body="It may have been removed by its organiser." className="py-24" />;

  const { circle, request } = state;
  const member = !!uid && !!circle.members[uid];
  const members = Object.entries(circle.members);
  const goal = request.goalCents;
  const others = Math.max(0, request.fundedCents - circle.raisedCents) / goal;
  const ours = Math.min(1 - others, circle.raisedCents / goal);
  const done = request.fundedCents >= goal;

  return (
    <main className="mx-auto max-w-2xl px-4 pt-4 pb-16 sm:px-6">
      <Link to="/circles" className="inline-flex h-9 items-center gap-1 text-[15px] font-medium text-accent ring-focus">
        <ArrowLeft className="size-4" aria-hidden /> Circles
      </Link>

      <section className="squircle relative mt-3 overflow-hidden rounded-[32px] bg-black text-white shadow-float">
        <img src={request.photoUrl ? thumbUrl(request.photoUrl) : undefined} alt="" aria-hidden className="absolute inset-0 size-full scale-125 object-cover opacity-60 blur-3xl saturate-150" />
        <div className="relative p-6 sm:p-8">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-white/80">
            <UsersRound className="size-4" aria-hidden /> Giving Circle
          </div>
          <h1 className="mt-2 text-[2rem] leading-tight font-bold tracking-[-0.025em] text-balance">{circle.name}</h1>
          <button onClick={() => openStory(request)} className="press mt-5 flex items-center gap-3 text-left ring-focus">
            <m.div layoutId={`art-${request.id}`} transition={spring.layout} className="size-16 overflow-hidden rounded-[18px] ring-1 ring-white/20">
              <Avatar seed={request.avatarSeed} name={request.firstName} photoUrl={request.photoUrl} shape="card" className="size-full" full />
            </m.div>
            <div className="min-w-0">
              <p className="text-[16px] font-semibold">
                {request.firstName}, {request.city}
              </p>
              <p className="line-clamp-2 text-[14px] text-white/75">{request.headline}</p>
            </div>
          </button>

          {/* Shared bar: everyone else's gifts, then the circle's slice in white, live. */}
          <div className="mt-7" role="progressbar" aria-valuenow={Math.round((others + ours) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Funding, with the circle’s share highlighted">
            <div className="relative h-3 overflow-hidden rounded-full bg-white/20">
              <m.div className="absolute inset-y-0 left-0 rounded-full bg-white/45" initial={false} animate={{ width: `${others * 100}%` }} transition={{ duration: duration.liquid, ease: ease.liquid }} />
              <m.div
                className={done ? "liquid-sheen absolute inset-y-0 rounded-full bg-positive" : "absolute inset-y-0 rounded-full bg-white"}
                initial={false}
                animate={{ left: `${others * 100}%`, width: `${ours * 100}%` }}
                transition={{ duration: duration.liquid, ease: ease.liquid }}
              />
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[2.25rem] leading-none font-bold tracking-[-0.03em] num">
                  <Ticker value={circle.raisedCents} format={(v) => formatUSD(Math.round(v / 100) * 100)} duration={0.9} />
                </p>
                <p className="mt-1 text-[13px] text-white/75">raised by this circle · {circle.giftCount} gifts</p>
              </div>
              <p className="text-right text-[13px] text-white/75 num">
                {done ? "Cleared" : `${formatUSD(remainingCents(goal, request.fundedCents))} to go`}
              </p>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-2.5">
            {member ? (
              <Button variant="glass" size="lg" className="flex-1 bg-white text-black hover:bg-white" disabled={done} onClick={() => setGiving(true)}>
                Give with the circle
              </Button>
            ) : (
              <Button size="lg" className="flex-1 bg-white text-black hover:bg-white" disabled={join.isPending} onClick={() => join.mutate()}>
                {join.isPending ? "Joining…" : "Join this circle"}
              </Button>
            )}
            <Button variant="glass" size="lg" onClick={() => void shareLink(`/circles/${circle.id}`, circle.name, `Join our Giving Circle for ${request.firstName} on Give.`)}>
              <Share className="size-4" aria-hidden /> Invite
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="members-h">
        <h2 id="members-h" className="eyebrow mb-3">
          {members.length} {members.length === 1 ? "member" : "members"}
        </h2>
        <ul className="flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            {members.map(([mid, name]) => (
              <m.li key={mid} layout initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.snappy} className="flex items-center gap-2 rounded-full bg-fill py-1 pr-3.5 pl-1">
                <Avatar seed={mid} name={name} className="size-7" />
                <span className="text-[14px] font-medium">
                  {name}
                  {mid === circle.createdBy && <span className="text-ink-3"> · organiser</span>}
                </span>
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      </section>

      <GiveSheet
        card={giving ? request : null}
        open={giving}
        circleId={circle.id}
        context={
          <>
            <UsersRound className="size-4" aria-hidden /> Counts toward {circle.name}
          </>
        }
        anonymousDefault={me?.user?.anonymousByDefault ?? false}
        onCancel={() => setGiving(false)}
        onGiven={refresh}
        onUndone={refresh}
        onDone={() => setGiving(false)}
        doneLabel="Done"
      />
    </main>
  );
}
