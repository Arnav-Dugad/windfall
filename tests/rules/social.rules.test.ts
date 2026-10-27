import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { deleteField, doc, getDoc, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, type Firestore } from "firebase/firestore";

/**
 * Rules for the social layer: giving circles, "match my gift", follows, recurring pledges, thank-you media,
 * moderation (reports, admins, verification review) and profile preferences.
 */
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "windfall-social-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8085 },
  });
});
afterAll(() => env.cleanup());

const user = (role: "patron" | "seeker", displayName: string) => ({
  role, displayName, anonymousByDefault: false, photoURL: null, isDemo: false, createdAt: Timestamp.now(),
});
const REQUEST = {
  seekerId: "sam", firstName: "Sam", age: 30, city: "Lima", country: "Peru", countryCode: "PE", lat: null, lng: null,
  category: "medical", headline: "A headline here", story: "s".repeat(100), breakdown: [{ label: "Bill", amountCents: 100000 }],
  goalCents: 100000, fundedCents: 0, giftCount: 0, status: "active", verification: "pending", verificationRequestedAt: null,
  avatarSeed: "sam", photoUrl: null, blurPhoto: false, isDemo: true, fundedAt: null, lastGiftId: null,
};
const CIRCLE = (createdBy: string, name: string) => ({
  name: "Lima nurses", requestId: "r1", requestName: "Sam", photoUrl: null, createdBy, createdByName: name,
  members: { [createdBy]: name }, raisedCents: 0, giftCount: 0, lastGiftId: null,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = as(ctx);
    await setDoc(doc(db, "users/pat"), user("patron", "Pat"));
    await setDoc(doc(db, "users/pia"), user("patron", "Pia"));
    await setDoc(doc(db, "users/sam"), user("seeker", "Sam"));
    await setDoc(doc(db, "users/mod"), user("patron", "Mo"));
    await setDoc(doc(db, "admins/mod"), { createdAt: Timestamp.now() });
    await setDoc(doc(db, "requests/r1"), { ...REQUEST, createdAt: Timestamp.now() });
    await setDoc(doc(db, "requests/r2"), { ...REQUEST, firstName: "Ana", createdAt: Timestamp.now() });
    await setDoc(doc(db, "stats/global"), { totalCents: 0, giftCount: 0, debtsCleared: 0, lastGiftId: null });
    await setDoc(doc(db, "reports/rep1"), { requestId: "r1", reporterId: "pia", reason: "duplicate", note: null, status: "open", createdAt: Timestamp.now() });
  });
});

const as = (ctx: { firestore(): unknown }) => ctx.firestore() as Firestore;
const db = (uid: string) => as(env.authenticatedContext(uid));

/** The app's gift transaction (src/lib/api.ts → give), optionally tagged to a circle and/or a match. */
function give(
  uid: string,
  giftId: string,
  amount: number,
  opts: { requestId?: string; circleId?: string; matchId?: string; circleFudge?: number; matchFudge?: number; skipCircle?: boolean } = {},
) {
  const d = db(uid);
  const rid = opts.requestId ?? "r1";
  return runTransaction(d, async (tx) => {
    const r = (await tx.get(doc(d, "requests", rid))).data()!;
    const g = (await tx.get(doc(d, "stats/global"))).data()!;
    const ps = await tx.get(doc(d, "patronStats", uid));
    const c = opts.circleId ? (await tx.get(doc(d, "circles", opts.circleId))).data()! : null;
    const m = opts.matchId ? (await tx.get(doc(d, "matches", opts.matchId))).data()! : null;
    const p = ps.exists() ? ps.data() : { totalCents: 0, giftCount: 0 };
    tx.set(doc(d, "gifts", giftId), {
      patronId: uid, requestId: rid, seekerId: "sam", amountCents: amount, kind: "give", anonymous: false, status: "settled",
      createdAt: serverTimestamp(), requestName: r.firstName, category: "medical", country: "Peru", countryCode: "PE", city: "Lima",
      lat: null, lng: null, photoUrl: null, avatarSeed: "sam",
      ...(opts.circleId ? { circleId: opts.circleId } : {}),
      ...(opts.matchId ? { matchId: opts.matchId } : {}),
    });
    if (c && !opts.skipCircle) {
      tx.update(doc(d, "circles", opts.circleId!), {
        raisedCents: c.raisedCents + amount + (opts.circleFudge ?? 0), giftCount: c.giftCount + 1, lastGiftId: giftId,
        members: { ...c.members, [uid]: uid.toUpperCase() },
      });
    }
    if (m) {
      tx.update(doc(d, "matches", opts.matchId!), { matchCount: m.matchCount + 1, matchedCents: m.matchedCents + amount + (opts.matchFudge ?? 0), lastGiftId: giftId });
    }
    tx.update(doc(d, "requests", rid), { fundedCents: r.fundedCents + amount, giftCount: r.giftCount + 1, lastGiftId: giftId });
    tx.set(doc(d, "requests", rid, "wall", giftId), { amountCents: amount, kind: "give", fromName: uid, fromAvatar: null, status: "settled", createdAt: serverTimestamp() });
    tx.set(doc(d, "patronStats", uid), {
      displayName: uid, avatar: null, anonymous: false, totalCents: p.totalCents + amount, giftCount: p.giftCount + 1,
      requests: { [rid]: true }, cleared: {}, weeks: {}, lastGiftId: giftId, lastGiftAt: serverTimestamp(),
    });
    tx.update(doc(d, "stats/global"), { totalCents: g.totalCents + amount, giftCount: g.giftCount + 1, debtsCleared: g.debtsCleared, lastGiftId: giftId });
  });
}

