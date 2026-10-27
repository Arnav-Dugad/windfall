/**
 * Seeds Firebase (Auth + Firestore) with the fictional Windfall roster.
 *
 *   npm run seed            # writes everything, relative to "now"
 *   npm run seed:emulators  # the same, into the local Auth + Firestore emulators (no production quota)
 *
 * 1. Demo accounts (personas + a `windfall-seeder` service account) are created with the official
 *    `firebase auth:import` command (bcrypt hashes, fixed UIDs) using your Firebase CLI login.
 * 2. Data is written through the normal client SDK while signed in as `windfall-seeder`, which
 *    firestore.rules allows to manage demo data. Its password lives only in .seed.env (git-ignored).
 * Totals are built from the generated gifts, so the ledger is consistent by construction.
 *
 * Also seeds the social layer: portrait accents, giving circles and "match my gift" challenges (made of
 * existing gifts, tagged — so no totals change), follows with unread activity for the demo Patrons, a monthly
 * pledge for Eleanor, and a moderation queue (a moderator persona, reports, pending reviews, two fraud demos).
 */
import bcrypt from "bcryptjs";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, connectFirestoreEmulator, doc, getDocs, initializeFirestore, Timestamp, writeBatch, type DocumentReference, type Firestore } from "firebase/firestore";
import type { SeedPatron, SeedSeeker } from "../shared/domain";
import type { CircleDoc, FollowDoc, GiftDoc, MatchDoc, PatronStatsDoc, PersonaDoc, RecurringDoc, ReportDoc, RequestDoc, UserDoc, WallDoc } from "../shared/firestore";
import { weekIndex } from "../shared/impact";
import { accentOf } from "./accent";

const PROJECT = "windfall-give-bb8b";
const EMULATORS = process.env.SEED_EMULATORS === "1";
const DEMO_PASSWORD = "windfall-demo";
const DAY = 86_400_000;
const NOW = Date.now();
/** Portraits a casting agent flagged as possibly under 20 — excluded to be strict. */
const EXCLUDE_PHOTOS = new Set(["1c85cafaa157", "8505f3da048e", "c3f880deac7f"]);

