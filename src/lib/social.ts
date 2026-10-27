import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { Category, RequestCard } from "@shared/domain";
import type {
  CircleDoc,
  FollowDoc,
  GiftDoc,
  MatchDoc,
  MediaDoc,
  RecurringDoc,
  ReportDoc,
  RequestDoc,
  UpdateDoc,
  UserDoc,
} from "@shared/firestore";
import { remainingCents } from "@shared/money";
import { affinity, buildProfile } from "@shared/rank";
import { activeRequestCards, api, ApiError, forgetRequests, friendly, toCard } from "./api";
import { db } from "./firebase";
import { getSession } from "./session";

// Firestore-backed social features for Give. Everything runs on the free Spark plan: there is no server,
// so "notifications" are an on-device activity inbox and recurring gifts run when the Patron opens Give.

const ms = (t: unknown): number => {
  if (t && typeof t === "object" && "toMillis" in t) return (t as { toMillis(): number }).toMillis();
  return typeof t === "number" ? t : 0;
};
const data = <T>(s: DocumentSnapshot<DocumentData> | QueryDocumentSnapshot<DocumentData>) =>
  s.data({ serverTimestamps: "estimate" }) as T;
function me() {
  const u = getSession().user;
  if (!u) throw new ApiError(401, "Sign in to continue");
  return u;
}
const milestoneOf = (pct: number) => (pct >= 1 ? 100 : pct >= 0.75 ? 75 : pct >= 0.5 ? 50 : pct >= 0.25 ? 25 : 0);

// ---- preferences: causes & budget ------------------------------------------------------------------
export interface Prefs {
  causes: { categories: Category[]; countries: string[] };
  budgetCents: number;
}

export async function getPrefs(): Promise<Prefs> {
  const s = await getDoc(doc(db, "users", me().id));
  const u = s.data() as UserDoc | undefined;
  return {
    causes: { categories: (u?.causes?.categories ?? []) as Category[], countries: u?.causes?.countries ?? [] },
    budgetCents: u?.budgetCents ?? 500_000,
  };
}
/** Matches firestore.rules: up to 5 kinds of debt and 10 places. */
export const MAX_CAUSE_PLACES = 10;

export async function savePrefs(p: Partial<Prefs>) {
  if (p.causes && p.causes.countries.length > MAX_CAUSE_PLACES) throw new ApiError(400, `Pick up to ${MAX_CAUSE_PLACES} places.`);
  await updateDoc(doc(db, "users", me().id), { ...(p.causes ? { causes: p.causes } : {}), ...(p.budgetCents ? { budgetCents: p.budgetCents } : {}) }).catch(friendly);
}

// ---- follows ----------------------------------------------------------------------------------------
export async function follow(requestId: string, pct = 0) {
  await setDoc(doc(db, "users", me().id, "follows", requestId), { createdAt: serverTimestamp(), seenAt: serverTimestamp(), seenPct: milestoneOf(pct) });
}
export async function unfollow(requestId: string) {
  await deleteDoc(doc(db, "users", me().id, "follows", requestId));
}
export async function isFollowing(requestId: string) {
  const u = getSession().user;
  if (!u) return false;
  return (await getDoc(doc(db, "users", u.id, "follows", requestId))).exists();
}

// ---- activity inbox: milestones, updates, cleared ---------------------------------------------------
export interface ActivityItem {
  id: string;
  kind: "milestone" | "update" | "thanks" | "cleared";
  requestId: string;
  card: RequestCard;
  title: string;
  body: string;
  /** When it happened (ms), or 0 for milestones, which are a status rather than a timed event. */
  at: number;
  unread: boolean;
  /** Milestones invite "one more push"; cleared items celebrate. */
  pct: number;
}

/**
 * Fan-out-on-read: for everyone you follow (giving auto-follows), look at their latest totals and updates
 * and turn changes since you last looked into activity. No server needed.
 */
