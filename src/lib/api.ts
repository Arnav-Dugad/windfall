import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile as updateAuthProfile,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { Category, GiftKind, PublicUser, RequestCard, RequestDetail, Role, SeekerUpdate } from "@shared/domain";
import type { CircleDoc, GiftDoc, GlobalStatsDoc, MatchDoc, PatronStatsDoc, PersonaDoc, RequestDoc, UpdateDoc, UserDoc, WallDoc } from "@shared/firestore";
import { countryCentroid } from "@shared/geo";
import { generosityIndex, givingStreakWeeks, weekIndex, weeklySeries } from "@shared/impact";
import { clampGift, remainingCents } from "@shared/money";
import type { NarrativeInput } from "@shared/narrative";
import { buildProfile, rankForYou } from "@shared/rank";
import type { DeckQuery, NewRequestInput } from "@shared/schemas";
import { auth, db, DEMO_PASSWORD } from "./firebase";
import { getSession, waitForSession } from "./session";
import { wireSession } from "./session-firebase";

wireSession();

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Firestore/Auth errors → friendly messages. */
function friendly(err: unknown): never {
  if (err instanceof ApiError) throw err;
  const code = (err as { code?: string })?.code ?? "";
  const map: Record<string, [number, string]> = {
    "permission-denied": [403, "That action isn’t allowed. If you just gave, wait a second and try again."],
    "auth/invalid-credential": [401, "That email and password don’t match."],
    "auth/email-already-in-use": [409, "There’s already an account with that email."],
    "auth/weak-password": [400, "Use at least 6 characters for your password."],
    "auth/invalid-email": [400, "That email address doesn’t look right."],
    "auth/popup-closed-by-user": [400, "Sign-in was cancelled."],
    "auth/unauthorized-domain": [403, "Google sign-in isn’t enabled for this domain yet."],
    "auth/too-many-requests": [429, "Too many attempts. Please wait a minute."],
    unavailable: [503, "You seem to be offline. We’ll sync when you’re back."],
    aborted: [409, "Someone else just gave — please try again."],
  };
  const hit = map[code];
  if (hit) throw new ApiError(hit[0], hit[1]);
  throw new ApiError(500, err instanceof Error ? err.message : "Something went wrong. Please try again.");
}

const ms = (t: unknown): number => {
  if (t && typeof t === "object" && "toMillis" in t) return (t as { toMillis(): number }).toMillis();
  return typeof t === "number" ? t : Date.now();
};
const data = <T>(s: DocumentSnapshot<DocumentData> | QueryDocumentSnapshot<DocumentData>) =>
  s.data({ serverTimestamps: "estimate" }) as T;

function requireUser(role?: Role): PublicUser {
  const u = getSession().user;
  if (!u) throw new ApiError(401, "Sign in to continue");
  if (role && u.role !== role) throw new ApiError(403, `This area is for ${role}s`);
  return u;
}

export function toCard(id: string, r: RequestDoc): RequestCard {
  return {
    id,
    firstName: r.firstName,
    age: r.age,
    city: r.city,
    country: r.country,
    countryCode: r.countryCode,
    category: r.category,
    headline: r.headline,
    story: r.story,
    breakdown: r.breakdown,
    goalCents: r.goalCents,
    fundedCents: r.fundedCents,
    giftCount: r.giftCount,
    verification: r.verification,
    status: r.status,
    avatarSeed: r.avatarSeed,
    photoUrl: r.photoUrl,
    blurPhoto: r.blurPhoto,
    createdAt: ms(r.createdAt),
    isDemo: r.isDemo,
    accent: r.accent ?? null,
  };
}

