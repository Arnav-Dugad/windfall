// Landing: when is the hero's top card fully painted (sharp portrait loaded)? Cold cache, throttled. Median of 5.
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:4174";
const browser = await chromium.launch();
const out = [];
for (let i = 0; i < 5; i++) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    const t = (window.__t = {});
    window.__tbt = 0;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__tbt += Math.max(0, e.duration - 50)))).observe({ type: "longtask", buffered: true });
    const tick = () => {
      const now = Math.round(performance.now());
      const art = document.querySelector("#hero-deck article");
      if (!t.card && art?.querySelector("h2")) t.card = now;
      const imgs = art ? [...art.querySelectorAll("img")] : [];
      if (!t.img && imgs.length >= 2 && imgs.every((im) => im.complete && im.naturalWidth)) t.img = now;
      if (!t.img) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto(`${base}/`);
  await page.waitForFunction(() => window.__t?.img, null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  out.push({ ...(await page.evaluate(() => window.__t)), tbt: Math.round(await page.evaluate(() => window.__tbt)) });
  await ctx.close();
}
const med = (k) => out.map((o) => o[k]).sort((a, b) => a - b)[2];
console.log("hero card", med("card"), "ms · hero portrait", med("img"), "ms · TBT", med("tbt"), "ms");
await browser.close();
