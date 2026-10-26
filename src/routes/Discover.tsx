import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Bookmark, HandCoins, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { CATEGORIES, CATEGORY_LABELS, type RequestCard } from "@shared/domain";
import { formatUSD, remainingCents } from "@shared/money";
import { loadStory } from "@/lib/routes";
import { Celebration } from "@/components/deck/Celebration";
import { FiltersSheet } from "@/components/deck/FiltersSheet";
import { activeFilterCount } from "@/lib/filters";
import { GiveSheet } from "@/components/deck/GiveSheet";
import { SwipeDeck, type SwipeDeckHandle, type SwipeDir } from "@/components/deck/SwipeDeck";
import { preloadEffects } from "@/components/effects";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { toast } from "@/lib/toast";
import { spring } from "@/design/motion";
import { announce } from "@/lib/announce";
import { api, type DeckFilters } from "@/lib/api";
import { useDocumentTitle, useHotkeys, useMe } from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface HistoryEntry {
  card: RequestCard;
  dir: SwipeDir;
  giftId?: string;
}

export default function Discover() {
  useDocumentTitle("Discover");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useMe();
  const deckRef = useRef<SwipeDeckHandle>(null);

  const [filters, setFilters] = useState<DeckFilters>({ sort: "newest" });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const deck = useQuery({ queryKey: ["deck", filters], queryFn: () => api.deck(filters), staleTime: Infinity, gcTime: 0 });

  const [queue, setQueue] = useState<RequestCard[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [returning, setReturning] = useState<{ id: string; from: SwipeDir } | null>(null);
  const [giving, setGiving] = useState<RequestCard | null>(null);
  const [celebrate, setCelebrate] = useState<RequestCard | null>(null);

  // A fresh deck response replaces the local queue (adjusted during render, not in an effect).
  const [seenDeck, setSeenDeck] = useState(deck.data);
  if (deck.data && deck.data !== seenDeck) {
    setSeenDeck(deck.data);
    setQueue(deck.data.cards);
  }

  useEffect(() => {
    void loadStory();
    preloadEffects();
  }, []);

  const refreshTotals = () => {
    void qc.invalidateQueries({ queryKey: ["impact"] });
    void qc.invalidateQueries({ queryKey: ["stats"] });
    void qc.invalidateQueries({ queryKey: ["leaderboard"] });
    void qc.invalidateQueries({ queryKey: ["saved"] });
  };

  const putBack = (card: RequestCard, from: SwipeDir) => {
    setQueue((q) => [card, ...q.filter((c) => c.id !== card.id)]);
    setReturning({ id: card.id, from });
  };

  const clearIt = useMutation({
    mutationFn: (card: RequestCard) => api.give({ requestId: card.id, kind: "clear", anonymous: me?.user?.anonymousByDefault ?? false }),
    onSuccess: (r, card) => {
      setHistory((h) => [...h, { card, dir: "up", giftId: r.gift.id }]);
      announce(`You cleared ${card.firstName}’s debt with ${formatUSD(r.gift.amountCents)}.`);
      setCelebrate(r.request);
      refreshTotals();
    },
    onError: (err, card) => {
      toast({ message: err.message, tone: "danger" });
      putBack(card, "up");
    },
  });

  const onSwipe = (card: RequestCard, dir: SwipeDir) => {
    setReturning(null);
    setQueue((q) => q.filter((c) => c.id !== card.id));
    if (dir === "left") {
      setHistory((h) => [...h, { card, dir }]);
      announce(`Passed on ${card.firstName}.`);
      void api.swipe(card.id, "pass").catch(() => undefined);
    } else if (dir === "down") {
      setHistory((h) => [...h, { card, dir }]);
      announce(`Saved ${card.firstName} for later.`);
      toast({ message: `${card.firstName} saved to Maybe later`, tone: "gold" });
      void api.swipe(card.id, "save").then(() => qc.invalidateQueries({ queryKey: ["saved"] }));
    } else if (dir === "right") {
      setGiving(card);
    } else {
      clearIt.mutate(card);
    }
  };

  const undo = async () => {
    const last = history.at(-1);
    if (!last) {
      toast({ message: "Nothing to undo yet" });
      return;
    }
    setHistory((h) => h.slice(0, -1));
    try {
      let card = last.card;
      if (last.giftId) {
        const r = await api.reverseGift(last.giftId);
        if (r.request) card = r.request;
        refreshTotals();
      } else {
        await api.unswipe(card.id);
      }
      putBack(card, last.dir);
      announce(`Undid. ${card.firstName} is back on top.`);
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Couldn’t undo", tone: "danger" });
    }
  };

  const openStory = (card: RequestCard) => navigate(`/story/${card.id}`, { state: { background: location, card } });
  const top = queue[0];
  const next = queue[1];
  const busy = !!giving || !!celebrate;

  useHotkeys(
    {
      ArrowLeft: () => deckRef.current?.swipe("left"),
      ArrowRight: () => deckRef.current?.swipe("right"),
      ArrowUp: () => deckRef.current?.swipe("up"),
      s: () => deckRef.current?.swipe("down"),
      z: () => void undo(),
      " ": () => top && openStory(top),
    },
    !busy,
  );

  const filterCount = activeFilterCount(filters);

  return (
    <main className="mx-auto flex max-w-6xl flex-col px-4 sm:px-6">
      <h1 className="sr-only">Discover stories</h1>

      {/* Category rail + filters */}
      <div className="sticky top-16 z-30 -mx-4 flex items-center gap-2 bg-canvas/80 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="no-scrollbar -my-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1" role="tablist" aria-label="Category">
          {[undefined, ...CATEGORIES].map((c) => {
            const active = filters.category === c;
            return (
              <button
                key={c ?? "all"}
                role="tab"
                aria-selected={active}
                onClick={() => setFilters((f) => ({ ...f, category: c }))}
                className={cn(
                  "relative h-9 shrink-0 rounded-full px-4 text-[13.5px] font-medium transition-colors ring-focus",
                  active ? "text-on-ink" : "text-ink-2 hover:text-ink",
                )}
              >
                {active && <motion.span layoutId="cat-pill" transition={spring.snappy} className="absolute inset-0 rounded-full bg-ink" />}
                {!active && <span className="absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_var(--wf-line)]" />}
                <span className="relative">{c ? CATEGORY_LABELS[c] : "Everyone"}</span>
              </button>
            );
          })}
        </div>
        <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)} aria-label={`Filters${filterCount ? `, ${filterCount} active` : ""}`}>
          <SlidersHorizontal className="size-4" aria-hidden />
          <span className="hidden sm:inline">Filters</span>
          {filterCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-gold text-[11px] text-[#16120b] num">{filterCount}</span>}
        </Button>
      </div>

      <div className="grid flex-1 items-start gap-10 pt-2 pb-6 lg:grid-cols-[1fr_minmax(0,420px)_1fr] lg:pt-6">
        <aside className="hidden lg:block" aria-hidden>
          {next && (
            <motion.div key={next.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }} className="sticky top-40 max-w-60 pt-10">
              <p className="eyebrow">Up next</p>
              <p className="mt-3 text-[15px] font-medium">
                {next.firstName} · <span className="font-normal text-ink-2">{next.city}</span>
              </p>
              <p className="display mt-2 text-[1.75rem] leading-tight text-balance">“{next.headline}”</p>
              <p className="mt-4 text-[14px] text-ink-2 num">{formatUSD(remainingCents(next.goalCents, next.fundedCents))} would clear it.</p>
            </motion.div>
          )}
        </aside>

        <section aria-label="Story deck" className="mx-auto w-full max-w-[420px]">
          <div className="relative h-[clamp(400px,calc(100dvh-340px),580px)] w-full md:h-[clamp(460px,calc(100dvh-300px),600px)]">
            {deck.isPending ? (
              <Skeleton className="absolute inset-0 rounded-card" />
            ) : deck.error ? (
              <ErrorState error={deck.error} onRetry={() => deck.refetch()} />
            ) : (
              <SwipeDeck
                ref={deckRef}
                cards={queue}
                returning={returning}
                onSwipe={onSwipe}
                onOpen={openStory}
                empty={
                  <EmptyState
                    title={filterCount ? "No one matches those filters" : "You’ve met everyone, for now"}
                    body={
                      filterCount
                        ? "Try widening the range or another category."
                        : "New stories arrive every day. You can also revisit the people you passed."
                    }
                    action={
                      filterCount ? (
                        <Button variant="outline" onClick={() => setFilters({ sort: "newest" })}>
                          Clear filters
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={async () => {
                            await api.resetDeck();
                            setHistory([]);
                            void deck.refetch();
                          }}
                        >
                          <RotateCcw className="size-4" aria-hidden /> Show passed stories again
                        </Button>
                      )
                    }
                  />
                }
              />
            )}
          </div>

          {/* Visible equivalents for every gesture */}
          <div className="mt-9 flex items-center justify-center gap-3 sm:gap-4">
            <IconButton label="Undo last swipe (Z)" size="sm" onClick={() => void undo()} disabled={history.length === 0}>
              <RotateCcw className="size-4" aria-hidden />
            </IconButton>
            <IconButton label="Pass (←)" size="lg" disabled={!top || busy} onClick={() => deckRef.current?.swipe("left")} className="size-16">
              <X className="size-6" aria-hidden strokeWidth={2.2} />
            </IconButton>
            <IconButton
              label="Clear it — fund the full amount (↑)"
              disabled={!top || busy}
              onClick={() => deckRef.current?.swipe("up")}
              className="size-12 bg-sage-soft text-sage-ink shadow-none hover:bg-sage-soft hover:brightness-95"
            >
              <ArrowUp className="size-5" aria-hidden strokeWidth={2.2} />
            </IconButton>
            <IconButton
              label="Give (→)"
              size="lg"
              disabled={!top || busy}
              onClick={() => deckRef.current?.swipe("right")}
              className="size-16 bg-gold text-[#16120b] shadow-glow hover:bg-gold hover:brightness-105"
            >
              <HandCoins className="size-6" aria-hidden strokeWidth={2} />
            </IconButton>
            <IconButton label="Maybe later (S)" size="sm" disabled={!top || busy} onClick={() => deckRef.current?.swipe("down")}>
              <Bookmark className="size-4" aria-hidden />
            </IconButton>
          </div>
          <KeyboardHints />
        </section>

        <aside className="hidden lg:block" />
      </div>

      <FiltersSheet open={filtersOpen} onOpenChange={setFiltersOpen} filters={filters} onApply={setFilters} />

      <GiveSheet
        card={giving}
        open={!!giving}
        anonymousDefault={me?.user?.anonymousByDefault ?? false}
        onCancel={() => {
          if (giving) putBack(giving, "right");
          setGiving(null);
        }}
        onGiven={(r) => {
          if (!giving) return;
          setHistory((h) => [...h, { card: giving, dir: "right", giftId: r.gift.id }]);
          refreshTotals();
          if (r.cleared) {
            setGiving(null);
            setCelebrate(r.request);
          }
        }}
        onDone={() => setGiving(null)}
      />

      <Celebration
        card={celebrate}
        onClose={() => setCelebrate(null)}
        onViewStory={(c) => {
          setCelebrate(null);
          navigate(`/story/${c.id}`);
        }}
      />
    </main>
  );
}

function KeyboardHints() {
  const hints: [string, string][] = [
    ["←", "Pass"],
    ["→", "Give"],
    ["↑", "Clear it"],
    ["Z", "Undo"],
    ["Space", "Details"],
  ];
  return (
    <ul className="mt-6 hidden flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[12.5px] text-ink-3 md:pointer-fine:flex" aria-label="Keyboard shortcuts">
      {hints.map(([k, l]) => (
        <li key={k} className="flex items-center gap-1.5">
          <kbd className="inline-grid h-6 min-w-6 place-items-center rounded-md bg-surface px-1.5 font-sans text-[11.5px] text-ink-2 shadow-sm hairline">{k}</kbd>
          {l}
        </li>
      ))}
    </ul>
  );
}
