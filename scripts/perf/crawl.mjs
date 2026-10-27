// QA crawl: every route × persona × viewport. Reports console errors, page errors, failed requests,
// horizontal overflow and broken images, and saves screenshots to .cache/crawl/.
// node scripts/perf/crawl.mjs http://localhost:4175 [anon|patron|seeker|moderator]   (DARK=1 for the dark theme)
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:4175";
const only = process.argv[3];
mkdirSync(".cache/crawl", { recursive: true });

const ROUTES = {
  anon: ["/", "/login", "/welcome", "/story/req-andres-bogota-1572", "/nope-404"],
  patron: ["/discover", "/search?q=nurses%20in%20Kenya%20under%20%245K", "/circles", "/circles/circle-1", "/match/match-1", "/impact", "/leaderboard", "/saved", "/activity", "/settings", "/more", "/wrapped", "/story/req-andres-bogota-1572", "/admin"],
  seeker: ["/seeker", "/seeker/new", "/seeker/requests/req-wes-halifax-012c"],
  moderator: ["/admin", "/discover"],
};
const PERSONA = { patron: /Eleanor V\./, moderator: "moderator", seeker: "seeker" };
const VIEWPORTS = { mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, desktop: { width: 1366, height: 860 } };

const browser = await chromium.launch();
const findings = [];
for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
  for (const [who, routes] of Object.entries(ROUTES)) {
    if (only && only !== who) continue;
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor ?? 1 });
    if (process.env.DARK) await ctx.addInitScript(() => localStorage.setItem("wf-theme", "dark"));
    const page = await ctx.newPage();
    let current = "";
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") {
        const t = m.text();
        if (/React DevTools|Built-In AI|OAuth operations|Download the React/.test(t)) return;
        findings.push({ vp: vpName, who, route: current, kind: `console.${m.type()}`, msg: t.slice(0, 300) });
      }
    });
    page.on("pageerror", (e) => findings.push({ vp: vpName, who, route: current, kind: "pageerror", msg: String(e).slice(0, 300) }));
    page.on("requestfailed", (r) => {
      const f = r.failure()?.errorText ?? "";
      if (/ERR_ABORTED/.test(f) && /Listen\/channel|\.webp/.test(r.url())) return;
      findings.push({ vp: vpName, who, route: current, kind: "requestfailed", msg: `${f} ${r.url().slice(0, 140)}` });
    });
    page.on("response", (r) => {
      if (r.status() >= 400 && !/Listen\/channel/.test(r.url())) findings.push({ vp: vpName, who, route: current, kind: `http${r.status()}`, msg: r.url().slice(0, 160) });
    });
    if (who !== "anon") {
      current = "/login";
      await page.goto(`${base}/login`);
      if (who === "seeker") await page.getByRole("tab", { name: /Seeker/ }).first().click();
      if (who === "moderator") await page.getByRole("button", { name: /Explore as a moderator/ }).click();
      else if (who === "seeker") await page.getByRole("button", { name: /Wes|part-funded/ }).first().click();
      else await page.getByRole("button", { name: PERSONA[who] }).click();
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
      await page.waitForTimeout(1500);
    }
    for (const route of routes) {
      current = route;
      await page.goto(`${base}${route}`);
      await page.waitForTimeout(route === "/wrapped" ? 3500 : 4000);
      const check = await page.evaluate(() => {
        const overflow = document.documentElement.scrollWidth - window.innerWidth;
        const wide = overflow > 1 ? [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(e).position !== "fixed").slice(0, 3).map((e) => `${e.tagName}.${String(e.className).slice(0, 50)}`) : [];
        const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith("data:")).map((i) => i.src.slice(-40));
        const h1 = document.querySelector("h1")?.textContent?.trim().slice(0, 40) ?? "";
        const errText = [...document.querySelectorAll("h2,p")].map((e) => e.textContent ?? "").find((t) => /something went wrong|couldn’t|could not|error/i.test(t)) ?? "";
        return { overflow, wide, broken, h1, errText: errText.slice(0, 120), url: location.pathname };
      });
      if (check.overflow > 1) findings.push({ vp: vpName, who, route, kind: "overflow", msg: `${check.overflow}px ${check.wide.join(" | ")}` });
      if (check.broken.length) findings.push({ vp: vpName, who, route, kind: "broken-img", msg: check.broken.join(", ") });
      if (check.errText) findings.push({ vp: vpName, who, route, kind: "error-ui", msg: check.errText });
      if (check.url !== route.split("?")[0]) findings.push({ vp: vpName, who, route, kind: "redirect", msg: `→ ${check.url}` });
      await page.screenshot({ path: `.cache/crawl/${process.env.DARK ? "dark-" : ""}${vpName}-${who}-${route.replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}.png` });
    }
    await ctx.close();
  }
}
await browser.close();
const seen = new Set();
for (const f of findings) {
  const k = `${f.kind}|${f.who}|${f.route}|${f.msg}`;
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`[${f.vp}] ${f.who} ${f.route} :: ${f.kind} :: ${f.msg}`);
}
console.log(`\n${findings.length} findings (${seen.size} unique)`);
