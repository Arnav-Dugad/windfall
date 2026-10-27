// Frame pacing while dragging the top Discover card back and forth (GPU on, 4x CPU throttle).
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:4175";
const browser = await chromium.launch({ args: ["--disable-gpu-vsync", "--use-angle=d3d11", "--enable-gpu-rasterization", "--ignore-gpu-blocklist", "--enable-gpu"] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(`${base}/login`);
await page.getByRole("button", { name: /Eleanor V\./ }).click();
await page.waitForURL(/discover/);
await page.locator('[aria-label="Story deck"] article h2').first().waitFor({ timeout: 60000 });
await page.waitForTimeout(6000); // let images settle and idle work finish
const variant = process.argv[3] ?? "as-is";
if (variant === "no-dof") await page.addStyleTag({ content: '[style*="brightness("] { filter: none !important; }' });
if (variant === "no-filters") await page.addStyleTag({ content: '* { filter: none !important; backdrop-filter: none !important; }' });
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
const results = [];
for (let run = 0; run < 3; run++) {
  const card = page.locator('[aria-label="Story deck"] article').first();
  const box = (await card.boundingBox());
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__frames.length < 400) window.__raf = requestAnimationFrame(tick); };
    window.__raf = requestAnimationFrame(tick);
  });
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 0; i < 90; i++) await page.mouse.move(x + Math.sin(i / 7) * 90, y + Math.sin(i / 11) * 12);
  await page.mouse.move(x, y);
  await page.mouse.up();
  await page.waitForTimeout(600);
  const f = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__frames.slice(2); });
  const sorted = [...f].sort((a, b) => a - b);
  results.push({ frames: f.length, avg: +(f.reduce((a, b) => a + b, 0) / f.length).toFixed(1), p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1), long: f.filter((d) => d > 34).length });
}
console.log(variant.padEnd(10), JSON.stringify(results.slice(1)));
await browser.close();
