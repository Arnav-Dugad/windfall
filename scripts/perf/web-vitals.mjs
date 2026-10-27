// Web vitals (FCP / LCP / TBT / CLS) and bytes by type for "/" and a signed-in "/discover", median of RUNS (default 3).
// node scripts/perf/web-vitals.mjs http://localhost:4175   (VERBOSE=1 lists the JS files)
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:4174";
const runs = Number(process.env.RUNS ?? 3);
const browser = await chromium.launch();

async function measure(path, { login } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  if (login) {
    await page.goto(`${base}/login`);
    await page.getByRole("button", { name: /Eleanor V\./ }).click();
    await page.waitForURL(/discover/);
    await page.waitForTimeout(2500);
  }
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: !login });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const bytes = { js: 0, css: 0, img: 0, font: 0, other: 0 };
  const reqs = [];
  cdp.on("Network.loadingFinished", (e) => (reqs.find((r) => r.id === e.requestId) ?? {}).size = e.encodedDataLength);
  cdp.on("Network.responseReceived", (e) => reqs.push({ id: e.requestId, url: e.response.url, type: e.type }));
  await page.addInitScript(() => {
    window.__perf = { lcp: 0, cls: 0, longTasks: 0, tbt: 0 };
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__perf.lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => !e.hadRecentInput && (window.__perf.cls += e.value))).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__perf.longTasks++; window.__perf.tbt += Math.max(0, e.duration - 50); })).observe({ type: "longtask", buffered: true });
  });
  const t0 = Date.now();
  await page.goto(`${base}${path}`, { waitUntil: "load" });
  const loadMs = Date.now() - t0;
  await page.waitForTimeout(6000);
  const fcp = await page.evaluate(() => performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0);
  const p = await page.evaluate(() => window.__perf);
  for (const r of reqs) {
    const k = r.type === "Script" ? "js" : r.type === "Stylesheet" ? "css" : r.type === "Image" ? "img" : r.type === "Font" ? "font" : "other";
    bytes[k] += r.size ?? 0;
  }
  await ctx.close();
  return { fcp: Math.round(fcp), lcp: Math.round(p.lcp), tbt: Math.round(p.tbt), cls: +p.cls.toFixed(3), loadMs, kb: Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, Math.round(v / 1024)])), reqs: reqs.length, js: reqs.filter((r) => r.type === "Script").map((r) => `${r.url.split("/").pop()} ${Math.round((r.size ?? 0) / 1024)}KB`) };
}

const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (const [path, opts] of [["/", {}], ["/discover", { login: true }]]) {
  const rs = [];
  for (let i = 0; i < runs; i++) rs.push(await measure(path, opts));
  const pick = (k) => median(rs.map((r) => r[k]));
  console.log(`\n${path}  FCP ${pick("fcp")}ms  LCP ${pick("lcp")}ms  TBT ${pick("tbt")}ms  CLS ${median(rs.map((r) => r.cls))}  load ${pick("loadMs")}ms  reqs ${rs[0].reqs}`);
  console.log("  KB transferred:", JSON.stringify(rs[0].kb));
  if (process.env.VERBOSE) console.log("  " + rs[0].js.join("\n  "));
}
await browser.close();
