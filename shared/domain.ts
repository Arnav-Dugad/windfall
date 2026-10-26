// Domain vocabulary shared by the Worker API and the React client.
// Money is always integer cents (USD) to keep the ledger exact.

export const CATEGORIES = [
  "medical",
  "student_loans",
  "rent",
  "small_business",
  "emergency",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  medical: "Medical debt",
  student_loans: "Student loans",
  rent: "Rent arrears",
  small_business: "Small business",
  emergency: "Emergency costs",
};

export type Role = "patron" | "seeker";
export type RequestStatus = "active" | "paused" | "closed" | "funded";
export type Verification = "unverified" | "pending" | "verified";
export type GiftKind = "give" | "clear";
export type UpdateKind = "update" | "thanks";

export interface BreakdownItem {
  label: string;
  amountCents: number;
}

export interface SeekerUpdate {
  id: string;
  kind: UpdateKind;
  body: string;
  createdAt: number;
}

/** A Seeker's request as the Patron sees it (first name only, ever). */
export interface RequestCard {
  id: string;
  firstName: string;
  age: number | null;
  city: string;
  country: string;
  countryCode: string;
  category: Category;
  headline: string;
  story: string;
  breakdown: BreakdownItem[];
  goalCents: number;
  fundedCents: number;
  giftCount: number;
  verification: Verification;
  status: RequestStatus;
  avatarSeed: string;
  photoUrl: string | null;
  blurPhoto: boolean;
  createdAt: number;
  isDemo: boolean;
}

export interface RequestDetail extends RequestCard {
  updates: SeekerUpdate[];
  lat: number | null;
  lng: number | null;
}

export interface PublicUser {
  id: string;
  role: Role;
  displayName: string;
  avatarSeed: string;
  anonymousByDefault: boolean;
  isDemo: boolean;
}

/** Shape of hand-written seed data in shared/seed. */
export interface SeedSeeker {
  slug: string;
  firstName: string;
  age: number;
  city: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  category: Category;
  headline: string;
  story: string;
  breakdown: BreakdownItem[];
  verified: boolean;
  fundedRatio: number;
  postedDaysAgo: number;
  updates: { daysAgo: number; kind: UpdateKind; body: string }[];
}
