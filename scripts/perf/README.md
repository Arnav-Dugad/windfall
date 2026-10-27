# Performance and QA checks

Small Playwright scripts used to measure Give on a throttled mid-range phone profile (4× CPU slowdown,
150 ms RTT, 1.6 Mbps). Point them at a local preview — preferably an emulator build, so measuring never
spends the Spark plan's daily Firestore quota:

```sh
npm run dev:emulators            # in another terminal
npm run seed:emulators
VITE_FIREBASE_EMULATORS=1 npx vite build --outDir .cache/dist-emu
npx vite preview --outDir .cache/dist-emu --port 4175
```

| Script | Measures |
|---|---|
| `landing-hero.mjs <url>` | When the landing hero's top card is fully painted (cold cache), plus blocking time |
| `discover-phases.mjs <url> [cold]` | Signed-in Discover: shell → route mounted → first card → card image |
| `web-vitals.mjs <url>` | FCP / LCP / TBT / CLS and bytes by type for `/` and `/discover` |
| `timeline.mjs <url> <path> [login]` | LCP entries, long tasks and the full request timeline for one route |
| `drag-frames.mjs <url> [as-is\|no-dof\|no-filters]` | Frame pacing while dragging the top card (GPU on) |
| `idle-cpu.mjs <url>` | Main-thread busy time while `/` and `/discover` sit idle |
| `crawl.mjs <url> [persona]` | QA: every route × persona × phone/desktop — console errors, failed requests, overflow, broken images, screenshots in `.cache/crawl/` (`DARK=1` for dark mode) |
| `flows.mjs <url> [flow]` | QA: drives the main journeys end to end (give + match, undo, filters, finish a debt, follow + circle, circle undo, cached deck, settings, moderation, search, Wrapped, Seeker update) |

In Git Bash, prefix commands that pass a path argument with `MSYS_NO_PATHCONV=1`. Emulator timings are slower
than production in absolute terms (rules evaluation is slower locally); compare builds against each other.
