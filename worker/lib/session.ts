import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import type { Role } from "../../shared/domain";
import type { AppEnv, Session } from "../env";

export const SESSION_COOKIE = "wf_session";
const MAX_AGE_S = 60 * 60 * 24 * 7;

/** Cookie value: `<userId>.<role>.<expiresAtMs>`, HMAC-SHA256 signed by Hono. */
export function encodeSession(s: Session, expiresAt: number): string {
  return `${s.userId}.${s.role}.${expiresAt}`;
}

export function decodeSession(raw: string, now = Date.now()): Session | null {
  const [userId, role, exp] = raw.split(".");
  if (!userId || (role !== "patron" && role !== "seeker")) return null;
  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return null;
  return { userId, role };
}

function secret(c: Context<AppEnv>): string {
  const s = c.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new HTTPException(500, { message: "SESSION_SECRET is not configured" });
  return s;
}

export async function startSession(c: Context<AppEnv>, session: Session) {
  const secure = new URL(c.req.url).protocol === "https:";
  await setSignedCookie(c, SESSION_COOKIE, encodeSession(session, Date.now() + MAX_AGE_S * 1000), secret(c), {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export function endSession(c: Context<AppEnv>) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const raw = await getSignedCookie(c, secret(c), SESSION_COOKIE);
  c.set("session", raw ? decodeSession(raw) : null);
  await next();
};

export function requireRole(role?: Role): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const s = c.get("session");
    if (!s) throw new HTTPException(401, { message: "Sign in to continue" });
    if (role && s.role !== role) throw new HTTPException(403, { message: `This area is for ${role}s` });
    await next();
  };
}

export function sessionOf(c: Context<AppEnv>): Session {
  const s = c.get("session");
  if (!s) throw new HTTPException(401, { message: "Sign in to continue" });
  return s;
}
