import type { Category, GiftKind, PublicUser, RequestCard, RequestDetail, SeekerUpdate } from "@shared/domain";
import type { DeckQuery, NewRequestInput } from "@shared/schemas";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? "Something went wrong. Please try again.");
  return body;
}

// ---- Response shapes ---------------------------------------------------------
export interface Stats {
  totalCents: number;
  giftCount: number;
  peopleHelped: number;
  debtsCleared: number;
  activeRequests: number;
}
export interface Persona {
  persona: string;
  displayName: string;
  blurb: string;
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
  places: {
    city: string;
    country: string;
    countryCode: string;
    lat: number;
    lng: number;
    totalCents: number;
    people: string[];
  }[];
  byCategory: { category: Category; totalCents: number }[];
  recent: {
    giftId: string;
    requestId: string;
    firstName: string;
    category: Category;
    country: string;
    avatarSeed: string;
    amountCents: number;
    kind: GiftKind;
    anonymous: boolean;
    createdAt: number;
    cleared: boolean;
  }[];
  cleared: { requestId: string; firstName: string; avatarSeed: string }[];
}
export interface LeaderboardEntry {
  id: string;
  rank: number;
  displayName: string;
  avatarSeed: string;
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
}

export type DeckFilters = Partial<Pick<DeckQuery, "category" | "country" | "min" | "max" | "sort">> & {
  verified?: boolean;
};

function qs(params: Record<string, string | number | boolean | undefined>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === false || v === "") continue;
    s.set(k, v === true ? "1" : String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : "";
}

export const api = {
  stats: () => request<Stats>("/stats"),
  featured: () => request<{ cards: RequestCard[] }>("/featured"),
  personas: () => request<{ patrons: Persona[]; seekers: Persona[] }>("/auth/personas"),
  me: () => request<{ user: PublicUser | null }>("/auth/me"),
  demoLogin: (role: "patron" | "seeker", persona: string) =>
    request<{ user: PublicUser }>("/auth/demo", { method: "POST", json: { role, persona } }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  updateProfile: (anonymousByDefault: boolean) =>
    request<{ user: PublicUser }>("/auth/me", { method: "PATCH", json: { anonymousByDefault } }),

  deck: (f: DeckFilters) => request<{ cards: RequestCard[] }>(`/deck${qs({ ...f, limit: 30 })}`),
  resetDeck: () => request<{ ok: true }>("/deck/reset", { method: "POST" }),
  countries: () => request<{ countries: { code: string; name: string }[] }>("/countries"),
  story: (id: string) => request<{ request: RequestDetail }>(`/requests/${id}`),
  swipe: (requestId: string, action: "pass" | "save") =>
    request<{ ok: true }>("/swipes", { method: "POST", json: { requestId, action } }),
  unswipe: (requestId: string) => request<{ ok: true }>(`/swipes/${requestId}`, { method: "DELETE" }),
  saved: () => request<{ saved: (RequestCard & { savedAt: number })[] }>("/saved"),
  give: (input: { requestId: string; amountCents?: number; kind: GiftKind; anonymous: boolean }) =>
    request<GiftResult>("/gifts", { method: "POST", json: input }),
  reverseGift: (giftId: string) =>
    request<{ ok: true; request: RequestCard | null }>(`/gifts/${giftId}/reverse`, { method: "POST" }),
  report: (requestId: string, reason: string, note?: string) =>
    request<{ ok: true }>("/reports", { method: "POST", json: { requestId, reason, note } }),

  impact: () => request<Impact>("/impact"),
  leaderboard: () => request<{ entries: LeaderboardEntry[] }>("/leaderboard"),

  myRequests: () => request<{ requests: RequestCard[] }>("/seeker/requests"),
  myRequest: (id: string) => request<{ request: RequestDetail; gifts: SeekerGift[] }>(`/seeker/requests/${id}`),
  createRequest: (input: NewRequestInput) =>
    request<{ request: RequestCard }>("/seeker/requests", { method: "POST", json: input }),
  updateRequest: (id: string, patch: { status?: "active" | "paused" | "closed"; blurPhoto?: boolean }) =>
    request<{ request: RequestCard }>(`/seeker/requests/${id}`, { method: "PATCH", json: patch }),
  postUpdate: (id: string, kind: "update" | "thanks", body: string) =>
    request<{ update: SeekerUpdate }>(`/seeker/requests/${id}/updates`, { method: "POST", json: { kind, body } }),
  attachDocument: (id: string, documentKey: string | null) =>
    request<{ request: RequestCard }>(`/seeker/requests/${id}/document`, { method: "POST", json: { documentKey } }),
  upload: (file: File, kind: "photo" | "proof") => {
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    return request<{ key: string | null; stored: boolean }>("/uploads", { method: "POST", body: form });
  },
};
