import { z } from "zod";
import { CATEGORIES } from "./domain";
import { MAX_GIFT_CENTS, MIN_GIFT_CENTS } from "./money";

// Every API body/query is validated against one of these (server) and reused by forms (client).

export const id = z.string().regex(/^[a-z0-9_-]{4,64}$/i, "Invalid id");

export const demoLoginSchema = z.object({
  role: z.enum(["patron", "seeker"]),
  persona: z.string().max(40).optional(),
});

export const deckQuerySchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  country: z.string().length(2).toUpperCase().optional(),
  min: z.coerce.number().int().min(0).optional(),
  max: z.coerce.number().int().min(0).optional(),
  sort: z.enum(["for_you", "newest", "closest"]).default("for_you"),
  verified: z
    .enum(["1", "0", "true", "false"])
    .transform((v) => v === "1" || v === "true")
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type DeckQuery = z.infer<typeof deckQuerySchema>;

export const giftSchema = z.object({
  requestId: id,
  amountCents: z.number().int().min(MIN_GIFT_CENTS).max(MAX_GIFT_CENTS).optional(),
  kind: z.enum(["give", "clear"]),
  anonymous: z.boolean().default(false),
});

export const swipeSchema = z.object({
  requestId: id,
  action: z.enum(["pass", "save"]),
});

export const reportSchema = z.object({
  requestId: id,
  reason: z.enum(["misleading", "duplicate", "offensive", "privacy", "other"]),
  note: z.string().trim().max(500).optional(),
});

export const breakdownItemSchema = z.object({
  label: z.string().trim().min(2, "Add a short label").max(60),
  // Whole dollars: gifts move in dollars, so a cents remainder could never be cleared.
  amountCents: z.number().int().min(100, "At least $1").max(50_000_000).multipleOf(100, "Whole dollars only"),
});

export const storyStepSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "Your first name, please")
    .max(30)
    .regex(/^[\p{L}][\p{L}'’ -]*$/u, "Letters only — first name only"),
  headline: z.string().trim().min(8, "A little longer").max(80, "Keep it under 80 characters"),
  story: z
    .string()
    .trim()
    .min(80, "Tell Patrons a bit more (80+ characters)")
    .max(2000, "Keep it under 2,000 characters"),
});

/** Requests can ask for up to $500,000 in total (firestore.rules enforces the same ceiling). */
export const MAX_GOAL_CENTS = 50_000_000;

export const amountStepSchema = z.object({
  breakdown: z
    .array(breakdownItemSchema)
    .min(1, "Add at least one item")
    .max(6)
    .refine((items) => items.reduce((s, b) => s + b.amountCents, 0) <= MAX_GOAL_CENTS, "The total can be up to $500,000"),
});

export const newRequestSchema = storyStepSchema.extend({
  age: z.number().int().min(18).max(110).nullable().default(null),
  city: z.string().trim().min(1).max(60),
  country: z.string().trim().min(2).max(60),
  countryCode: z.string().length(2).toUpperCase(),
  category: z.enum(CATEGORIES),
  breakdown: amountStepSchema.shape.breakdown,
  blurPhoto: z.boolean().default(false),
  // Photos are resized on-device and stored inline as a data URL (firestore.rules allows up to 160,000 characters).
  photoKey: z.string().max(160_000, "That photo is too large — try another").nullable().default(null),
  documentKey: z.string().max(200).nullable().default(null),
});
export type NewRequestInput = z.infer<typeof newRequestSchema>;

export const updateRequestSchema = z.object({
  status: z.enum(["active", "paused", "closed"]).optional(),
  blurPhoto: z.boolean().optional(),
});

export const postUpdateSchema = z.object({
  kind: z.enum(["update", "thanks"]),
  body: z.string().trim().min(4, "Say a little more").max(600),
});

export const profileSchema = z.object({
  anonymousByDefault: z.boolean(),
});
