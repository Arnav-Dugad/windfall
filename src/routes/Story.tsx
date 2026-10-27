import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, Flag, HandCoins, MessageCircleHeart, Newspaper, X } from "lucide-react";
import { m } from "motion/react";
import { RadioGroup } from "radix-ui";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { CATEGORY_LABELS, type RequestCard, type RequestDetail } from "@shared/domain";
import { formatUSD, formatUSDWhole, progress, remainingCents } from "@shared/money";
import { Celebration } from "@/components/deck/Celebration";
import { GiveSheet } from "@/components/deck/GiveSheet";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, DemoBadge, VerificationBadge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { ErrorState, Skeleton } from "@/components/ui/Feedback";
import { Progress } from "@/components/ui/Progress";
import { Sheet } from "@/components/ui/Sheet";
import { Ticker } from "@/components/ui/Ticker";
import { toast } from "@/lib/toast";
import { ease, spring } from "@/design/motion";
import { api } from "@/lib/api";
import { useDocumentTitle, useMe } from "@/lib/hooks";
import { cn, possessive, shortDate, timeAgo } from "@/lib/utils";

function useStory(id: string | undefined) {
  // When opened from the deck, the card is passed along so the hero renders (and animates) instantly.
  const card = (useLocation().state as { card?: RequestCard } | null)?.card;
  return useQuery({
    queryKey: ["story", id],
    queryFn: () => api.story(id!),
    enabled: !!id,
    placeholderData: card && card.id === id ? { request: { ...card, updates: [], lat: null, lng: null } } : undefined,
  });
}

/** Full page (direct visits, shared links). */
export default function Story() {
  const { id } = useParams();
  const q = useStory(id);
  const navigate = useNavigate();
  useDocumentTitle(q.data ? `${possessive(q.data.request.firstName)} story` : "Story");

  return (
    <main className="mx-auto max-w-3xl px-4 pt-4 pb-16 sm:px-6 sm:pt-8">
      <Button variant="ghost" size="sm" className="-ml-3 mb-4" onClick={() => (history.length > 1 ? navigate(-1) : navigate("/"))}>
        <ArrowLeft className="size-4" aria-hidden /> Back
      </Button>
      {q.isPending ? <StorySkeleton /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <StoryContent story={q.data.request} />}
    </main>
  );
}

/** Rendered over the deck: the card's portrait expands into this view via a shared layoutId. */
export function StoryOverlay() {
  const { id } = useParams();
  const navigate = useNavigate();
  const q = useStory(id);
  const close = useCallback(() => navigate(-1), [navigate]);
  useDocumentTitle(q.data ? `${possessive(q.data.request.firstName)} story` : "Story");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("[role=dialog]") && close();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Story">
      <m.div
        className="absolute inset-0 bg-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
      />
      <div className="pointer-events-none absolute inset-0 overflow-y-auto overscroll-contain sm:px-6 sm:py-10">
        <m.div
          className="pointer-events-auto relative mx-auto min-h-full max-w-3xl bg-canvas px-4 pt-4 pb-16 sm:min-h-0 sm:rounded-sheet sm:px-8 sm:pt-8 sm:shadow-float"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 0.25 }}
        >
          <div className="sticky top-3 z-10 flex justify-end">
            <IconButton label="Close story" onClick={close} autoFocus>
              <X className="size-5" aria-hidden />
            </IconButton>
          </div>
          <div className="-mt-11">
            {q.isPending ? <StorySkeleton /> : q.error ? <ErrorState error={q.error} /> : <StoryContent story={q.data.request} />}
          </div>
        </m.div>
      </div>
    </div>
  );
}