export async function activity(): Promise<{ items: ActivityItem[]; unread: number }> {
  const u = me();
  const follows = await getDocs(query(collection(db, "users", u.id, "follows"), limit(60)));
  const rows = follows.docs.map((f) => ({ id: f.id, f: data<FollowDoc>(f) }));
  // Followed stories in batches of 30 (Firestore's "in" limit) rather than one read each.
  const reqs = new Map<string, RequestDoc>();
  const ids = rows.map((r) => r.id);
  await Promise.all(
    Array.from({ length: Math.ceil(ids.length / 30) }, (_, i) =>
      getDocs(query(collection(db, "requests"), where(documentId(), "in", ids.slice(i * 30, i * 30 + 30)))).then((s) =>
        s.docs.forEach((d) => reqs.set(d.id, data<RequestDoc>(d))),
      ),
    ),
  );
  const items: ActivityItem[] = [];
  await Promise.all(
    rows.map(async ({ id, f }) => {
      const r = reqs.get(id);
      if (!r) return;
      const ups = await getDocs(query(collection(db, "requests", id, "updates"), orderBy("createdAt", "desc"), limit(3)));
      const card = toCard(id, r);
      const pct = r.fundedCents / Math.max(1, r.goalCents);
      const seenAt = ms(f.seenAt);
      for (const d of ups.docs) {
        const up = data<UpdateDoc>(d);
        const at = ms(up.createdAt);
        if (at < ms(f.createdAt) - 14 * 86_400_000) continue;
        items.push({
          id: `${id}-${d.id}`,
          kind: up.kind === "thanks" ? "thanks" : "update",
          requestId: id,
          card,
          title: up.kind === "thanks" ? `${r.firstName} said thank you` : `${r.firstName} posted an update`,
          body: up.body,
          at,
          unread: at > seenAt,
          pct,
        });
      }
      if (r.status === "funded") {
        const at = ms(r.fundedAt) || Date.now();
        items.push({ id: `${id}-cleared`, kind: "cleared", requestId: id, card, title: `${r.firstName}’s debt is cleared`, body: `Every dollar is covered — ${r.giftCount} gifts in all. You were part of it.`, at, unread: (f.seenPct ?? 0) < 100, pct: 1 });
      } else {
        const m = milestoneOf(pct);
        if (m >= 50) {
          items.push({
            id: `${id}-m${m}`,
            kind: "milestone",
            requestId: id,
            card,
            title: `${r.firstName} is ${m}% there`,
            body: `${(remainingCents(r.goalCents, r.fundedCents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} to go. One more push could finish it.`,
            // A milestone is a status, not a timed event (there's no record of when it was crossed), so it
            // carries no time and sorts after dated items with the same read state.
            at: 0,
            unread: m > (f.seenPct ?? 0),
            pct,
          });
        }
      }
    }),
  );
  items.sort((a, b) => Number(b.unread) - Number(a.unread) || b.at - a.at);
  return { items, unread: items.filter((i) => i.unread).length };
}

export async function markActivitySeen(items: ActivityItem[]) {
  const u = me();
  const byReq = new Map<string, number>();
  for (const i of items) byReq.set(i.requestId, Math.max(byReq.get(i.requestId) ?? 0, milestoneOf(i.pct)));
  await Promise.all(
    [...byReq].map(([rid, pct]) => updateDoc(doc(db, "users", u.id, "follows", rid), { seenAt: serverTimestamp(), seenPct: pct }).catch(() => undefined)),
  );
}

// ---- giving circles ---------------------------------------------------------------------------------
export interface Circle extends Omit<CircleDoc<number>, "createdAt"> {
  id: string;
  createdAt: number;
}
const toCircle = (id: string, c: CircleDoc): Circle => ({ ...(c as unknown as CircleDoc<number>), id, createdAt: ms(c.createdAt) });

export async function createCircle(requestId: string, name: string): Promise<string> {
  const u = me();
  const r = await getDoc(doc(db, "requests", requestId));
  if (!r.exists()) throw new ApiError(404, "We couldn’t find that story.");
  const rd = data<RequestDoc>(r);
  const ref = await addDoc(collection(db, "circles"), {
    name,
    requestId,
    requestName: rd.firstName,
    photoUrl: rd.photoUrl?.startsWith("/") ? rd.photoUrl : null,
    createdBy: u.id,
    createdByName: u.displayName,
    members: { [u.id]: u.displayName },
    raisedCents: 0,
    giftCount: 0,
    lastGiftId: null,
    createdAt: serverTimestamp(),
  } satisfies CircleDoc);
  return ref.id;
}

