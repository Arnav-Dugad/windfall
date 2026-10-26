import { formatUSD } from "@shared/money";
import { WORLD_DOTS } from "@/data/world-dots";
import type { Impact } from "@/lib/api";

const W = 1080;
const H = 1350;

/** Renders a 1080×1350 impact card (Instagram portrait) to a PNG blob, in the current theme. */
export async function renderShareCard(opts: { name: string; impact: Impact; dark: boolean }): Promise<Blob> {
  const { impact, dark } = opts;
  await Promise.all([
    document.fonts.load('400 200px "Instrument Serif"'),
    document.fonts.load('italic 400 80px "Instrument Serif"'),
    document.fonts.load('500 32px "Geist Variable"'),
  ]).catch(() => undefined);

  const c = {
    bg: dark ? "#12110f" : "#faf7f2",
    card: dark ? "#1c1a17" : "#fffdf9",
    ink: dark ? "#f3efe7" : "#111111",
    ink2: dark ? "#bdb5a8" : "#57524a",
    ink3: dark ? "#8f887d" : "#8a8378",
    gold: dark ? "#d6b67c" : "#b08a4c",
    dots: dark ? "rgba(255,248,235,0.13)" : "rgba(17,17,17,0.10)",
    line: dark ? "rgba(255,248,235,0.10)" : "rgba(17,17,17,0.08)",
  };

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);

  // Soft gold glow
  const glow = ctx.createRadialGradient(W * 0.78, 260, 20, W * 0.78, 260, 620);
  glow.addColorStop(0, dark ? "rgba(214,182,124,0.22)" : "rgba(195,163,112,0.22)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Mark + wordmark
  ctx.fillStyle = c.ink;
  ctx.beginPath();
  ctx.arc(100, 110, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.gold;
  ctx.beginPath();
  ctx.arc(100, 115, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.ink;
  ctx.font = '400 52px "Instrument Serif", Georgia, serif';
  ctx.textBaseline = "middle";
  ctx.fillText("Windfall", 142, 112);

  ctx.textBaseline = "alphabetic";
  ctx.font = '500 26px "Geist Variable", system-ui, sans-serif';
  ctx.fillStyle = c.ink3;
  ctx.letterSpacing = "4px";
  ctx.fillText(`${opts.name.toUpperCase()} · MY IMPACT`, 80, 300);
  ctx.letterSpacing = "0px";

  // Hero number
  ctx.fillStyle = c.gold;
  ctx.font = '400 190px "Instrument Serif", Georgia, serif';
  fitText(ctx, formatUSD(impact.totals.totalCents), 80, 470, W - 160, 190);
  ctx.fillStyle = c.ink2;
  ctx.font = 'italic 400 54px "Instrument Serif", Georgia, serif';
  ctx.fillText("given, quietly, to people with stories.", 80, 550);

  // Map
  const mapTop = 620;
  const scale = (W - 160) / WORLD_DOTS.width;
  ctx.save();
  ctx.translate(80, mapTop);
  ctx.scale(scale, scale);
  ctx.strokeStyle = c.dots;
  ctx.lineWidth = 0.6;
  ctx.lineCap = "round";
  ctx.setLineDash([0, 1]);
  ctx.stroke(new Path2D(WORLD_DOTS.path));
  ctx.setLineDash([]);
  const max = Math.max(1, ...impact.places.map((p) => p.totalCents));
  for (const p of impact.places) {
    const x = (p.lng + 180) / WORLD_DOTS.step - 0.5;
    const y = (WORLD_DOTS.latMax - p.lat) / WORLD_DOTS.step;
    const r = 0.9 + Math.sqrt(p.totalCents / max) * 1.4;
    ctx.fillStyle = dark ? "rgba(214,182,124,0.2)" : "rgba(176,138,76,0.18)";
    ctx.beginPath();
    ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.gold;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Stats
  const stats: [string, string][] = [
    [String(impact.totals.peopleHelped), "people helped"],
    [String(impact.totals.debtsCleared), "debts cleared"],
    [String(impact.totals.countries), "countries"],
    [`${impact.totals.streakWeeks}w`, "giving streak"],
  ];
  const top = 1080;
  ctx.fillStyle = c.line;
  ctx.fillRect(80, top - 60, W - 160, 2);
  const colW = (W - 160) / 4;
  stats.forEach(([v, l], i) => {
    const x = 80 + i * colW;
    ctx.fillStyle = c.ink;
    ctx.font = '400 96px "Instrument Serif", Georgia, serif';
    ctx.fillText(v, x, top + 50);
    ctx.fillStyle = c.ink2;
    ctx.font = '500 26px "Geist Variable", system-ui, sans-serif';
    ctx.fillText(l, x, top + 100);
  });

  ctx.fillStyle = c.ink3;
  ctx.font = '400 22px "Geist Variable", system-ui, sans-serif';
  ctx.fillText("Demo data — no real money moved. Windfall is a fictional product demo.", 80, H - 70);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn’t render image"))), "image/png"));
}

function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number) {
  let s = size;
  ctx.font = `400 ${s}px "Instrument Serif", Georgia, serif`;
  while (ctx.measureText(text).width > maxW && s > 60) {
    s -= 6;
    ctx.font = `400 ${s}px "Instrument Serif", Georgia, serif`;
  }
  ctx.fillText(text, x, y);
}
