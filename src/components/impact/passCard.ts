import { formatUSDWhole } from "@shared/money";
import { barcode, memberSinceLabel, type PassData } from "./pass";

const W = 960;
const H = 1500;
const PAD = 72;
const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter Variable", system-ui, sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Renders the impact pass front (960×1500, transparent corners) to a PNG blob, on-device. */
export async function renderPass({ name, totals, memberSince }: PassData): Promise<Blob> {
  await document.fonts.load(`700 120px "Inter Variable"`).catch(() => undefined);
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--wf-accent").trim() || "#0071e3";

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Card body: accent → violet, like the mark.
  roundRect(ctx, 0, 0, W, H, 84);
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, W * 0.55, H);
  g.addColorStop(0, "#7cb8ff");
  g.addColorStop(0.38, accent);
  g.addColorStop(1, "#6e4cf5");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Sheen + corner glow
  const sheen = ctx.createLinearGradient(0, 0, W, H * 0.6);
  sheen.addColorStop(0.3, "rgba(255,255,255,0)");
  sheen.addColorStop(0.45, "rgba(255,255,255,0.22)");
  sheen.addColorStop(0.6, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W - 80, 60, 10, W - 80, 60, 520);
  glow.addColorStop(0, "rgba(255,255,255,0.28)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";

  // Header
  roundRect(ctx, PAD, PAD, 76, 76, 22);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(PAD + 38, PAD + 38, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `600 50px ${SANS}`;
  ctx.fillText("Give", PAD + 100, PAD + 56);
  ctx.font = `600 26px ${SANS}`;
  ctx.letterSpacing = "6px";
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.textAlign = "right";
  ctx.fillText("IMPACT PASS", W - PAD, PAD + 50);
  ctx.textAlign = "left";

  const label = (text: string, x: number, y: number) => {
    ctx.font = `600 26px ${SANS}`;
    ctx.letterSpacing = "5px";
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillText(text.toUpperCase(), x, y);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = "#fff";
  };

  // Primary field
  label("Total given", PAD, 320);
  ctx.font = `700 132px ${SANS}`;
  ctx.letterSpacing = "-4px";
  ctx.fillText(formatUSDWhole(totals.totalCents), PAD - 4, 450);
  ctx.letterSpacing = "0px";

  // Secondary fields
  const fields: [string, string][] = [
    ["People", totals.peopleHelped.toLocaleString("en-US")],
    ["Cleared", totals.debtsCleared.toLocaleString("en-US")],
    ["Streak", `${totals.streakWeeks} wk`],
  ];
  const fw = (W - PAD * 2 - 2 * 24) / 3;
  fields.forEach(([l, v], i) => {
    const x = PAD + i * (fw + 24);
    roundRect(ctx, x, 520, fw, 150, 32);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fill();
    label(l, x + 28, 574);
    ctx.font = `600 54px ${SANS}`;
    ctx.fillText(v, x + 28, 640);
  });

  // Holder
  label("Holder", PAD, 780);
  ctx.font = `600 58px ${SANS}`;
  ctx.fillText(name, PAD, 852, W - PAD * 2);

  // Barcode panel
  const bx = PAD;
  const by = H - PAD - 300;
  const bw = W - PAD * 2;
  roundRect(ctx, bx, by, bw, 300, 40);
  ctx.fillStyle = "#fff";
  ctx.fill();
  const bars = barcode(`${name}|${totals.totalCents}|${totals.giftCount}`);
  const units = bars.reduce((s, w) => s + w + 1, 0);
  const unit = (bw - 80) / units;
  let x = bx + 40;
  ctx.fillStyle = "#111";
  bars.forEach((w, i) => {
    if (i % 2 === 0) ctx.fillRect(x, by + 40, w * unit, 170);
    x += (w + 1) * unit;
  });
  ctx.font = `500 26px ${SANS}`;
  ctx.letterSpacing = "4px";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.textAlign = "center";
  ctx.fillText(`MEMBER SINCE ${memberSinceLabel(memberSince).toUpperCase()}`, W / 2, by + 262);
  ctx.restore();

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}