export async function joinCircle(id: string) {
  const u = me();
  await updateDoc(doc(db, "circles", id), { [`members.${u.id}`]: u.displayName });
}

/** Live circle + its request, for the shared progress bar. */
export function watchCircle(id: string, cb: (v: { circle: Circle; request: RequestCard } | null) => void, onError: (e: Error) => void) {
  let circle: Circle | null = null;
  let request: RequestCard | null = null;
  let unReq: (() => void) | null = null;
  const emit = () => circle && request && cb({ circle, request });
  const unCircle = onSnapshot(
    doc(db, "circles", id),
    (s) => {
      if (!s.exists()) return cb(null);
      const c = toCircle(s.id, data<CircleDoc>(s));
      if (!circle || circle.requestId !== c.requestId) {
        unReq?.();
        unReq = onSnapshot(doc(db, "requests", c.requestId), (rs) => {
          request = toCard(rs.id, data<RequestDoc>(rs));
          emit();
        });
      }
      circle = c;
      emit();
    },
    onError,
  );
  return () => {
    unCircle();
    unReq?.();
  };
}

export async function listCircles(): Promise<Circle[]> {
  const s = await getDocs(query(collection(db, "circles"), orderBy("createdAt", "desc"), limit(24)));
  return s.docs.map((d) => toCircle(d.id, data<CircleDoc>(d)));
}

// ---- match my gift ----------------------------------------------------------------------------------
export interface Match extends Omit<MatchDoc<number>, "createdAt"> {
  id: string;
  createdAt: number;
}
export async function createMatch(giftId: string): Promise<string> {
  const u = me();
  const g = data<GiftDoc>(await getDoc(doc(db, "gifts", giftId)));
  const ref = await addDoc(collection(db, "matches"), {
    requestId: g.requestId,
    requestName: g.requestName,
    photoUrl: g.photoUrl,
    amountCents: g.amountCents,
    fromName: g.anonymous || u.anonymousByDefault ? "A Patron" : u.displayName,
    createdBy: u.id,
    matchCount: 0,
    matchedCents: 0,
    lastGiftId: giftId,
    createdAt: serverTimestamp(),
  } satisfies MatchDoc);
  return ref.id;
}
export function watchMatch(id: string, cb: (v: { match: Match; request: RequestCard } | null) => void, onError: (e: Error) => void) {
  let match: Match | null = null;
  let request: RequestCard | null = null;
  let unReq: (() => void) | null = null;
  const un = onSnapshot(
    doc(db, "matches", id),
    (s) => {
      if (!s.exists()) return cb(null);
      const m = { ...(data<MatchDoc>(s) as unknown as MatchDoc<number>), id: s.id, createdAt: ms(data<MatchDoc>(s).createdAt) };
      if (!match) {
        unReq = onSnapshot(doc(db, "requests", m.requestId), (rs) => {
          request = toCard(rs.id, data<RequestDoc>(rs));
          if (match && request) cb({ match, request });
        });
      }
      match = m;
      if (request) cb({ match, request });
    },
    onError,
  );
  return () => {
    un();
    unReq?.();
  };
}

// ---- recurring gifts --------------------------------------------------------------------------------
export interface Recurring extends Omit<RecurringDoc<number>, "createdAt" | "lastRunAt"> {
  id: string;
  createdAt: number;
  lastRunAt: number | null;
}
const RECUR_MS = 30 * 86_400_000;

