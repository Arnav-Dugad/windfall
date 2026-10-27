import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

// Firebase web config is public by design; access is governed by firestore.rules and Auth.
export const firebaseConfig = {
  apiKey: "AIzaSyATxkXcTU37dYSbc87_QoZGNmtGh65quQo",
  authDomain: "windfall-give-bb8b.firebaseapp.com",
  projectId: "windfall-give-bb8b",
  storageBucket: "windfall-give-bb8b.firebasestorage.app",
  messagingSenderId: "1072718083580",
  appId: "1:1072718083580:web:c071662872284259a2ae79",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Offline-first cache: the deck and dashboards render instantly on repeat visits and sync live.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (import.meta.env.VITE_FIREBASE_EMULATORS === "1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8085);
}

/** Shared password for the fictional demo personas (they are public, read-mostly accounts). */
export const DEMO_PASSWORD = "windfall-demo";
