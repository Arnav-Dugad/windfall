import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUp, BadgeCheck, Bell, BellRing, Flag, HandCoins, Languages, MessageCircleHeart, Newspaper, Users, X } from "lucide-react";
import { m, useReducedMotion, useScroll, useTransform } from "motion/react";
import { RadioGroup } from "radix-ui";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type RefObject } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { CATEGORY_LABELS, type RequestCard, type RequestDetail, type SeekerUpdate } from "@shared/domain";
import { formatCompactUSD, formatUSD, formatUSDWhole, progress, remainingCents } from "@shared/money";
import { Celebration } from "@/components/deck/Celebration";
import { GiveSheet } from "@/components/deck/GiveSheet";
import { fxCoinBurst } from "@/components/effects";
import { flyCoin } from "@/components/effects/flyCoin";
import { MediaPlayer } from "@/components/media/MediaPlayer";
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
import { createCircle, follow, isFollowing, unfollow } from "@/lib/social";
import { languageName, translateAll, translationPair, translationSupported } from "@/lib/translate";
import { cn, haptic, possessive, shortDate, timeAgo } from "@/lib/utils";

/** The element the story scrolls in: the window on the full page, the overlay's scroller over the deck. */
const ScrollRoot = createContext<RefObject<HTMLDivElement | null> | null>(null);

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
      {q.isPending ? <StorySkeleton /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <StoryContent story={q.data.request} aboveTabBar />}
    </main>
  );
}

