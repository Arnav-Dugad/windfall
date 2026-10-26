import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUp, BadgeCheck, EyeOff, HandCoins, Hourglass, Landmark, PauseCircle, ShieldCheck, Undo2, X } from "lucide-react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import type { RequestCard } from "@shared/domain";
import { formatUSD, formatUSDWhole, remainingCents } from "@shared/money";
import { SwipeDeck, type SwipeDeckHandle, type SwipeDir } from "@/components/deck/SwipeDeck";
import { fxCoinBurst, fxConfetti } from "@/components/effects";
import { DemoBadge } from "@/components/ui/Badge";
import { Logo, Mark, ThemeToggle } from "@/components/ui/Brand";
import { ButtonLink, IconButton, Magnetic } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Feedback";
import { Ticker } from "@/components/ui/Ticker";
import { toast } from "@/lib/toast";
import { ease, reveal } from "@/design/motion";
import { announce } from "@/lib/announce";
import { api } from "@/lib/api";
import { useDocumentTitle, useMediaQuery, useMe } from "@/lib/hooks";
import { homeFor } from "@/lib/routes";
import { cn } from "@/lib/utils";

export default function Landing() {
  useDocumentTitle("");
  const { data: me } = useMe();
  const user = me?.user;

  return (
    <div className="overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-transparent bg-canvas/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <DemoBadge className="hidden sm:inline-flex" />
          <DemoBadge className="sm:hidden" label="Demo" />
          <nav aria-label="Sections" className="mx-auto hidden items-center gap-7 text-[14px] text-ink-2 md:flex">
            <a href="#how" className="rounded hover:text-ink ring-focus">
              How it works
            </a>
            <a href="#seekers" className="rounded hover:text-ink ring-focus">
              For Seekers
            </a>
            <a href="#trust" className="rounded hover:text-ink ring-focus">
              Trust
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <ThemeToggle />
            <ButtonLink to={user ? homeFor(user.role) : "/login"} size="sm">
              {user ? "Open app" : "Enter the demo"}
            </ButtonLink>
          </div>
        </div>
      </header>

      <main>
        <Hero />
        <HowItWorks />
        <Principle />
        <ForSeekers />
        <Trust />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- */

function Hero() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats, refetchInterval: 15_000 });
  return (
    <section className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pt-10 pb-24 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-20 lg:pb-32">
      <div aria-hidden className="pointer-events-none absolute -top-40 right-0 -z-10 size-[640px] rounded-full opacity-60 blur-3xl" style={{ background: "radial-gradient(closest-side, var(--wf-gold-soft), transparent)" }} />
      <div>
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: ease.outExpo }} className="eyebrow">
          Person-to-person generosity · a demo
        </motion.p>
        <h1 className="display mt-6 text-[clamp(3.2rem,6.2vw,6.25rem)] leading-[0.95] tracking-[-0.02em]">
          {["Swipe", "right", "to"].map((w, i) => (
            <Word key={w} i={i}>
              {w}
            </Word>
          ))}{" "}
          <Word i={3}>
            <em className="gold-sheen pr-2 italic">clear</em>
          </Word>
          {["someone’s", "debt."].map((w, i) => (
            <Word key={w} i={i + 4}>
              {w}
            </Word>
          ))}
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.45, ease: ease.outExpo }}
          className="mt-7 max-w-lg text-[18px] leading-relaxed text-ink-2 text-pretty"
        >
          Windfall puts Patrons face to face with people carrying medical bills, student loans, rent arrears and the wreckage of a brave small business.
          Swipe right to give. Swipe up to clear it entirely.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.55, ease: ease.outExpo }}
          className="mt-9 flex flex-wrap items-center gap-3"
        >
          <Magnetic>
            <ButtonLink to="/login?role=patron" size="lg">
              Start giving <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </Magnetic>
          <ButtonLink to="/login?role=seeker" size="lg" variant="outline">
            I could use a hand
          </ButtonLink>
        </motion.div>

        <motion.dl
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.75 }}
          className="mt-14 grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-6"
          aria-label="Live totals (demo)"
        >
          <LiveStat label="Given on Windfall" value={stats.data?.totalCents} format={formatUSDWhole} />
          <LiveStat label="People helped" value={stats.data?.peopleHelped} format={(n) => n.toLocaleString("en-US")} />
          <LiveStat label="Debts cleared" value={stats.data?.debtsCleared} format={(n) => n.toLocaleString("en-US")} />
        </motion.dl>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40, rotate: 2 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 1.1, delay: 0.2, ease: ease.outExpo }}
        className="mx-auto w-full max-w-[380px]"
      >
        <HeroDeck />
      </motion.div>
    </section>
  );
}

