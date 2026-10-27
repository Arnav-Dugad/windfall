import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import type { UserDoc } from "@shared/firestore";
import { auth, db } from "./firebase";
import { setSession, toPublicUser } from "./session";

let wired = false;
let profileUnsub: Unsubscribe | null = null;

/** Mirrors Firebase Auth + users/{uid} into the session store. */
export function wireSession() {
  if (wired) return;
  wired = true;
  onAuthStateChanged(auth, (fbUser) => {
    profileUnsub?.();
    profileUnsub = null;
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
