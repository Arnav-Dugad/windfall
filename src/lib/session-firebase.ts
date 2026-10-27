import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import type { UserDoc } from "@shared/firestore";
import { auth, db } from "./firebase";
import { setSession, SIGNED_IN_KEY, toPublicUser } from "./session";

let wired = false;

/** Lets the landing page decide, without Firebase, whether this visitor needs their session right away. */
function rememberSignedIn(on: boolean) {
  try {
    if (on) localStorage.setItem(SIGNED_IN_KEY, "1");
    else localStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    /* storage unavailable */
  }
}
let profileUnsub: Unsubscribe | null = null;

/** Mirrors Firebase Auth + users/{uid} into the session store. */
export function wireSession() {
  if (wired) return;
  wired = true;
  onAuthStateChanged(auth, (fbUser) => {
    profileUnsub?.();
    profileUnsub = null;
    rememberSignedIn(!!fbUser);
    if (!fbUser) {
      setSession({ status: "ready", firebaseUser: null, user: null, needsOnboarding: false });
      return;
    }
    profileUnsub = onSnapshot(
      doc(db, "users", fbUser.uid),
      (snap) => {
        if (!snap.exists()) setSession({ status: "ready", firebaseUser: fbUser, user: null, needsOnboarding: true });
        else setSession({ status: "ready", firebaseUser: fbUser, user: toPublicUser(fbUser.uid, snap.data() as UserDoc), needsOnboarding: false });
      },
      () => setSession({ status: "ready", firebaseUser: fbUser, user: null, needsOnboarding: true }),
    );
  });
}