// ---- Response shapes (unchanged for the UI) ------------------------------------------------------
export interface Stats {
  totalCents: number;
  giftCount: number;
  debtsCleared: number;
}
export interface Persona {
  persona: string;
  displayName: string;
  blurb: string;
  photo: string | null;
  anonymousByDefault?: boolean;
}
export interface GiftResult {
  gift: { id: string; amountCents: number; createdAt: number; undoUntil: number };
  request: RequestCard;
  cleared: boolean;
}
export interface Impact {
  totals: {
    totalCents: number;
    giftCount: number;
    peopleHelped: number;
    debtsCleared: number;
    streakWeeks: number;
    countries: number;
    generosityIndex: number;
  };
  series: { weekStart: number; totalCents: number }[];
  places: { city: string; country: string; countryCode: string; lat: number; lng: number; totalCents: number; people: string[] }[];
  byCategory: { category: Category; totalCents: number }[];
  recent: {
    giftId: string;
    requestId: string;
    firstName: string;
    category: Category;
    country: string;
    avatarSeed: string;
    photoUrl: string | null;
    amountCents: number;
    kind: GiftKind;
    anonymous: boolean;
    createdAt: number;
    cleared: boolean;
  }[];
  cleared: { requestId: string; firstName: string; avatarSeed: string; photoUrl: string | null }[];
}
export interface LeaderboardEntry {
  id: string;
  rank: number;
  displayName: string;
  avatarSeed: string;
  photo: string | null;
  anonymous: boolean;
  isYou: boolean;
  totalCents: number;
  peopleHelped: number;
  debtsCleared: number;
  activeWeeks: number;
  index: number;
}
export interface SeekerGift {
  id: string;
  amountCents: number;
  kind: GiftKind;
  createdAt: number;
  from: string | null;
  avatarSeed: string;
  photo: string | null;
}

export type DeckFilters = Partial<Pick<DeckQuery, "category" | "country" | "min" | "max" | "sort">> & { verified?: boolean };

export const UNDO_WINDOW_MS = 2 * 60 * 1000;
const giftsCol = collection(db, "gifts");
const requestsCol = collection(db, "requests");

// Every story, shared briefly between the screens that load together (the deck, "Finish a debt", search,
// filter counts), so one screen costs one read. Our own writes clear it.
const SHARE_MS = 10_000;
let sharedRequests: { at: number; p: Promise<{ id: string; r: RequestDoc }[]> } | null = null;

function allRequests(): Promise<{ id: string; r: RequestDoc }[]> {
  if (sharedRequests && Date.now() - sharedRequests.at < SHARE_MS) return sharedRequests.p;
  const p = getDocs(requestsCol).then((snap) => snap.docs.map((d) => ({ id: d.id, r: data<RequestDoc>(d) })));
  const entry = { at: Date.now(), p };
  sharedRequests = entry;
  p.catch(() => {
    if (sharedRequests === entry) sharedRequests = null;
  });
  return p;
}

/** Forget the shared stories read (after anything that changes a request). */
export function forgetRequests() {
  sharedRequests = null;
}

/** Active stories as cards, from the shared read. */
export async function activeRequestCards(): Promise<RequestCard[]> {
  return (await allRequests()).filter(({ r }) => r.status === "active").map(({ id, r }) => toCard(id, r));
}

async function ensureUserDoc(uid: string, role: Role, displayName: string, photoURL: string | null) {
  await setDoc(doc(db, "users", uid), {
    role,
    displayName: displayName.slice(0, 40) || "Friend",
    anonymousByDefault: false,
    photoURL,
    isDemo: false,
    createdAt: serverTimestamp(),
  } satisfies UserDoc);
}

