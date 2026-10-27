import "./index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { startSession } from "./lib/session";

// Firebase (auth + profile) loads immediately on app routes; on the landing page it waits for idle
// so the SDK never competes with the hero's first paint.
if (location.pathname === "/") {
  const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1200));
  idle(() => void startSession(), { timeout: 2500 });
} else {
  void startSession();
}

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