/** The app's undo transaction (src/lib/api.ts → reverseGift), including the circle/match roll-back. */
function undo(uid: string, giftId: string, opts: { circleId?: string; matchId?: string; fudge?: number } = {}) {
  const d = db(uid);
  return runTransaction(d, async (tx) => {
    const gift = (await tx.get(doc(d, "gifts", giftId))).data()!;
    const r = (await tx.get(doc(d, "requests", gift.requestId))).data()!;
    const p = (await tx.get(doc(d, "patronStats", uid))).data()!;
    const g = (await tx.get(doc(d, "stats/global"))).data()!;
    const c = opts.circleId ? (await tx.get(doc(d, "circles", opts.circleId))).data()! : null;
    const m = opts.matchId ? (await tx.get(doc(d, "matches", opts.matchId))).data()! : null;
    const amount = gift.amountCents as number;
    tx.update(doc(d, "gifts", giftId), { status: "reversed", reversedAt: serverTimestamp() });
    tx.update(doc(d, "requests", gift.requestId), { fundedCents: r.fundedCents - amount, giftCount: r.giftCount - 1, lastGiftId: giftId });
    tx.update(doc(d, "requests", gift.requestId, "wall", giftId), { status: "reversed" });
    if (c) tx.update(doc(d, "circles", opts.circleId!), { raisedCents: c.raisedCents - amount + (opts.fudge ?? 0), giftCount: c.giftCount - 1, lastGiftId: giftId });
    if (m) tx.update(doc(d, "matches", opts.matchId!), { matchCount: m.matchCount - 1, matchedCents: m.matchedCents - amount + (opts.fudge ?? 0), lastGiftId: giftId });
    tx.update(doc(d, "patronStats", uid), { totalCents: p.totalCents - amount, giftCount: p.giftCount - 1, requests: {}, weeks: {}, lastGiftId: giftId, lastGiftAt: serverTimestamp() });
    tx.update(doc(d, "stats/global"), { totalCents: g.totalCents - amount, giftCount: g.giftCount - 1, debtsCleared: g.debtsCleared, lastGiftId: giftId });
  });
}
/** patronStats allows one write per second per Patron. */
const pastRateLimit = () => new Promise((r) => setTimeout(r, 1100));

async function seedCircle() {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(as(ctx), "circles/c1"), { ...CIRCLE("pat", "Pat"), createdAt: Timestamp.now() }));
}

