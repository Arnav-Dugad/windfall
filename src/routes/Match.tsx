import { useQueryClient } from "@tanstack/react-query";
import { HandCoins, Repeat2 } from "lucide-react";
import { m } from "motion/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import type { RequestCard } from "@shared/domain";
import { formatUSD, remainingCents } from "@shared/money";
import { GiveSheet } from "@/components/deck/GiveSheet";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { Progress } from "@/components/ui/Progress";
import { ease, spring } from "@/design/motion";
import { useDocumentTitle, useMe } from "@/lib/hooks";
import { watchMatch, type Match as MatchT } from "@/lib/social";
import { useOpenStory } from "@/lib/useOpenStory";

/** A "match my gift" challenge: one tap to give the same amount to the same person. */
export default function Match() {
  useDocumentTitle("Match a gift");
  const { id = "" } = useParams();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const openStory = useOpenStory();
  const [state, setState] = useState<{ match: MatchT; request: RequestCard } | null | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [giving, setGiving] = useState(false);
  useEffect(() => watchMatch(id, setState, setError), [id]);
  const refresh = () => {
    for (const k of ["impact", "stats", "leaderboard", "activity", "active-cards"]) void qc.invalidateQueries({ queryKey: [k] });
  };

  if (error) return <ErrorState error={error} className="py-24" />;
  if (state === undefined)
    return (
      <main className="mx-auto max-w-md px-4 pt-10">
        <Skeleton className="h-[480px] rounded-[32px]" />
      </main>
    );
  if (state === null) return <EmptyState title="This challenge has ended" className="py-24" action={<ButtonLink to="/discover">Discover stories</ButtonLink>} />;

  const { match, request } = state;
  const rem = remainingCents(request.goalCents, request.fundedCents);
  const amount = Math.min(match.amountCents, rem);
  const done = rem <= 0;
  const own = me?.user?.id === match.createdBy;

  return (
    <main className="mx-auto max-w-md px-4 pt-8 pb-16">
      <m.section
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: ease.outExpo }}
        className="glass-thick squircle overflow-hidden rounded-[32px] shadow-float"
      >
        <button onClick={() => openStory(request)} className="relative block aspect-[4/3] w-full overflow-hidden ring-focus" aria-label={`Read ${request.firstName}’s story`}>
          <m.div layoutId={`art-${request.id}`} transition={spring.layout} className="absolute inset-0">
            <Avatar seed={request.avatarSeed} name={request.firstName} photoUrl={request.photoUrl} shape="card" className="size-full" priority />
          </m.div>
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" aria-hidden />
          <p className="absolute bottom-4 left-5 text-left text-white">
            <span className="block text-[20px] font-semibold">
              {request.firstName}, {request.city}
            </span>
            <span className="text-[14px] text-white/80">{request.headline}</span>
          </p>
        </button>
        <div className="p-6">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-accent">
            <Repeat2 className="size-4" aria-hidden /> Match challenge
          </p>
          <h1 className="mt-2 text-[1.7rem] leading-tight font-bold tracking-[-0.02em] text-balance">
            {match.fromName} gave {formatUSD(match.amountCents)}. Will you match it?
          </h1>
          <Progress value={request.fundedCents / request.goalCents} accent={request.accent} className="mt-5" />
          <p className="mt-2 flex justify-between text-[13px] text-ink-2 num">
            <span>{done ? "Fully cleared" : `${formatUSD(rem)} to go`}</span>
            <span>
              {match.matchCount} {match.matchCount === 1 ? "match" : "matches"} · {formatUSD(match.matchedCents)}
            </span>
          </p>
          {done ? (
            <ButtonLink to="/discover" size="lg" className="mt-6 w-full">
              Find someone else
            </ButtonLink>
          ) : own ? (
            <p className="mt-6 rounded-[16px] bg-fill p-4 text-center text-[14px] text-ink-2">This is your challenge — share the link and watch the matches roll in.</p>
          ) : (
            <Button size="lg" variant="accent" magnetic className="mt-6 w-full" onClick={() => setGiving(true)}>
              <HandCoins className="size-5" aria-hidden /> Match with {formatUSD(amount)}
            </Button>
          )}
        </div>
      </m.section>

      <GiveSheet
        card={giving ? request : null}
        open={giving}
        matchId={match.id}
        suggestedCents={amount}
        context={
          <>
            <Repeat2 className="size-4" aria-hidden /> Matching {match.fromName}’s gift
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
