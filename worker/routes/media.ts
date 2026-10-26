import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb, schema } from "../db/client";
import type { AppEnv } from "../env";
import { newId } from "../lib/ids";
import { requireRole, sessionOf } from "../lib/session";

export const media = new Hono<AppEnv>();

const RULES = {
  photo: { maxBytes: 5 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/webp"] },
  proof: { maxBytes: 10 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/webp", "application/pdf"] },
} as const;

/**
 * Upload a Seeker photo or proof document to R2.
 * Without an R2 binding the upload is acknowledged but not stored (`stored: false`) so the demo still works.
 */
media.post("/uploads", requireRole("seeker"), async (c) => {
  const { userId } = sessionOf(c);
  const form = await c.req.formData().catch(() => null);
  const kind = form?.get("kind");
  const file = form?.get("file");
  if (kind !== "photo" && kind !== "proof") throw new HTTPException(400, { message: "kind must be photo or proof" });
  if (!(file instanceof File)) throw new HTTPException(400, { message: "Attach a file" });

  const rule = RULES[kind];
  if (!(rule.types as readonly string[]).includes(file.type)) {
    throw new HTTPException(415, { message: kind === "photo" ? "Use a JPG, PNG or WebP image" : "Use a PDF or an image" });
  }
  if (file.size > rule.maxBytes) {
    throw new HTTPException(413, { message: `Keep it under ${rule.maxBytes / 1024 / 1024} MB` });
  }

  if (!c.env.MEDIA) return c.json({ key: null, stored: false });

  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
  const key = `${kind}/${userId}/${newId("f")}.${ext}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await getDb(c.env.DB)
    .insert(schema.documents)
    .values({ id: newId("doc"), ownerId: userId, key, kind, contentType: file.type });
  return c.json({ key, stored: true }, 201);
});

/** Public read for Seeker photos only. Proof documents are never served publicly. */
media.get("/media/:key{photo/.+}", async (c) => {
  if (!c.env.MEDIA) throw new HTTPException(404, { message: "Not found" });
  const obj = await c.env.MEDIA.get(c.req.param("key"));
  if (!obj) throw new HTTPException(404, { message: "Not found" });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
});