function Word({ children, i }: { children: ReactNode; i: number }) {
  // The trailing space must sit outside the inline-block or it collapses.
  return (
    <>
      <span className="inline-block overflow-hidden pb-[0.08em] align-bottom">
        <motion.span
          className="inline-block"
          initial={{ y: "105%" }}
          animate={{ y: 0 }}
          transition={{ duration: 0.9, delay: 0.08 + i * 0.06, ease: ease.outExpo }}
        >
          {children}
        </motion.span>
      </span>{" "}
    </>
  );
}

function LiveStat({ label, value, format }: { label: string; value: number | undefined; format: (n: number) => string }) {
  return (
    <div>
      <dt className="text-[12.5px] text-ink-3">{label}</dt>
      <dd className="display mt-1.5 text-[1.9rem] leading-none sm:text-[2.2rem]">
        {value === undefined ? <Skeleton className="h-8 w-20" /> : <Ticker value={value} format={format} duration={2} />}
      </dd>
    </div>
  );
}

/** The hero's live deck: real (demo) stories, swipeable by visitors; decisions stay local. */
function HeroDeck() {
  const featured = useQuery({ queryKey: ["featured"], queryFn: api.featured, staleTime: 60_000 });
  const [queue, setQueue] = useState<RequestCard[]>([]);
  const deckRef = useRef<SwipeDeckHandle>(null);
  const desktop = useMediaQuery("(min-width: 1024px)");
  const hinted = useRef(false);

  const [seen, setSeen] = useState(featured.data);
  if (featured.data && featured.data !== seen) {
    setSeen(featured.data);
    setQueue(featured.data.cards);
  }

  const onSwipe = (card: RequestCard, dir: SwipeDir) => {
    const center = () => {
      const el = document.getElementById("hero-deck")?.getBoundingClientRect();
      return el ? { x: el.left + el.width / 2, y: el.top + el.height * 0.45 } : { x: innerWidth / 2, y: innerHeight / 2 };
    };
    let next = card;
    if (dir === "right") {
      const c = center();
      void fxCoinBurst(c.x, c.y);
      next = { ...card, fundedCents: Math.min(card.goalCents, card.fundedCents + 100_000), giftCount: card.giftCount + 1 };
      announce(`Pretend gift of $1,000 to ${card.firstName}.`);
    } else if (dir === "up") {
      void fxConfetti();
      announce(`Pretend clear of ${card.firstName}’s debt.`);
    } else {
      announce(`Passed on ${card.firstName}.`);
    }
    if (dir !== "left" && !hinted.current) {
      hinted.current = true;
      toast({ message: "That was pretend. Sign in as a Patron to give (demo) money.", tone: "gold", duration: 5000 });
    }
    // Loop forever: the card goes to the back of the stack.
    setQueue((q) => [...q.filter((c) => c.id !== card.id), dir === "up" ? card : next]);
  };

  const top = queue[0];
  return (
    <div>
      <div id="hero-deck" className="relative h-[480px] w-full sm:h-[520px]">
        {featured.isPending ? (
          <Skeleton className="absolute inset-0 rounded-card" />
        ) : featured.error || queue.length === 0 ? (
          <div className="card-surface grid h-full place-items-center p-8 text-center text-ink-2">The live demo deck is resting. Enter the demo to see every story.</div>
        ) : (
          <SwipeDeck ref={deckRef} cards={queue} onSwipe={onSwipe} axis={desktop ? "both" : "x"} interactive={false} />
        )}
      </div>
      <div className="mt-9 flex items-center justify-center gap-4">
        <IconButton label="Pass" size="lg" className="size-14" onClick={() => deckRef.current?.swipe("left")} disabled={!top}>
          <X className="size-5" aria-hidden strokeWidth={2.2} />
        </IconButton>
        <IconButton label="Clear it (pretend)" className="size-11 bg-sage-soft text-sage-ink shadow-none hover:bg-sage-soft" onClick={() => deckRef.current?.swipe("up")} disabled={!top}>
          <ArrowUp className="size-5" aria-hidden />
        </IconButton>
        <IconButton label="Give (pretend)" size="lg" className="size-14 bg-gold text-[#16120b] shadow-glow hover:bg-gold" onClick={() => deckRef.current?.swipe("right")} disabled={!top}>
          <HandCoins className="size-5" aria-hidden />
        </IconButton>
      </div>
      <p className="mt-4 text-center text-[13px] text-ink-3">
        Try it — drag the card. {top ? <span className="num">{formatUSD(remainingCents(top.goalCents, top.fundedCents))} would clear {top.firstName}’s debt.</span> : null}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- */

function HowItWorks() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 60%"] });
  const line = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const steps = [
    { icon: X, title: "Swipe left to pass", body: "No guilt, no follow-up emails. They’ll find their Patron; you’ll find your person.", tone: "bg-surface-2 text-ink" },
    { icon: HandCoins, title: "Swipe right to give", body: "Choose $1K, $10K, $100K or anything in between. Watch their bar fill as the coins land.", tone: "bg-gold-soft text-gold-ink" },
    { icon: ArrowUp, title: "Swipe up to clear it", body: "Fund whatever remains in one motion. You’ll be the reason someone opens their mail without dread.", tone: "bg-sage-soft text-sage-ink" },
  ];
  return (
    <section id="how" ref={ref} className="scroll-mt-20 border-t border-line bg-canvas-2/60 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.p {...reveal} className="eyebrow">
          How it works
        </motion.p>
        <motion.h2 {...reveal} className="display mt-4 max-w-3xl text-display-lg text-balance">
          Three gestures. One very good feeling.
        </motion.h2>
        <div className="relative mt-16">
          <div className="absolute top-7 right-[16%] left-[16%] hidden h-px bg-line md:block" aria-hidden>
            <motion.div className="h-full origin-left bg-gold" style={{ scaleX: line }} />
          </div>
          <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
            {steps.map((s, i) => (
              <motion.li key={s.title} {...reveal} transition={{ ...reveal.transition, delay: i * 0.12 }} className="relative md:text-center">
                <span className={cn("relative z-10 grid size-14 place-items-center rounded-full shadow-sm md:mx-auto", s.tone)}>
                  <s.icon className="size-6" aria-hidden />
                </span>
                <h3 className="display mt-6 text-[1.9rem] leading-tight">{s.title}</h3>
                <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2 md:mx-auto md:max-w-xs">{s.body}</p>
              </motion.li>
            ))}
          </ol>
        </div>
        <motion.ul {...reveal} className="mt-16 flex flex-wrap justify-center gap-x-6 gap-y-3 text-[14px] text-ink-2">
          <li className="flex items-center gap-2">
            <Undo2 className="size-4 text-gold-ink" aria-hidden /> Undo any swipe
          </li>
          <li className="flex items-center gap-2">
            <EyeOff className="size-4 text-gold-ink" aria-hidden /> Give anonymously
          </li>
          <li className="flex items-center gap-2">
            <Hourglass className="size-4 text-gold-ink" aria-hidden /> Save for later
          </li>
          <li className="flex items-center gap-2">
            <BadgeCheck className="size-4 text-gold-ink" aria-hidden /> Verified-only filter
          </li>
        </motion.ul>
      </div>
    </section>
  );
}

/** Scroll-linked reveal: each word warms from faint to ink as the statement crosses the viewport. */
function Principle() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 45%"] });
  const text = "Seekers are people with stories, not charity cases. They keep their dignity, their privacy, and the last word on what’s shared.";
  const words = text.split(" ");
  return (
    <section className="mx-auto max-w-5xl px-4 py-28 sm:px-6 sm:py-40">
      <div ref={ref}>
        <p className="display text-display-md leading-[1.15] text-balance sm:text-display-lg">
          {words.map((w, i) => (
            <ScrollWord key={i} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]}>
              {w}
            </ScrollWord>
          ))}
        </p>
      </div>
    </section>
  );
}

