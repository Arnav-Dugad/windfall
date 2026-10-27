import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Bookmark, HandCoins, History, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { m } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { CATEGORIES, CATEGORY_LABELS, type RequestCard } from "@shared/domain";
import { formatUSD, remainingCents } from "@shared/money";
import { loadStory } from "@/lib/routes";
import { Celebration } from "@/components/deck/Celebration";
import { FiltersSheet } from "@/components/deck/FiltersSheet";
import { FinishPanel } from "@/components/deck/FinishPanel";
import { HistoryDrawer, type HistoryEntry } from "@/components/deck/HistoryDrawer";
import { PullToRefresh } from "@/components/deck/PullToRefresh";
import { activeFilterCount } from "@/lib/filters";
import { GiveSheet } from "@/components/deck/GiveSheet";
import { SwipeDeck, type SwipeDeckHandle, type SwipeDir } from "@/components/deck/SwipeDeck";
import { preloadEffects } from "@/components/effects";
import { flyCoin } from "@/components/effects/flyCoin";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { toast } from "@/lib/toast";
import { spring } from "@/design/motion";
import { announce } from "@/lib/announce";
import { api, type DeckFilters } from "@/lib/api";
import { useDocumentTitle, useHotkeys, useMe, whenIdle } from "@/lib/hooks";
import { runDueRecurring } from "@/lib/social";
import { cn } from "@/lib/utils";

const DEFAULT_FILTERS: DeckFilters = { sort: "for_you" };
let entrySeq = 0;
let recurringChecked = false;

