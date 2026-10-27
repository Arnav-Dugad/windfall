import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMotionValue, useSpring } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { getSession, subscribeSession } from "./session";

/** Current Give user from Firebase Auth + their live profile (same shape the screens always used). */
export function useMe() {
  const s = useSyncExternalStore(subscribeSession, getSession, getSession);
  return {
    data: { user: s.user },
    isPending: s.status === "loading",
    needsOnboarding: s.needsOnboarding,
    firebaseUser: s.firebaseUser,
  };
}

export function useSignOut() {
  const qc = useQueryClient();
  return useCallback(async () => {
    const { api } = await import("./api");
    await api.logout();
    qc.clear();
  }, [qc]);
}

/** Whether the signed-in user is on the moderation team (admins/{uid} exists). Keyed by uid so persona switches refresh it. */
export function useIsModerator(enabled = true) {
  const uid = useMe().data.user?.id;
  return useQuery({
    queryKey: ["is-moderator", uid],
    queryFn: () => import("./social").then((m) => m.isModerator()),
    enabled: !!uid && enabled,
    staleTime: Infinity,
  });
}

/** Runs `fn` once the page has been idle for a moment after `delayMs` — for background work that shouldn't compete with first paint. */
export function whenIdle(fn: () => void, delayMs = 2500) {
  const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 300));
  let handle: number | undefined;
  const t = setTimeout(() => (handle = idle(fn, { timeout: 3000 }) as unknown as number), delayMs);
  return () => {
    clearTimeout(t);
    if (handle !== undefined) (window.cancelIdleCallback ?? clearTimeout)(handle);
  };
}

/** False until the page has settled (see whenIdle); then true for good. */
export function useIdleReady(delayMs = 2500) {
  const [ready, setReady] = useState(false);
  useEffect(() => (ready ? undefined : whenIdle(() => setReady(true), delayMs)), [ready, delayMs]);
  return ready;
}

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// ---- Theme -------------------------------------------------------------------
type Theme = "light" | "dark";
const themeListeners = new Set<() => void>();
function readTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("wf-theme", t);
  } catch {
    /* storage may be unavailable */
  }
  themeListeners.forEach((l) => l());
}
export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(
    (cb) => {
      themeListeners.add(cb);
      return () => themeListeners.delete(cb);
    },
    readTheme,
    () => "light" as Theme,
  );
  return [theme, setTheme];
}

// ---- Magnetic hover (desktop only) -----------------------------------------
export function useMagnetic<T extends HTMLElement>(strength = 0.28) {
  const ref = useRef<T>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 320, damping: 22, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 320, damping: 22, mass: 0.5 });
  const fine = useMediaQuery("(hover: hover) and (pointer: fine)");
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    const el = ref.current;
    if (!el || !fine || reduced) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      x.set((e.clientX - (r.left + r.width / 2)) * strength);
      y.set((e.clientY - (r.top + r.height / 2)) * strength);
    };
    const leave = () => {
      x.set(0);
      y.set(0);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [fine, reduced, strength, x, y]);

  return { ref, style: { x: sx, y: sy } };
}

/** Run a callback for global keyboard shortcuts, ignoring keystrokes inside form fields and dialogs. */
export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>, enabled = true) {
  const mapRef = useRef(map);
  useLayoutEffect(() => {
    mapRef.current = map;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (t?.closest("[role=dialog]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const fn = mapRef.current[e.key] ?? mapRef.current[e.key.toLowerCase()];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Give` : "Give — Swipe to clear someone's debt";
  }, [title]);
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