function ScrollWord({ children, progress, range }: { children: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.16, 1]);
  return (
    <>
      <motion.span style={{ opacity }}>{children}</motion.span>{" "}
    </>
  );
}

function ForSeekers() {
  const items = [
    { icon: ShieldCheck, title: "First name only", body: "Always. No surnames, no addresses, no employer names." },
    { icon: EyeOff, title: "Blur your photo", body: "Or skip it — a calm generated portrait is the default." },
    { icon: PauseCircle, title: "Pause or close anytime", body: "Your request, your timeline. Gifts received are yours to keep." },
    { icon: BadgeCheck, title: "Verification that respects you", body: "Documents are seen by reviewers only, never by Patrons." },
  ];
  return (
    <section id="seekers" className="scroll-mt-20 border-t border-line py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl gap-14 px-4 sm:px-6 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <motion.p {...reveal} className="eyebrow">
            For Seekers
          </motion.p>
          <motion.h2 {...reveal} className="display mt-4 text-display-lg text-balance">
            Ask for help without asking for pity.
          </motion.h2>
          <motion.p {...reveal} className="mt-6 max-w-md text-[17px] leading-relaxed text-ink-2">
            A five-minute request flow. A live dashboard of every gift. A place to post updates and say thank you, in your own words.
          </motion.p>
          <motion.div {...reveal} className="mt-8">
            <ButtonLink to="/login?role=seeker" variant="outline" size="lg">
              Explore as a Seeker <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </motion.div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((it, i) => (
            <motion.li key={it.title} {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }} className="card-surface p-6">
              <it.icon className="size-5 text-sage-ink" aria-hidden />
              <h3 className="mt-5 text-[16px] font-medium">{it.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{it.body}</p>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Trust() {
  return (
    <section id="trust" className="scroll-mt-20 border-t border-line bg-canvas-2/60 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.p {...reveal} className="eyebrow">
          Trust & safety
        </motion.p>
        <motion.h2 {...reveal} className="display mt-4 max-w-3xl text-display-lg text-balance">
          Quiet on the surface. Rigorous underneath.
        </motion.h2>
        <div className="mt-14 grid gap-3 md:grid-cols-3">
          {[
            { icon: Landmark, title: "A double-entry ledger", body: "Every gift is one atomic transaction. Totals can’t drift and requests can’t be over-funded." },
            { icon: BadgeCheck, title: "Verification states", body: "Unverified → Pending → Verified, visible on every card, filterable in the deck." },
            { icon: ShieldCheck, title: "Reports & rate limits", body: "Every story can be reported. Every endpoint is validated and rate limited." },
          ].map((f, i) => (
            <motion.div key={f.title} {...reveal} transition={{ ...reveal.transition, delay: i * 0.1 }} className="rounded-card bg-surface p-7 shadow-hair">
              <f.icon className="size-5 text-gold-ink" aria-hidden />
              <h3 className="display mt-6 text-[1.6rem] leading-tight">{f.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{f.body}</p>
            </motion.div>
          ))}
        </div>
        <motion.p {...reveal} className="mt-10 max-w-2xl text-[14px] leading-relaxed text-ink-3">
          This is a product demo. No real money moves: gifts are recorded in an internal ledger, and payments run through a documented Stripe
          Connect integration point that is switched off. Every Seeker, Patron and story is fictional.
        </motion.p>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden py-28 sm:py-40">
      <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-3xl" style={{ background: "radial-gradient(closest-side, var(--wf-gold-soft), transparent)" }} />
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <motion.div {...reveal} className="flex justify-center">
          <Mark className="size-12" />
        </motion.div>
        <motion.h2 {...reveal} className="display mt-8 text-display-lg text-balance">
          Somebody’s whole year changes with one swipe.
        </motion.h2>
        <motion.div {...reveal} className="mt-10 flex flex-wrap justify-center gap-3">
          <Magnetic>
            <ButtonLink to="/login?role=patron" size="lg" variant="gold">
              Enter as a Patron
            </ButtonLink>
          </Magnetic>
          <ButtonLink to="/login?role=seeker" size="lg" variant="outline">
            Enter as a Seeker
          </ButtonLink>
        </motion.div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-[13px] text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <Mark className="size-6" />
          <span>Windfall — a design & engineering demo.</span>
        </div>
        <p className="max-w-md">All people, stories, gifts and totals are fictional demo data. No real money is collected or sent.</p>
      </div>
    </footer>
  );
}
