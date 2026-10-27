import { useQuery } from "@tanstack/react-query";
import { Share, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { CATEGORY_LABELS } from "@shared/domain";
import { countryCentroid } from "@shared/geo";
import { formatUSD } from "@shared/money";
import { fxConfetti } from "@/components/effects";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Feedback";
import { Ticker } from "@/components/ui/Ticker";
import { ease } from "@/design/motion";
import { useDocumentTitle, useMe } from "@/lib/hooks";
import { shareLink } from "@/lib/share";
import { wrapped, type Wrapped as WrappedT } from "@/lib/social";
import { prefersReducedMotion } from "@/lib/utils";

const YEAR = new Date().getFullYear();

const SLIDE_MS = 5200;

interface Slide {
  key: string;
  bg: string;
  body: ReactNode;
}

/** Year in review, told as full-screen story slides (tap or arrow keys to move, hold to pause). */
export default function Wrapped() {
  const year = YEAR;
  useDocumentTitle(`${year} Wrapped`);
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ["wrapped", year], queryFn: () => wrapped(year), staleTime: 5 * 60_000 });

  return (
    <main className="fixed inset-0 z-50 bg-black text-white">
      {q.isPending ? (
        <div className="grid size-full place-items-center">
          <div className="size-10 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-label="Loading" />
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} className="text-white" />
      ) : (
        <Stories data={q.data} name={me?.user?.displayName ?? "you"} />
      )}
    </main>
  );
}

function slidesFor(w: WrappedT, name: string): Slide[] {
  if (w.giftCount === 0)
    return [
      {
        key: "empty",
        bg: "radial-gradient(120% 80% at 20% 10%, #0a84ff 0%, #1c1c1e 60%)",
        body: (
          <>
            <Big>Your {w.year} story starts with one swipe.</Big>
            <Small>Give to someone this year and come back for your Wrapped.</Small>
            <ButtonLink to="/discover" size="lg" className="mt-8 bg-white text-black">
              Discover stories
            </ButtonLink>
          </>
        ),
      },
    ];
  const countries = w.countries.map((c) => countryCentroid(c)?.name ?? c);
  const s: Slide[] = [
    {
      key: "intro",
      bg: "radial-gradient(120% 90% at 10% 0%, #5e5ce6 0%, #0a84ff 35%, #000 80%)",
      body: (
        <>
          <Eyebrow>Give · {w.year} Wrapped</Eyebrow>
          <Big>{name}, this was your year of giving.</Big>
          <Small>Let’s look back at who you showed up for.</Small>
        </>
      ),
    },
    {
      key: "total",
      bg: "radial-gradient(120% 90% at 80% 10%, #30d158 0%, #0b3d1f 50%, #000 90%)",
      body: (
        <>
          <Eyebrow>You gave</Eyebrow>
          <p className="text-[clamp(3.5rem,16vw,7rem)] leading-none font-bold tracking-[-0.04em] num">
            <Ticker value={w.totalCents} format={(v) => formatUSD(Math.round(v / 100) * 100)} duration={1.6} />
          </p>
          <Small>
            across {w.giftCount} {w.giftCount === 1 ? "gift" : "gifts"}
            {w.firstGiftAt ? `, starting ${new Date(w.firstGiftAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}` : ""}.
          </Small>
        </>
      ),
    },
    {
      key: "people",
      bg: "radial-gradient(120% 90% at 50% 100%, #ff375f 0%, #3a0a18 55%, #000 90%)",
      body: (
        <>
          <Eyebrow>You helped</Eyebrow>
          <Big>
            {w.people} {w.people === 1 ? "person" : "people"}
            {w.cleared > 0 && (
              <>
                , and cleared {w.cleared === 1 ? "a debt" : `${w.cleared} debts`} completely
              </>
            )}
            .
          </Big>
          <ul className="mt-8 grid grid-cols-6 gap-1.5" aria-label="People you helped">
            {w.faces.slice(0, 18).map((f, i) => (
              <m.li key={i} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 + i * 0.05, duration: 0.5, ease: ease.outExpo }}>
                <Avatar seed={f.avatarSeed} name={f.name} photoUrl={f.photoUrl} shape="card" className="aspect-square w-full rounded-[12px]" />
              </m.li>
            ))}
          </ul>
        </>
      ),
    },
  ];
  if (countries.length)
    s.push({
      key: "world",
      bg: "radial-gradient(120% 90% at 0% 50%, #64d2ff 0%, #0a3a52 50%, #000 90%)",
      body: (
        <>
          <Eyebrow>Your generosity travelled to</Eyebrow>
          <Big>
            {countries.length} {countries.length === 1 ? "country" : "countries"}
          </Big>
          <ul className="mt-6 flex flex-wrap gap-2">
            {countries.slice(0, 12).map((c, i) => (
              <m.li key={c} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.06 }} className="rounded-full bg-white/15 px-3.5 py-1.5 text-[15px] font-medium backdrop-blur">
                {c}
              </m.li>
            ))}
          </ul>
        </>
      ),
    });
  if (w.topCategory)
    s.push({
      key: "cause",
      bg: "radial-gradient(120% 90% at 100% 100%, #ff9f0a 0%, #4a2a00 55%, #000 90%)",
      body: (
        <>
          <Eyebrow>The cause closest to your heart</Eyebrow>
          <Big>{CATEGORY_LABELS[w.topCategory]}</Big>
          {w.busiestMonth && <Small>You gave most in {w.busiestMonth}.</Small>}
        </>
      ),
    });
  if (w.biggest)
    s.push({
      key: "biggest",
      bg: "radial-gradient(120% 90% at 50% 0%, #bf5af2 0%, #2c0b3a 55%, #000 90%)",
      body: (
        <>
          <Eyebrow>Your biggest single gift</Eyebrow>
          <div className="mt-2 flex items-center gap-4">
            <Avatar seed={w.biggest.name} name={w.biggest.name} photoUrl={w.biggest.photoUrl} shape="card" className="size-24 rounded-[24px] ring-1 ring-white/20" />
            <div>
              <p className="text-[clamp(2.5rem,11vw,4.5rem)] leading-none font-bold tracking-[-0.03em] num">{formatUSD(w.biggest.amountCents)}</p>
              <p className="mt-2 text-[17px] text-white/80">
                to {w.biggest.name} in {w.biggest.city}
              </p>
            </div>
          </div>
        </>
      ),
    });
  s.push({
    key: "outro",
    bg: "radial-gradient(130% 100% at 50% 0%, #0a84ff 0%, #30d158 45%, #000 95%)",
    body: (
      <>
        <Eyebrow>{w.year}, wrapped</Eyebrow>
        <Big>Thank you for giving.</Big>
        <Small>Every gift on Give is a person who sleeps a little easier.</Small>
        <div className="mt-8 flex flex-wrap gap-2.5" data-interactive>
          <Button size="lg" className="bg-white text-black hover:bg-white" onClick={() => void shareLink("/wrapped", `My ${w.year} on Give`, `I helped ${w.people} people with ${formatUSD(w.totalCents)} on Give this year.`)}>
            <Share className="size-4" aria-hidden /> Share
          </Button>
          <ButtonLink to="/impact" size="lg" variant="glass">
            See my impact
          </ButtonLink>
        </div>
      </>
    ),
  });
  return s;
}

