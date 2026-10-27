import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Download, Flame, HeartHandshake, Share2, Sparkles, Trophy } from "lucide-react";
import { m } from "motion/react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CATEGORY_LABELS } from "@shared/domain";
import { formatUSD, formatUSDWhole } from "@shared/money";
import { GivingChart } from "@/components/impact/GivingChart";
import { ImpactMap } from "@/components/impact/ImpactMap";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { Sheet } from "@/components/ui/Sheet";
import { Ticker } from "@/components/ui/Ticker";
import { toast } from "@/lib/toast";
import { reveal } from "@/design/motion";
import { api, type Impact as ImpactData } from "@/lib/api";
import { useDocumentTitle, useMe, useTheme } from "@/lib/hooks";
import { timeAgo } from "@/lib/utils";

export default function Impact() {
  useDocumentTitle("Your impact");
  const q = useQuery({ queryKey: ["impact"], queryFn: api.impact });
  const { data: me } = useMe();
  const [sharing, setSharing] = useState(false);

  if (q.isPending) return <ImpactSkeleton />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const name = me?.user?.anonymousByDefault ? "Anonymous Patron" : (me?.user?.displayName ?? "Patron");

  if (d.totals.giftCount === 0) {
    return (
      <EmptyState
        title="Your impact starts with one swipe"
        body="Give to someone in the deck and this page will fill with the people, places and debts you’ve touched."
        action={
          <ButtonLink to="/discover">Meet someone</ButtonLink>
        }
      />
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Your impact</p>
          <h1 className="display mt-4 text-display-xl text-accent-ink">
            <Ticker value={d.totals.totalCents} format={formatUSDWhole} duration={1.8} />
          </h1>
          <p className="mt-3 text-[16px] text-ink-2">
            given across <span className="num text-ink">{d.totals.giftCount}</span> gifts. Every dollar here is demo money.
          </p>
        </div>
        <Button variant="outline" onClick={() => setSharing(true)}>
          <Share2 className="size-4" aria-hidden /> Share impact card
        </Button>
      </div>

      <section className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Highlights">
        <Stat icon={HeartHandshake} label="People helped" value={d.totals.peopleHelped} />
        <Stat icon={Sparkles} label="Debts fully cleared" value={d.totals.debtsCleared} />
        <Stat icon={Flame} label="Giving streak" value={d.totals.streakWeeks} suffix={d.totals.streakWeeks === 1 ? " week" : " weeks"} />
        <Stat icon={Trophy} label="Generosity Index" value={d.totals.generosityIndex} link="/leaderboard" />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <m.section {...reveal} className="card-surface p-5 sm:p-7" aria-labelledby="over-time">
          <h2 id="over-time" className="display text-[1.7rem]">
            Giving over time
          </h2>
          <p className="mt-1 text-[14px] text-ink-2">Weekly totals, last 26 weeks</p>
          <div className="mt-6">
            <GivingChart series={d.series} />
          </div>
        </m.section>

        <m.section {...reveal} className="card-surface p-5 sm:p-7" aria-labelledby="by-cat">
          <h2 id="by-cat" className="display text-[1.7rem]">
            What you’ve cleared
          </h2>
          <p className="mt-1 text-[14px] text-ink-2">By kind of debt</p>
          <ul className="mt-6 space-y-4">
            {[...d.byCategory]
              .sort((a, b) => b.totalCents - a.totalCents)
              .map((c, i) => {
                const max = Math.max(...d.byCategory.map((x) => x.totalCents));
                return (
                  <li key={c.category}>
                    <div className="flex items-baseline justify-between text-[14px]">
                      <span>{CATEGORY_LABELS[c.category]}</span>
                      <span className="num text-ink-2">{formatUSD(c.totalCents)}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                      <m.div
                        className="h-full origin-left rounded-full bg-chart"
                        initial={{ scaleX: 0 }}
                        whileInView={{ scaleX: c.totalCents / max }}
                        viewport={{ once: true }}
                        transition={{ duration: 1.1, delay: i * 0.08, ease: [0.65, 0, 0.35, 1] }}
                      />
                    </div>
                  </li>
                );
              })}
          </ul>
        </m.section>
      </div>

      <m.section {...reveal} className="card-surface mt-6 p-5 sm:p-7" aria-labelledby="where">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="where" className="display text-[1.7rem]">
            Where your money went
          </h2>
          <p className="text-[14px] text-ink-2">
            <span className="num">{d.places.length}</span> cities · <span className="num">{d.totals.countries}</span> countries
          </p>
        </div>
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_260px]">
          <ImpactMap places={d.places} />
          <ol className="space-y-3 text-[14px]" aria-label="Top places">
            {d.places.slice(0, 6).map((p) => (
              <li key={`${p.city}-${p.countryCode}`} className="flex items-baseline justify-between gap-3 border-b border-line pb-3">
                <span className="min-w-0 truncate">
                  {p.city}, <span className="text-ink-3">{p.country}</span>
                </span>
                <span className="num shrink-0 text-ink-2">{formatUSD(p.totalCents)}</span>
              </li>
            ))}
          </ol>
        </div>
      </m.section>

      <m.section {...reveal} className="mt-12" aria-labelledby="recent">
        <h2 id="recent" className="display text-[1.7rem]">
          Recent gifts
        </h2>
        <ul className="mt-5 divide-y divide-line rounded-tile bg-surface hairline">
          {d.recent.map((g) => (
            <li key={g.giftId}>
              <Link to={`/story/${g.requestId}`} className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:px-5 ring-focus">
                <Avatar seed={g.avatarSeed} name={g.firstName} photoUrl={g.photoUrl} className="size-11 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium">
                    {g.firstName} <span className="font-normal text-ink-3">· {g.country}</span>
                  </p>
                  <p className="text-[13px] text-ink-3">
                    {CATEGORY_LABELS[g.category]} · {timeAgo(g.createdAt)}
                    {g.anonymous && " · anonymous"}
                  </p>
                </div>
                {g.cleared && <Badge tone="positive" className="hidden sm:inline-flex">Cleared</Badge>}
                <span className="num text-[15px] font-medium">{formatUSD(g.amountCents)}</span>
                <ArrowRight className="size-4 text-ink-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </m.section>

      <ShareSheet open={sharing} onOpenChange={setSharing} impact={d} name={name} />
    </main>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  suffix = "",
  link,
}: {
  icon: typeof Flame;
  label: string;
  value: number;
  suffix?: string;
  link?: string;
}) {
  const body = (
    <>
      <Icon className="size-5 text-accent-ink" aria-hidden />
      <p className="display mt-6 text-[2.6rem] leading-none">
        <Ticker value={value} format={(n) => `${n.toLocaleString("en-US")}${suffix}`} />
      </p>
      <p className="mt-2 text-[13.5px] text-ink-2">{label}</p>
    </>
  );
  return link ? (
    <Link to={link} className="card-surface block p-5 transition-transform duration-(--duration-base) hover:-translate-y-0.5 ring-focus">
      {body}
    </Link>
  ) : (
    <div className="card-surface p-5">{body}</div>
  );
}

function ShareSheet({ open, onOpenChange, impact, name }: { open: boolean; onOpenChange: (o: boolean) => void; impact: ImpactData; name: string }) {
  const [theme] = useTheme();
  const [file, setFile] = useState<{ url: string; blob: Blob } | null>(null);

  useEffect(() => {
    if (!open) return;
    let url = "";
    let cancelled = false;
    void import("@/components/impact/shareCard").then(async ({ renderShareCard }) => {
      const blob = await renderShareCard({ name, impact, dark: theme === "dark" });
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setFile({ url, blob });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setFile(null);
    };
  }, [open, impact, name, theme]);

  const share = async () => {
    if (!file) return;
    const f = new File([file.blob], "windfall-impact.png", { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [f] })) {
        await navigator.share({ files: [f], title: "My Windfall impact" });
      } else {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": file.blob })]);
        toast({ message: "Image copied to clipboard", tone: "accent" });
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Your impact card" description="A beautiful summary, ready to share. Generated on your device.">
      <div className="overflow-hidden rounded-tile bg-surface-2 hairline">
        {file ? (
          <img src={file.url} alt={`Impact card: ${formatUSD(impact.totals.totalCents)} given to ${impact.totals.peopleHelped} people`} className="aspect-[4/5] w-full" />
        ) : (
          <Skeleton className="aspect-[4/5] w-full rounded-none" />
        )}
      </div>
      <div className="mt-5 mb-1 flex gap-3">
        <a
          href={file?.url}
          download="windfall-impact.png"
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-medium text-on-ink ring-focus aria-disabled:opacity-50"
          aria-disabled={!file}
        >
          <Download className="size-4" aria-hidden /> Download
        </a>
        <Button variant="outline" className="flex-1" onClick={share} disabled={!file}>
          <Share2 className="size-4" aria-hidden /> Share
        </Button>
      </div>
    </Sheet>
  );
}

function ImpactSkeleton() {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-12 sm:px-6" aria-busy="true" aria-label="Loading your impact">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-5 h-24 w-80 max-w-full" />
      <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36 rounded-card" />
        ))}
      </div>
      <Skeleton className="mt-6 h-80 rounded-card" />
    </main>
  );
}