function StoryContent({ story }: { story: RequestDetail }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [giving, setGiving] = useState(false);
  const [celebrate, setCelebrate] = useState<RequestCard | null>(null);
  const [reporting, setReporting] = useState(false);
  const pct = progress(story.goalCents, story.fundedCents);
  const remaining = remainingCents(story.goalCents, story.fundedCents);
  const isPatron = me?.user?.role === "patron";
  const canGive = story.status === "active";

  const stagger = (i: number) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.12 + i * 0.06, duration: 0.7, ease: ease.outExpo },
  });

  return (
    <article>
      <m.div
        layoutId={`art-${story.id}`}
        transition={spring.layout}
        className="relative mx-auto aspect-[4/5] max-h-[68vh] w-full overflow-hidden rounded-card shadow-card sm:aspect-[3/2] sm:max-h-none [&_img]:object-[50%_28%]"
      >
        <Avatar seed={story.avatarSeed} name={story.firstName} photoUrl={story.photoUrl} blur={story.blurPhoto} shape="card" className="absolute inset-0" />
      </m.div>

      <m.header className="mt-7" {...stagger(0)}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{CATEGORY_LABELS[story.category]}</Badge>
          <VerificationBadge status={story.verification} />
          {story.status === "funded" && <Badge tone="positive">Fully funded</Badge>}
          {story.status === "paused" && <Badge>Paused by {story.firstName}</Badge>}
          {story.isDemo && <DemoBadge label="Demo — fictional person" />}
        </div>
        <h1 className="display mt-5 text-display-lg">
          {story.firstName}
          {story.age ? <span className="text-ink-3">, {story.age}</span> : null}
        </h1>
        <p className="mt-2 text-[15px] text-ink-2">
          {story.city}, {story.country} · posted {timeAgo(story.createdAt)}
        </p>
        <p className="display mt-6 text-[1.85rem] leading-[1.15] text-balance sm:text-[2.2rem]">“{story.headline}”</p>
      </m.header>

      <m.section {...stagger(1)} aria-label="Funding" className="card-surface mt-8 p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Raised</p>
            <p className="display mt-2 text-[2.8rem] leading-none">
              <Ticker value={story.fundedCents} format={formatUSDWhole} />
            </p>
            <p className="mt-2 text-[14px] text-ink-2 num">
              of {formatUSD(story.goalCents)} · {story.giftCount} {story.giftCount === 1 ? "gift" : "gifts"}
            </p>
          </div>
          <p className="display text-[2.2rem] leading-none text-ink-3 num">{Math.round(pct * 100)}%</p>
        </div>
        <Progress className="mt-5" value={pct} size="lg" />
        {canGive && (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {isPatron ? (
              <Button variant="accent" size="lg" magnetic className="flex-1" onClick={() => setGiving(true)}>
                <HandCoins className="size-5" aria-hidden /> Give to {story.firstName}
              </Button>
            ) : (
              <Button size="lg" className="flex-1" onClick={() => navigate(`/login?role=patron&next=/story/${story.id}`)}>
                Sign in as a Patron to give
              </Button>
            )}
            <p className="self-center text-[13px] text-ink-3 num sm:max-w-44">{formatUSD(remaining)} would clear it completely.</p>
          </div>
        )}
      </m.section>

      <m.section {...stagger(2)} className="mt-12" aria-labelledby="story-h">
        <h2 id="story-h" className="eyebrow">
          In {possessive(story.firstName)} words
        </h2>
        <div className="mt-4 space-y-4 text-[17px] leading-[1.7] text-ink/90 text-pretty">
          {story.story.split(/\n\n+/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </m.section>

      <m.section {...stagger(3)} className="mt-12" aria-labelledby="breakdown-h">
        <h2 id="breakdown-h" className="eyebrow">
          Where the money goes
        </h2>
        <ul className="mt-4 divide-y divide-line rounded-tile bg-surface hairline">
          {story.breakdown.map((b) => (
            <li key={b.label} className="flex items-center gap-4 px-5 py-4">
              <span className="min-w-0 flex-1 text-[15px]">{b.label}</span>
              <span className="hidden h-1 w-24 overflow-hidden rounded-full bg-line sm:block" aria-hidden>
                <span className="block h-full rounded-full bg-accent/70" style={{ width: `${(b.amountCents / story.goalCents) * 100}%` }} />
              </span>
              <span className="num w-24 text-right text-[15px] font-medium">{formatUSD(b.amountCents)}</span>
            </li>
          ))}
          <li className="flex items-center justify-between px-5 py-4 text-[15px] font-medium">
            <span>Total</span>
            <span className="num">{formatUSD(story.goalCents)}</span>
          </li>
        </ul>
      </m.section>

      <m.section {...stagger(4)} className="mt-12" aria-labelledby="verify-h">
        <h2 id="verify-h" className="eyebrow">
          Verification
        </h2>
        <div className="mt-4 flex gap-4 rounded-tile bg-surface-2 p-5">
          <BadgeCheck className={cn("mt-0.5 size-5 shrink-0", story.verification === "verified" ? "text-positive-ink" : "text-ink-3")} aria-hidden />
          <p className="text-[14.5px] leading-relaxed text-ink-2">
            {story.verification === "verified"
              ? `${story.firstName} uploaded statements for this debt and they were reviewed. In this demo, review is simulated.`
              : story.verification === "pending"
                ? `${story.firstName}’s documents are being reviewed. Gifts are still possible while review is pending.`
                : `${story.firstName} hasn’t uploaded proof yet. Patrons can filter for verified stories only.`}
          </p>
        </div>
      </m.section>

      {story.updates.length > 0 && (
        <m.section {...stagger(5)} className="mt-12" aria-labelledby="updates-h">
          <h2 id="updates-h" className="eyebrow">
            Updates from {story.firstName}
          </h2>
          <ol className="relative mt-5 space-y-6 border-l border-line pl-6">
            {story.updates.map((u) => (
              <li key={u.id} className="relative">
                <span className="absolute top-0.5 -left-[35px] grid size-5 place-items-center rounded-full bg-canvas text-accent-ink">
                  {u.kind === "thanks" ? <MessageCircleHeart className="size-4" aria-hidden /> : <Newspaper className="size-4" aria-hidden />}
                </span>
                <p className="text-[12.5px] text-ink-3">
                  {u.kind === "thanks" ? "Thank-you note" : "Update"} · {shortDate(u.createdAt)}
                </p>
                <p className="mt-1.5 text-[15.5px] leading-relaxed text-pretty">{u.body}</p>
              </li>
            ))}
          </ol>
        </m.section>
      )}

      <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-[13px] text-ink-3">
        <p>Every story on Windfall in this demo is fictional.</p>
        <button onClick={() => setReporting(true)} className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors hover:text-ink ring-focus">
          <Flag className="size-3.5" aria-hidden /> Report this story
        </button>
      </div>

      <GiveSheet
        card={giving ? story : null}
        open={giving}
        anonymousDefault={me?.user?.anonymousByDefault ?? false}
        onCancel={() => setGiving(false)}
        onGiven={(r) => {
          void qc.invalidateQueries({ queryKey: ["story", story.id] });
          void qc.invalidateQueries({ queryKey: ["impact"] });
          void qc.invalidateQueries({ queryKey: ["deck"] });
          if (r.cleared) {
            setGiving(false);
            setCelebrate(r.request);
          }
        }}
        onDone={() => setGiving(false)}
      />
      <Celebration card={celebrate} onClose={() => setCelebrate(null)} />
      <ReportSheet open={reporting} onOpenChange={setReporting} requestId={story.id} name={story.firstName} />
    </article>
  );
}

const REASONS = [
  ["misleading", "Misleading or inaccurate"],
  ["duplicate", "Duplicate or spam"],
  ["privacy", "Shares someone’s private information"],
  ["offensive", "Offensive content"],
  ["other", "Something else"],
] as const;

function ReportSheet({ open, onOpenChange, requestId, name }: { open: boolean; onOpenChange: (o: boolean) => void; requestId: string; name: string }) {
  const [reason, setReason] = useState<string>("misleading");
  const [note, setNote] = useState("");
  const report = useMutation({
    mutationFn: () => api.report(requestId, reason, note || undefined),
    onSuccess: () => {
      onOpenChange(false);
      setNote("");
      toast({ message: "Thanks — our trust & safety team will take a look.", tone: "positive" });
    },
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Report this story" description={`Tell us what’s wrong with ${possessive(name)} request. Reports are confidential.`}>
      <RadioGroup.Root value={reason} onValueChange={setReason} className="space-y-1.5" aria-label="Reason">
        {REASONS.map(([value, label]) => (
          <label key={value} className="flex h-12 cursor-pointer items-center gap-3 rounded-control px-3 transition-colors hover:bg-surface-2 has-[:focus-visible]:bg-surface-2">
            <RadioGroup.Item value={value} className="grid size-5 place-items-center rounded-full shadow-[inset_0_0_0_1.5px_var(--wf-line-strong)] data-[state=checked]:shadow-[inset_0_0_0_1.5px_var(--wf-ink)] ring-focus">
              <RadioGroup.Indicator className="size-2.5 rounded-full bg-ink" />
            </RadioGroup.Item>
            <span className="text-[15px]">{label}</span>
          </label>
        ))}
      </RadioGroup.Root>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="Anything else we should know? (optional)"
        aria-label="Additional details"
        className="mt-4 w-full resize-none rounded-control bg-surface-2 p-4 text-[15px] placeholder:text-ink-3 ring-focus"
      />
      {report.error && (
        <p role="alert" className="mt-3 text-[14px] text-danger">
          {report.error.message}
        </p>
      )}
      <Button className="mt-4 mb-1 w-full" size="lg" onClick={() => report.mutate()} disabled={report.isPending}>
        Send report
      </Button>
    </Sheet>
  );
}

function StorySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading story">
      <Skeleton className="aspect-[16/9] w-full rounded-card" />
      <Skeleton className="mt-8 h-14 w-48" />
      <Skeleton className="mt-4 h-5 w-64" />
      <Skeleton className="mt-8 h-40 w-full" />
    </div>
  );
}

