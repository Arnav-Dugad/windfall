/**
 * Small portrait variants for list avatars, tiles and blurred backdrops:
 *   public/people/s/<hash>.webp   240×300, from the 600×750 originals
 *   npx tsx scripts/make-thumbs.ts
 */
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import sharp from "sharp";

const src = "public/people";
const out = "public/people/s";
mkdirSync(out, { recursive: true });

let made = 0;
let bytes = 0;
for (const f of readdirSync(src).filter((f) => f.endsWith(".webp"))) {
  const dest = `${out}/${f}`;
  if (!existsSync(dest)) {
    await sharp(`${src}/${f}`).resize(240, 300).webp({ quality: 70, effort: 6 }).toFile(dest);
    made++;
  }
  bytes += statSync(dest).size;
}
console.log(`made ${made} thumbnails; ${Math.round(bytes / 1024)}KB total in ${out}`);
