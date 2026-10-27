/**
 * Downloads synthetic (StyleGAN-generated) portraits of people who do not exist, for demo Seekers.
 * Using generated faces means no real person is ever depicted as having debt.
 *   npx tsx scripts/fetch-faces.ts 220
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";

const target = Number(process.argv[2] ?? 220);
const dir = ".cache/faces/raw";
mkdirSync(dir, { recursive: true });
const seen = new Set(readdirSync(dir).map((f) => f.split(".")[0]));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
while (seen.size < target && fails < 40) {
  try {
    const res = await fetch(`https://thispersondoesnotexist.com/random-person.jpeg?t=${Date.now()}`, {
      headers: { "User-Agent": "Mozilla/5.0 (windfall demo seed)", "Cache-Control": "no-cache" },
    });
    if (!res.ok || !res.headers.get("content-type")?.includes("image")) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const hash = createHash("md5").update(buf).digest("hex").slice(0, 12);
    if (!seen.has(hash) && !existsSync(`${dir}/${hash}.jpg`)) {
      writeFileSync(`${dir}/${hash}.jpg`, buf);
      seen.add(hash);
      if (seen.size % 10 === 0) console.log(`${seen.size}/${target}`);
    }
    fails = 0;
    await sleep(2200);
  } catch {
    fails++;
    await sleep(5000 * Math.min(fails, 4));
  }
}
console.log(`done: ${seen.size} faces in ${dir}`);
