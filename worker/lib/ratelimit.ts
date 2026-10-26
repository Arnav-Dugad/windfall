import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../env";

/**
 * Per-client rate limiting using Workers Rate Limiting bindings.
 * Reads share API_LIMITER (120/min); mutations also hit WRITE_LIMITER (30/min).
 */
export const rateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const ip = c.req.header("cf-connecting-ip") ?? "local";
  const who = c.get("session")?.userId ?? ip;
  const write = c.req.method !== "GET" && c.req.method !== "HEAD";

  const checks: Promise<{ success: boolean }>[] = [];
  if (c.env.API_LIMITER) checks.push(c.env.API_LIMITER.limit({ key: `r:${who}` }));
  if (write && c.env.WRITE_LIMITER) checks.push(c.env.WRITE_LIMITER.limit({ key: `w:${who}` }));

  const results = await Promise.all(checks);
  if (results.some((r) => !r.success)) {
    c.header("Retry-After", "60");
    throw new HTTPException(429, { message: "Easy there — too many requests. Try again in a minute." });
  }
  await next();
};
