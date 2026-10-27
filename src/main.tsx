import "./index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { installPortraitWarmup } from "./lib/photos";
import { startSession, wasSignedIn } from "./lib/session";

// Firebase (auth + profile) loads immediately on app routes. On the landing page it never competes with
// the hero: returning signed-in visitors get it once the page is idle (their header shows "Open app"),
// everyone else on their first interaction or once the page has settled.
if (location.pathname === "/") {
  const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1200));
  const start = () => void startSession();
  if (wasSignedIn()) {
    idle(start, { timeout: 2500 });
  } else {
    const events = ["pointerdown", "keydown", "touchstart", "focusin"] as const;
    const once = () => {
      events.forEach((t) => window.removeEventListener(t, once, true));
      start();
    };
    events.forEach((t) => window.addEventListener(t, once, { capture: true, passive: true }));
    // Hovering a link into the app is a strong hint too.
    document.addEventListener("pointerover", (e) => (e.target as Element | null)?.closest?.('a[href^="/"]:not([href^="/#"]):not([href="/"])') && once(), { passive: true });
    addEventListener("load", () => setTimeout(() => idle(start, { timeout: 4000 }), 6000), { once: true });
  }
} else {
  void startSession();
}

installPortraitWarmup();

const loadMotionFeatures = () => import("./lib/motion-features").then((m) => m.default);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => {
        const status = (err as { status?: number }).status;
        return !(status && status < 500) && count < 2;
      },
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <LazyMotion features={loadMotionFeatures} strict>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </LazyMotion>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
