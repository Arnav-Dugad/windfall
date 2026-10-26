# Windfall — Architecture & Build Plan

## Deployment model
Cloudflare's current recommendation for a Vite SPA + API is **one Worker with static assets**
(via `@cloudflare/vite-plugin`), not Pages. `create-cloudflare --framework=react --platform=workers`
was used to scaffold. The Worker serves `/api/*` (Hono) and everything else falls through to the SPA
(`assets.not_found_handling = "single-page-application"`, `run_worker_first = ["/api/*"]`).

```
Browser ──► Worker (Hono)
             ├── /api/*  → routes → Drizzle → D1  (ledger, requests, users…)
             │                    → R2 (photos, proof documents)
             │                    → RateLimit binding (per IP / per user)
             └── *       → static assets (React SPA, code-split)
```

## Bindings (wrangler.jsonc)
| Binding | Type | Purpose |
|---|---|---|
| `DB` | D1 | All relational data, migrations in `migrations/` (drizzle-kit) |
| `MEDIA` | R2 | Seeker photos + proof docs (optional; generated avatars otherwise) |
| `API_LIMITER`, `WRITE_LIMITER` | Rate limiting | 120 req/min reads, 30 req/min writes |
| `SESSION_SECRET` | Secret | HMAC key for signed session cookies |
| `PAYMENTS_MODE` | Var | `demo` (internal ledger, default) or `stripe_test` |
| `STRIPE_SECRET_KEY` | Secret (optional) | Only used when `PAYMENTS_MODE=stripe_test` |

## Data model (integer cents, USD)
- `users` — role (patron/seeker), display name, anonymity default, demo flag
- `requests` — a Seeker's ask: story, breakdown JSON, goal/funded cents, status, verification, geo
- `request_updates` — progress notes & thank-yous
- `gifts` — every gift (give/clear), anonymous flag, status (`settled` / `reversed`), payment ref
- `ledger_entries` — double-entry rows (patron −, request +) per gift / reversal
- `balances` — materialised running balance per ledger account
- `swipes` — pass / save per patron+request (deck exclusion, "Maybe later", undo)
- `documents` — proof uploads with mock verification state
- `reports` — trust & safety reports

**Consistency:** a gift is a single atomic `D1.batch()`: a guarded `UPDATE requests … WHERE funded + amount <= goal`,
then gift/ledger/balance writes that only apply `WHERE changes() = 1` / `EXISTS(gift)`. Over-funding and partial
writes are impossible; totals always equal the sum of ledger rows.

## Payments integration point
`worker/lib/payments.ts` defines `PaymentProvider`. `DemoLedgerProvider` (default) settles instantly in the
internal ledger. `StripeConnectProvider` (test mode, `PAYMENTS_MODE=stripe_test`) creates a PaymentIntent with
`transfer_data.destination` = the Seeker's connected account. No real money moves in demo mode.

## Auth
Signed (HMAC-SHA256) `wf_session` cookie, HttpOnly, SameSite=Lax, Secure in prod, 7-day expiry.
`POST /api/auth/demo` = one-click login with role/persona picker.

## Frontend
- React 19 + Vite 8 + TS strict, React Router (library mode), routes lazy-loaded.
- Tailwind v4; **all design tokens in `src/design/`** (`tokens.css`: color/radius/shadow/type/duration/easing,
  `motion.ts`: spring physics derived from the same names).
- Motion (`motion/react`) for physics animation; `MotionConfig reducedMotion="user"` + explicit checks
  for canvas effects (particles/confetti are skipped under reduced motion).
- Radix primitives (Dialog, Slider, Switch, Tooltip, ToggleGroup) for accessible UI.
- Fonts self-hosted via Fontsource: Instrument Serif (display) + Geist (UI), tabular numerals for money.

```
shared/        domain types, zod schemas, money math, seed data (used by worker + client + tests)
worker/        Hono app: index.ts, db/schema.ts, lib/{session,ledger,payments,ratelimit,serialize}.ts, routes/*
migrations/    drizzle-kit SQL migrations
scripts/       seed SQL generator, world-dot-map generator, OG/icon renderer
src/
  design/      tokens.css, motion.ts
  lib/         api client, format, haptics, hooks (reduced motion, magnetic, keyboard)
  components/  ui/* primitives, deck/* (SwipeDeck, SwipeCard, Stamp, GiveSheet), effects/* (particles, confetti)
  routes/      Landing, Login, Discover, Story, Impact, Leaderboard, Saved, seeker/{Dashboard,NewRequest,Manage}, NotFound
tests/         vitest unit tests; e2e/ Playwright smoke test
```

## Build order
1. Tokens + primitives → 2. Swipe deck + give flow (hero) → 3. API/ledger → 4. Remaining screens →
5. Seed + migrations → 6. Lint/typecheck/tests → 7. Visual QA at 390px & 1440px → 8. Ship (GitHub + Cloudflare).
