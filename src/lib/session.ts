import type { User } from "firebase/auth";
import type { PublicUser } from "@shared/domain";
import type { UserDoc } from "@shared/firestore";

/**
 * Session = Firebase Auth user + their live users/{uid} profile.
 * `needsOnboarding` means signed in (e.g. via Google) but no Give profile/role yet.
 * The store itself has no Firebase imports, so the landing page can render without the SDK;
 * `startSession()` loads the wiring (session-firebase.ts) on demand.
 */
export interface SessionState {
  status: "loading" | "ready";
  firebaseUser: User | null;
  user: PublicUser | null;
  needsOnboarding: boolean;
}

let state: SessionState = { status: "loading", firebaseUser: null, user: null, needsOnboarding: false };
const listeners = new Set<() => void>();

export function setSession(next: SessionState) {
  state = next;
  listeners.forEach((l) => l());
}

export function toPublicUser(uid: string, d: UserDoc): PublicUser {
  return {
    id: uid,
    role: d.role,
    displayName: d.displayName,
    avatarSeed: uid,
    anonymousByDefault: d.anonymousByDefault,
    photoURL: d.photoURL ?? null,
    isDemo: d.isDemo,
  };
}

export const SIGNED_IN_KEY = "give:signed-in";

/** True if this browser had a signed-in Give session last time (a hint only — Firebase is the source of truth). */
export function wasSignedIn() {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === "1";
  } catch {
    return false;
  }
}

let started: Promise<void> | null = null;
/** Loads Firebase Auth + the profile listener (idempotent). */
export function startSession() {
  started ??= import("./session-firebase").then((m) => m.wireSession());
  return started;
}

export const getSession = () => state;

export function subscribeSession(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Resolves once the session has settled for the given uid (profile loaded or known missing). */
export function waitForSession(uid: string, opts: { profile?: boolean; timeoutMs?: number } = {}): Promise<SessionState> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  return new Promise((resolve, reject) => {
    const check = () => {
      const settled = opts.profile ? !!state.user : !!state.user || state.needsOnboarding;
      if (state.status === "ready" && state.firebaseUser?.uid === uid && settled) {
        un();
        clearTimeout(t);
        resolve(state);
      }
    };
    const un = subscribeSession(check);
    const t = setTimeout(() => {
      un();
      reject(new Error("Signing in took too long. Please try again."));
    }, timeoutMs);
    check();
  });
}
