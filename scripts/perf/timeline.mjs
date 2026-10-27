// Diagnostic: LCP entries, long tasks, Firestore bytes and the request timeline for one route (throttled).
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:4174";
const path = process.argv[3] ?? "/";
const login = process.argv[4] === "login";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
if (login) {
  await page.goto(`${base}/login`);
  await page.getByRole("button", { name: /Eleanor V\./ }).click();
  await page.waitForURL(/discover/);
  await page.waitForTimeout(2500);
  await page.goto(`${base}/`);
  await page.waitForTimeout(500);
}
const cdp = await ctx.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
const t0 = { v: 0 };
const rows = new Map();
cdp.on("Network.requestWillBeSent", (e) => { if (!t0.v) t0.v = e.timestamp; rows.set(e.requestId, { url: e.request.url, method: e.request.method, start: e.timestamp }); });
const recv = { fs: 0, fsChunks: [] };
cdp.on("Network.dataReceived", (e) => { const r = rows.get(e.requestId); if (r && r.url.includes("firestore.googleapis.com")) { recv.fs += e.dataLength; recv.fsChunks.push([Math.round((e.timestamp - t0.v) * 1000), e.dataLength]); } });
cdp.on("Network.loadingFinished", (e) => { const r = rows.get(e.requestId); if (r) { r.end = e.timestamp; r.size = e.encodedDataLength; } });
await page.addInitScript(() => {
  window.__lcp = [];
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lcp.push({ t: Math.round(e.startTime), el: e.element ? e.element.tagName + "." + String(e.element.className).slice(0, 60) : "", url: e.url, size: e.size }))).observe({ type: "largest-contentful-paint", buffered: true });
  window.__lt = [];
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: "longtask", buffered: true });
});
await page.goto(`${base}${path}`);
await page.waitForTimeout(8000);
console.log("LCP entries:", JSON.stringify(await page.evaluate(() => window.__lcp), null, 1));
console.log("Long tasks [start,dur]:", JSON.stringify(await page.evaluate(() => window.__lt)));
const list = [...rows.values()].filter((r) => !r.url.startsWith("data:")).sort((a, b) => a.start - b.start);
for (const r of list) {
  const u = r.url.replace(base, "").replace(/\?.*$/, (q) => (q.length > 60 ? q.slice(0, 60) + "…" : q));
  console.log(String(Math.round((r.start - t0.v) * 1000)).padStart(6), "→", String(r.end ? Math.round((r.end - t0.v) * 1000) : "…").padStart(6), String(Math.round((r.size ?? 0) / 1024)).padStart(5) + "KB", r.method, u.slice(0, 130));
}
console.log("Firestore bytes received (decoded):", Math.round(recv.fs / 1024) + "KB");
const buckets = {}; for (const [t, n] of recv.fsChunks) { const b = Math.floor(t / 500) * 500; buckets[b] = (buckets[b] ?? 0) + n; }
console.log("by 500ms:", Object.entries(buckets).map(([b, n]) => `${b}:${Math.round(n / 1024)}KB`).join(" "));
const posts = list.filter((r) => r.url.includes("Listen/channel") && r.method === "POST");
console.log("Listen POSTs:", posts.length);
await browser.close();
