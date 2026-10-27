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