/** Rendered over the deck: the card's portrait expands into this view via a shared layoutId. */
export function StoryOverlay() {
  const { id } = useParams();
  const navigate = useNavigate();
  const q = useStory(id);
  const close = useCallback(() => navigate(-1), [navigate]);
  const scroller = useRef<HTMLDivElement>(null);
  useDocumentTitle(q.data ? `${possessive(q.data.request.firstName)} story` : "Story");

  useEffect(() => {
    // Escape closes the story unless a sheet on top of it (give, report, circle…) is open — that one closes first.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("[role=dialog]:not([data-story-overlay])") && close();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Story" data-story-overlay>
      <m.div
        className="absolute inset-0 bg-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
      />
      <div ref={scroller} className="pointer-events-none absolute inset-0 overflow-y-auto overscroll-contain sm:px-6 sm:py-10">
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
            <ScrollRoot.Provider value={scroller}>
              {q.isPending ? <StorySkeleton /> : q.error ? <ErrorState error={q.error} /> : <StoryContent story={q.data.request} />}
            </ScrollRoot.Provider>
          </div>
        </m.div>
      </div>
    </div>
  );
}

function StoryContent({ story, aboveTabBar = false }: { story: RequestDetail; aboveTabBar?: boolean }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const root = useContext(ScrollRoot);
  const [giving, setGiving] = useState(false);
  const [celebrate, setCelebrate] = useState<RequestCard | null>(null);
  const [reporting, setReporting] = useState(false);
  const [circling, setCircling] = useState(false);
  const pct = progress(story.goalCents, story.fundedCents);
  const remaining = remainingCents(story.goalCents, story.fundedCents);
  const isPatron = me?.user?.role === "patron";
  const canGive = story.status === "active";
  const tr = useStoryTranslation(story);

  // Scroll-linked parallax: the portrait drifts down and settles in slightly as the page scrolls past it.
  const hero = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ container: root ?? undefined, target: hero, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, 90]);
  const heroScale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [1.04, 1.14]);
  const heroDim = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 0.35]);

  // The sticky give bar appears once the main funding panel has scrolled up and away — not while it's still
  // below the fold (then the bar would sit over the name and headline on a phone).
  const fund = useRef<HTMLElement>(null);
  const [fundPassed, setFundPassed] = useState(false);
  useEffect(() => {
    const el = fund.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => e && setFundPassed(!e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 0)),
      { root: root?.current ?? null, rootMargin: "0px 0px -20% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  const refreshAfterGift = () => {
    for (const key of [["story", story.id], ["impact"], ["deck"], ["active-cards"], ["following", story.id], ["activity"], ["circles"], ["wrapped"], ["leaderboard"]])
      void qc.invalidateQueries({ queryKey: key });
  };

  const clearIt = useMutation({
    mutationFn: () => api.give({ requestId: story.id, kind: "clear", anonymous: me?.user?.anonymousByDefault ?? false }),
    onSuccess: (r) => {
      haptic([10, 30, 14]);
      refreshAfterGift();
      setCelebrate(r.request);
      toast({
        message: `You cleared ${possessive(story.firstName)} debt · ${formatUSD(r.gift.amountCents)}`,
        tone: "positive",
        duration: 8000,
        action: {
          label: "Undo",
          onClick: () =>
            void api
              .reverseGift(r.gift.id)
              .then(() => {
                setCelebrate(null);
                refreshAfterGift();
                toast({ message: "Gift undone", tone: "accent" });
              })
              .catch((e: Error) => toast({ message: e.message, tone: "danger" })),
        },
      });
    },
    onError: (e) => toast({ message: e.message, tone: "danger" }),
  });

  const stagger = (i: number) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.12 + i * 0.06, duration: 0.7, ease: ease.outExpo },
  });

  return (
    <article>
      <m.div
        ref={hero}
        layoutId={`art-${story.id}`}
        transition={spring.layout}
        className="squircle relative mx-auto aspect-[4/5] max-h-[68vh] w-full overflow-hidden rounded-card shadow-card sm:aspect-[3/2] sm:max-h-none [&_img]:object-[50%_28%]"
      >
        <m.div style={{ y: heroY, scale: heroScale }} className="absolute inset-0 will-change-transform">
          <Avatar seed={story.avatarSeed} name={story.firstName} photoUrl={story.photoUrl} blur={story.blurPhoto} shape="card" className="absolute inset-0" />
        </m.div>
        <m.div aria-hidden style={{ opacity: heroDim }} className="absolute inset-0 bg-black" />
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
        <div className="mt-4 flex flex-wrap gap-2">
          {isPatron && <FollowButton story={story} />}
          {isPatron && canGive && (
            <Button variant="outline" size="sm" onClick={() => setCircling(true)}>
              <Users className="size-4" aria-hidden /> Start a Giving Circle
            </Button>
          )}
          {tr.pair && (
            <Button variant="outline" size="sm" onClick={tr.toggle} disabled={tr.busy} aria-pressed={tr.on}>
              <Languages className="size-4" aria-hidden />
              {tr.busy ? "Translating…" : tr.on ? "Show original" : `Translate to ${languageName(tr.pair.target)}`}
            </Button>
          )}
        </div>
        <p className="display mt-6 text-[1.85rem] leading-[1.15] text-balance sm:text-[2.2rem]" lang={tr.on ? tr.pair?.target : undefined}>
          “{tr.on && tr.text ? tr.text.headline : story.headline}”
        </p>
        {tr.on && tr.pair && <p className="mt-2 text-[12.5px] text-ink-3">Translated on your device from {languageName(tr.pair.source)}.</p>}
      </m.header>

      <m.section ref={fund} {...stagger(1)} aria-label="Funding" className="card-surface mt-8 p-5 sm:p-7">
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
        <Progress className="mt-5" value={pct} size="lg" accent={story.accent} />
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
        <div className="mt-4 space-y-4 text-[17px] leading-[1.7] text-ink/90 text-pretty" lang={tr.on ? tr.pair?.target : undefined}>
          {(tr.on && tr.text ? tr.text.paragraphs : paragraphsOf(story.story)).map((p, i) => (
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
                  {u.kind === "thanks" ? (mediaIdOf(u) ? "Thank-you message" : "Thank-you note") : "Update"} · {shortDate(u.createdAt)}
                </p>
                <p className="mt-1.5 text-[15.5px] leading-relaxed text-pretty">{u.body}</p>
                {mediaIdOf(u) && <MediaPlayer requestId={story.id} mediaId={mediaIdOf(u)!} accent={story.accent} />}
              </li>
            ))}
          </ol>
        </m.section>
      )}

      <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-[13px] text-ink-3">
        <p>Every story on Give in this demo is fictional.</p>
        <button onClick={() => setReporting(true)} className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors hover:text-ink ring-focus">
          <Flag className="size-3.5" aria-hidden /> Report this story
        </button>
      </div>

      {canGive && (
        <GiveBar
          story={story}
          show={fundPassed}
          aboveTabBar={aboveTabBar}
          isPatron={isPatron}
          clearing={clearIt.isPending}
          onGive={() => setGiving(true)}
          onClear={(from) => {
            void fxCoinBurst(from.x, from.y, 1.4);
            flyCoin(from, { delay: 40 });
            clearIt.mutate();
          }}
          onSignIn={() => navigate(`/login?role=patron&next=/story/${story.id}`)}
        />
      )}

      <GiveSheet
        card={giving ? story : null}
        open={giving}
        anonymousDefault={me?.user?.anonymousByDefault ?? false}
        onCancel={() => setGiving(false)}
        onGiven={(r) => {
          refreshAfterGift();
          if (r.cleared) {
            setGiving(false);
            setCelebrate(r.request);
          }
        }}
        onDone={() => setGiving(false)}
        onUndone={refreshAfterGift}
        doneLabel="Done"
      />
      <Celebration card={celebrate} onClose={() => setCelebrate(null)} />
      <ReportSheet open={reporting} onOpenChange={setReporting} requestId={story.id} name={story.firstName} />
      {isPatron && <CircleSheet open={circling} onOpenChange={setCircling} story={story} />}
    </article>
  );
}