// mulberry32 — deterministic randomness
let rng = 0x5eed1e55;
const rand = () => {
  rng = (rng + 0x6d2b79f5) | 0;
  let t = Math.imul(rng ^ (rng >>> 15), 1 | rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
const ts = (msTime: number) => Timestamp.fromMillis(Math.round(msTime));

// ---- roster -----------------------------------------------------------------------------------------
const peopleDir = "shared/seed/people";
const { PATRONS } = (await import(`../${peopleDir}/patrons.ts`)) as { PATRONS: SeedPatron[] };
const seekers: SeedSeeker[] = [];
for (const f of readdirSync(peopleDir).filter((f) => /^batch-\d+\.ts$/.test(f)).sort((a, b) => parseInt(a.slice(6)) - parseInt(b.slice(6)))) {
  const mod = (await import(`../${peopleDir}/${f}`)) as Record<string, SeedSeeker[]>;
  for (const list of Object.values(mod)) seekers.push(...list);
}
const roster = seekers.filter((s) => !EXCLUDE_PHOTOS.has(s.photo.replace("/people/", "").replace(".webp", "")));
const slugs = new Set<string>();
for (const s of roster) {
  if (slugs.has(s.slug)) throw new Error(`duplicate slug ${s.slug}`);
  slugs.add(s.slug);
}
console.log(`roster: ${roster.length} seekers, ${PATRONS.length} patrons`);

// The loginable demo Seeker: a part-funded, verified story with updates.
const demoSeeker = roster.find((s) => s.verified && s.fundedRatio > 0.3 && s.fundedRatio < 0.7 && s.updates.length >= 2) ?? roster[0]!;

const patronUid = (p: SeedPatron) => (p.persona ? `demo-${p.persona}` : `patron-${p.key}`);
const seekerUid = (s: SeedSeeker) => (s === demoSeeker ? "demo-seeker" : `seeker-${s.slug}`);
const requestId = (s: SeedSeeker) => `req-${s.slug}`;

/** A Trust & Safety reviewer: a Patron account listed in admins/, so it sees the moderation queue. */
const MODERATOR = { uid: "demo-moderator", persona: "moderator", email: "moderator@windfall-demo.app", displayName: "Maya (Trust & Safety)" };
const DEMO_UIDS = ["demo-eleanor", "demo-theo", "demo-sora", "demo-seeker", MODERATOR.uid];

// ---- 1. accounts via firebase auth:import ----------------------------------------------------------
mkdirSync(".cache", { recursive: true });
let seederPassword: string;
if (existsSync(".seed.env")) {
  seederPassword = readFileSync(".seed.env", "utf8").match(/SEEDER_PASSWORD=(.+)/)![1]!.trim();
} else {
  seederPassword = randomBytes(24).toString("base64url");
  writeFileSync(".seed.env", `# Password for the windfall-seeder account (never commit)\nSEEDER_PASSWORD=${seederPassword}\n`);
}
const hash = (pw: string) => Buffer.from(bcrypt.hashSync(pw, 10)).toString("base64");
const accounts = [
  { localId: "windfall-seeder", email: "seeder@windfall-demo.app", passwordHash: hash(seederPassword), displayName: "Windfall seeder" },
  ...PATRONS.filter((p) => p.persona).map((p) => ({
    localId: patronUid(p),
    email: `${p.persona}@windfall-demo.app`,
    passwordHash: hash(DEMO_PASSWORD),
    displayName: p.displayName,
  })),
  { localId: "demo-seeker", email: "seeker@windfall-demo.app", passwordHash: hash(DEMO_PASSWORD), displayName: demoSeeker.firstName },
  { localId: MODERATOR.uid, email: MODERATOR.email, passwordHash: hash(DEMO_PASSWORD), displayName: MODERATOR.displayName },
].map((a) => ({ ...a, emailVerified: true }));
if (EMULATORS) {
  // The Auth emulator takes plain passwords and fixed UIDs through its admin endpoint.
  const plain = (localId: string) => (localId === "windfall-seeder" ? seederPassword : DEMO_PASSWORD);
  const res = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchCreate`, {
    method: "POST",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ users: accounts.map((a) => ({ localId: a.localId, email: a.email, displayName: a.displayName, emailVerified: true, rawPassword: plain(a.localId) })) }),
  });
  if (!res.ok) throw new Error(`auth emulator import failed: ${res.status} ${await res.text()}`);
} else {
  writeFileSync(".cache/auth-import.json", JSON.stringify({ users: accounts }));
  execSync(`npx firebase auth:import .cache/auth-import.json --hash-algo=BCRYPT --project ${PROJECT}`, { stdio: "inherit" });
}

// ---- 2. sign in as the seeder ----------------------------------------------------------------------
const app = initializeApp({
  apiKey: "AIzaSyATxkXcTU37dYSbc87_QoZGNmtGh65quQo",
  authDomain: `${PROJECT}.firebaseapp.com`,
  projectId: PROJECT,
  appId: "1:1072718083580:web:c071662872284259a2ae79",
});
const seederAuth = getAuth(app);
const db = initializeFirestore(app, {});
if (EMULATORS) {
  connectAuthEmulator(seederAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8085);
}
await signInWithEmailAndPassword(seederAuth, "seeder@windfall-demo.app", seederPassword);

// Batched writer (Firestore allows 500 operations per batch).
type Op = { ref: DocumentReference; data?: object };
async function commitAll(db: Firestore, ops: Op[]) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 450)) {
      if (op.data) batch.set(op.ref, op.data);
      else batch.delete(op.ref);
    }
    await batch.commit();
  }
}

// ---- 3. wipe previous demo data ---------------------------------------------------------------------
const wipe: Op[] = [];
const reqSnap = await getDocs(collection(db, "requests"));
for (const r of reqSnap.docs) {
  for (const sub of ["wall", "updates", "media"]) for (const d of (await getDocs(collection(r.ref, sub))).docs) wipe.push({ ref: d.ref });
  wipe.push({ ref: r.ref });
}
for (const col of ["gifts", "patronStats", "stats", "meta", "circles", "matches", "reports", "admins"]) {
  for (const d of (await getDocs(collection(db, col))).docs) wipe.push({ ref: d.ref });
}
for (const uid of DEMO_UIDS) {
  for (const sub of ["swipes", "follows", "recurring"]) for (const d of (await getDocs(collection(db, "users", uid, sub))).docs) wipe.push({ ref: d.ref });
}
await commitAll(db, wipe);
console.log(`wiped ${wipe.length} documents`);

// ---- 4. generate ------------------------------------------------------------------------------------
// Portrait accents (vivid colour from each photo's background/clothing; null → the app accent).
const accents = new Map<string, string | null>();
for (const s of roster) if (!accents.has(s.photo)) accents.set(s.photo, await accentOf(`public${s.photo}`));
console.log(`accents: ${[...accents.values()].filter(Boolean).length}/${accents.size} portraits have their own colour`);

const ops: Op[] = [];
const demoPatrons = PATRONS.filter((p) => p.persona);
const community = PATRONS.filter((p) => !p.persona);
const weights = demoPatrons.map((p) => p.history.gifts);
const weightedDemo = () => {
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < demoPatrons.length; i++) if ((r -= weights[i]!) <= 0) return demoPatrons[i]!;
  return demoPatrons[0]!;
};

// Persona users
for (const p of PATRONS) {
  if (!p.persona) continue;
  ops.push({
    ref: doc(db, "users", patronUid(p)),
    data: { role: "patron", displayName: p.displayName, anonymousByDefault: p.anonymousByDefault, photoURL: p.photo, isDemo: true, createdAt: ts(NOW - 300 * DAY) } satisfies UserDoc,
  });
}
ops.push({
  ref: doc(db, "users", "demo-seeker"),
  data: { role: "seeker", displayName: demoSeeker.firstName, anonymousByDefault: false, photoURL: demoSeeker.photo, isDemo: true, createdAt: ts(NOW - (demoSeeker.postedDaysAgo + 3) * DAY) } satisfies UserDoc,
});

ops.push({
  ref: doc(db, "users", MODERATOR.uid),
  data: { role: "patron", displayName: MODERATOR.displayName, anonymousByDefault: true, photoURL: null, isDemo: true, createdAt: ts(NOW - 400 * DAY) } satisfies UserDoc,
});
ops.push({ ref: doc(db, "admins", MODERATOR.uid), data: { displayName: MODERATOR.displayName, createdAt: ts(NOW - 400 * DAY) } });

type Stat = PatronStatsDoc & { lastAt: number };
const stats = new Map<string, Stat>();
for (const p of PATRONS) {
  stats.set(patronUid(p), {
    displayName: p.anonymousByDefault ? null : p.displayName,
    avatar: p.anonymousByDefault ? null : p.photo,
    anonymous: p.anonymousByDefault,
    totalCents: 0,
    giftCount: 0,
    requests: {},
    cleared: {},
    weeks: {},
    lastGiftId: null,
    lastGiftAt: null,
    lastAt: 0,
  });
}

// A handful of modest stories are seeded as already cleared, so "debts cleared" has history.
const goalOf = (s: SeedSeeker) => s.breakdown.reduce((sum, b) => sum + b.amountCents, 0);
const fullyFund = new Set(
  roster
    .filter((s) => s !== demoSeeker && s.fundedRatio > 0.25 && s.fundedRatio < 0.8)
    .sort((a, b) => goalOf(a) - goalOf(b))
    .slice(0, 12),
);

let giftSeq = 0;
let globalTotal = 0;
let globalCount = 0;
let globalCleared = 0;
const giftRows: { id: string; g: GiftDoc; rid: string; createdAt: number }[] = [];
const requestRows = new Map<string, { s: SeedSeeker; r: RequestDoc }>();

// A few unverified stories have documents waiting for review (moderation queue → "Pending verification").
const pendingReview = new Set(
  roster.filter((s) => s !== demoSeeker && !s.verified && !fullyFund.has(s)).slice(0, 3),
);

for (const s of roster) {
  const rid = requestId(s);
  const goal = goalOf(s);
  const createdAt = NOW - s.postedDaysAgo * DAY - Math.floor(rand() * 10) * 3_600_000;
  const target = fullyFund.has(s) ? goal : Math.floor((goal * s.fundedRatio) / 10_000) * 10_000;

  const amounts: number[] = [];
  if (target > 0) {
    const n = Math.max(1, Math.min(10, Math.round(target / 350_000) + Math.floor(rand() * 3)));
    const w = Array.from({ length: n }, () => 0.4 + rand());
    const wsum = w.reduce((a, b) => a + b, 0);
    let left = target;
    for (let i = 0; i < n - 1; i++) {
      const a = Math.max(10_000, Math.floor((target * w[i]!) / wsum / 10_000) * 10_000);
      if (a >= left) break;
      amounts.push(a);
      left -= a;
    }
    amounts.push(left);
  }

  const used = new Set<string>();
  let funded = 0;
  let lastGiftId: string | null = null;
  amounts.forEach((amount, i) => {
    const isLast = i === amounts.length - 1;
    let patron: SeedPatron;
    if (fullyFund.has(s) && isLast) patron = demoPatrons.find((p) => p.persona === "theo") ?? demoPatrons[0]!;
    else {
      patron = rand() < 0.6 ? weightedDemo() : pick(community);
      for (let t = 0; used.has(patron.key) && t < 10; t++) patron = rand() < 0.5 ? weightedDemo() : pick(community);
    }
    used.add(patron.key);
    const uid = patronUid(patron);
    const anonymous = patron.anonymousByDefault || rand() < 0.12;
    const span = Math.max(DAY, NOW - createdAt - 2 * 3_600_000);
    let at = createdAt + Math.floor(((i + rand()) / amounts.length) * span);
    // Keep demo Patrons' recent weeks busy so their giving streaks look real.
    if (patron.persona && rand() < 0.35) at = Math.max(createdAt + 3_600_000, NOW - Math.floor(rand() * 42) * DAY - 3_600_000);
    const id = `gift-${String(++giftSeq).padStart(5, "0")}`;
    const clears = fullyFund.has(s) && isLast;
    const g: GiftDoc = {
      patronId: uid,
      requestId: rid,
      seekerId: seekerUid(s),
      amountCents: amount,
      kind: clears ? "clear" : "give",
      anonymous,
      status: "settled",
      createdAt: ts(at),
      requestName: s.firstName,
      category: s.category,
      country: s.country,
      countryCode: s.countryCode,
      city: s.city,
      lat: s.lat,
      lng: s.lng,
      photoUrl: s.photo,
      avatarSeed: `${s.firstName}-${s.slug}`,
    };
    giftRows.push({ id, g, rid, createdAt: at });
    ops.push({ ref: doc(db, "gifts", id), data: g });
    ops.push({
      ref: doc(db, "requests", rid, "wall", id),
      data: {
        amountCents: amount,
        kind: g.kind,
        fromName: anonymous ? null : patron.displayName,
        fromAvatar: anonymous ? null : patron.photo,
        status: "settled",
        createdAt: ts(at),
      } satisfies WallDoc,
    });
    const st = stats.get(uid)!;
    st.totalCents += amount;
    st.giftCount += 1;
    st.requests[rid] = true;
    if (clears) st.cleared[rid] = true;
    st.weeks[String(weekIndex(at))] = true;
    if (at > st.lastAt) {
      st.lastAt = at;
      st.lastGiftId = id;
    }
    funded += amount;
    lastGiftId = id;
  });

  const isFunded = funded >= goal;
  if (isFunded) globalCleared++;
  globalTotal += funded;
  globalCount += amounts.length;
  // Funded stories count as "cleared" for every Patron who chipped in.
  if (isFunded) for (const r of giftRows.filter((x) => x.rid === rid)) stats.get(r.g.patronId)!.cleared[rid] = true;

  const requestDoc: RequestDoc = {
      seekerId: seekerUid(s),
      firstName: s.firstName,
      age: s.age,
      city: s.city,
      country: s.country,
      countryCode: s.countryCode,
      lat: s.lat,
      lng: s.lng,
      category: s.category,
      headline: s.headline,
      story: s.story,
      breakdown: s.breakdown,
      goalCents: goal,
      fundedCents: funded,
      giftCount: amounts.length,
      status: isFunded ? "funded" : "active",
      verification: s.verified ? "verified" : pendingReview.has(s) ? "pending" : "unverified",
      verificationRequestedAt: pendingReview.has(s) ? ts(NOW - (1 + Math.floor(rand() * 3)) * DAY) : null,
      avatarSeed: `${s.firstName}-${s.slug}`,
      photoUrl: s.photo,
      blurPhoto: false,
      isDemo: true,
      createdAt: ts(createdAt),
      fundedAt: isFunded ? ts(NOW - Math.floor(rand() * 10 + 1) * DAY) : null,
      lastGiftId,
      accent: accents.get(s.photo) ?? null,
  };
  requestRows.set(rid, { s, r: requestDoc });
  ops.push({ ref: doc(db, "requests", rid), data: requestDoc });

  s.updates.forEach((u, i) => {
    ops.push({
      ref: doc(db, "requests", rid, "updates", `upd-${i}`),
      data: { kind: u.kind, body: u.body, createdAt: ts(NOW - u.daysAgo * DAY - Math.floor(rand() * 10) * 3_600_000) },
    });
  });
}

// ---- 5. social layer (tags existing gifts; totals are unchanged) ------------------------------------
const nameOf = (uid: string) => {
  if (uid === MODERATOR.uid) return MODERATOR.displayName;
  const p = PATRONS.find((x) => patronUid(x) === uid);
  return p?.displayName ?? "A Patron";
};
const giftsOf = (rid: string) => giftRows.filter((x) => x.rid === rid).sort((a, b) => a.createdAt - b.createdAt);
const remainingOf = (rid: string) => {
  const r = requestRows.get(rid)!.r;
  return r.goalCents - r.fundedCents;
};
const isDemoUid = (uid: string) => uid.startsWith("demo-");

// Giving circles: three big, active stories where several named Patrons (including a demo persona) chipped in.
const CIRCLE_NAMES: Record<string, string> = {
  medical: "Night-shift friends",
  student_loans: "Class of ’26 fund",
  rent: "Keep the lights on",
  small_business: "Main Street circle",
  emergency: "Rainy day crew",
};
const circleSummary: string[] = [];
const usedCats = new Set<string>();
const circleCandidates = [...requestRows.entries()]
  .filter(([rid, { s, r }]) => r.status === "active" && s !== demoSeeker && remainingOf(rid) > 1_000_000)
  .map(([rid, { s }]) => ({ rid, s, named: giftsOf(rid).filter((x) => !x.g.anonymous) }))
  .filter((c) => c.named.length >= 3 && c.named.some((x) => isDemoUid(x.g.patronId)) && new Set(c.named.map((x) => x.g.patronId)).size >= 3)
  .sort((a, b) => b.named.length - a.named.length);
let circleSeq = 0;
for (const c of circleCandidates) {
  if (circleSeq >= 3) break;
  if (usedCats.has(c.s.category)) continue;
  usedCats.add(c.s.category);
  const tagged = c.named.slice(-Math.min(5, c.named.length));
  const id = `circle-${++circleSeq}`;
  for (const t of tagged) t.g.circleId = id;
  const members: Record<string, string> = {};
  for (const t of tagged) members[t.g.patronId] = nameOf(t.g.patronId);
  const creator = tagged[0]!.g.patronId;
  ops.push({
    ref: doc(db, "circles", id),
    data: {
      name: CIRCLE_NAMES[c.s.category] ?? "Giving circle",
      requestId: c.rid,
      requestName: c.s.firstName,
      photoUrl: c.s.photo,
      createdBy: creator,
      createdByName: nameOf(creator),
      members,
      raisedCents: tagged.reduce((sum, t) => sum + t.g.amountCents, 0),
      giftCount: tagged.length,
      lastGiftId: tagged.at(-1)!.id,
      createdAt: ts(tagged[0]!.createdAt - 2 * 3_600_000),
    } satisfies CircleDoc,
  });
  circleSummary.push(`${id} → ${c.s.firstName} (${c.rid}), ${tagged.length} gifts, ${Object.keys(members).length} members`);
}

// "Match my gift": a demo Patron's named gift that later Patrons matched.
const matchSummary: string[] = [];
let matchSeq = 0;
for (const [rid, { s, r }] of requestRows) {
  if (matchSeq >= 2) break;
  if (r.status !== "active" || s === demoSeeker) continue;
  const gs = giftsOf(rid).filter((x) => !x.g.circleId);
  const i = gs.findIndex((x) => isDemoUid(x.g.patronId) && !x.g.anonymous);
  if (i < 0) continue;
  const origin = gs[i]!;
  const later = gs.slice(i + 1).filter((x) => x.g.patronId !== origin.g.patronId).slice(0, 2);
  if (!later.length) continue;
  const id = `match-${++matchSeq}`;
  for (const l of later) l.g.matchId = id;
  ops.push({
    ref: doc(db, "matches", id),
    data: {
      requestId: rid,
      requestName: s.firstName,
      photoUrl: s.photo,
      amountCents: origin.g.amountCents,
      fromName: nameOf(origin.g.patronId),
      createdBy: origin.g.patronId,
      matchCount: later.length,
      matchedCents: later.reduce((sum, l) => sum + l.g.amountCents, 0),
      lastGiftId: later.at(-1)!.id,
      createdAt: ts(origin.createdAt + 60_000),
    } satisfies MatchDoc,
  });
  matchSummary.push(`${id} → ${s.firstName} (${rid}) from ${nameOf(origin.g.patronId)}, matched ${later.length}×`);
}

// Follows: demo Patrons follow everyone they gave to (most recent 40). They last looked a week ago, and some
// milestones/clears happened since — so /activity opens with unread items.
const milestone = (pct: number) => (pct >= 1 ? 100 : pct >= 0.75 ? 75 : pct >= 0.5 ? 50 : pct >= 0.25 ? 25 : 0);
let followCount = 0;
let unreadMilestones = 0;
for (const uid of ["demo-eleanor", "demo-theo", "demo-sora"]) {
  const firstGift = new Map<string, number>();
  for (const x of giftRows) if (x.g.patronId === uid) firstGift.set(x.rid, Math.min(firstGift.get(x.rid) ?? Infinity, x.createdAt));
  const lastGift = new Map<string, number>();
  for (const x of giftRows) if (x.g.patronId === uid) lastGift.set(x.rid, Math.max(lastGift.get(x.rid) ?? 0, x.createdAt));
  const rids = [...lastGift.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([rid]) => rid);
  for (const rid of rids) {
    const r = requestRows.get(rid)!.r;
    const now = milestone(r.fundedCents / r.goalCents);
    const behind = now >= 50 && rand() < 0.5;
    if (behind) unreadMilestones++;
    const created = firstGift.get(rid)!;
    ops.push({
      ref: doc(db, "users", uid, "follows", rid),
      data: { createdAt: ts(created), seenAt: ts(Math.max(created, NOW - 7 * DAY)), seenPct: behind ? now - 25 : now } satisfies FollowDoc,
    });
    followCount++;
  }
}

// Eleanor's monthly pledge. Last ran 25 days ago, so it comes due in ~5 days (not during a test run).
ops.push({
  ref: doc(db, "users", "demo-eleanor", "recurring", "pledge-1"),
  data: { amountCents: 50_000, rule: "closest_verified", active: true, lastRunAt: ts(NOW - 25 * DAY), createdAt: ts(NOW - 145 * DAY) } satisfies RecurringDoc,
});

// Moderation demos: a copied story (same photo) and a vague, outsized ask — both unfunded, so no totals move.
const original = roster.find((s) => s !== demoSeeker && s.verified && !fullyFund.has(s) && s.category === "medical" && s.story.length > 400)!;
const fraudDup: SeedSeeker = {
  ...original,
  slug: "fraud-dup",
  firstName: original.firstName === "Alex" ? "Sam" : "Alex",
  city: "Manchester",
  country: "United Kingdom",
  countryCode: "GB",
  lat: 53.48,
  lng: -2.24,
  verified: false,
  postedDaysAgo: 2,
};
const fraudMisc: SeedSeeker = {
  slug: "fraud-misc",
  firstName: "Rick",
  age: 41,
  city: "Phoenix",
  country: "United States",
  countryCode: "US",
  lat: 33.45,
  lng: -112.07,
  category: "emergency",
  headline: "Urgent help needed with expenses",
  story: "Things have been really hard lately and I have a lot of expenses that need to be paid soon. Any help is appreciated, every bit counts and I will pay it forward.",
  breakdown: [
    { label: "Misc expenses", amountCents: 8_600_000 },
    { label: "Bills", amountCents: 900_000 },
  ],
  verified: false,
  fundedRatio: 0,
  postedDaysAgo: 1,
  updates: [],
  photo: "", // no portrait: a reused one would wrongly flag a real person
};
for (const [s, verification] of [[fraudDup, "unverified"], [fraudMisc, "pending"]] as const) {
  const rid = requestId(s);
  ops.push({
    ref: doc(db, "requests", rid),
    data: {
      seekerId: `seeker-${s.slug}`,
      firstName: s.firstName,
      age: s.age,
      city: s.city,
      country: s.country,
      countryCode: s.countryCode,
      lat: s.lat,
      lng: s.lng,
      category: s.category,
      headline: s.headline,
      story: s.story,
      breakdown: s.breakdown,
      goalCents: goalOf(s),
      fundedCents: 0,
      giftCount: 0,
      status: "active",
      verification,
      verificationRequestedAt: verification === "pending" ? ts(NOW - 6 * 3_600_000) : null,
      avatarSeed: `${s.firstName}-${s.slug}`,
      photoUrl: s.photo || null,
      blurPhoto: false,
      isDemo: true,
      createdAt: ts(NOW - s.postedDaysAgo * DAY),
      fundedAt: null,
      lastGiftId: null,
      accent: accents.get(s.photo) ?? null,
    } satisfies RequestDoc,
  });
}
const someone = [...requestRows.entries()].find(([, { s, r }]) => s !== demoSeeker && r.status === "active" && s !== original)!;
const reports: [string, ReportDoc][] = [
  ["report-1", { requestId: requestId(fraudDup), reporterId: "demo-theo", reason: "duplicate", note: `Same photo and story as ${original.firstName} in ${original.city}.`, status: "open", createdAt: ts(NOW - 20 * 3_600_000) }],
  ["report-2", { requestId: requestId(fraudMisc), reporterId: "demo-sora", reason: "misleading", note: "Almost the whole goal is “misc expenses”.", status: "open", createdAt: ts(NOW - 5 * 3_600_000) }],
  ["report-3", { requestId: requestId(fraudDup), reporterId: "patron-" + community[0]!.key, reason: "misleading", note: null, status: "open", createdAt: ts(NOW - 9 * 3_600_000) }],
  ["report-4", { requestId: someone[0], reporterId: "demo-eleanor", reason: "privacy", note: "The story names an employer — maybe blur that?", status: "resolved", createdAt: ts(NOW - 6 * DAY) }],
];
for (const [id, r] of reports) ops.push({ ref: doc(db, "reports", id), data: r });

for (const [uid, { lastAt, ...st }] of stats) {
  ops.push({ ref: doc(db, "patronStats", uid), data: { ...st, lastGiftAt: lastAt ? ts(lastAt) : null } });
}
ops.push({ ref: doc(db, "stats", "global"), data: { totalCents: globalTotal, giftCount: globalCount, debtsCleared: globalCleared, lastGiftId: null } });

const personas: PersonaDoc[] = [
  ...demoPatrons.map((p) => ({
    persona: p.persona!,
    role: "patron" as const,
    uid: patronUid(p),
    email: `${p.persona}@windfall-demo.app`,
    displayName: p.displayName,
    blurb: p.blurb,
    photo: p.photo,
  })),
  {
    persona: "demo-seeker",
    role: "seeker",
    uid: "demo-seeker",
    email: "seeker@windfall-demo.app",
    displayName: demoSeeker.firstName,
    blurb: `${demoSeeker.city}. A live, part-funded ${demoSeeker.category.replace("_", " ")} request.`,
    photo: demoSeeker.photo,
  },
  {
    persona: MODERATOR.persona,
    role: "patron",
    uid: MODERATOR.uid,
    email: MODERATOR.email,
    displayName: MODERATOR.displayName,
    blurb: "Review reports, pending verifications and fraud signals.",
    photo: null,
  },
];
ops.push({ ref: doc(db, "meta", "personas"), data: { list: personas } });

await commitAll(db, ops);
console.log(`seeded ${roster.length} requests, ${giftRows.length} gifts, ${PATRONS.length} patrons (${ops.length} writes)`);
console.log(`total given ${(globalTotal / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}, ${globalCleared} cleared`);
console.log(`demo seeker: ${demoSeeker.firstName} (${demoSeeker.city})`);
console.log(`circles:\n  ${circleSummary.join("\n  ")}`);
console.log(`matches:\n  ${matchSummary.join("\n  ")}`);
console.log(`follows: ${followCount} (${unreadMilestones} unread milestones); pending review: ${[...pendingReview].map((s) => requestId(s)).join(", ")}, ${requestId(fraudMisc)}`);
console.log(`fraud demos: ${requestId(fraudDup)} (copies ${requestId(original)}), ${requestId(fraudMisc)}; reports: ${reports.length} (${reports.filter(([, r]) => r.status === "open").length} open)`);
await deleteApp(app);
process.exit(0);