export default function Discover() {
  useDocumentTitle("Discover");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useMe();
  const deckRef = useRef<SwipeDeckHandle>(null);

  const [filters, setFilters] = useState<DeckFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const deck = useQuery({ queryKey: ["deck", filters], queryFn: () => api.deck(filters), staleTime: Infinity, gcTime: 0 });
  // Returning Patrons see their deck straight from the offline cache while the server answers.
  const cached = useQuery({ queryKey: ["deck-cache", filters], queryFn: () => api.deck(filters, { fromCache: true }), staleTime: Infinity, gcTime: 0, retry: false });

  const [queue, setQueue] = useState<RequestCard[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [returning, setReturning] = useState<{ id: string; from: SwipeDir } | null>(null);
  const [giving, setGiving] = useState<RequestCard | null>(null);
  // "Finish a debt" opens the sheet on the exact amount that clears it (reset whenever the sheet closes).
  const [finishing, setFinishing] = useState(false);
  if (!giving && finishing) setFinishing(false);
  const [celebrate, setCelebrate] = useState<RequestCard | null>(null);

  // The local queue follows the deck (adjusted during render, not in an effect). A cached deck shows first;
  // when the server's arrives, the cards already on screen stay put (with fresh totals) unless they've gone,
  // and nothing the Patron has already decided on comes back.
  const filtersKey = JSON.stringify(filters);
  const [seeded, setSeeded] = useState<{ key: string; from: "cache" | "server"; data: unknown } | null>(null);
  if (deck.data && seeded?.data !== deck.data) {
    const server = deck.data.cards;
    const fromCache = seeded?.key === filtersKey && seeded.from === "cache";
    setSeeded({ key: filtersKey, from: "server", data: deck.data });
    if (fromCache) {
      const decided = new Set(history.map((e) => e.card.id));
      setQueue((q) => {
        const fresh = new Map(server.map((c) => [c.id, c]));
        const keep = q.slice(0, 3).flatMap((c) => fresh.get(c.id) ?? []);
        const kept = new Set(keep.map((c) => c.id));
        return [...keep, ...server.filter((c) => !kept.has(c.id) && !decided.has(c.id))];
      });
    } else setQueue(server);
  } else if (!deck.data && cached.data && seeded?.key !== filtersKey) {
    setSeeded({ key: filtersKey, from: "cache", data: cached.data });
    setQueue(cached.data.cards);
  }
  const showingCache = !deck.data && seeded?.key === filtersKey && seeded.from === "cache";
  const offline = showingCache && !!deck.error;
  useEffect(() => {
    if (offline) toast({ message: "Showing saved stories — Give couldn’t reach the server. Pull down or retry to refresh.", duration: 7000 });
  }, [offline]);

  const record = (e: Omit<HistoryEntry, "key" | "at">) => setHistory((h) => [...h.slice(-19), { ...e, key: `h${++entrySeq}`, at: Date.now() }]);

  const refreshTotals = useCallback(() => {
    for (const key of ["impact", "stats", "leaderboard", "saved", "active-cards", "activity"]) void qc.invalidateQueries({ queryKey: [key] });
  }, [qc]);

  useEffect(() => {
    void loadStory();
    preloadEffects();
    // Recurring pledges run when the Patron opens Give (no server on the free plan). Once per page load,
    // after the deck has had the network to itself.
    if (recurringChecked) return;
    return whenIdle(() => {
      if (recurringChecked) return;
      recurringChecked = true;
      void runDueRecurring()
        .then((ran) => {
          if (!ran.length) return;
          const total = ran.reduce((s, r) => s + r.amountCents, 0);
          toast({
            message: ran.length === 1 ? `Your monthly gift of ${formatUSD(total)} went to ${ran[0]!.name}` : `${ran.length} monthly gifts sent · ${formatUSD(total)}`,
            tone: "positive",
            duration: 7000,
            action: {
              label: "Undo",
              // One at a time: each undo is a leaderboard write, and those are limited to one per second.
              onClick: async () => {
                try {
                  for (const r of ran) await api.reverseGift(r.giftId);
                  toast({ message: ran.length === 1 ? "Monthly gift undone" : "Monthly gifts undone", tone: "accent" });
                } catch (e) {
                  toast({ message: e instanceof Error ? e.message : "Couldn’t undo", tone: "danger" });
                }
                refreshTotals();
              },
            },
          });
          refreshTotals();
        })
        .catch(() => undefined);
    });
  }, [refreshTotals]);

  const putBack = (card: RequestCard, from: SwipeDir) => {
    setQueue((q) => [card, ...q.filter((c) => c.id !== card.id)]);
    setReturning({ id: card.id, from });
  };

  const clearIt = useMutation({
    mutationFn: (card: RequestCard) => api.give({ requestId: card.id, kind: "clear", anonymous: me?.user?.anonymousByDefault ?? false }),
    onSuccess: (r, card) => {
      record({ card, dir: "up", giftId: r.gift.id, amountCents: r.gift.amountCents });
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
      record({ card, dir });
      announce(`Passed on ${card.firstName}.`);
      void api.swipe(card.id, "pass").catch(() => undefined);
    } else if (dir === "down") {
      record({ card, dir });
      announce(`Saved ${card.firstName} for later.`);
      toast({ message: `${card.firstName} saved to Maybe later`, tone: "accent" });
      void api.swipe(card.id, "save").then(() => qc.invalidateQueries({ queryKey: ["saved"] }));
    } else if (dir === "right") {
      // The Give stamp turns into a coin that lands in the sheet's progress bar.
      const stamp = document.querySelector<HTMLElement>('[data-stamp="give"]')?.getBoundingClientRect();
      if (stamp && stamp.width) flyCoin({ x: stamp.left + stamp.width / 2, y: stamp.top + stamp.height / 2 }, { delay: 120, size: 34 });
      setGiving(card);
    } else {
      clearIt.mutate(card);
    }
  };

  const undoEntry = async (entry: HistoryEntry) => {
    setHistory((h) => h.filter((e) => e.key !== entry.key));
    try {
      let card = entry.card;
      if (entry.giftId) {
        const r = await api.reverseGift(entry.giftId);
        if (r.request) card = r.request;
        refreshTotals();
        putBack(card, entry.dir);
      } else {
        // Passes and saves come back instantly; the swipe record is removed in the background.
        putBack(card, entry.dir);
        void api
          .unswipe(card.id)
          .then(() => {
            if (entry.dir === "down") void qc.invalidateQueries({ queryKey: ["saved"] });
          })
          .catch(() => toast({ message: "Couldn’t sync that undo — it may reappear later", tone: "danger" }));
      }
      announce(`Undid. ${card.firstName} is back on top.`);
    } catch (err) {
      setHistory((h) => [...h, entry].sort((a, b) => a.at - b.at));
      toast({ message: err instanceof Error ? err.message : "Couldn’t undo", tone: "danger" });
    }
  };
  const undo = () => {
    const last = history.at(-1);
    if (!last) return toast({ message: "Nothing to undo yet" });
    void undoEntry(last);
  };

  // Pull-to-refresh keeps the history: gifts in it may still be inside their undo window.
  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["active-cards"] });
    await deck.refetch();
  }, [deck, qc]);

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
      z: undo,
      h: () => setHistoryOpen(true),
      " ": () => top && openStory(top),
    },
    !busy && !historyOpen,
  );

  const filterCount = activeFilterCount(filters);
  const seen = new Set(history.map((e) => e.card.id));

  return (
    <main className="mx-auto flex max-w-6xl flex-col px-4 sm:px-6">
      <h1 className="sr-only">Discover stories</h1>
      <PullToRefresh onRefresh={refresh} />

      {/* Category rail + filters */}
      <div data-no-ptr className="sticky top-14 z-30 -mx-4 flex items-center gap-2 bg-canvas/75 px-4 py-2.5 backdrop-blur-xl backdrop-saturate-150 sm:-mx-6 sm:px-6">
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
                  "press relative h-9 shrink-0 rounded-full px-4 text-[13.5px] font-medium transition-colors ring-focus",
                  active ? "text-on-ink" : "text-ink-2 hover:text-ink",
                )}
              >
                {active && <m.span layoutId="cat-pill" transition={spring.snappy} className="absolute inset-0 rounded-full bg-ink" />}
                {!active && <span className="absolute inset-0 rounded-full bg-fill" />}
                <span className="relative">{c ? CATEGORY_LABELS[c] : "Everyone"}</span>
              </button>
            );
          })}
        </div>
        <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)} aria-label={`Filters${filterCount ? `, ${filterCount} active` : ""}`}>
          <SlidersHorizontal className="size-4" aria-hidden />
          <span className="hidden sm:inline">Filters</span>
          {filterCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-accent text-[11px] text-white num">{filterCount}</span>}
        </Button>
      </div>

      <div className="grid flex-1 items-start gap-10 pt-2 pb-6 lg:grid-cols-[1fr_minmax(0,420px)_1fr] lg:pt-6">
        <aside className="hidden lg:block" aria-hidden>
          {next && (
            <m.div key={next.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }} className="sticky top-36 max-w-60 pt-10">
              <p className="eyebrow">Up next</p>
              <p className="mt-3 text-[15px] font-medium">
                {next.firstName} · <span className="font-normal text-ink-2">{next.city}</span>
              </p>
              <p className="display mt-2 text-[1.75rem] leading-tight text-balance">“{next.headline}”</p>
              <p className="mt-4 text-[14px] text-ink-2 num">{formatUSD(remainingCents(next.goalCents, next.fundedCents))} would clear it.</p>
            </m.div>
          )}
        </aside>

        <section aria-label="Story deck" className="mx-auto w-full max-w-[420px]">
          <div className="relative h-[clamp(400px,calc(100dvh-330px),580px)] w-full md:h-[clamp(460px,calc(100dvh-290px),600px)]">
            {deck.isPending && !showingCache ? (
              <Skeleton className="absolute inset-0 rounded-card" />
            ) : deck.error && !showingCache ? (
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
                        <Button variant="outline" onClick={() => setFilters(DEFAULT_FILTERS)}>
                          Clear filters
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={async () => {
                            try {
                              await api.resetDeck();
                              setHistory([]);
                              void deck.refetch();
                            } catch (e) {
                              toast({ message: e instanceof Error ? e.message : "Couldn’t bring them back — try again", tone: "danger" });
                            }
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
          <div className="mt-8 flex items-center justify-center gap-3 sm:gap-4">
            <IconButton label="Recent decisions (H)" size="sm" onClick={() => setHistoryOpen(true)} className="relative">
              <History className="size-4" aria-hidden />
              {history.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-accent px-1 text-[10.5px] font-semibold text-white num">{history.length}</span>
              )}
            </IconButton>
            <IconButton label="Pass (←)" size="lg" disabled={!top || busy} onClick={() => deckRef.current?.swipe("left")} className="size-16">
              <X className="size-6" aria-hidden strokeWidth={2.2} />
            </IconButton>
            <IconButton
              label="Clear it — fund the full amount (↑)"
              disabled={!top || busy}
              onClick={() => deckRef.current?.swipe("up")}
              className="size-12 bg-positive-soft text-positive-ink shadow-none hover:bg-positive-soft hover:brightness-95"
            >
              <ArrowUp className="size-5" aria-hidden strokeWidth={2.2} />
            </IconButton>
            <IconButton
              label="Give (→)"
              size="lg"
              disabled={!top || busy}
              onClick={() => deckRef.current?.swipe("right")}
              className="size-16 bg-accent text-white shadow-glow hover:bg-accent hover:brightness-110"
            >
              <HandCoins className="size-6" aria-hidden strokeWidth={2} />
            </IconButton>
            <IconButton label="Maybe later (S)" size="sm" disabled={!top || busy} onClick={() => deckRef.current?.swipe("down")}>
              <Bookmark className="size-4" aria-hidden />
            </IconButton>
          </div>
          <KeyboardHints />
        </section>

        <aside className="lg:sticky lg:top-36 lg:pt-10" aria-label="Finish a debt">
          <div className="mx-auto max-w-[420px] lg:max-w-72">
            <FinishPanel
              onFinish={(c) => {
                setFinishing(true);
                setGiving(c);
              }}
              onOpen={openStory}
              excludeIds={seen}
            />
          </div>
        </aside>
      </div>

      <FiltersSheet open={filtersOpen} onOpenChange={setFiltersOpen} filters={filters} onApply={setFilters} />
      <HistoryDrawer open={historyOpen} onOpenChange={setHistoryOpen} history={history} onUndo={(e) => void undoEntry(e)} />

      <GiveSheet
        card={giving}
        open={!!giving}
        suggestedCents={finishing && giving ? remainingCents(giving.goalCents, giving.fundedCents) : undefined}
        anonymousDefault={me?.user?.anonymousByDefault ?? false}
        onCancel={() => {
          // Cards opened from the "Finish a debt" panel weren't in the queue; only deck cards go back.
          if (giving && (deck.data ?? cached.data)?.cards.some((c) => c.id === giving.id)) putBack(giving, "right");
          setGiving(null);
        }}
        onGiven={(r) => {
          if (!giving) return;
          setQueue((q) => q.filter((c) => c.id !== giving.id));
          record({ card: giving, dir: r.cleared ? "up" : "right", giftId: r.gift.id, amountCents: r.gift.amountCents });
          refreshTotals();
          if (r.cleared) {
            setGiving(null);
            setCelebrate(r.request);
          }
        }}
        onDone={() => setGiving(null)}
        onUndone={(giftId, request) => {
          const entry = history.find((e) => e.giftId === giftId);
          setHistory((h) => h.filter((e) => e.giftId !== giftId));
          const card = request ?? entry?.card;
          if (card && (deck.data ?? cached.data)?.cards.some((c) => c.id === card.id)) putBack(card, "right");
          refreshTotals();
        }}
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
    ["H", "History"],
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