describe("giving circles", () => {
  it("lets a Patron start a circle with only themselves as a member", async () => {
    await assertSucceeds(setDoc(doc(db("pat"), "circles/new"), { ...CIRCLE("pat", "Pat"), createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db("pat"), "circles/x"), { ...CIRCLE("pat", "Pat"), members: { pat: "Pat", pia: "Pia" }, createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db("pat"), "circles/y"), { ...CIRCLE("pat", "Pat"), raisedCents: 5000, createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db("sam"), "circles/z"), { ...CIRCLE("sam", "Sam"), createdAt: serverTimestamp() }));
  });

  it("lets people join themselves, never others, and never bump the total", async () => {
    await seedCircle();
    await assertSucceeds(updateDoc(doc(db("pia"), "circles/c1"), { "members.pia": "Pia" }));
    await assertFails(updateDoc(doc(db("pia"), "circles/c1"), { "members.mod": "Mo" }));
    await assertFails(updateDoc(doc(db("pia"), "circles/c1"), { "members.pat": deleteField() }));
    await assertFails(updateDoc(doc(db("pia"), "circles/c1"), { raisedCents: 1_000_000 }));
  });

  it("moves the pooled total only with a tagged gift of exactly that amount", async () => {
    await seedCircle();
    await assertSucceeds(give("pia", "g1", 4000, { circleId: "c1" }));
    await assertFails(give("pat", "g2", 4000, { circleId: "c1", circleFudge: 1 }));
  });

  it("rejects a circle gift for a different person than the circle's", async () => {
    await seedCircle();
    await assertFails(give("pia", "g3", 4000, { circleId: "c1", requestId: "r2" }));
  });

  it("takes an undone gift back off the pooled total, by exactly its amount", async () => {
    await seedCircle();
    await give("pia", "g1", 4000, { circleId: "c1" });
    await pastRateLimit();
    await assertFails(undo("pia", "g1", { circleId: "c1", fudge: 1000 }));
    await assertSucceeds(undo("pia", "g1", { circleId: "c1" }));
    await assertFails(updateDoc(doc(db("pia"), "circles/c1"), { raisedCents: -4000, giftCount: -1, lastGiftId: "g1" }));
  });
});

describe("match my gift", () => {
  const match = (createdBy: string, giftId: string, amount: number) => ({
    requestId: "r1", requestName: "Sam", photoUrl: null, amountCents: amount, fromName: "Pat", createdBy,
    matchCount: 0, matchedCents: 0, lastGiftId: giftId, createdAt: serverTimestamp(),
  });

  it("can only be created from your own gift, with its real amount", async () => {
    await give("pat", "g1", 4000);
    await assertSucceeds(setDoc(doc(db("pat"), "matches/m1"), match("pat", "g1", 4000)));
    await assertFails(setDoc(doc(db("pat"), "matches/m2"), match("pat", "g1", 9000)));
    await assertFails(setDoc(doc(db("pia"), "matches/m3"), match("pia", "g1", 4000)));
  });

  it("counts a matching gift exactly once, for the same person", async () => {
    await give("pat", "g1", 4000);
    await setDoc(doc(db("pat"), "matches/m1"), match("pat", "g1", 4000));
    await assertFails(give("pia", "g2", 4000, { matchId: "m1", matchFudge: 500 }));
    await assertFails(give("pia", "g3", 4000, { matchId: "m1", requestId: "r2" }));
    await assertSucceeds(give("pia", "g4", 4000, { matchId: "m1" }));
  });

  it("uncounts a matching gift that is undone", async () => {
    await give("pat", "g1", 4000);
    await setDoc(doc(db("pat"), "matches/m1"), match("pat", "g1", 4000));
    await give("pia", "g2", 4000, { matchId: "m1" });
    await pastRateLimit();
    await assertFails(undo("pia", "g2", { matchId: "m1", fudge: 500 }));
    await assertSucceeds(undo("pia", "g2", { matchId: "m1" }));
  });
});

describe("follows and recurring pledges", () => {
  it("keeps follows private to their owner with a fixed shape", async () => {
    const f = { createdAt: serverTimestamp(), seenAt: serverTimestamp(), seenPct: 25 };
    await assertSucceeds(setDoc(doc(db("pat"), "users/pat/follows/r1"), f));
    await assertSucceeds(getDoc(doc(db("pat"), "users/pat/follows/r1")));
    await assertFails(getDoc(doc(db("pia"), "users/pat/follows/r1")));
    await assertFails(setDoc(doc(db("pia"), "users/pat/follows/r2"), f));
    await assertFails(setDoc(doc(db("pat"), "users/pat/follows/r2"), { ...f, spy: true }));
    await assertFails(setDoc(doc(db("pat"), "users/pat/follows/r2"), { ...f, seenPct: 400 }));
  });

  it("validates recurring pledges and keeps them to their owner", async () => {
    const r = { amountCents: 50000, rule: "closest_verified", active: true, lastRunAt: null, createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db("pat"), "users/pat/recurring/p1"), r));
    await assertSucceeds(updateDoc(doc(db("pat"), "users/pat/recurring/p1"), { active: false }));
    await assertFails(setDoc(doc(db("sam"), "users/pat/recurring/p2"), r));
    await assertFails(setDoc(doc(db("pat"), "users/pat/recurring/p3"), { ...r, amountCents: 50 }));
    await assertFails(setDoc(doc(db("pat"), "users/pat/recurring/p4"), { ...r, rule: "everyone" }));
    await assertFails(getDoc(doc(db("pia"), "users/pat/recurring/p1")));
  });
});

