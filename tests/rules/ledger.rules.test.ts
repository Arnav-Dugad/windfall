import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { doc, getDoc, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, type Firestore } from "firebase/firestore";

/**
 * The gift ledger lives in firestore.rules. These tests run the real rules in the Firestore emulator
 * (npm run test:rules) and attack them the way a hand-crafted client would.
 */
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "windfall-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8085 },
  });
});
afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = as(ctx);
    await setDoc(doc(db, "users/pat"), { role: "patron", displayName: "Pat", anonymousByDefault: false, photoURL: null, isDemo: false, createdAt: Timestamp.now() });
    await setDoc(doc(db, "users/sam"), { role: "seeker", displayName: "Sam", anonymousByDefault: false, photoURL: null, isDemo: false, createdAt: Timestamp.now() });
    await setDoc(doc(db, "requests/r1"), {
      seekerId: "sam", firstName: "Sam", age: 30, city: "Lima", country: "Peru", countryCode: "PE", lat: null, lng: null,
      category: "medical", headline: "A headline here", story: "s".repeat(100), breakdown: [{ label: "Bill", amountCents: 10000 }],
      goalCents: 10000, fundedCents: 0, giftCount: 0, status: "active", verification: "verified", verificationRequestedAt: null,
      avatarSeed: "sam", photoUrl: null, blurPhoto: false, isDemo: true, createdAt: Timestamp.now(), fundedAt: null, lastGiftId: null,
    });
    await setDoc(doc(db, "stats/global"), { totalCents: 0, giftCount: 0, debtsCleared: 0, lastGiftId: null });
  });
});

// The emulator helper returns the compat type; it is the same modular Firestore at runtime.
const as = (ctx: { firestore(): unknown }) => ctx.firestore() as Firestore;
const patron = () => as(env.authenticatedContext("pat"));

/** The same transaction the app performs (src/lib/api.ts → give). */
function give(db: Firestore, giftId: string, amount: number, opts: { anonymous?: boolean; fudgeFunded?: number } = {}) {
  return runTransaction(db, async (tx) => {
    const r = (await tx.get(doc(db, "requests/r1"))).data()!;
    const g = (await tx.get(doc(db, "stats/global"))).data()!;
    const ps = await tx.get(doc(db, "patronStats/pat"));
    const p = ps.exists() ? ps.data() : { totalCents: 0, giftCount: 0 };
    const clears = r.fundedCents + amount >= r.goalCents;
    tx.set(doc(db, "gifts", giftId), {
      patronId: "pat", requestId: "r1", seekerId: "sam", amountCents: amount, kind: clears ? "clear" : "give",
      anonymous: !!opts.anonymous, status: "settled", createdAt: serverTimestamp(), requestName: "Sam", category: "medical",
      country: "Peru", countryCode: "PE", city: "Lima", lat: null, lng: null, photoUrl: null, avatarSeed: "sam",
    });
    tx.update(doc(db, "requests/r1"), {
      fundedCents: r.fundedCents + amount + (opts.fudgeFunded ?? 0),
      giftCount: r.giftCount + 1,
      lastGiftId: giftId,
      ...(clears ? { status: "funded", fundedAt: serverTimestamp() } : {}),
    });
    tx.set(doc(db, "requests/r1/wall", giftId), {
      amountCents: amount, kind: clears ? "clear" : "give", fromName: opts.anonymous ? null : "Pat", fromAvatar: opts.anonymous ? null : "pat",
      status: "settled", createdAt: serverTimestamp(),
    });
    tx.set(doc(db, "patronStats/pat"), {
      displayName: "Pat", avatar: null, anonymous: false, totalCents: p.totalCents + amount, giftCount: p.giftCount + 1,
      requests: { r1: true }, cleared: {}, weeks: {}, lastGiftId: giftId, lastGiftAt: serverTimestamp(),
    });
    tx.update(doc(db, "stats/global"), { totalCents: g.totalCents + amount, giftCount: g.giftCount + 1, debtsCleared: g.debtsCleared + (clears ? 1 : 0), lastGiftId: giftId });
  });
}

