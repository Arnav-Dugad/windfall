// When do the app shell, the Discover route, and the deck data appear? (throttled, warm HTTP cache, signed in)
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:4174";
const cold = process.argv[3] === "cold";
const browser = await chromium.launch();
const out = [];
for (let i = 0; i < 3; i++) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${base}/login`);
  await page.getByRole("button", { name: /Eleanor V\./ }).click();
  await page.waitForURL(/discover/);
  await page.waitForTimeout(3000);
  await page.goto(`${base}/404-blank`);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  if (cold) await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    const t = (window.__t = {});
    const tick = () => {
      const now = Math.round(performance.now());
      if (!t.header && document.querySelector("header")) t.header = now;
      if (!t.deckRegion && document.querySelector('[aria-label="Story deck"]')) t.deckRegion = now;
      if (!t.card && document.querySelector('[aria-label="Story deck"] article h2')) t.card = now;
      if (!t.img) {
        const img = document.querySelector('[aria-label="Story deck"] article img');
        if (img && img.complete && img.naturalWidth) t.img = now;
      }
      if (!t.img) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto(`${base}/discover`);
  await page.waitForFunction(() => window.__t?.img, null, { timeout: 30000 });
  out.push(await page.evaluate(() => window.__t));
  await ctx.close();
}
const med = (k) => out.map((o) => o[k]).sort((a, b) => a - b)[1];
console.log(cold ? "COLD" : "WARM", "header", med("header"), "deckRegion", med("deckRegion"), "card", med("card"), "img", med("img"));
await browser.close();
