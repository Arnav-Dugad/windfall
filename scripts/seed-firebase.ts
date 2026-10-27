/**
 * Seeds Firebase (Auth + Firestore) with the fictional Windfall roster.
 *
 *   npm run seed            # writes everything, relative to "now"
 *
 * 1. Demo accounts (personas + a `windfall-seeder` service account) are created with the official
 *    `firebase auth:import` command (bcrypt hashes, fixed UIDs) using your Firebase CLI login.
 * 2. Data is written through the normal client SDK while signed in as `windfall-seeder`, which
 *    firestore.rules allows to manage demo data. Its password lives only in .seed.env (git-ignored).
 * Totals are built from the generated gifts, so the ledger is consistent by construction.
 */
import bcrypt from "bcryptjs";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { deleteApp, initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, doc, getDocs, initializeFirestore, Timestamp, writeBatch, type DocumentReference, type Firestore } from "firebase/firestore";
import type { SeedPatron, SeedSeeker } from "../shared/domain";
import type { GiftDoc, PatronStatsDoc, PersonaDoc, RequestDoc, UserDoc, WallDoc } from "../shared/firestore";
import { weekIndex } from "../shared/impact";

const PROJECT = "windfall-give-bb8b";
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
].map((a) => ({ ...a, emailVerified: true }));
writeFileSync(".cache/auth-import.json", JSON.stringify({ users: accounts }));
execSync(`npx firebase auth:import .cache/auth-import.json --hash-algo=BCRYPT --project ${PROJECT}`, { stdio: "inherit" });

// ---- 2. sign in as the seeder ----------------------------------------------------------------------
const app = initializeApp({
  apiKey: "AIzaSyATxkXcTU37dYSbc87_QoZGNmtGh65quQo",
  authDomain: `${PROJECT}.firebaseapp.com`,
  projectId: PROJECT,
  appId: "1:1072718083580:web:c071662872284259a2ae79",
});
await signInWithEmailAndPassword(getAuth(app), "seeder@windfall-demo.app", seederPassword);
const db = initializeFirestore(app, {});

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
  for (const sub of ["wall", "updates"]) for (const d of (await getDocs(collection(r.ref, sub))).docs) wipe.push({ ref: d.ref });
  wipe.push({ ref: r.ref });
}
for (const col of ["gifts", "patronStats", "stats", "meta"]) for (const d of (await getDocs(collection(db, col))).docs) wipe.push({ ref: d.ref });
for (const uid of ["demo-eleanor", "demo-theo", "demo-sora"]) {
  for (const d of (await getDocs(collection(db, "users", uid, "swipes"))).docs) wipe.push({ ref: d.ref });
}
await commitAll(db, wipe);
console.log(`wiped ${wipe.length} documents`);

// ---- 4. generate ------------------------------------------------------------------------------------
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

  ops.push({
    ref: doc(db, "requests", rid),
    data: {
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
      verification: s.verified ? "verified" : "unverified",
      verificationRequestedAt: null,
      avatarSeed: `${s.firstName}-${s.slug}`,
      photoUrl: s.photo,
      blurPhoto: false,
      isDemo: true,
      createdAt: ts(createdAt),
      fundedAt: isFunded ? ts(NOW - Math.floor(rand() * 10 + 1) * DAY) : null,
      lastGiftId,
    } satisfies RequestDoc,
  });

  s.updates.forEach((u, i) => {
    ops.push({
      ref: doc(db, "requests", rid, "updates", `upd-${i}`),
      data: { kind: u.kind, body: u.body, createdAt: ts(NOW - u.daysAgo * DAY - Math.floor(rand() * 10) * 3_600_000) },
    });
  });
}

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
];
ops.push({ ref: doc(db, "meta", "personas"), data: { list: personas } });

await commitAll(db, ops);
console.log(`seeded ${roster.length} requests, ${giftRows.length} gifts, ${PATRONS.length} patrons (${ops.length} writes)`);
console.log(`total given ${(globalTotal / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}, ${globalCleared} cleared`);
console.log(`demo seeker: ${demoSeeker.firstName} (${demoSeeker.city})`);
await deleteApp(app);
process.exit(0);
