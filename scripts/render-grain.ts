/** Pre-renders the film-grain tile (an SVG turbulence filter is too costly to rasterize on first paint). */
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 112, height: 112 } });
await page.setContent(`<body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112">
  <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>
  <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 0"/></filter>
  <rect width="100%" height="100%" filter="url(#n)"/>
</svg></body>`);
await page.screenshot({ path: "public/grain.png", omitBackground: true });
await browser.close();
console.log("public/grain.png written");
