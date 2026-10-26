import type { Role } from "../shared/domain";

export type Bindings = Omit<Env, "PAYMENTS_MODE" | "MEDIA"> & {
  PAYMENTS_MODE: "demo" | "stripe_test";
  /** Optional: generated avatars are used when R2 isn't configured. */
  MEDIA?: R2Bucket;
  STRIPE_SECRET_KEY?: string;
};

export interface Session {
  userId: string;
  role: Role;
}

export type AppEnv = {
  Bindings: Bindings;
  Variables: { session: Session | null };
};
