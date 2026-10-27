/**
 * Renders brand assets (OG image, favicons, touch icons) from HTML using the self-hosted Inter font and
 * real (AI-generated, fictional) roster portraits.
 *
 *   npx tsx scripts/render-assets.ts
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const b64 = (p: string, type: string) => `data:${type};base64,${readFileSync(p).toString("base64")}`;
const inter = b64("public/fonts/inter-latin.woff2", "font/woff2");
const portrait = (id: string) => b64(`public/people/${id}.webp`, "image/webp");
const linh = portrait("33da3b15268a");
const andrew = portrait("969339472dd1");

const base = `
<style>
@font-face { font-family: I; src: url(${inter}); font-weight: 100 900; }
* { margin: 0; box-sizing: border-box; }
body { background: #f5f5f7; color: #1d1d1f; font-family: I, sans-serif; -webkit-font-smoothing: antialiased; letter-spacing: -0.02em; }
.grad { background: linear-gradient(95deg, #0071e3 0%, #6e4cf5 55%, #c13584 100%); -webkit-background-clip: text; color: transparent; }
</style>`;

const mark = (size: number) => `
<svg width="${size}" height="${size}" viewBox="0 0 32 32">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2997ff"/><stop offset="1" stop-color="#6e4cf5"/></linearGradient></defs>
  <path d="M16 1c9.9 0 15 5.1 15 15s-5.1 15-15 15S1 25.9 1 16 6.1 1 16 1Z" fill="url(#g)"/>
  <circle cx="16" cy="18.5" r="6.2" fill="#fff"/>
  <path d="M16 5.5v5.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity="0.8"/>
  <path d="M11.5 8v3M20.5 8v3" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity="0.45"/>
</svg>`;

const card = (img: string, name: string, city: string, headline: string, pct: number, style: string) => `
<div style="position:absolute;width:300px;height:420px;border-radius:34px;overflow:hidden;box-shadow:0 30px 70px -20px rgba(0,0,0,.35);${style}">
  <img src="${img}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(24px) saturate(1.5);transform:scale(1.3)"/>
  <img src="${img}" style="position:absolute;inset:0 0 auto 0;width:100%;height:76%;object-fit:cover;-webkit-mask-image:linear-gradient(to bottom,#000 62%,transparent)"/>
  <div style="position:absolute;inset:auto 0 0 0;height:60%;background:linear-gradient(to top,rgba(0,0,0,.75),rgba(0,0,0,.35),transparent)"></div>
  <div style="position:absolute;left:18px;right:18px;bottom:18px;color:#fff">
    <div style="font-size:30px;font-weight:700">${name}</div>
    <div style="font-size:14px;opacity:.8;margin-top:4px">${city}</div>
    <div style="font-size:16px;font-weight:500;margin-top:10px;line-height:1.3">${headline}</div>
    <div style="margin-top:14px;padding:12px 14px;border-radius:18px;background:rgba(20,20,22,.34);backdrop-filter:blur(20px);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.22)">
      <div style="height:6px;border-radius:9px;background:rgba(255,255,255,.25)"><div style="width:${pct}%;height:100%;border-radius:9px;background:#fff"></div></div>
    </div>
  </div>
</div>`;

const og = `${base}
<body style="width:1200px;height:630px;overflow:hidden;position:relative">
  <div style="position:absolute;right:-60px;top:-140px;width:760px;height:760px;border-radius:50%;background:radial-gradient(closest-side,rgba(0,113,227,.18),transparent)"></div>
  <div style="position:absolute;left:80px;top:70px;display:flex;align-items:center;gap:14px">
    ${mark(46)}<span style="font-size:34px;font-weight:700">Windfall</span>
    <span style="margin-left:10px;background:rgba(120,120,128,.14);color:#424245;border-radius:999px;padding:7px 14px;font-size:16px;font-weight:600">Demo</span>
  </div>
  <h1 style="position:absolute;left:80px;top:150px;width:560px;font-size:76px;line-height:1;font-weight:700;letter-spacing:-0.04em">
    Swipe right to <span class="grad">clear</span> someone’s debt.
  </h1>
  <p style="position:absolute;left:82px;bottom:58px;font-size:22px;color:#6e6e73;font-weight:500">261 fictional people. Real-feeling stories. One swipe.</p>
  ${card(andrew, "Andrew, 56", "Melbourne, Australia", "Twenty-nine years fixing bikes. One flood.", 38, "right:250px;top:130px;transform:rotate(-6deg)")}
  ${card(linh, "Linh, 24", "Paris, France", "Microbiologist by day, still paying for the degree", 64, "right:70px;top:95px;transform:rotate(5deg)")}
  <div style="position:absolute;right:300px;top:170px;transform:rotate(-14deg);background:#0071e3;color:#fff;border-radius:999px;padding:8px 22px;font-size:24px;font-weight:700;box-shadow:0 10px 30px -6px rgba(0,113,227,.7)">Give</div>
</body>`;

const icon = (size: number, pad: number, bg = "#f5f5f7") => `${base}
<body style="width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg}">${mark(size - pad * 2)}</body>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function shot(html: string, w: number, h: number, path: string) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html);
  await page.evaluate("document.fonts.ready");
  await page.waitForTimeout(150);
  await page.screenshot({ path });
}

await shot(og, 1200, 630, "public/og.png");
await shot(icon(180, 0, "#fff").replace(mark(180), `<div style="width:180px;height:180px;display:grid;place-items:center;background:linear-gradient(135deg,#2997ff,#6e4cf5)">${mark(120).replace('fill="url(#g)"', 'fill="none"')}</div>`), 180, 180, "public/apple-touch-icon.png");
await shot(icon(192, 0), 192, 192, "public/icon-192.png");
await shot(icon(512, 0), 512, 512, "public/icon-512.png");
await shot(icon(32, 0), 32, 32, ".cache/favicon-32.png");
await browser.close();

// favicon.ico with a single embedded PNG (supported by every modern browser).
const png = readFileSync(".cache/favicon-32.png");
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt8(32, 6);
header.writeUInt8(32, 7);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
writeFileSync("public/favicon.ico", Buffer.concat([header, png]));

writeFileSync(
  "public/favicon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2997ff"/><stop offset="1" stop-color="#6e4cf5"/></linearGradient></defs>
  <path d="M16 1c9.9 0 15 5.1 15 15s-5.1 15-15 15S1 25.9 1 16 6.1 1 16 1Z" fill="url(#g)"/>
  <circle cx="16" cy="18.5" r="6.2" fill="#fff"/>
  <path d="M16 5.5v5.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity="0.8"/>
  <path d="M11.5 8v3M20.5 8v3" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity="0.45"/>
</svg>
`,
);
console.log("assets rendered → public/");