const paragraphsOf = (text: string) => text.split(/\n\n+/);
/** Thank-you voice notes / videos hang off an update by id. */
const mediaIdOf = (u: SeekerUpdate) => (u as SeekerUpdate & { mediaId?: string | null }).mediaId ?? null;

/** Feature-detected on-device translation of the headline and story (hidden where unsupported). */
function useStoryTranslation(story: RequestDetail) {
  const pair = useQuery({
    queryKey: ["translate-pair", story.id],
    queryFn: () => translationPair(`${story.headline}\n${story.story}`),
    enabled: translationSupported(),
    staleTime: Infinity,
  });
  const [on, setOn] = useState(false);
  const run = useMutation({
    mutationFn: async () => {
      const paragraphs = paragraphsOf(story.story);
      const [headline, ...rest] = await translateAll([story.headline, ...paragraphs], pair.data!);
      return { headline: headline!, paragraphs: rest };
    },
    onSuccess: () => setOn(true),
    onError: () => toast({ message: "Translation isn’t available right now.", tone: "danger" }),
  });
  return {
    pair: pair.data ?? null,
    on,
    busy: run.isPending,
    text: run.data ?? null,
    toggle: () => (on ? setOn(false) : run.data ? setOn(true) : run.mutate()),
  };
}

function FollowButton({ story }: { story: RequestDetail }) {
  const qc = useQueryClient();
  // Keyed by user and held until the session is known: asked too early, the answer is always "not following".
  const uid = useMe().data?.user?.id;
  const key = ["following", story.id, uid];
  const q = useQuery({ queryKey: key, queryFn: () => isFollowing(story.id), staleTime: 60_000, enabled: !!uid });
  const toggle = useMutation({
    mutationFn: (next: boolean) => (next ? follow(story.id, progress(story.goalCents, story.fundedCents)) : unfollow(story.id)),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<boolean>(key);
      qc.setQueryData(key, next);
      haptic(6);
      return { prev };
    },
    onSuccess: (_, next) => {
      void qc.invalidateQueries({ queryKey: ["activity"] });
      if (next) toast({ message: `You’ll hear quietly when ${story.firstName} posts or hits a milestone.`, tone: "accent" });
    },
    onError: (e, _, ctx) => {
      qc.setQueryData(key, ctx?.prev ?? false);
      toast({ message: e.message, tone: "danger" });
    },
  });
  const on = !!q.data;
  return (
    <Button variant={on ? "quiet" : "outline"} size="sm" onClick={() => toggle.mutate(!on)} disabled={q.isPending} aria-pressed={on}>
      {on ? <BellRing className="size-4 text-accent" aria-hidden /> : <Bell className="size-4" aria-hidden />}
      {on ? "Following" : "Follow"}
    </Button>
  );
}