function reverse(db: Firestore, giftId: string) {
  return runTransaction(db, async (tx) => {
    const gift = (await tx.get(doc(db, "gifts", giftId))).data()!;
    const r = (await tx.get(doc(db, "requests/r1"))).data()!;
    const p = (await tx.get(doc(db, "patronStats/pat"))).data()!;
    const g = (await tx.get(doc(db, "stats/global"))).data()!;
    tx.update(doc(db, "gifts", giftId), { status: "reversed", reversedAt: serverTimestamp() });
    tx.update(doc(db, "requests/r1"), {
      fundedCents: r.fundedCents - gift.amountCents, giftCount: r.giftCount - 1, lastGiftId: giftId,
      ...(r.status === "funded" ? { status: "active", fundedAt: null } : {}),
    });
    tx.update(doc(db, "requests/r1/wall", giftId), { status: "reversed" });
    tx.update(doc(db, "patronStats/pat"), { totalCents: p.totalCents - gift.amountCents, giftCount: p.giftCount - 1, lastGiftId: giftId, lastGiftAt: serverTimestamp() });
    tx.update(doc(db, "stats/global"), { totalCents: g.totalCents - gift.amountCents, giftCount: g.giftCount - 1, debtsCleared: g.debtsCleared - (r.status === "funded" ? 1 : 0), lastGiftId: giftId });
  });
}

describe("gift ledger rules", () => {
  it("accepts a consistent gift transaction", async () => {
    await assertSucceeds(give(patron(), "g1", 4000));
  });

  it("accepts a gift that clears the debt and marks it funded", async () => {
    await assertSucceeds(give(patron(), "g1", 10000));
  });

  it("rejects over-funding past the goal", async () => {
    await assertFails(give(patron(), "g1", 12000));
  });

  it("rejects a request total that doesn't match the gift", async () => {
    await assertFails(give(patron(), "g1", 4000, { fudgeFunded: 500 }));
  });

  it("rejects bumping totals without a gift", async () => {
    await assertFails(updateDoc(doc(patron(), "requests/r1"), { fundedCents: 5000, giftCount: 1, lastGiftId: "nope" }));
  });

  it("rejects gifts from Seekers or signed-out visitors", async () => {
    await assertFails(setDoc(doc(as(env.unauthenticatedContext()), "gifts/x"), { patronId: "pat" }));
    const sam = as(env.authenticatedContext("sam"));
    await assertFails(setDoc(doc(sam, "gifts/x"), { patronId: "sam", requestId: "r1", amountCents: 100 }));
  });

  it("undo applies exactly once", async () => {
    await give(patron(), "g1", 4000);
    // The 1-gift-per-second limit also applies to undo; step past it.
    await new Promise((r) => setTimeout(r, 1100));
    await assertSucceeds(reverse(patron(), "g1"));
    await new Promise((r) => setTimeout(r, 1100));
    await assertFails(reverse(patron(), "g1"));
  });

  it("keeps the gift private and the wall anonymous", async () => {
    await give(patron(), "g1", 4000, { anonymous: true });
    const sam = as(env.authenticatedContext("sam"));
    await assertFails(getDoc(doc(sam, "gifts/g1")));
    await assertSucceeds(getDoc(doc(sam, "requests/r1/wall/g1")));
  });

  it("lets only the Seeker pause their request", async () => {
    await assertFails(updateDoc(doc(patron(), "requests/r1"), { status: "paused" }));
    await assertSucceeds(updateDoc(doc(as(env.authenticatedContext("sam")), "requests/r1"), { status: "paused" }));
  });

  it("validates new requests (goal must equal the breakdown)", async () => {
    const sam = as(env.authenticatedContext("sam"));
    const base = {
      seekerId: "sam", firstName: "Sam", age: null, city: "Lima", country: "Peru", countryCode: "PE", lat: null, lng: null,
      category: "rent", headline: "A fair headline", story: "x".repeat(90), breakdown: [{ label: "Rent", amountCents: 5000 }],
      goalCents: 5000, fundedCents: 0, giftCount: 0, status: "active", verification: "unverified", verificationRequestedAt: null,
      avatarSeed: "sam", photoUrl: null, blurPhoto: false, isDemo: true, createdAt: serverTimestamp(), fundedAt: null, lastGiftId: null,
    };
    await assertSucceeds(setDoc(doc(sam, "requests/new1"), base));
    await assertFails(setDoc(doc(sam, "requests/new2"), { ...base, goalCents: 999999 }));
    await assertFails(setDoc(doc(sam, "requests/new3"), { ...base, fundedCents: 5000 }));
  });
});