describe("thank-you media", () => {
  const media = (kind: "voice" | "video", durationSec: number, size = 2000) => ({
    kind, dataUrl: `data:audio/webm;base64,${"A".repeat(size)}`, mime: "audio/webm", durationSec, caption: "Thank you all", createdAt: serverTimestamp(),
  });

  it("lets only the request's Seeker post, within length limits", async () => {
    await assertSucceeds(setDoc(doc(db("sam"), "requests/r1/media/v1"), media("voice", 30)));
    await assertSucceeds(setDoc(doc(db("sam"), "requests/r1/media/v2"), media("video", 12)));
    await assertFails(setDoc(doc(db("sam"), "requests/r1/media/v3"), media("voice", 60)));
    await assertFails(setDoc(doc(db("sam"), "requests/r1/media/v4"), media("video", 20)));
    await assertFails(setDoc(doc(db("pat"), "requests/r1/media/v5"), media("voice", 10)));
  });

  it("caps the inline size", async () => {
    await assertFails(setDoc(doc(db("sam"), "requests/r1/media/big"), media("voice", 10, 900_100)));
  });

  it("lets updates reference media", async () => {
    await assertSucceeds(setDoc(doc(db("sam"), "requests/r1/updates/u1"), { kind: "thanks", body: "Thank you!", mediaId: "v1", createdAt: serverTimestamp() }));
  });
});

describe("moderation", () => {
  it("shows reports only to moderators, who can only change their status", async () => {
    await assertSucceeds(getDoc(doc(db("mod"), "reports/rep1")));
    await assertFails(getDoc(doc(db("pat"), "reports/rep1")));
    await assertSucceeds(updateDoc(doc(db("mod"), "reports/rep1"), { status: "resolved" }));
    await assertFails(updateDoc(doc(db("mod"), "reports/rep1"), { reason: "other" }));
    await assertFails(updateDoc(doc(db("pat"), "reports/rep1"), { status: "dismissed" }));
  });

  it("lets anyone signed in file an open report", async () => {
    const rep = { requestId: "r1", reporterId: "pat", reason: "misleading", note: "Numbers don't add up", status: "open", createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db("pat"), "reports/n1"), rep));
    await assertFails(setDoc(doc(db("pat"), "reports/n2"), { ...rep, status: "resolved" }));
    await assertFails(setDoc(doc(db("pat"), "reports/n3"), { ...rep, reporterId: "pia" }));
  });

  it("never lets a client grant moderator rights", async () => {
    await assertFails(setDoc(doc(db("pat"), "admins/pat"), { createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db("mod"), "admins/pia"), { createdAt: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(db("mod"), "admins/mod")));
  });

  it("lets moderators review verification and pause, but not touch money", async () => {
    await assertSucceeds(updateDoc(doc(db("mod"), "requests/r1"), { verification: "verified" }));
    await assertSucceeds(updateDoc(doc(db("mod"), "requests/r1"), { status: "paused" }));
    await assertFails(updateDoc(doc(db("mod"), "requests/r1"), { fundedCents: 100 }));
    await assertFails(updateDoc(doc(db("pat"), "requests/r1"), { verification: "verified" }));
  });
});

describe("profile preferences and portrait accents", () => {
  it("accepts causes and a budget, rejects bad values and role changes", async () => {
    const ref = doc(db("pat"), "users/pat");
    await assertSucceeds(updateDoc(ref, { causes: { categories: ["medical", "rent"], countries: ["KE"] }, budgetCents: 250000 }));
    await assertFails(updateDoc(ref, { budgetCents: 10 }));
    await assertFails(updateDoc(ref, { causes: { categories: ["a", "b", "c", "d", "e", "f"], countries: [] } }));
    await assertFails(updateDoc(ref, { role: "seeker" }));
    await assertFails(updateDoc(doc(db("pia"), "users/pat"), { budgetCents: 250000 }));
  });

  it("allows a short accent colour on new requests", async () => {
    const sam = db("sam");
    const base = {
      ...REQUEST, age: null, breakdown: [{ label: "Rent", amountCents: 5000 }], goalCents: 5000, category: "rent",
      verification: "unverified", createdAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(sam, "requests/a1"), { ...base, accent: "#3a7bd5" }));
    await assertSucceeds(setDoc(doc(sam, "requests/a2"), { ...base, accent: null }));
    await assertFails(setDoc(doc(sam, "requests/a3"), { ...base, accent: "url(javascript:alert(1))" }));
  });
});