export const api = {
  // ---- auth --------------------------------------------------------------------------------------
  async personas(): Promise<{ patrons: Persona[]; seekers: Persona[] }> {
    const snap = await getDoc(doc(db, "meta", "personas"));
    const list = ((snap.exists() ? snap.data().list : []) as PersonaDoc[]) ?? [];
    const toP = (p: PersonaDoc): Persona => ({ persona: p.persona, displayName: p.displayName, blurb: p.blurb, photo: p.photo });
    return {
      // The moderator is a patron account with an admins/{uid} doc; it gets its own entry on the login page.
      patrons: list.filter((p) => p.role === "patron" && p.persona !== "moderator").map(toP),
      seekers: [
        ...list.filter((p) => p.role === "seeker").map(toP),
        { persona: "new", displayName: "A new Seeker", blurb: "Start fresh and walk through the request flow.", photo: null },
      ],
    };
  },

  async demoLogin(role: Role, persona: string): Promise<{ user: PublicUser }> {
    try {
      if (role === "seeker" && persona === "new") {
        const cred = await signInAnonymously(auth);
        await ensureUserDoc(cred.user.uid, "seeker", "New Seeker", null);
        const s = await waitForSession(cred.user.uid, { profile: true });
        return { user: s.user! };
      }
      const snap = await getDoc(doc(db, "meta", "personas"));
      const p = ((snap.data()?.list ?? []) as PersonaDoc[]).find((x) => x.persona === persona && x.role === role);
      if (!p) throw new ApiError(503, "Demo data isn’t seeded yet. Run npm run seed.");
      const cred = await signInWithEmailAndPassword(auth, p.email, DEMO_PASSWORD);
      const s = await waitForSession(cred.user.uid, { profile: true });
      return { user: s.user! };
    } catch (e) {
      return friendly(e);
    }
  },

  async signUpWithEmail(input: { name: string; email: string; password: string; role: Role }) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, input.email, input.password);
      await updateAuthProfile(cred.user, { displayName: input.name });
      await ensureUserDoc(cred.user.uid, input.role, input.name, null);
      const s = await waitForSession(cred.user.uid, { profile: true });
      return { user: s.user! };
    } catch (e) {
      return friendly(e);
    }
  },

  async signInWithEmail(email: string, password: string) {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return await waitForSession(cred.user.uid);
    } catch (e) {
      return friendly(e);
    }
  },

  async signInWithGoogle() {
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      return await waitForSession(cred.user.uid);
    } catch (e) {
      return friendly(e);
    }
  },

  /** After Google/email sign-in without a profile: choose a role. */
  async completeOnboarding(role: Role, displayName: string) {
    const fb = getSession().firebaseUser;
    if (!fb) throw new ApiError(401, "Sign in to continue");
    try {
      await ensureUserDoc(fb.uid, role, displayName, fb.photoURL ?? null);
      const s = await waitForSession(fb.uid, { profile: true });
      return { user: s.user! };
    } catch (e) {
      return friendly(e);
    }
  },

  logout: () => signOut(auth),

  async updateProfile(anonymousByDefault: boolean) {
    const u = requireUser();
    try {
      await updateDoc(doc(db, "users", u.id), { anonymousByDefault });
      const stats = await getDoc(doc(db, "patronStats", u.id));
      if (stats.exists()) {
        await updateDoc(stats.ref, {
          anonymous: anonymousByDefault,
          displayName: anonymousByDefault ? null : u.displayName,
          avatar: anonymousByDefault ? null : u.photoURL,
        });
      }
      return { user: { ...u, anonymousByDefault } };
    } catch (e) {
      return friendly(e);
    }
  },

  // ---- public ------------------------------------------------------------------------------------
  async stats(): Promise<Stats> {
    const s = await getDoc(doc(db, "stats", "global"));
    const g = (s.data() as GlobalStatsDoc | undefined) ?? { totalCents: 0, giftCount: 0, debtsCleared: 0 };
    return { totalCents: g.totalCents, giftCount: g.giftCount, debtsCleared: g.debtsCleared };
  },

  async featured(): Promise<{ cards: RequestCard[] }> {
    const snap = await getDocs(query(requestsCol, where("status", "==", "active"), orderBy("giftCount", "desc"), limit(16)));
    return {
      cards: snap.docs
        .map((d) => toCard(d.id, data<RequestDoc>(d)))
        .filter((c) => c.verification === "verified")
        .slice(0, 10),
    };
  },

  async people(): Promise<{ cards: RequestCard[] }> {
    const snap = await getDocs(query(requestsCol, where("status", "==", "active"), limit(48)));
    return { cards: snap.docs.map((d) => toCard(d.id, data<RequestDoc>(d))) };
  },

  // ---- patron deck -------------------------------------------------------------------------------
  async deck(f: DeckFilters): Promise<{ cards: RequestCard[] }> {
    const u = requireUser("patron");
    const [reqs, swipes, gifts, profileDoc] = await Promise.all([
      allRequests(),
      getDocs(collection(db, "users", u.id, "swipes")),
      getDocs(query(giftsCol, where("patronId", "==", u.id))),
      getDoc(doc(db, "users", u.id)),
    ]);
    const hidden = new Set([...swipes.docs.map((d) => d.id), ...gifts.docs.filter((g) => data<GiftDoc>(g).status === "settled").map((g) => data<GiftDoc>(g).requestId)]);
    let cards = reqs
      .filter(({ id, r }) => r.status === "active" && !hidden.has(id))
      .filter(({ r }) => !f.category || r.category === f.category)
      .filter(({ r }) => !f.country || r.countryCode === f.country)
      .filter(({ r }) => f.min === undefined || r.goalCents >= f.min * 100)
      .filter(({ r }) => f.max === undefined || r.goalCents <= f.max * 100)
      .filter(({ r }) => !f.verified || r.verification === "verified")
      .map(({ id, r }) => toCard(id, r));
    if (f.sort === "closest") cards = cards.sort((a, b) => b.fundedCents / b.goalCents - a.fundedCents / a.goalCents);
    else if (f.sort === "newest") cards = cards.sort((a, b) => b.createdAt - a.createdAt);
    else {
      // "For you": learns from this Patron's gifts and causes, with an exploration slot every fourth card.
      const myGifts = gifts.docs.map((g) => data<GiftDoc>(g));
      const causes = (profileDoc.data() as UserDoc | undefined)?.causes ?? { categories: [], countries: [] };
      cards = rankForYou(cards, buildProfile(myGifts, causes), Date.now(), Math.floor(Date.now() / 3_600_000));
    }
    return { cards: cards.slice(0, 80) };
  },

  async resetDeck() {
    const u = requireUser("patron");
    const snap = await getDocs(query(collection(db, "users", u.id, "swipes"), where("action", "==", "pass")));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return { ok: true as const };
  },

  async countries() {
    const reqs = await allRequests();
    const map = new Map<string, string>();
    for (const { r } of reqs) if (r.status === "active") map.set(r.countryCode, r.country);
    return { countries: [...map].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name)) };
  },

  async story(id: string): Promise<{ request: RequestDetail }> {
    const s = await getDoc(doc(db, "requests", id));
    if (!s.exists()) throw new ApiError(404, "We couldn’t find that story.");
    const r = data<RequestDoc>(s);
    const ups = await getDocs(query(collection(db, "requests", id, "updates"), orderBy("createdAt", "desc")));
    const updates: SeekerUpdate[] = ups.docs.map((d) => {
      const u = data<UpdateDoc>(d);
      return { id: d.id, kind: u.kind, body: u.body, createdAt: ms(u.createdAt), mediaId: u.mediaId ?? null };
    });
    return { request: { ...toCard(id, r), updates, lat: r.lat, lng: r.lng } };
  },

  async swipe(requestId: string, action: "pass" | "save") {
    const u = requireUser("patron");
    await setDoc(doc(db, "users", u.id, "swipes", requestId), { action, createdAt: serverTimestamp() });
    return { ok: true as const };
  },

  async unswipe(requestId: string) {
    const u = requireUser("patron");
    await deleteDoc(doc(db, "users", u.id, "swipes", requestId));
    return { ok: true as const };
  },

  async saved() {
    const u = requireUser("patron");
    const snap = await getDocs(query(collection(db, "users", u.id, "swipes"), where("action", "==", "save")));
    const rows = await Promise.all(
      snap.docs.map(async (s) => {
        const r = await getDoc(doc(db, "requests", s.id));
        return r.exists() ? { ...toCard(r.id, data<RequestDoc>(r)), savedAt: ms(data<{ createdAt: unknown }>(s).createdAt) } : null;
      }),
    );
    return { saved: rows.filter((x): x is RequestCard & { savedAt: number } => !!x).sort((a, b) => b.savedAt - a.savedAt) };
  },

  /**
   * One atomic transaction: private gift + request totals + public wall entry + Patron stats + global totals.
   * firestore.rules verifies each write against the others, so the client can't fudge any number.
   */
  async give(input: {
    requestId: string;
    amountCents?: number;
    kind: GiftKind;
    anonymous: boolean;
    /** Count this gift toward a Giving Circle and/or a "match my gift" challenge (same transaction). */
    circleId?: string | null;
    matchId?: string | null;
  }): Promise<GiftResult> {
    forgetRequests();
    const me = requireUser("patron");
    const giftRef = doc(giftsCol);
    const reqRef = doc(db, "requests", input.requestId);
    const statsRef = doc(db, "patronStats", me.id);
    const globalRef = doc(db, "stats", "global");
    const circleRef = input.circleId ? doc(db, "circles", input.circleId) : null;
    const matchRef = input.matchId ? doc(db, "matches", input.matchId) : null;
    try {
      const out = await runTransaction(db, async (tx) => {
        const [rs, ps, gs, cs, ms_] = await Promise.all([
          tx.get(reqRef),
          tx.get(statsRef),
          tx.get(globalRef),
          circleRef ? tx.get(circleRef) : Promise.resolve(null),
          matchRef ? tx.get(matchRef) : Promise.resolve(null),
        ]);
        if (!rs.exists()) throw new ApiError(404, "We couldn’t find that story.");
        const r = rs.data() as RequestDoc;
        if (r.status !== "active") {
          throw new ApiError(409, r.status === "funded" ? `${r.firstName} is already fully funded.` : "This request isn’t accepting gifts right now.");
        }
        const remaining = remainingCents(r.goalCents, r.fundedCents);
        const amount = input.kind === "clear" ? remaining : clampGift(input.amountCents ?? 0, r.goalCents, r.fundedCents);
        if (amount < 100) throw new ApiError(400, "Choose an amount to give.");
        const clears = amount >= remaining;
        const kind: GiftKind = clears ? "clear" : input.kind;
        const now = serverTimestamp();
        const p = ps.exists() ? (ps.data() as PatronStatsDoc) : null;
        const g = gs.data() as GlobalStatsDoc;

        tx.set(giftRef, {
          patronId: me.id,
          requestId: input.requestId,
          seekerId: r.seekerId,
          amountCents: amount,
          kind,
          anonymous: input.anonymous,
          status: "settled",
          createdAt: now,
          requestName: r.firstName,
          category: r.category,
          country: r.country,
          countryCode: r.countryCode,
          city: r.city,
          lat: r.lat,
          lng: r.lng,
          photoUrl: r.photoUrl?.startsWith("/") ? r.photoUrl : null,
          avatarSeed: r.avatarSeed,
          ...(circleRef ? { circleId: circleRef.id } : {}),
          ...(matchRef ? { matchId: matchRef.id } : {}),
        } satisfies GiftDoc);
        if (circleRef && cs?.exists()) {
          const c = cs.data() as CircleDoc;
          tx.update(circleRef, {
            raisedCents: c.raisedCents + amount,
            giftCount: c.giftCount + 1,
            lastGiftId: giftRef.id,
            members: { ...c.members, [me.id]: me.displayName },
          });
        }
        if (matchRef && ms_?.exists()) {
          const m_ = ms_.data() as MatchDoc;
          tx.update(matchRef, { matchCount: m_.matchCount + 1, matchedCents: m_.matchedCents + amount, lastGiftId: giftRef.id });
        }
        tx.update(reqRef, {
          fundedCents: r.fundedCents + amount,
          giftCount: r.giftCount + 1,
          lastGiftId: giftRef.id,
          ...(clears ? { status: "funded", fundedAt: now } : {}),
        });
        tx.set(doc(db, "requests", input.requestId, "wall", giftRef.id), {
          amountCents: amount,
          kind,
          fromName: input.anonymous ? null : me.displayName,
          fromAvatar: input.anonymous ? null : (me.photoURL ?? me.avatarSeed),
          status: "settled",
          createdAt: now,
        } satisfies WallDoc);
        tx.set(statsRef, {
          displayName: me.anonymousByDefault ? null : me.displayName,
          avatar: me.anonymousByDefault ? null : me.photoURL,
          anonymous: me.anonymousByDefault,
          totalCents: (p?.totalCents ?? 0) + amount,
          giftCount: (p?.giftCount ?? 0) + 1,
          requests: { ...(p?.requests ?? {}), [input.requestId]: true },
          cleared: clears ? { ...(p?.cleared ?? {}), [input.requestId]: true } : (p?.cleared ?? {}),
          weeks: { ...(p?.weeks ?? {}), [String(weekIndex(Date.now()))]: true },
          lastGiftId: giftRef.id,
          lastGiftAt: now,
        } satisfies PatronStatsDoc);
        tx.update(globalRef, {
          totalCents: g.totalCents + amount,
          giftCount: g.giftCount + 1,
          debtsCleared: g.debtsCleared + (clears ? 1 : 0),
          lastGiftId: giftRef.id,
        });
        return {
          amount,
          clears,
          card: toCard(input.requestId, {
            ...r,
            fundedCents: r.fundedCents + amount,
            giftCount: r.giftCount + 1,
            status: clears ? "funded" : r.status,
          }),
        };
      });
      // Giving auto-follows the person, so their updates and milestones reach this Patron's activity inbox.
      const pct = out.card.fundedCents / Math.max(1, out.card.goalCents);
      const seenPct = pct >= 1 ? 100 : pct >= 0.75 ? 75 : pct >= 0.5 ? 50 : pct >= 0.25 ? 25 : 0;
      void setDoc(doc(db, "users", me.id, "follows", input.requestId), { createdAt: serverTimestamp(), seenAt: serverTimestamp(), seenPct }).catch(() => undefined);
      const t = Date.now();
      forgetRequests(); // a read that raced the transaction may hold pre-gift totals
      return { gift: { id: giftRef.id, amountCents: out.amount, createdAt: t, undoUntil: t + UNDO_WINDOW_MS }, request: out.card, cleared: out.clears };
    } catch (e) {
      return friendly(e);
    }
  },

  /** Undo within 2 minutes: reverses the gift once and compensates every total. */
  async reverseGift(giftId: string): Promise<{ ok: true; request: RequestCard | null }> {
    forgetRequests();
    const me = requireUser("patron");
    const giftRef = doc(giftsCol, giftId);
    const statsRef = doc(db, "patronStats", me.id);
    const globalRef = doc(db, "stats", "global");
    try {
      const card = await runTransaction(db, async (tx) => {
        const gsnap = await tx.get(giftRef);
        if (!gsnap.exists()) throw new ApiError(404, "Gift not found.");
        const gift = gsnap.data() as GiftDoc<{ toMillis(): number }>;
        if (gift.status === "reversed") return null;
        if (Date.now() - gift.createdAt.toMillis() > UNDO_WINDOW_MS) throw new ApiError(409, "The undo window for this gift has closed.");
        const reqRef = doc(db, "requests", gift.requestId);
        const [rs, ps, gs] = await Promise.all([tx.get(reqRef), tx.get(statsRef), tx.get(globalRef)]);
        const r = rs.data() as RequestDoc;
        const p = ps.data() as PatronStatsDoc;
        const g = gs.data() as GlobalStatsDoc;
        const now = serverTimestamp();
        const wasFunded = r.status === "funded";
        tx.update(giftRef, { status: "reversed", reversedAt: now });
        tx.update(reqRef, {
          fundedCents: r.fundedCents - gift.amountCents,
          giftCount: r.giftCount - 1,
          lastGiftId: giftId,
          ...(wasFunded ? { status: "active", fundedAt: null } : {}),
        });
        tx.update(doc(db, "requests", gift.requestId, "wall", giftId), { status: "reversed" });
        const cleared = { ...p.cleared };
        if (wasFunded) delete cleared[gift.requestId];
        tx.update(statsRef, {
          totalCents: p.totalCents - gift.amountCents,
          giftCount: p.giftCount - 1,
          cleared,
          lastGiftId: giftId,
          lastGiftAt: now,
        });
        tx.update(globalRef, {
          totalCents: g.totalCents - gift.amountCents,
          giftCount: g.giftCount - 1,
          debtsCleared: g.debtsCleared - (wasFunded ? 1 : 0),
          lastGiftId: giftId,
        });
        return toCard(gift.requestId, {
          ...r,
          fundedCents: r.fundedCents - gift.amountCents,
          giftCount: r.giftCount - 1,
          status: wasFunded ? "active" : r.status,
        });
      });
      return { ok: true, request: card };
    } catch (e) {
      return friendly(e);
    }
  },

  async report(requestId: string, reason: string, note?: string) {
    const fb = getSession().firebaseUser;
    if (!fb) throw new ApiError(401, "Sign in to report a story.");
    await addDoc(collection(db, "reports"), { requestId, reporterId: fb.uid, reason, note: note ?? null, createdAt: serverTimestamp() });
    return { ok: true as const };
  },

  // ---- patron insight ----------------------------------------------------------------------------
  async impact(): Promise<Impact & { month: NarrativeInput; memberSince: number | null }> {
    const me = requireUser("patron");
    const [giftSnap, reqs] = await Promise.all([
      getDocs(query(giftsCol, where("patronId", "==", me.id), orderBy("createdAt", "desc"))),
      allRequests(),
    ]);
    const status = new Map(reqs.map(({ id, r }) => [id, r.status]));
    const rows = giftSnap.docs
      .map((d) => ({ id: d.id, g: data<GiftDoc>(d) }))
      .filter(({ g }) => g.status === "settled")
      .map(({ id, g }) => ({ ...g, id, createdAtMs: ms(g.createdAt) }));

    const totalCents = rows.reduce((s, r) => s + r.amountCents, 0);
    const people = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!people.has(r.requestId)) people.set(r.requestId, r);
    const cleared = [...people.values()].filter((r) => status.get(r.requestId) === "funded");
    const activeWeeks = new Set(rows.map((r) => weekIndex(r.createdAtMs))).size;

    const places = new Map<string, Impact["places"][number] & { set: Set<string> }>();
    for (const r of rows) {
      if (r.lat == null || r.lng == null) continue;
      const key = `${r.city}|${r.countryCode}`;
      const p = places.get(key) ?? { city: r.city, country: r.country, countryCode: r.countryCode, lat: r.lat, lng: r.lng, totalCents: 0, people: [], set: new Set<string>() };
      p.totalCents += r.amountCents;
      p.set.add(r.requestName);
      places.set(key, p);
    }
    const byCategory = new Map<Category, number>();
    for (const r of rows) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amountCents);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const streakWeeks = givingStreakWeeks(rows.map((r) => r.createdAtMs));

    return {
      month: {
        monthName: now.toLocaleString("en-US", { month: "long" }),
        streakWeeks,
        gifts: rows
          .filter((r) => r.createdAtMs >= monthStart)
          .map((r) => ({ amountCents: r.amountCents, firstName: r.requestName, city: r.city, country: r.country, category: r.category, cleared: status.get(r.requestId) === "funded" })),
      },
      memberSince: rows.length ? Math.min(...rows.map((r) => r.createdAtMs)) : null,
      totals: {
        totalCents,
        giftCount: rows.length,
        peopleHelped: people.size,
        debtsCleared: cleared.length,
        streakWeeks,
        countries: new Set(rows.map((r) => r.countryCode)).size,
        generosityIndex: generosityIndex({ peopleHelped: people.size, debtsCleared: cleared.length, activeWeeks }),
      },
      series: weeklySeries(rows.map((r) => ({ createdAt: r.createdAtMs, amountCents: r.amountCents })), 26),
      places: [...places.values()].map(({ set, ...p }) => ({ ...p, people: [...set] })).sort((a, b) => b.totalCents - a.totalCents),
      byCategory: [...byCategory].map(([category, totalCents]) => ({ category, totalCents })),
      recent: rows.slice(0, 8).map((r) => ({
        giftId: r.id,
        requestId: r.requestId,
        firstName: r.requestName,
        category: r.category,
        country: r.country,
        avatarSeed: r.avatarSeed,
        photoUrl: r.photoUrl,
        amountCents: r.amountCents,
        kind: r.kind,
        anonymous: r.anonymous,
        createdAt: r.createdAtMs,
        cleared: status.get(r.requestId) === "funded",
      })),
      cleared: cleared.slice(0, 8).map((r) => ({ requestId: r.requestId, firstName: r.requestName, avatarSeed: r.avatarSeed, photoUrl: r.photoUrl })),
    };
  },

  async leaderboard(): Promise<{ entries: LeaderboardEntry[] }> {
    const me = getSession().user;
    const snap = await getDocs(collection(db, "patronStats"));
    const entries = snap.docs
      .map((d) => {
        const p = data<PatronStatsDoc>(d);
        const isYou = d.id === me?.id;
        const stats = {
          peopleHelped: Object.keys(p.requests ?? {}).length,
          debtsCleared: Object.keys(p.cleared ?? {}).length,
          activeWeeks: Object.keys(p.weeks ?? {}).length,
        };
        return {
          id: d.id,
          displayName: p.anonymous ? (isYou ? "You (anonymous)" : "Anonymous Patron") : (p.displayName ?? "Patron"),
          avatarSeed: p.anonymous ? "anonymous" : d.id,
          photo: p.anonymous ? null : p.avatar,
          anonymous: p.anonymous,
          isYou,
          totalCents: p.totalCents,
          ...stats,
          index: generosityIndex(stats),
        };
      })
      .filter((e) => e.totalCents > 0)
      .sort((a, b) => b.index - a.index || b.totalCents - a.totalCents)
      .map((e, i) => ({ ...e, rank: i + 1 }));
    return { entries };
  },

  // ---- seeker ------------------------------------------------------------------------------------
  async myRequests(): Promise<{ requests: RequestCard[] }> {
    const me = requireUser("seeker");
    const snap = await getDocs(query(requestsCol, where("seekerId", "==", me.id), orderBy("createdAt", "desc")));
    const out = snap.docs.map((d) => ({ id: d.id, r: data<RequestDoc>(d) }));
    await Promise.all(out.map(({ id, r }) => settleVerification(id, r)));
    return { requests: out.map(({ id, r }) => toCard(id, r)) };
  },

  async myRequest(id: string): Promise<{ request: RequestDetail; gifts: SeekerGift[] }> {
    requireUser("seeker");
    const [{ request }, wall] = await Promise.all([
      api.story(id),
      getDocs(query(collection(db, "requests", id, "wall"), orderBy("createdAt", "desc"), limit(100))),
    ]);
    return {
      request,
      gifts: wall.docs
        .map((d) => ({ id: d.id, w: data<WallDoc>(d) }))
        .filter(({ w }) => w.status === "settled")
        .map(({ id: gid, w }) => ({
          id: gid,
          amountCents: w.amountCents,
          kind: w.kind,
          createdAt: ms(w.createdAt),
          from: w.fromName,
          avatarSeed: w.fromAvatar && !w.fromAvatar.startsWith("/") && !w.fromAvatar.startsWith("http") ? w.fromAvatar : "anonymous",
          photo: w.fromAvatar && (w.fromAvatar.startsWith("/") || w.fromAvatar.startsWith("http")) ? w.fromAvatar : null,
        })),
    };
  },

  async createRequest(input: NewRequestInput): Promise<{ request: RequestCard }> {
    forgetRequests();
    const me = requireUser("seeker");
    const geo = countryCentroid(input.countryCode);
    const goalCents = input.breakdown.reduce((s, b) => s + b.amountCents, 0);
    const doc_: RequestDoc = {
      seekerId: me.id,
      firstName: input.firstName,
      age: input.age,
      city: input.city,
      country: input.country,
      countryCode: input.countryCode,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      category: input.category,
      headline: input.headline,
      story: input.story,
      breakdown: input.breakdown,
      goalCents,
      fundedCents: 0,
      giftCount: 0,
      status: "active",
      verification: input.documentKey ? "pending" : "unverified",
      verificationRequestedAt: input.documentKey ? serverTimestamp() : null,
      avatarSeed: `${input.firstName}-${me.id}`,
      photoUrl: input.photoKey,
      blurPhoto: input.blurPhoto,
      isDemo: true,
      createdAt: serverTimestamp(),
      fundedAt: null,
      lastGiftId: null,
    };
    try {
      const ref = await addDoc(requestsCol, doc_);
      await updateDoc(doc(db, "users", me.id), { displayName: input.firstName });
      return { request: toCard(ref.id, { ...doc_, createdAt: Date.now() }) };
    } catch (e) {
      return friendly(e);
    }
  },

  async updateRequest(id: string, patch: { status?: "active" | "paused" | "closed"; blurPhoto?: boolean }) {
    forgetRequests();
    requireUser("seeker");
    try {
      await updateDoc(doc(db, "requests", id), patch);
      return { request: (await api.story(id)).request };
    } catch (e) {
      return friendly(e);
    }
  },

  async postUpdate(id: string, kind: "update" | "thanks", body: string) {
    requireUser("seeker");
    try {
      const ref = await addDoc(collection(db, "requests", id, "updates"), { kind, body, createdAt: serverTimestamp() });
      return { update: { id: ref.id, kind, body, createdAt: Date.now() } as SeekerUpdate };
    } catch (e) {
      return friendly(e);
    }
  },

  /** Starts the (simulated) document review: pending now, verified ~20s later. */
  async attachDocument(id: string, _documentKey: string | null) {
    requireUser("seeker");
    try {
      await updateDoc(doc(db, "requests", id), { verification: "pending", verificationRequestedAt: serverTimestamp() });
      return { request: (await api.story(id)).request };
    } catch (e) {
      return friendly(e);
    }
  },

  /**
   * Photos are resized on-device and stored inline (the free Spark plan has no Cloud Storage).
   * Proof documents are never uploaded in this demo — review is simulated.
   */
  async upload(file: File, kind: "photo" | "proof"): Promise<{ key: string | null; stored: boolean }> {
    if (kind === "proof") return { key: `proof:${file.name}`, stored: false };
    return { key: await compressImage(file, 480, 0.78), stored: true };
  },
};

/** Mock review: "pending" flips to "verified" 20s after submission (rules enforce the delay). */
async function settleVerification(id: string, r: RequestDoc) {
  const at = r.verificationRequestedAt ? ms(r.verificationRequestedAt) : 0;
  if (r.verification === "pending" && at && Date.now() - at > 21_000) {
    try {
      await updateDoc(doc(db, "requests", id), { verification: "verified" });
      r.verification = "verified";
    } catch {
      /* not yet allowed — try again on the next refresh */
    }
  }
}

async function compressImage(file: File, maxSide: number, quality: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/webp", quality);
  if (url.length > 150_000) return canvas.toDataURL("image/jpeg", 0.6);
  return url;
}
