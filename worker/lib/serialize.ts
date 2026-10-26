import type { RequestCard, RequestDetail, SeekerUpdate } from "../../shared/domain";
import type { requests } from "../db/schema";

type RequestRow = typeof requests.$inferSelect;

export function toCard(r: RequestRow): RequestCard {
  return {
    id: r.id,
    firstName: r.firstName,
    age: r.age,
    city: r.city,
    country: r.country,
    countryCode: r.countryCode,
    category: r.category,
    headline: r.headline,
    story: r.story,
    breakdown: r.breakdown,
    goalCents: r.goalCents,
    fundedCents: r.fundedCents,
    giftCount: r.giftCount,
    verification: r.verification,
    status: r.status,
    avatarSeed: r.avatarSeed,
    photoUrl: r.photoKey ? `/api/media/${r.photoKey}` : null,
    blurPhoto: r.blurPhoto,
    createdAt: r.createdAt,
    isDemo: r.isDemo,
  };
}

export function toDetail(r: RequestRow, updates: SeekerUpdate[]): RequestDetail {
  return { ...toCard(r), updates, lat: r.lat, lng: r.lng };
}
