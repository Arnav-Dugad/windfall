import sharp from "sharp";

/**
 * A vivid, mid-lightness accent colour taken from a portrait, for that person's progress bar and Give stamp.
 * Hue comes from the most colourful region around the face (background, clothing), ignoring skin and hair;
 * lightness and saturation are clamped so the colour reads on white and black. Returns null when the portrait
 * has no colour of its own, so the card falls back to the app accent.
 */
export async function accentOf(file: string): Promise<string | null> {
  const { data } = await sharp(file).resize(32, 40, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = 24;
  const buckets = Array.from({ length: B }, () => ({ w: 0, x: 0, y: 0, s: 0, l: 0 }));
  for (let i = 0; i < data.length; i += 3) {
    // Skip the face itself (a central ellipse): background and clothing carry the person's colours.
    const px = ((i / 3) % 32) / 32 - 0.5;
    const py = Math.floor(i / 3 / 32) / 40 - 0.44;
    if ((px / 0.3) ** 2 + (py / 0.36) ** 2 < 1) continue;
    const [h, s, l] = rgbToHsl(data[i]!, data[i + 1]!, data[i + 2]!);
    if (s < 0.18 || l < 0.12 || l > 0.9) continue;
    let w = s * (1 - Math.abs(2 * l - 1));
    // Skin, hair, lips and warm shadows (hue ~335°–50°) say little about the person's colours; only a strongly
    // saturated warm (a red jumper, an orange wall) counts.
    if ((h >= 335 || h <= 50) && !(s > 0.75 && l > 0.3 && l < 0.7)) continue;
    const b = buckets[Math.floor(h / (360 / B)) % B]!;
    b.w += w;
    b.x += Math.cos((h * Math.PI) / 180) * w;
    b.y += Math.sin((h * Math.PI) / 180) * w;
    b.s += s * w;
    b.l += l * w;
  }
  const best = buckets.reduce((a, b) => (b.w > a.w ? b : a));
  if (best.w < 0.12) return null; // nothing colourful besides the person: use the app accent
  const hue = ((Math.atan2(best.y, best.x) * 180) / Math.PI + 360) % 360;
  const sat = clamp(best.s / best.w, 0.5, 0.82);
  let light = clamp(best.l / best.w, 0.42, 0.56);
  // Yellows and cyans look washed out at mid lightness on white; deepen them.
  if ((hue >= 40 && hue <= 85) || (hue >= 165 && hue <= 200)) light = Math.min(light, 0.44);
  return hslToHex(hue, sat, light);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
}
