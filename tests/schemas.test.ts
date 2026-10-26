import { describe, expect, it } from "vitest";
import { deckQuerySchema, giftSchema, newRequestSchema, storyStepSchema } from "../shared/schemas";
import { decodeSession, encodeSession } from "../worker/lib/session";

describe("schemas", () => {
  it("validates gifts", () => {
    expect(giftSchema.safeParse({ requestId: "req_abc123", amountCents: 100_000, kind: "give" }).success).toBe(true);
    expect(giftSchema.safeParse({ requestId: "req_abc123", kind: "clear" }).success).toBe(true);
    expect(giftSchema.safeParse({ requestId: "req_abc123", amountCents: 50, kind: "give" }).success).toBe(false);
    expect(giftSchema.safeParse({ requestId: "../../etc", kind: "give" }).success).toBe(false);
    expect(giftSchema.safeParse({ requestId: "req_abc123", amountCents: 1.5, kind: "give" }).success).toBe(false);
  });

  it("coerces deck query strings", () => {
    const q = deckQuerySchema.parse({ min: "1000", verified: "1", country: "ng" });
    expect(q).toMatchObject({ min: 1000, verified: true, country: "NG", sort: "newest", limit: 20 });
    expect(deckQuerySchema.safeParse({ category: "yachts" }).success).toBe(false);
  });

  it("enforces first-name-only and story length", () => {
    expect(storyStepSchema.safeParse({ firstName: "Maya", headline: "A short headline", story: "x".repeat(80) }).success).toBe(true);
    expect(storyStepSchema.safeParse({ firstName: "Maya42", headline: "A short headline", story: "x".repeat(80) }).success).toBe(false);
    expect(storyStepSchema.safeParse({ firstName: "Maya", headline: "short", story: "x".repeat(80) }).success).toBe(false);
    expect(storyStepSchema.safeParse({ firstName: "Maya", headline: "A short headline", story: "too short" }).success).toBe(false);
  });

  it("validates a full request with a breakdown", () => {
    const ok = newRequestSchema.safeParse({
      firstName: "Lena",
      headline: "A broken boiler in January",
      story: "y".repeat(120),
      city: "Cork",
      country: "Ireland",
      countryCode: "ie",
      category: "rent",
      breakdown: [{ label: "Rent", amountCents: 320_000 }],
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.countryCode).toBe("IE");
    expect(
      newRequestSchema.safeParse({
        firstName: "Lena",
        headline: "A broken boiler in January",
        story: "y".repeat(120),
        city: "Cork",
        country: "Ireland",
        countryCode: "IE",
        category: "rent",
        breakdown: [],
      }).success,
    ).toBe(false);
  });
});

describe("session cookie payload", () => {
  it("round-trips and expires", () => {
    const raw = encodeSession({ userId: "usr_demo_maya", role: "seeker" }, 2_000);
    expect(decodeSession(raw, 1_000)).toEqual({ userId: "usr_demo_maya", role: "seeker" });
    expect(decodeSession(raw, 3_000)).toBeNull();
  });
  it("rejects tampered roles", () => {
    expect(decodeSession("usr_x.admin.99999999999999", 0)).toBeNull();
    expect(decodeSession("garbage", 0)).toBeNull();
  });
});
