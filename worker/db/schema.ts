import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch('subsec') * 1000)`;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  role: text("role", { enum: ["patron", "seeker"] }).notNull(),
  displayName: text("display_name").notNull(),
  persona: text("persona"),
  avatarSeed: text("avatar_seed").notNull(),
  anonymousByDefault: integer("anonymous_by_default", { mode: "boolean" }).notNull().default(false),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().default(now),
});

export const requests = sqliteTable(
  "requests",
  {
    id: text("id").primaryKey(),
    seekerId: text("seeker_id")
      .notNull()
      .references(() => users.id),
    firstName: text("first_name").notNull(),
    age: integer("age"),
    city: text("city").notNull(),
    country: text("country").notNull(),
    countryCode: text("country_code").notNull(),
    lat: real("lat"),
    lng: real("lng"),
    category: text("category", {
      enum: ["medical", "student_loans", "rent", "small_business", "emergency"],
    }).notNull(),
    headline: text("headline").notNull(),
    story: text("story").notNull(),
    breakdown: text("breakdown", { mode: "json" }).$type<{ label: string; amountCents: number }[]>().notNull(),
    goalCents: integer("goal_cents").notNull(),
    fundedCents: integer("funded_cents").notNull().default(0),
    giftCount: integer("gift_count").notNull().default(0),
    status: text("status", { enum: ["active", "paused", "closed", "funded"] })
      .notNull()
      .default("active"),
    verification: text("verification", { enum: ["unverified", "pending", "verified"] })
      .notNull()
      .default("unverified"),
    verificationAt: integer("verification_at"),
    avatarSeed: text("avatar_seed").notNull(),
    photoKey: text("photo_key"),
    blurPhoto: integer("blur_photo", { mode: "boolean" }).notNull().default(false),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull().default(now),
    fundedAt: integer("funded_at"),
  },
  (t) => [
    index("requests_status_idx").on(t.status, t.createdAt),
    index("requests_seeker_idx").on(t.seekerId),
  ],
);

export const requestUpdates = sqliteTable(
  "request_updates",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => requests.id),
    kind: text("kind", { enum: ["update", "thanks"] }).notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("updates_request_idx").on(t.requestId, t.createdAt)],
);

export const gifts = sqliteTable(
  "gifts",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => requests.id),
    patronId: text("patron_id")
      .notNull()
      .references(() => users.id),
    amountCents: integer("amount_cents").notNull(),
    kind: text("kind", { enum: ["give", "clear"] }).notNull(),
    anonymous: integer("anonymous", { mode: "boolean" }).notNull().default(false),
    status: text("status", { enum: ["settled", "reversed"] }).notNull().default("settled"),
    paymentRef: text("payment_ref"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("gifts_patron_idx").on(t.patronId, t.createdAt),
    index("gifts_request_idx").on(t.requestId, t.createdAt),
  ],
);

/** Double-entry ledger: each gift writes −amount on the patron account and +amount on the request account. */
export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    giftId: text("gift_id")
      .notNull()
      .references(() => gifts.id),
    account: text("account").notNull(), // "patron:<id>" | "request:<id>"
    deltaCents: integer("delta_cents").notNull(),
    memo: text("memo", { enum: ["gift", "reversal"] }).notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("ledger_account_idx").on(t.account), index("ledger_gift_idx").on(t.giftId)],
);

export const balances = sqliteTable("balances", {
  account: text("account").primaryKey(),
  balanceCents: integer("balance_cents").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(now),
});

export const swipes = sqliteTable(
  "swipes",
  {
    patronId: text("patron_id")
      .notNull()
      .references(() => users.id),
    requestId: text("request_id")
      .notNull()
      .references(() => requests.id),
    action: text("action", { enum: ["pass", "save"] }).notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.patronId, t.requestId] })],
);

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").references(() => requests.id),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    key: text("key").notNull(),
    kind: text("kind", { enum: ["photo", "proof"] }).notNull(),
    contentType: text("content_type").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("documents_key_idx").on(t.key)],
);

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  requestId: text("request_id")
    .notNull()
    .references(() => requests.id),
  reporterId: text("reporter_id").references(() => users.id),
  reason: text("reason").notNull(),
  note: text("note"),
  createdAt: integer("created_at").notNull().default(now),
});
