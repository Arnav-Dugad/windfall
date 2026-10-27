/**
 * Runs only for /assets/* (see wrangler.jsonc "run_worker_first"). Vite's hashed build files never change, so
 * they're cached for a year; a missing hash returns a real 404 instead of the SPA's index.html, so a stale tab
 * can never cache HTML under a script's name. Every other path is served straight from static assets.
 */
export default {
  async fetch(request, env) {
    const res = await env.ASSETS.fetch(request);
    if ((res.headers.get("content-type") ?? "").includes("text/html")) {
      return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" } });
    }
    if (res.status !== 200) return res;
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    return new Response(res.body, { status: 200, headers });
  },
};
