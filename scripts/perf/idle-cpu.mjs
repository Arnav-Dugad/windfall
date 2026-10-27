// Main-thread busy time per second while a page sits idle (GPU on, no throttling).
import { chromium } from "@playwright/test";
const base = process.argv[2];
const b = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu-rasterization", "--ignore-gpu-blocklist", "--enable-gpu"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Performance.enable");
const busy = async (label) => {
  await page.waitForTimeout(5000);
  const m0 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  await page.waitForTimeout(6000);
  const m1 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const per = (k) => (((m1[k] - m0[k]) / 6) * 1000).toFixed(0);
  console.log(label.padEnd(10), "task ms/s", per("TaskDuration"), "· script", per("ScriptDuration"), "· layout", per("LayoutDuration"), "· style", per("RecalcStyleDuration"));
};
await page.goto(`${base}/`);
await busy("landing");
await page.goto(`${base}/login`);
await page.getByRole("button", { name: /Eleanor V\./ }).click();
await page.waitForURL(/discover/);
await page.locator('[aria-label="Story deck"] article h2').first().waitFor({ timeout: 60000 });
await busy("discover");
await b.close();
