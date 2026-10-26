/**
 * Captures README screenshots and a swipe-flow video (converted to GIF with ffmpeg afterwards).
 *   npx tsx scripts/capture-media.ts [http://localhost:4174]
 * Runs against a local preview so recording never changes production demo data.
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import gifenc from "gifenc";
import { mkdirSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const url = process.argv[2] ?? "http://localhost:4174";
const { GIFEncoder, applyPalette, quantize } = gifenc; // CommonJS package
const out = "docs/media";
mkdirSync(out, { recursive: true });

async function signIn(page: Page, role: "patron" | "seeker", name: RegExp) {
  await page.goto(`${url}/login?role=${role}`);
  await page.getByRole("button", { name }).click();
  await page.waitForURL(role === "patron" ? "**/discover" : "**/seeker");
  await page.waitForTimeout(1200);
}

async function drag(page: Page, dx: number, dy: number, steps = 24) {
  const box = (await page.getByRole("region", { name: "Story deck" }).locator("article").first().boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
    await page.waitForTimeout(16);
  }
  return async () => page.mouse.up();
}

async function shots(browser: Browser, theme: "light" | "dark") {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  const d = await desktop.newPage();
  await d.goto(`${url}/`);
  await d.waitForTimeout(2200);
  await d.screenshot({ path: `${out}/landing-${theme}.jpg`, quality: 88 });
  if (theme === "light") {
    await signIn(d, "patron", /Eleanor/);
    await d.screenshot({ path: `${out}/discover-desktop.jpg`, quality: 88 });
    await d.goto(`${url}/impact`);
    await d.waitForTimeout(2200);
    await d.screenshot({ path: `${out}/impact-desktop.jpg`, quality: 88 });
    await d.evaluate(() => window.scrollTo(0, 820));
    await d.waitForTimeout(1500);
    await d.screenshot({ path: `${out}/impact-map.jpg`, quality: 88 });
  }
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: theme, hasTouch: false });
  const m = await mobile.newPage();
  await signIn(m, "patron", /Theo/);
  await m.screenshot({ path: `${out}/deck-mobile-${theme}.jpg`, quality: 85 });
  if (theme === "light") {
    const release = await drag(m, 150, 10);
    await m.screenshot({ path: `${out}/deck-drag-mobile.jpg`, quality: 85 });
    await release();
    await m.waitForTimeout(900);
    await m.screenshot({ path: `${out}/give-sheet-mobile.jpg`, quality: 85 });
    await m.keyboard.press("Escape");
    await m.waitForTimeout(800);
    await signIn(m, "seeker", /^Maya/);
    await m.getByRole("link", { name: /Manage/ }).first().click();
    await m.waitForTimeout(1800);
    await m.screenshot({ path: `${out}/seeker-mobile.jpg`, quality: 85 });
  }
  await mobile.close();
}

/** Records the swipe flow via a CDP screencast and encodes an optimized GIF (no ffmpeg needed). */
async function video(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const p = await ctx.newPage();
  await signIn(p, "patron", /Sora/);
  await p.waitForTimeout(600);

  const frames: { png: Buffer; t: number }[] = [];
  const cdp = await ctx.newCDPSession(p);
  cdp.on("Page.screencastFrame", async (f) => {
    frames.push({ png: Buffer.from(f.data, "base64"), t: f.metadata.timestamp ?? Date.now() / 1000 });
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined);
  });
  await cdp.send("Page.startScreencast", { format: "png", maxWidth: 300, maxHeight: 600, everyNthFrame: 1 });

  // Drag right slowly → GIVE stamp → release → give sheet → give
  let release = await drag(p, 170, 12, 36);
  await p.waitForTimeout(250);
  await release();
  await p.waitForTimeout(900);
  await p.getByRole("dialog").getByRole("radio").first().click();
  await p.waitForTimeout(700);
  await p.getByRole("dialog").getByRole("button", { name: /^Give \$|^Clear/ }).click();
  await p.waitForTimeout(2200);
  await p.getByRole("button", { name: "Keep swiping" }).click();
  await p.waitForTimeout(900);
  // Pass with a flick left, then undo
  release = await drag(p, -200, 20, 14);
  await release();
  await p.waitForTimeout(800);
  await p.keyboard.press("z");
  await p.waitForTimeout(1100);
  // Swipe up → clear it → celebration
  release = await drag(p, 6, -230, 30);
  await p.waitForTimeout(200);
  await release();
  await p.waitForTimeout(3600);
  await cdp.send("Page.stopScreencast");
  await ctx.close();

  // Resample to a steady ~15fps and encode with one shared palette.
  const decoded = frames.map((f) => ({ img: PNG.sync.read(f.png), t: f.t }));
  const { width, height } = decoded[0]!.img;
  const step = 1 / 12;
  const picked: Uint8Array[] = [];
  for (let t = decoded[0]!.t, i = 0; t <= decoded.at(-1)!.t; t += step) {
    while (i + 1 < decoded.length && decoded[i + 1]!.t <= t) i++;
    const im = decoded[i]!.img;
    if (im.width === width && im.height === height) picked.push(new Uint8Array(im.data));
  }
  const sample = new Uint8Array(picked.filter((_, i) => i % 6 === 0).flatMap((f) => [...f]));
  const palette = quantize(sample, 128);
  // Identical consecutive frames collapse into one longer frame.
  const runs: { frame: Uint8Array; delay: number }[] = [];
  for (const f of picked) {
    const last = runs.at(-1);
    if (last && Buffer.compare(Buffer.from(last.frame), Buffer.from(f)) === 0) last.delay += step * 1000;
    else runs.push({ frame: f, delay: step * 1000 });
  }
  const gif = GIFEncoder();
  for (const r of runs) gif.writeFrame(applyPalette(r.frame, palette), width, height, { palette, delay: Math.round(r.delay) });
  gif.finish();
  for (const [i, at] of [[0, 0.25], [1, 0.62]] as const) {
    const png = new PNG({ width, height });
    png.data = Buffer.from(picked[Math.floor(picked.length * at)]!);
    writeFileSync(`${process.env.FRAME_DIR ?? out}/frame-${i}.png`, PNG.sync.write(png));
  }
  writeFileSync(`${out}/swipe.gif`, gif.bytes());
  console.log(`gif: ${picked.length} frames (${runs.length} unique), ${(gif.bytes().length / 1024 / 1024).toFixed(1)}MB`);
}

const browser = await chromium.launch();
const only = process.argv[3];
if (only !== "gif") {
  await shots(browser, "light");
  await shots(browser, "dark");
}
await video(browser);
await browser.close();
console.log("media captured →", out);