export async function listRecurring(): Promise<Recurring[]> {
  const s = await getDocs(collection(db, "users", me().id, "recurring"));
  return s.docs.map((d) => {
    const r = data<RecurringDoc>(d);
    return { ...(r as unknown as Recurring), id: d.id, createdAt: ms(r.createdAt), lastRunAt: r.lastRunAt ? ms(r.lastRunAt) : null };
  });
}
export async function saveRecurring(amountCents: number, rule: RecurringDoc["rule"]) {
  await addDoc(collection(db, "users", me().id, "recurring"), { amountCents, rule, active: true, lastRunAt: null, createdAt: serverTimestamp() });
}
export async function setRecurringActive(id: string, active: boolean) {
  await updateDoc(doc(db, "users", me().id, "recurring", id), { active });
}
export async function deleteRecurring(id: string) {
  await deleteDoc(doc(db, "users", me().id, "recurring", id));
}

/**
 * Runs pledges that are due (monthly). With no server on the Spark plan, this happens the next time the
 * Patron opens Give — each run is a normal gift (with the usual 2-minute undo).
 */
export async function runDueRecurring(): Promise<{ name: string; amountCents: number; giftId: string }[]> {
  const u = getSession().user;
  if (!u || u.role !== "patron") return [];
  const due = (await listRecurring()).filter((r) => r.active && (!r.lastRunAt || Date.now() - r.lastRunAt > RECUR_MS));
  if (!due.length) return [];
  const [cards, prefs, follows] = await Promise.all([activeRequestCards(), getPrefs(), getDocs(collection(db, "users", u.id, "follows"))]);
  const followed = new Set(follows.docs.map((d) => d.id));
  const profile = buildProfile([], prefs.causes);
  const results: { name: string; amountCents: number; giftId: string }[] = [];
  for (const r of due) {
    // Only ever give within the pledge's rule — if no one fits (e.g. nobody followed yet), try again next visit.
    const pool = cards.filter((c) =>
      r.rule === "followed" ? followed.has(c.id) : r.rule === "cause" ? affinity(c, profile) >= 0.8 : c.verification === "verified",
    );
    const target = pool
      .filter((c) => remainingCents(c.goalCents, c.fundedCents) > 0)
      .sort((a, b) => b.fundedCents / b.goalCents - a.fundedCents / a.goalCents)[0];
    if (!target) continue;
    // Gifts are limited to one per second per Patron.
    if (results.length) await new Promise((res) => setTimeout(res, 1100));
    try {
      const res = await api.give({ requestId: target.id, amountCents: Math.min(r.amountCents, remainingCents(target.goalCents, target.fundedCents)), kind: "give", anonymous: u.anonymousByDefault });
      await updateDoc(doc(db, "users", u.id, "recurring", r.id), { lastRunAt: Timestamp.now() });
      results.push({ name: target.firstName, amountCents: res.gift.amountCents, giftId: res.gift.id });
      cards.splice(cards.indexOf(target), 1, res.request);
    } catch {
      /* try again next visit */
    }
  }
  return results;
}

// ---- thank-you voice notes & short videos -----------------------------------------------------------
export async function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}
export async function postMediaThanks(requestId: string, input: { blob: Blob; kind: "voice" | "video"; durationSec: number; caption: string | null; body: string }) {
  // Check the note first so a rejected update never leaves an orphaned recording behind.
  const body = input.body.trim();
  if (body.length < 4 || body.length > 600) throw new ApiError(400, "Add a short message (4–600 characters) to go with it.");
  const dataUrl = await blobToDataUrl(input.blob);
  if (dataUrl.length > 900_000) throw new ApiError(413, input.kind === "voice" ? "That note is a little long — keep it under 45 seconds." : "Keep videos under 15 seconds.");
  const media = await addDoc(collection(db, "requests", requestId, "media"), {
    kind: input.kind,
    dataUrl,
    mime: input.blob.type || (input.kind === "voice" ? "audio/webm" : "video/webm"),
    durationSec: Math.max(1, Math.round(input.durationSec)),
    caption: input.caption,
    createdAt: serverTimestamp(),
  } satisfies MediaDoc);
  await addDoc(collection(db, "requests", requestId, "updates"), { kind: "thanks", body, mediaId: media.id, createdAt: serverTimestamp() });
}
export async function getMedia(requestId: string, mediaId: string): Promise<MediaDoc<number> | null> {
  const s = await getDoc(doc(db, "requests", requestId, "media", mediaId));
  return s.exists() ? (data<MediaDoc>(s) as unknown as MediaDoc<number>) : null;
}

