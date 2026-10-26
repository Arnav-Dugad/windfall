/**
 * Captures the rendered landing hero and writes it into index.html as a static shell, so the
 * headline paints from HTML + CSS before any JavaScript runs (React then takes over seamlessly).
 * Re-run after changing the hero:   npx tsx scripts/build-shell.ts [http://localhost:5173]
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
await page.goto(`${url}/`);
await page.locator("h1").waitFor();
await page.waitForTimeout(1500);

const html = await page.evaluate(() => {
  const app = document.querySelector("#root > div")!.cloneNode(true) as HTMLElement;
  app.querySelector("footer")?.remove();
  const main = app.querySelector("main")!;
  [...main.children].slice(1).forEach((el) => el.remove());

  // The live deck and live totals are replaced by same-size placeholders.
  const deck = main.querySelector('[data-shell="deck"]')!;
  deck.removeAttribute("style");
  deck.innerHTML =
    '<div class="relative h-[480px] w-full sm:h-[520px]"><div aria-hidden="true" class="skeleton absolute inset-0 rounded-card"></div></div><div class="mt-9 h-14"></div><div class="mt-4 h-[19.5px]"></div>';
  main.querySelectorAll("dd").forEach((dd) => {
    dd.innerHTML = '<div aria-hidden="true" class="skeleton rounded-tile h-[1em] w-20"></div>';
  });
  // Motion leaves resolved inline styles behind; the shell should rely on classes only.
  app.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
    if (/^(opacity|transform|will-change)/.test(el.getAttribute("style") ?? "")) el.removeAttribute("style");
  });
  return app.outerHTML;
});
await browser.close();

const index = readFileSync("index.html", "utf8");
const next = index.replace(/<!-- shell:start -->[\s\S]*?<!-- shell:end -->/, `<!-- shell:start -->${html}<!-- shell:end -->`);
if (next === index && !index.includes("shell:start")) throw new Error("shell markers missing from index.html");
writeFileSync("index.html", next);
console.log(`shell written: ${(html.length / 1024).toFixed(1)}KB`);
