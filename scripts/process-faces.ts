/**
 * Turns downloaded synthetic portraits into web assets:
 *   public/people/<hash>.webp   600×750 (4:5 portrait crop) for cards and story pages
 *   .cache/faces/thumbs/<hash>.jpg  small previews used when casting the fictional roster
 *   npx tsx scripts/process-faces.ts
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import sharp from "sharp";

const raw = ".cache/faces/raw";
const out = "public/people";
const thumbs = ".cache/faces/thumbs";
mkdirSync(out, { recursive: true });
mkdirSync(thumbs, { recursive: true });

const files = readdirSync(raw).filter((f) => f.endsWith(".jpg")).sort();
let made = 0;
for (const f of files) {
  const id = f.replace(".jpg", "");
  if (existsSync(`${out}/${id}.webp`) && existsSync(`${thumbs}/${id}.jpg`)) continue;
  // Source is 1024² with the face centred; take a 4:5 crop that keeps the head and shoulders.
  const crop = sharp(`${raw}/${f}`).extract({ left: 102, top: 0, width: 820, height: 1024 });
  await crop.clone().resize(600, 750).webp({ quality: 74, effort: 5 }).toFile(`${out}/${id}.webp`);
  await crop.clone().resize(200, 250).jpeg({ quality: 70 }).toFile(`${thumbs}/${id}.jpg`);
  made++;
}
console.log(`processed ${made} new portraits; ${files.length} total`);
