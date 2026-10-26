/**
 * Renders brand assets (OG image, favicons, touch icon) from HTML using the self-hosted fonts.
 *
 *   npx tsx scripts/render-assets.ts
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const font = (p: string) => `data:font/woff2;base64,${readFileSync(p).toString("base64")}`;
const serif = font("node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2");
const serifItalic = font("node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2");
const sans = font("node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2");

const base = `
<style>
@font-face { font-family: S; src: url(${serif}); }
@font-face { font-family: S; font-style: italic; src: url(${serifItalic}); }
@font-face { font-family: G; src: url(${sans}); font-weight: 100 900; }
* { margin: 0; box-sizing: border-box; }
body { background: #faf7f2; color: #111; font-family: G, sans-serif; -webkit-font-smoothing: antialiased; }
</style>`;

const mark = (size: number) => `
<svg width="${size}" height="${size}" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="15" fill="#111"/>
  <circle cx="16" cy="18.5" r="6.5" fill="#c3a370"/>
  <path d="M16 4.5v6" stroke="#c3a370" stroke-width="1.6" stroke-linecap="round" opacity="0.65"/>
  <path d="M11.5 7.5v3.5M20.5 7.5v3.5" stroke="#c3a370" stroke-width="1.2" stroke-linecap="round" opacity="0.35"/>
</svg>`;

const og = `${base}
<body style="width:1200px;height:630px;overflow:hidden;position:relative">
  <div style="position:absolute;right:-120px;top:-160px;width:760px;height:760px;border-radius:50%;background:radial-gradient(closest-side,#ece0c8,transparent)"></div>
  <div style="position:absolute;left:80px;top:72px;display:flex;align-items:center;gap:16px">
    ${mark(48)}<span style="font-family:S;font-size:46px;letter-spacing:-0.01em">Windfall</span>
    <span style="margin-left:14px;background:#ece0c8;color:#7a5a26;border-radius:999px;padding:7px 14px;font-size:15px;letter-spacing:.12em;font-weight:600">DEMO</span>
  </div>
  <h1 style="position:absolute;left:80px;top:188px;width:640px;font-family:S;font-weight:400;font-size:104px;line-height:.95;letter-spacing:-0.02em">
    Swipe right to <i style="color:#a97b2e">clear</i> someone’s debt.
  </h1>
  <p style="position:absolute;left:84px;bottom:70px;font-size:24px;color:#57524a">Give with a swipe. Clear it with one more.</p>
  <div style="position:absolute;right:120px;top:120px;width:330px;height:430px;border-radius:28px;background:#f6f1e8;transform:rotate(-4deg) translate(-26px,22px);box-shadow:0 30px 60px -20px rgba(40,30,15,.25)"></div>
  <div style="position:absolute;right:120px;top:120px;width:330px;height:430px;border-radius:28px;background:#fffdf9;overflow:hidden;transform:rotate(5deg);box-shadow:0 2px 4px rgba(40,30,15,.05),0 40px 80px -24px rgba(40,30,15,.3)">
    <div style="height:230px;background:radial-gradient(circle at 30% 25%,#e9dccb,#c9a77c);position:relative;overflow:hidden">
      <div style="position:absolute;width:220px;height:220px;border-radius:50%;background:#c9a77c;opacity:.55;left:150px;top:-40px"></div>
      <div style="position:absolute;width:180px;height:180px;border-radius:50%;background:#8c6a43;opacity:.25;left:-30px;top:110px"></div>
      <span style="position:absolute;inset:0;display:grid;place-items:center;font-family:S;font-size:120px;color:rgba(29,26,21,.8)">A</span>
    </div>
    <div style="padding:20px 24px">
      <div style="font-family:S;font-size:40px;line-height:1">Ana<span style="color:#6e685e">, 30</span></div>
      <div style="margin-top:10px;font-size:16px;line-height:1.35;color:#111">Our daughter arrived ten weeks early and has been showing off ever since</div>
      <div style="margin-top:26px;display:flex;justify-content:space-between;font-size:13px;color:#6e685e"><span><b style="color:#111">$38,800</b> of $54,000</span><span>$15,200 to go</span></div>
      <div style="margin-top:8px;height:6px;border-radius:9px;background:rgba(17,17,17,.08)"><div style="width:72%;height:100%;border-radius:9px;background:#c3a370"></div></div>
    </div>
    <div style="position:absolute;left:22px;top:30px;transform:rotate(-12deg);border:3px solid #c3a370;color:#7a5a26;background:rgba(236,224,200,.9);border-radius:14px;padding:4px 16px;font-size:26px;font-weight:600;letter-spacing:.12em">GIVE</div>
  </div>
</body>`;

const icon = (size: number, pad: number) => `${base}
<body style="width:${size}px;height:${size}px;display:grid;place-items:center;background:#faf7f2">${mark(size - pad * 2)}</body>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function shot(html: string, w: number, h: number, path: string) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html);
  await page.evaluate("document.fonts.ready");
  await page.screenshot({ path, omitBackground: false });
}

await shot(og, 1200, 630, "public/og.png");
await shot(icon(180, 22), 180, 180, "public/apple-touch-icon.png");
await shot(icon(192, 0), 192, 192, "public/icon-192.png");
await shot(icon(512, 0), 512, 512, "public/icon-512.png");
await shot(icon(32, 0), 32, 32, "public/favicon-32.png");
await browser.close();

// favicon.ico with a single embedded PNG (supported by every modern browser).
const png = readFileSync("public/favicon-32.png");
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt8(32, 6);
header.writeUInt8(32, 7);
header.writeUInt8(0, 8);
header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
writeFileSync("public/favicon.ico", Buffer.concat([header, png]));

writeFileSync(
  "public/favicon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <style>.b{fill:#111}@media (prefers-color-scheme:dark){.b{fill:#f3efe7}}</style>
  <circle class="b" cx="16" cy="16" r="15"/>
  <circle cx="16" cy="18.5" r="6.5" fill="#c3a370"/>
  <path d="M16 4.5v6" stroke="#c3a370" stroke-width="1.6" stroke-linecap="round" opacity="0.65"/>
  <path d="M11.5 7.5v3.5M20.5 7.5v3.5" stroke="#c3a370" stroke-width="1.2" stroke-linecap="round" opacity="0.35"/>
</svg>
`,
);
console.log("assets rendered → public/");
