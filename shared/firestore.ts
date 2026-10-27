import type { BreakdownItem, Category, GiftKind, RequestStatus, Role, UpdateKind, Verification } from "./domain";

/**
 * Firestore document shapes. Timestamps are Firestore `Timestamp`s in the database and are converted to
 * epoch milliseconds at the edge (see src/lib/api.ts). `T` is the timestamp type for each side.
 */
export interface UserDoc<T = unknown> {
  role: Role;
  displayName: string;
  anonymousByDefault: boolean;
  photoURL: string | null;
  isDemo: boolean;
  createdAt: T;
  /** Patron "causes": preferred categories/countries that weight (never filter) the deck. */
  causes?: { categories: string[]; countries: string[] };
  /** Typical gift budget, used by "closest to cleared within your budget". */
  budgetCents?: number;
}

export interface RequestDoc<T = unknown> {
  seekerId: string;
  firstName: string;
  age: number | null;
  city: string;
  country: string;
  countryCode: string;
  lat: number | null;
  lng: number | null;
  category: Category;
  headline: string;
  story: string;
  breakdown: BreakdownItem[];
  goalCents: number;
  fundedCents: number;
  giftCount: number;
  status: RequestStatus;
  verification: Verification;
  verificationRequestedAt: T | null;
  avatarSeed: string;
  photoUrl: string | null;
  blurPhoto: boolean;
  isDemo: boolean;
  createdAt: T;
  fundedAt: T | null;
  lastGiftId: string | null;
  /** Dominant colour of the portrait, used for that card's progress bar and stamps. */
  accent?: string | null;
}

/** Private ledger row, readable only by the Patron who gave it. */
export interface GiftDoc<T = unknown> {
  patronId: string;
  requestId: string;
  seekerId: string;
  amountCents: number;
  kind: GiftKind;
  anonymous: boolean;
  status: "settled" | "reversed";
  createdAt: T;
  reversedAt?: T;
  // Denormalised so the Impact page needs no joins.
  requestName: string;
  category: Category;
  country: string;
  countryCode: string;
  city: string;
  lat: number | null;
  lng: number | null;
  photoUrl: string | null;
  avatarSeed: string;
  /** Set when the gift was given as part of a Giving Circle / in response to a match challenge. */
  circleId?: string | null;
  matchId?: string | null;
}

/** Public gift-wall entry under requests/{id}/wall — never contains a Patron id. */
export interface WallDoc<T = unknown> {
  amountCents: number;
  kind: GiftKind;
  fromName: string | null;
  fromAvatar: string | null;
  status: "settled" | "reversed";
  createdAt: T;
}

export interface UpdateDoc<T = unknown> {
  kind: UpdateKind;
  body: string;
  createdAt: T;
  /** Optional voice note / short video attached to a thank-you (requests/{id}/media/{mediaId}). */
  mediaId?: string | null;
}

/** A Seeker's recorded thank-you. Stored inline (Spark has no Cloud Storage), so it's small and short. */
export interface MediaDoc<T = unknown> {
  kind: "voice" | "video";
  dataUrl: string;
  mime: string;
  durationSec: number;
  /** Auto-caption produced on-device while recording (Web Speech API). */
  caption: string | null;
  createdAt: T;
}

/** Giving Circle: several Patrons pooling gifts toward one large debt, with a live shared bar. */
export interface CircleDoc<T = unknown> {
  name: string;
  requestId: string;
  requestName: string;
  photoUrl: string | null;
  createdBy: string;
  createdByName: string;
  /** uid → display name */
  members: Record<string, string>;
  raisedCents: number;
  giftCount: number;
  lastGiftId: string | null;
  createdAt: T;
}

/** "Match my gift" challenge created from a Patron's gift; others match it via a link. */
export interface MatchDoc<T = unknown> {
  requestId: string;
  requestName: string;
  photoUrl: string | null;
  amountCents: number;
  fromName: string;
  createdBy: string;
  matchCount: number;
  matchedCents: number;
  lastGiftId: string | null;
  createdAt: T;
}

/** users/{uid}/follows/{requestId} */
export interface FollowDoc<T = unknown> {
  createdAt: T;
  /** Last time the follower looked at this person's activity. */
  seenAt: T;
  /** Highest funding milestone (0, 25, 50, 75, 100) the follower has already been told about. */
  seenPct?: number;
}

/** users/{uid}/recurring/{id}: "$500 a month to whoever is closest to cleared". */
export interface RecurringDoc<T = unknown> {
  amountCents: number;
  rule: "closest_verified" | "followed" | "cause";
  active: boolean;
  lastRunAt: T | null;
  createdAt: T;
}

export interface ReportDoc<T = unknown> {
  requestId: string;
  reporterId: string;
  reason: string;
  note: string | null;
  status?: "open" | "resolved" | "dismissed";
  createdAt: T;
}

export interface PatronStatsDoc<T = unknown> {
  displayName: string | null;
  avatar: string | null;
  anonymous: boolean;
  totalCents: number;
  giftCount: number;
  /** requestId → true for everyone this Patron has helped. */
  requests: Record<string, true>;
  /** requestId → true for debts this Patron helped clear. */
  cleared: Record<string, true>;
  /** weekIndex → true for every week with a gift. */
  weeks: Record<string, true>;
  lastGiftId: string | null;
  lastGiftAt: T | null;
}

export interface GlobalStatsDoc {
  totalCents: number;
  giftCount: number;
  debtsCleared: number;
  lastGiftId: string | null;
}

export interface PersonaDoc {
  persona: string;
  role: Role;
  uid: string;
  email: string;
  displayName: string;
  blurb: string;
  photo: string | null;
}

export interface SwipeDoc<T = unknown> {
  action: "pass" | "save";
  createdAt: T;
}
