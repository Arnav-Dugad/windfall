# Windfall — Architecture

## v2 (current): Cloudflare hosting + Firebase everything else

```
Browser ──► Cloudflare Workers static assets (React SPA, SPA fallback, _headers)
   ├──► Firebase Auth        (Google, email/password, anonymous, demo personas)
   ├──► Cloud Firestore      (data, live listeners, persistent offline cache)
   │       └── firestore.rules — the gift ledger, validation, privacy, rate limit
   └──► Firestore REST       (public landing-page reads without the SDK)
```

- **Free Spark plan only** (no Cloud Functions / Storage). Seeker photos are resized on-device and stored inline;
  proof documents are never uploaded (review is simulated: pending → verified after 20s, enforced by rules).
- **Ledger:** one client transaction per gift (gift, request totals, public wall entry, patron stats, global stats).
  Rules cross-check every write with `get()`/`getAfter()`; tests in `tests/rules` run against the emulator.
- **Seeding:** `firebase auth:import` creates demo accounts with fixed UIDs; a `windfall-seeder` account (password in the
  git-ignored `.seed.env`) writes demo data through the normal SDK, permitted by an explicit rules clause.
- **Performance:** static hero shell in `index.html`; app bundle requested after the shell paints; Firebase SDK in a lazy
  chunk (immediate on app routes, idle on the landing page); fonts preloaded with metric-matched fallbacks.

## Design system (`src/design/`)
Apple-inspired: SF/Inter type, system greys, blue accent, green positive, glass materials (`.glass`, `.glass-thick`,
`.glass-photo`), 12/22/32/34px radii, diffuse shadows, spring physics in `motion.ts`.

## Roster
274 fictional people with AI-generated portraits (`public/people/<hash>.webp`), cast photo-first by agents from a written
brief (`shared/seed/people/*.ts`). Minors, multi-face images and artefacts were excluded.

## History
v1 (2026-10-26) used a Hono API on Workers with D1 + R2; it was retired in favour of Firebase in v2.