// ---- moderation -------------------------------------------------------------------------------------
export async function isModerator(): Promise<boolean> {
  const u = getSession().firebaseUser;
  if (!u) return false;
  try {
    return (await getDoc(doc(db, "admins", u.uid))).exists();
  } catch {
    return false;
  }
}
export interface Report extends Omit<ReportDoc<number>, "createdAt"> {
  id: string;
  createdAt: number;
}
export async function moderationQueue(): Promise<{ reports: Report[]; pending: RequestCard[]; all: (RequestCard & { seekerId: string })[] }> {
  const [reps, reqs] = await Promise.all([
    getDocs(query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(100))),
    getDocs(collection(db, "requests")),
  ]);
  const all = reqs.docs.map((d) => ({ ...toCard(d.id, data<RequestDoc>(d)), seekerId: data<RequestDoc>(d).seekerId }));
  return {
    reports: reps.docs.map((d) => ({ ...(data<ReportDoc>(d) as unknown as Report), id: d.id, createdAt: ms(data<ReportDoc>(d).createdAt) })),
    pending: all.filter((c) => c.verification === "pending"),
    all,
  };
}
export async function setReportStatus(id: string, status: "open" | "resolved" | "dismissed") {
  await updateDoc(doc(db, "reports", id), { status });
}
export async function moderate(requestId: string, patch: { verification?: "unverified" | "pending" | "verified"; status?: "active" | "paused" | "closed" }) {
  forgetRequests();
  await updateDoc(doc(db, "requests", requestId), patch);
}

// ---- year in review ("Wrapped") ---------------------------------------------------------------------
export interface Wrapped {
  year: number;
  totalCents: number;
  giftCount: number;
  people: number;
  countries: string[];
  cleared: number;
  topCategory: Category | null;
  biggest: { amountCents: number; name: string; city: string; photoUrl: string | null } | null;
  firstGiftAt: number | null;
  busiestMonth: string | null;
  faces: { name: string; photoUrl: string | null; avatarSeed: string }[];
}
export async function wrapped(year = new Date().getFullYear()): Promise<Wrapped> {
  const u = me();
  const [gs, reqs] = await Promise.all([
    getDocs(query(collection(db, "gifts"), where("patronId", "==", u.id), orderBy("createdAt", "asc"))),
    getDocs(query(collection(db, "requests"), where("status", "==", "funded"))),
  ]);
  const funded = new Set(reqs.docs.map((d) => d.id));
  const gifts = gs.docs.map((d) => data<GiftDoc>(d)).filter((g) => g.status === "settled" && new Date(ms(g.createdAt)).getFullYear() === year);
  const byCat = new Map<Category, number>();
  const byMonth = new Map<string, number>();
  for (const g of gifts) {
    byCat.set(g.category, (byCat.get(g.category) ?? 0) + g.amountCents);
    const m = new Date(ms(g.createdAt)).toLocaleString("en-US", { month: "long" });
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }
  const people = new Map(gifts.map((g) => [g.requestId, g]));
  const biggest = [...gifts].sort((a, b) => b.amountCents - a.amountCents)[0];
  return {
    year,
    totalCents: gifts.reduce((s, g) => s + g.amountCents, 0),
    giftCount: gifts.length,
    people: people.size,
    countries: [...new Set(gifts.map((g) => g.country))],
    cleared: [...people.keys()].filter((id) => funded.has(id)).length,
    topCategory: [...byCat].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    biggest: biggest ? { amountCents: biggest.amountCents, name: biggest.requestName, city: biggest.city, photoUrl: biggest.photoUrl } : null,
    firstGiftAt: gifts[0] ? ms(gifts[0].createdAt) : null,
    busiestMonth: [...byMonth].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    faces: [...people.values()].slice(-24).map((g) => ({ name: g.requestName, photoUrl: g.photoUrl, avatarSeed: g.avatarSeed })),
  };
}

/** Every active story — used by search, filters' live counts and finishers; shares the deck's read. */
export function activeCards(): Promise<RequestCard[]> {
  return activeRequestCards();
}
