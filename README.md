<div align="center">

<img src="public/icon-192.png" width="72" alt="" />

# Windfall

**Swipe right to give. Swipe up to clear someone’s debt.**

A quietly luxurious, two-sided demo: Patrons swipe through stories from Seekers carrying medical debt,
student loans, rent arrears and the wreckage of brave small businesses.

**[Live demo → windfall.arnavrival12.workers.dev](https://windfall.arnavrival12.workers.dev)** · one-click demo login, no sign-up

> ⚠️ **Demo only.** Every Seeker, Patron, story and total is fictional and labelled “Demo” in the UI.
> No real money moves: gifts are recorded in an internal ledger.

<img src="docs/media/swipe.gif" width="300" alt="Swiping right to give $1,000, passing, undoing, then swiping up to clear a debt and seeing the celebration" />

</div>

## Screenshots

| Landing (light) | Landing (dark) |
|---|---|
| ![Landing page with live demo deck](docs/media/landing-light.jpg) | ![Landing page in dark mode](docs/media/landing-dark.jpg) |

| Deck | Drag to give | Give sheet | Seeker dashboard | Dark mode |
|---|---|---|---|---|
| ![Swipe deck](docs/media/deck-mobile-light.jpg) | ![Card mid-drag with the GIVE stamp](docs/media/deck-drag-mobile.jpg) | ![Give sheet with amount chips](docs/media/give-sheet-mobile.jpg) | ![Seeker request dashboard](docs/media/seeker-mobile.jpg) | ![Deck in dark mode](docs/media/deck-mobile-dark.jpg) |

| Discover (desktop) | Impact dashboard | Where the money went |
|---|---|---|
| ![Desktop deck with keyboard hints](docs/media/discover-desktop.jpg) | ![Impact dashboard](docs/media/impact-desktop.jpg) | ![Dotted world map of gifts](docs/media/impact-map.jpg) |

## Features

**Patrons**
- **Swipe deck** with spring physics: cards follow the finger, rotate and tilt in 3D, fly off with the release velocity, and snap back with overshoot. *GIVE / PASS / CLEAR IT* stamps scale in with drag distance, and the two cards behind lean forward as the top card leaves.
- **Give moment:** a bottom sheet with $1K / $10K / $100K / Custom (log-scale slider) and an anonymous toggle. Confirming fires a canvas coin burst, a liquid progress fill and a count-up ticker.
- **Clear it:** swipe up to fund the full remaining amount, followed by a full-screen celebration with brand-coloured confetti and a shared-layout portrait transition.
- **Undo:** Z or the Undo button flies the last card back in. Gifts can be reversed within 2 minutes, with compensating ledger entries.
- **Filters:** category, country, amount range, *closest to cleared*, verified only.
- **Story page:** the deck card expands into it via a shared layout. Shows the funding breakdown, verification, updates from the Seeker, and a report button.
- **Impact dashboard:** total given, people helped, debts cleared, weekly giving streak, giving-over-time chart (with a table view), an interactive dotted world map, and a **shareable impact card** generated on a canvas (download, or share via the native share sheet).
- **Generosity Index** leaderboard that rewards breadth over cheque size, with an option to appear anonymously.
- **Maybe later** list, plus keyboard shortcuts: `←` pass · `→` give · `↑` clear · `Z` undo · `S` save · `Space` details.

**Seekers**
- **Six-step request flow:** story → amount breakdown → category and location → photo (R2) → proof upload, with mock *Pending → Verified* review → review and publish. A live card preview shows how Patrons will see you, and drafts autosave.
- **Live dashboard** that polls for gifts, shows a toast when a new one arrives, and lets you post updates and thank-you notes.
- **Dignity controls:** first name only (always), blurred photo, pause/resume or close a request.

**Platform**
- Every endpoint validates its input with **Zod**. Workers **rate limiting** applies on reads (120/min) and writes (30/min).
- An atomic **double-entry ledger** on D1 (see below). Over-funding and partial writes are impossible.
- Signed HMAC session cookies and a one-click demo login with a role and persona picker.
- Designed empty, error and loading states throughout (shimmer skeletons, not spinners).
- Full **dark mode**, `prefers-reduced-motion` respected everywhere (canvas effects are skipped entirely), and screen-reader announcements for gifts, passes and undo.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite 8, TypeScript (strict), React Router, TanStack Query |
| Styling | Tailwind CSS v4, design tokens in [`src/design/`](src/design) |
| Motion | Motion (`motion/react`) via `LazyMotion` (async features) and a custom canvas particle engine |
| UI primitives | Radix (Dialog, Slider, Switch, RadioGroup, DropdownMenu), Lucide icons |
| API | Hono on Cloudflare Workers |
| Data | Cloudflare D1 and Drizzle ORM (migrations via drizzle-kit) |
| Storage | Cloudflare R2 for Seeker photos and proof documents (generated portraits as fallback) |
| Tests | Vitest (incl. the ledger on real SQLite) and Playwright (swipe-flow smoke test, mobile + desktop) |
| Lint | oxlint |

Deployment follows Cloudflare’s current recommendation for a Vite SPA plus API: **one Worker with static assets**
via `@cloudflare/vite-plugin` (not Pages). `/api/*` runs the Worker first; everything else is the SPA.
See [PLAN.md](PLAN.md) for the architecture.

### The ledger
A gift is a single `D1.batch()` (one transaction):

1. `INSERT` the gift, but **only if** the request is active and `funded + amount <= goal`
2. `UPDATE` the request totals, guarded on the gift row existing
3. Two `ledger_entries` (patron −, request +) and two `balances` upserts, with the same guard

If step 1's guard fails, nothing else applies. Undo flips the gift to `reversed` exactly once and applies
compensating entries guarded on that flip, so it is idempotent. The ledger always nets to zero, and each request's `funded_cents`
always equals the sum of its settled gifts. [`tests/ledger.test.ts`](tests/ledger.test.ts) proves this by running the Worker's exact
SQL against SQLite.

### Payments integration point
[`worker/lib/payments.ts`](worker/lib/payments.ts) defines a `PaymentProvider`:

- `PAYMENTS_MODE=demo` (default): `DemoLedgerProvider`. Nothing leaves the internal ledger.
- `PAYMENTS_MODE=stripe_test`: `StripeConnectProvider` (test keys only) creates a confirmed PaymentIntent with
  `transfer_data.destination` set to the Seeker’s connected account, refunds when the ledger rejects a gift, and refunds on undo.
  To finish it: store each Seeker’s `acct_…` id, collect a real PaymentMethod client-side, and add a webhook.

## Local setup

Requires Node 22.13+ (the ledger test uses the built-in `node:sqlite`).

```bash
git clone https://github.com/Arnav-Dugad/windfall.git && cd windfall
npm install
cp .dev.vars.example .dev.vars          # then set SESSION_SECRET to a long random string
npm run setup:local                     # apply D1 migrations locally and seed demo data
npm run dev                             # http://localhost:5173 (SPA + Worker API in workerd)
```

### Environment

| Name | Where | Purpose |
|---|---|---|
| `SESSION_SECRET` | `.dev.vars` / `wrangler secret put` | **Required.** HMAC key for session cookies (16+ chars). |
| `PAYMENTS_MODE` | `wrangler.jsonc` `vars` | `demo` (default) or `stripe_test`. |
| `STRIPE_SECRET_KEY` | secret | Only for `stripe_test`; must be an `sk_test_…` key. |
| `DB`, `MEDIA` | `wrangler.jsonc` bindings | D1 database and R2 bucket (if R2 is unbound, uploads are acknowledged but not stored). |
| `API_LIMITER`, `WRITE_LIMITER` | `wrangler.jsonc` `ratelimits` | Workers Rate Limiting bindings. |

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with the Worker running in workerd |
| `npm run check` | oxlint, TypeScript (`tsc -b`) and Vitest |
| `npm run test:e2e` | Builds, reseeds the local DB, previews, then runs the Playwright smoke test (mobile + desktop) |
| `PLAYWRIGHT_BASE_URL=https://… npm run test:e2e` | Runs the same smoke test against a deployed URL |
| `npm run db:generate` | Generates a new migration from `worker/db/schema.ts` |
| `npm run db:seed:local` / `db:seed:remote` | Regenerates and applies the fictional seed (relative to “now”, so streaks look alive) |
| `npx tsx scripts/build-shell.ts <url>` | Regenerates the static landing hero in `index.html` (run after changing the hero) |
| `npx tsx scripts/render-assets.ts` | Re-renders the OG image, favicons and touch icons |
| `npx tsx scripts/capture-media.ts <url>` | Re-captures the README screenshots and GIF |

## Deploy (Cloudflare)

```bash
npx wrangler login
npx wrangler d1 create windfall-db            # put the database_id in wrangler.jsonc
npx wrangler r2 bucket create windfall-media
npm run db:migrate:remote
npm run db:seed:remote
npx wrangler secret put SESSION_SECRET        # paste a long random string
npm run deploy                                # vite build && wrangler deploy
```

The current deployment lives at **https://windfall.arnavrival12.workers.dev**. If you deploy under a different URL,
update the absolute `og:url`, `og:image` and `canonical` tags in `index.html`.

## Quality

- **Tests:** 21 Vitest unit tests (money math, impact math, schemas, session cookies, ledger on SQLite) and an 8-case
  Playwright smoke test (landing, sign-in, drag to give, pass, undo, impact, Seeker), all passing locally **and against production**.
- **Lighthouse** (production, measured locally with Lighthouse 12):
  desktop **100 / 100 / 100 / 100**; mobile Performance **88–95** (median ~90), with Accessibility, Best Practices and SEO all at **100** and CLS **0**.
  The landing hero ships as static HTML (generated from the real render), so it paints before any JavaScript runs.
  Fonts are preloaded with metric-matched fallbacks, and the motion engine and signed-in shell load asynchronously.
- **Accessibility:** every gesture has a visible button and a keyboard shortcut, focus rings everywhere, Radix dialogs,
  `inert` background cards, a live region for gift and undo announcements, chart table views, and AA contrast in both themes
  (chart colours validated for 3:1 against their surfaces).

## Project structure

```
shared/      domain types, Zod schemas, money + impact math, fictional seed data
worker/      Hono app · db/schema.ts · lib/{ledger,payments,session,ratelimit}.ts · routes/*
migrations/  drizzle-kit SQL
src/
  design/    tokens.css (colour, type, radii, shadows, timing) · motion.ts (springs) · fonts.css
  components/ deck/ (SwipeDeck, SwipeCard, GiveSheet, Celebration) · effects/ (canvas particles) · impact/ · ui/
  routes/    Landing, Login, Discover, Story, Impact, Leaderboard, Saved, seeker/*
tests/       Vitest unit tests · e2e/ Playwright
scripts/     seed, world dot-map, static shell, brand assets, README media
```

---

<sub>Windfall is a design and engineering demo. All people, stories, gifts and totals are fictional.</sub>