function Stories({ data, name }: { data: WrappedT; name: string }) {
  const navigate = useNavigate();
  const slides = slidesFor(data, name.split(" ")[0] ?? name);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const last = i === slides.length - 1;
  // Auto-advance is driven by the progress bar's CSS animation, so press-and-hold pauses both together.
  const [auto] = useState(() => !prefersReducedMotion());

  const go = useCallback((d: number) => setI((v) => Math.max(0, Math.min(slides.length - 1, v + d))), [slides.length]);

  useEffect(() => {
    if (last && data.giftCount > 0) void fxConfetti();
  }, [last, data.giftCount]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") navigate("/impact");
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [go, navigate]);

  const slide = slides[i]!;
  return (
    <div
      className="relative size-full overflow-hidden select-none"
      onPointerDown={() => setPaused(true)}
      onPointerUp={(e) => {
        setPaused(false);
        if ((e.target as HTMLElement).closest("a,button,[data-interactive]")) return;
        go(e.clientX < window.innerWidth / 3 ? -1 : 1);
      }}
      onPointerCancel={() => setPaused(false)}
    >
      <AnimatePresence initial={false}>
        <m.div key={slide.key} className="absolute inset-0" style={{ background: slide.bg }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} aria-hidden />
      </AnimatePresence>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_120%,rgba(255,255,255,0.08),transparent)]" aria-hidden />

      {/* Segmented progress, like Stories */}
      <div className="absolute inset-x-0 top-0 z-10 flex gap-1 px-3 pt-[max(env(safe-area-inset-top),12px)]">
        {slides.map((s, n) => (
          <div key={s.key} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            <div
              key={n === i ? `on-${i}` : "off"}
              className="h-full origin-left bg-white"
              style={
                n === i && auto && !last
                  ? { animation: `wrapped-fill ${SLIDE_MS}ms linear forwards`, animationPlayState: paused ? "paused" : "running" }
                  : { transform: `scaleX(${n <= i ? 1 : 0})` }
              }
              onAnimationEnd={() => go(1)}
            />
          </div>
        ))}
      </div>
      <Link to="/impact" className="absolute top-[max(calc(env(safe-area-inset-top)+20px),28px)] right-3 z-10 grid size-10 place-items-center rounded-full bg-white/15 backdrop-blur ring-focus" aria-label="Close Wrapped">
        <X className="size-5" aria-hidden />
      </Link>

      <AnimatePresence mode="wait">
        <m.section
          key={slide.key}
          initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -16, filter: "blur(6px)" }}
          transition={{ duration: 0.6, ease: ease.outExpo }}
          className="relative mx-auto flex size-full max-w-xl flex-col justify-center px-7 pb-16"
          aria-live="polite"
        >
          {slide.body}
        </m.section>
      </AnimatePresence>
      <p className="sr-only">
        Slide {i + 1} of {slides.length}. Use the arrow keys to move between slides.
      </p>
    </div>
  );
}

const Eyebrow = ({ children }: { children: ReactNode }) => <p className="mb-3 text-[13px] font-semibold tracking-[0.08em] text-white/70 uppercase">{children}</p>;
const Big = ({ children }: { children: ReactNode }) => <h2 className="text-[clamp(2.2rem,9vw,3.6rem)] leading-[1.03] font-bold tracking-[-0.035em] text-balance">{children}</h2>;
const Small = ({ children }: { children: ReactNode }) => <p className="mt-4 text-[18px] leading-snug text-white/80 text-pretty">{children}</p>;
