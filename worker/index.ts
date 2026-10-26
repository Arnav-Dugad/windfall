import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv } from "./env";
import { rateLimit } from "./lib/ratelimit";
import { sessionMiddleware } from "./lib/session";
import { auth } from "./routes/auth";
import { deck } from "./routes/deck";
import { gifts } from "./routes/gifts";
import { media } from "./routes/media";
import { patron } from "./routes/patron";
import { publicRoutes } from "./routes/public";
import { seeker } from "./routes/seeker";

const app = new Hono<AppEnv>().basePath("/api");

app.use(secureHeaders());
app.use(sessionMiddleware);
app.use(rateLimit);

app.get("/health", (c) => c.json({ ok: true, payments: c.env.PAYMENTS_MODE }));
app.route("/", publicRoutes);
app.route("/auth", auth);
app.route("/", deck);
app.route("/gifts", gifts);
app.route("/", patron);
app.route("/seeker", seeker);
app.route("/", media);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Something went wrong on our side." }, 500);
});

export type AppType = typeof app;
export default app satisfies ExportedHandler<Env>;