/** Floating glass bar that keeps "Give" one tap away while reading. */
function GiveBar({
  story,
  show,
  aboveTabBar,
  isPatron,
  clearing,
  onGive,
  onClear,
  onSignIn,
}: {
  story: RequestDetail;
  show: boolean;
  aboveTabBar: boolean;
  isPatron: boolean;
  clearing: boolean;
  onGive: () => void;
  onClear: (from: { x: number; y: number }) => void;
  onSignIn: () => void;
}) {
  const remaining = remainingCents(story.goalCents, story.fundedCents);
  return (
    <div
      className={cn(
        "pointer-events-none sticky z-20 mt-10 flex justify-center",
        aboveTabBar ? "bottom-[calc(max(env(safe-area-inset-bottom),12px)+5.25rem)] md:bottom-6" : "bottom-[max(env(safe-area-inset-bottom),12px)] sm:bottom-4",
      )}
    >
      <m.div
        initial={false}
        animate={show ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 28, scale: 0.97 }}
        transition={spring.sheet}
        aria-hidden={!show}
        inert={!show}
        className={cn("glass-thick flex w-full max-w-xl items-center gap-3 rounded-full py-2 pr-2 pl-2.5 shadow-float", show && "pointer-events-auto")}
      >
        <Avatar seed={story.avatarSeed} name={story.firstName} photoUrl={story.photoUrl} blur={story.blurPhoto} className="size-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold num">
            {formatCompactUSD(remaining)} <span className="font-normal text-ink-2">to clear {story.firstName}</span>
          </p>
          <Progress value={progress(story.goalCents, story.fundedCents)} size="sm" accent={story.accent} className="mt-1.5" coinTarget />
        </div>
        {isPatron ? (
          <>
            <Button
              variant="positive"
              size="sm"
              disabled={clearing}
              className="hidden sm:inline-flex"
              aria-label={`Clear ${possessive(story.firstName)} debt with ${formatUSD(remaining)}`}
              onClick={(e) => {
                const b = e.currentTarget.getBoundingClientRect();
                onClear({ x: b.left + b.width / 2, y: b.top + b.height / 2 });
              }}
            >
              <ArrowUp className="size-4" aria-hidden /> Clear
            </Button>
            <Button variant="accent" size="sm" onClick={onGive}>
              <HandCoins className="size-4" aria-hidden /> Give
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={onSignIn}>
            Sign in to give
          </Button>
        )}
      </m.div>
    </div>
  );
}

function CircleSheet({ open, onOpenChange, story }: { open: boolean; onOpenChange: (o: boolean) => void; story: RequestDetail }) {
  const navigate = useNavigate();
  const id = useId();
  const [name, setName] = useState(`Friends of ${story.firstName}`);
  const create = useMutation({
    mutationFn: () => createCircle(story.id, name.trim().slice(0, 60)),
    onSuccess: (circleId) => {
      onOpenChange(false);
      navigate(`/circles/${circleId}`);
    },
  });
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Start a Giving Circle"
      description={`Pool gifts with friends toward ${possessive(story.firstName)} ${formatCompactUSD(remainingCents(story.goalCents, story.fundedCents))}. Everyone sees one shared, live bar.`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length >= 2) create.mutate();
        }}
        className="pb-1"
      >
        <label htmlFor={id} className="eyebrow mb-2 block">
          Circle name
        </label>
        <input
          id={id}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoFocus
          className="h-12 w-full rounded-control bg-fill px-4 text-[16px] ring-focus"
        />
        {create.error && (
          <p role="alert" className="mt-3 text-[14px] text-danger">
            {create.error.message}
          </p>
        )}
        <Button type="submit" size="lg" className="mt-5 w-full" disabled={create.isPending || name.trim().length < 2}>
          <Users className="size-4" aria-hidden /> {create.isPending ? "Creating…" : "Create circle & invite friends"}
        </Button>
      </form>
    </Sheet>
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

