// Roster portraits ship in two sizes: /people/<hash>.webp (600×750) and /people/s/<hash>.webp (240×300).
// Seeker uploads (data URLs) only have one.

const ROSTER = /^\/people\/([a-f0-9]+)\.webp$/;

/** The small variant of a roster portrait, or the original for anything else. */
export function thumbUrl(url: string): string {
  const m = ROSTER.exec(url);
  return m ? `/people/s/${m[1]}.webp` : url;
}

/** srcset for a roster portrait (undefined for uploads, which have a single size). */
export function portraitSrcSet(url: string): string | undefined {
  const m = ROSTER.exec(url);
  return m ? `/people/s/${m[1]}.webp 240w, ${url} 600w` : undefined;
}

const warmed = new Set<string>();
/** Fetch a full-size portrait ahead of time (low priority, once). */
export function warmPortrait(url: string) {
  if (warmed.has(url)) return;
  warmed.add(url);
  const img = new Image();
  img.fetchPriority = "low";
  img.src = url;
}

/**
 * Thumbnails mark themselves with data-portrait. When a link or button holding one is hovered, focused or
 * touched, warm the full-size image so the story it opens paints its hero instantly (as when lists used it).
 */
export function installPortraitWarmup() {
  const onIntent = (e: Event) => {
    const host = (e.target as Element | null)?.closest?.("a, button");
    if (!host) return;
    // Some cards put the portrait beside a stretched link, so also look within the enclosing list item.
    const url = (host.querySelector<HTMLElement>("[data-portrait]") ?? host.closest("li")?.querySelector<HTMLElement>("[data-portrait]"))?.dataset.portrait;
    if (url) warmPortrait(url);
  };
  for (const type of ["pointerover", "focusin", "touchstart"]) document.addEventListener(type, onIntent, { passive: true, capture: true });
}
