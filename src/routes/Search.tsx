import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon, Sparkles, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useDeferredValue, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import { parseQuery, searchCards } from "@shared/search";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { LargeTitle } from "@/components/ui/LargeTitle";
import { PersonTile } from "@/components/ui/PersonTile";
import { spring } from "@/design/motion";
import { useDocumentTitle } from "@/lib/hooks";
import { activeCards } from "@/lib/social";
import { useOpenStory } from "@/lib/useOpenStory";

const EXAMPLES = ["nurses in Kenya under $5K", "verified medical bills", "small businesses close to cleared", "student loans in the Philippines", "rent arrears under $3,000"];

/** Natural-language search, parsed on-device into filters you can see (and remove) as chips. */
export default function Search() {
  useDocumentTitle("Search");
  const [params, setParams] = useSearchParams();
  const text = params.get("q") ?? "";
  const deferred = useDeferredValue(text);
  const input = useRef<HTMLInputElement>(null);
  const openStory = useOpenStory();
  const cards = useQuery({ queryKey: ["active-cards"], queryFn: activeCards, staleTime: 30_000 });

  const parsed = useMemo(() => parseQuery(deferred), [deferred]);
  // Strict first; if nothing matches, relax the free-text words, then the amount, and say so.
  const { results, relaxed } = useMemo(() => {
    if (!cards.data || !deferred.trim()) return { results: [], relaxed: false };
    const strict = searchCards(cards.data, parsed);
    if (strict.length) return { results: strict, relaxed: false };
    const looser = searchCards(cards.data, { ...parsed, terms: [] });
    const any = looser.length || !(parsed.countryCodes.length || parsed.category) ? looser : searchCards(cards.data, { ...parsed, terms: [], maxCents: undefined, minCents: undefined });
    return { results: any, relaxed: true };
  }, [cards.data, parsed, deferred]);
  const set = (q: string) => setParams(q ? { q } : {}, { replace: true });

  return (
    <main className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
      <LargeTitle title="Search" subtitle="Describe who you’d like to help, in your own words." />

      <div className="sticky top-14 z-20 -mx-4 bg-canvas/75 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 sm:-mx-6 sm:px-6">
        <div className="glass-thick flex h-13 items-center gap-2.5 rounded-full px-4 shadow-card">
          <SearchIcon className="size-[18px] shrink-0 text-ink-3" aria-hidden />
          <input
            ref={input}
            type="search"
            value={text}
            onChange={(e) => set(e.target.value)}
            placeholder="Try “nurses in Kenya under $5K”"
            aria-label="Search stories"
            autoFocus
            enterKeyHint="search"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
          />
          {text && (
            <button onClick={() => (set(""), input.current?.focus())} className="press grid size-7 place-items-center rounded-full bg-fill-2 ring-focus" aria-label="Clear search">
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
        <AnimatePresence initial={false}>
          {parsed.chips.length > 0 && (
            <m.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-1.5 pt-3" aria-label="Understood as">
                <Sparkles className="size-3.5 text-accent" aria-hidden />
                {parsed.chips.map((c) => (
                  <m.span key={c} layout initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.snappy} className="rounded-full bg-accent-soft px-2.5 py-1 text-[12.5px] font-semibold text-accent-ink">
                    {c}
                  </m.span>
                ))}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {!text.trim() ? (
        <section className="mt-6" aria-labelledby="try-h">
          <h2 id="try-h" className="eyebrow mb-3">
            Try
          </h2>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => set(e)} className="press rounded-full bg-fill px-4 py-2 text-[14px] font-medium text-ink-2 transition-colors hover:text-ink ring-focus">
                {e}
              </button>
            ))}
          </div>
        </section>
      ) : cards.isPending ? (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/5] rounded-[26px]" />
          ))}
        </ul>
      ) : cards.error ? (
        <ErrorState error={cards.error} onRetry={() => cards.refetch()} />
      ) : results.length === 0 ? (
        <EmptyState title="No one matches that yet" body="Try fewer words, a wider amount, or another country." />
      ) : (
        <>
          <p className="mt-5 mb-3 text-[13px] text-ink-3" aria-live="polite">
            {relaxed ? "No exact matches — here are the closest. " : ""}
            {results.length} {results.length === 1 ? "person" : "people"}
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {results.slice(0, 48).map((c, i) => (
              <PersonTile key={c.id} card={c} index={i} onOpen={openStory} />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
