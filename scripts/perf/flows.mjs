// QA: drives the main user journeys against a preview (use an emulator build) and reports failures and
// console errors per flow.  node scripts/perf/flows.mjs http://localhost:4175 [flowName]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:4175";
const only = process.argv[3];
const browser = await chromium.launch();
const results = [];

async function session(persona, vp = { width: 1366, height: 860 }) {
  const ctx = await browser.newContext({ viewport: vp, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("console", (m) => m.type() === "error" && !/Listen\/channel|React DevTools/.test(m.text()) && page.errors.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => page.errors.push("pageerror: " + String(e).slice(0, 200)));
  await page.goto(`${base}/login`);
  if (persona === "seeker") {
    await page.getByRole("tab", { name: /Seeker/ }).first().click();
    await page.getByRole("button", { name: /Wes/ }).first().click();
  } else if (persona === "moderator") await page.getByRole("button", { name: /Explore as a moderator/ }).click();
  else await page.getByRole("button", { name: persona }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  await page.waitForTimeout(1200);
  return { ctx, page };
}
const toastText = (page) => page.locator("[aria-live]").allTextContents().then((t) => t.join(" / "));
const deckTop = (page) => page.locator('[aria-label="Story deck"] article h2').first();

const FLOWS = {
  async giveAndMatch() {
    const { ctx, page } = await session(/Theo M\./);
    await page.goto(`${base}/discover`);
    await deckTop(page).waitFor({ timeout: 30000 });
    await page.keyboard.press("ArrowRight");
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: /^Give \$|^Clear .* debt/ }).click();
    await page.getByRole("heading", { name: /Thank you\.|You cleared/ }).waitFor({ timeout: 15000 });
    const match = page.getByRole("button", { name: /Challenge a friend/ });
    if (await match.count()) {
      await match.click();
      await page.waitForTimeout(2500);
      const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
      if (!/\/match\//.test(clip)) throw new Error(`match link not copied (clipboard="${clip}", toast="${await toastText(page)}")`);
      await page.goto(clip.replace(/^https?:\/\/[^/]+/, base));
      await page.getByText(/Match challenge/).waitFor({ timeout: 15000 });
    }
    return { ctx, page };
  },
  async historyUndo() {
    const { ctx, page } = await session(/Eleanor V\./);
    await page.goto(`${base}/discover`);
    await deckTop(page).waitFor({ timeout: 30000 });
    const first = await deckTop(page).innerText();
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(700);
    const second = await deckTop(page).innerText();
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(700);
    await page.keyboard.press("h");
    const drawer = page.getByRole("dialog", { name: /Recent decisions/ });
    await drawer.waitFor();
    // Undo the OLDER pass (second row) — it should come back on top.
    await drawer.getByRole("button", { name: new RegExp(`Undo: Passed ${first.split(",")[0]}`) }).click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    const top = await deckTop(page).innerText();
    if (top !== first) throw new Error(`expected ${first} back on top, got ${top} (second was ${second})`);
    return { ctx, page };
  },
  async filters() {
    const { ctx, page } = await session(/Eleanor V\./);
    await page.goto(`${base}/discover`);
    await deckTop(page).waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: /^Filters/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filters" });
    await sheet.getByRole("radio", { name: "Closest" }).click();
    await sheet.getByRole("button", { name: /Under \$10K/ }).click();
    const cta = sheet.getByRole("button", { name: /^Show \d+ stor/ });
    await cta.waitFor({ timeout: 10000 });
    await cta.click();
    await page.waitForTimeout(2500);
    const badge = await page.getByRole("button", { name: /Filters, \d+ active/ }).count();
    if (!badge) throw new Error("filter badge missing after apply");
    await deckTop(page).waitFor({ timeout: 20000 });
    return { ctx, page };
  },
  async finishDebt() {
    const { ctx, page } = await session(/Sora K\./);
    await page.goto(`${base}/discover`);
    await deckTop(page).waitFor({ timeout: 30000 });
    const btn = page.getByRole("button", { name: /^Clear .* debt with/ }).first();
    await btn.waitFor({ timeout: 20000 });
    await btn.click();
    await page.getByRole("dialog").getByRole("button", { name: /^Clear .* debt ·/ }).click();
    await page.getByRole("heading", { name: /You cleared/ }).waitFor({ timeout: 20000 });
    return { ctx, page };
  },
  async followAndCircle() {
    const { ctx, page } = await session(/Theo M\./);
    await page.goto(`${base}/story/req-hanna-uppsala-44e7`);
    const follow = page.getByRole("button", { name: /^Follow|^Following/ }).first();
    await follow.waitFor({ timeout: 20000 });
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^(Follow|Following)$/.test(b.textContent?.trim() ?? "") && !b.disabled));
    const before = await follow.innerText();
    await follow.click();
    await page.waitForTimeout(1500);
    const after = await page.getByRole("button", { name: /^Follow|^Following/ }).first().innerText();
    if (before === after) throw new Error(`follow button didn't toggle (${before})`);
    await page.getByRole("button", { name: /Start a Giving Circle/ }).first().click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("button", { name: /Start|Create/ }).last().click();
    await page.waitForURL(/\/circles\/[^/]+$/, { timeout: 15000 });
    await page.getByRole("button", { name: /Give with the circle/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Give \$|^Clear .* debt/ }).click();
    await page.getByRole("heading", { name: /Thank you\.|You cleared/ }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Done" }).click();
    await page.waitForTimeout(2000);
    const raised = await page.getByText(/raised by this circle · 1 gifts/).count();
    if (!raised) throw new Error("circle bar didn't update to 1 gift");
    return { ctx, page };
  },
  async circleUndo() {
    const { ctx, page } = await session(/Eleanor V\./);
    await page.goto(`${base}/circles/circle-1`);
    const total = () => page.getByText(/raised by this circle · \d+ gifts/).innerText();
    await page.getByRole("button", { name: /Give with the circle/ }).waitFor({ timeout: 20000 });
    const before = await total();
    await page.getByRole("button", { name: /Give with the circle/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Give \$|^Clear .* debt/ }).click();
    await page.getByRole("heading", { name: /Thank you\./ }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /Undo gift/ }).click();
    await page.getByRole("dialog").waitFor({ state: "detached", timeout: 15000 });
    await page.waitForTimeout(2000);
    const after = await total();
    if (after !== before) throw new Error(`circle total not restored: "${before}" → "${after}"`);
    return { ctx, page };
  },
  async cachedDeck() {
    const { ctx, page } = await session(/Eleanor V\./);
    await page.goto(`${base}/discover`);
    await deckTop(page).waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    const t0 = Date.now();
    await page.reload();
    await deckTop(page).waitFor({ timeout: 30000 });
    const ms = Date.now() - t0;
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(3000);
    if (ms > 4000) throw new Error(`deck took ${ms}ms on a return visit`);
    return { ctx, page };
  },
  async settings() {
    const { ctx, page } = await session(/Eleanor V\./);
    await page.goto(`${base}/settings`);
    const chip = () => page.getByRole("button", { name: "Rent arrears" }).first();
    await chip().waitFor();
    const was = await chip().getAttribute("aria-pressed");
    await chip().click();
    await page.getByRole("button", { name: /^Save$/ }).click();
    await page.getByText(/lean toward these causes/).waitFor({ timeout: 8000 });
    await page.reload();
    await chip().waitFor();
    if ((await chip().getAttribute("aria-pressed")) === was) throw new Error("cause change not persisted");
    await page.getByRole("button", { name: "Rent arrears" }).first().click();
    await page.getByRole("button", { name: /^Save$/ }).click();
    await page.getByRole("button", { name: /every month/ }).click();
    await page.waitForTimeout(1500);
    const pledges = await page.getByText(/\/ month/).count();
    if (pledges < 2) throw new Error(`expected a new pledge row, have ${pledges}`);
    await page.getByRole("button", { name: /Delete this monthly gift/ }).last().click();
    await page.waitForTimeout(1500);
    return { ctx, page };
  },
  async moderation() {
    const { ctx, page } = await session("moderator");
    await page.waitForURL(/admin/);
    await page.getByRole("button", { name: "Resolve" }).first().waitFor({ timeout: 20000 });
    const n = await page.getByRole("button", { name: "Resolve" }).count();
    await page.getByRole("button", { name: "Resolve" }).first().click();
    await page.waitForTimeout(2000);
    const m = await page.getByRole("button", { name: "Resolve" }).count();
    if (m !== n - 1) throw new Error(`resolve didn't remove the report (${n} → ${m})`);
    await page.getByRole("tab", { name: /Verification/ }).click();
    await page.getByRole("button", { name: /Verify/ }).first().click();
    await page.waitForTimeout(1500);
    return { ctx, page };
  },
  async search() {
    const { ctx, page } = await session(/Eleanor V\./);
    await page.goto(`${base}/search`);
    await page.getByRole("searchbox", { name: "Search stories" }).fill("verified medical bills");
    await page.waitForTimeout(2500);
    const tiles = await page.locator("main li button").count();
    if (!tiles) throw new Error("no results for 'verified medical bills'");
    await page.locator("main li button").first().click();
    await page.waitForURL(/\/story\//);
    await page.getByRole("heading", { level: 1 }).waitFor();
    return { ctx, page };
  },
  async wrapped() {
    const { ctx, page } = await session(/Eleanor V\./);
    await page.goto(`${base}/wrapped`);
    await page.waitForTimeout(2500);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(500);
    }
    await page.getByRole("button", { name: /Share/ }).waitFor({ timeout: 8000 });
    await page.keyboard.press("Escape");
    await page.waitForURL(/impact/);
    return { ctx, page };
  },
  async seekerUpdate() {
    const { ctx, page } = await session("seeker");
    await page.goto(`${base}/seeker/requests/req-wes-halifax-012c`);
    const box = page.getByRole("textbox").first();
    await box.waitFor({ timeout: 20000 });
    await box.fill("Thank you all — the new spray booth is ordered.");
    await page.getByRole("button", { name: /Post|Send/ }).first().click();
    await page.waitForTimeout(2000);
    const posted = await page.getByText("the new spray booth is ordered").count();
    if (!posted) throw new Error(`update not shown after posting (${await toastText(page)})`);
    return { ctx, page };
  },
};

for (const [name, fn] of Object.entries(FLOWS)) {
  if (only && only !== name) continue;
  let ctx;
  try {
    const r = await fn();
    ctx = r.ctx;
    results.push({ name, ok: true, errors: r.page.errors });
  } catch (e) {
    results.push({ name, ok: false, error: String(e.message ?? e).split("\n")[0].slice(0, 260) });
  } finally {
    await ctx?.close().catch(() => undefined);
  }
}
for (const r of results) console.log(r.ok ? "PASS" : "FAIL", r.name.padEnd(16), r.ok ? (r.errors.length ? `console: ${r.errors.join(" | ")}` : "") : r.error);
await browser.close();
