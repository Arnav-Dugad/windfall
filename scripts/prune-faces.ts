/** Deletes portraits in public/people that no roster entry uses (skipped or excluded during casting). */
import { readdirSync, unlinkSync } from "node:fs";

const EXCLUDED = ["1c85cafaa157", "8505f3da048e", "c3f880deac7f"];
const used = new Set<string>();
for (const f of readdirSync("shared/seed/people")) {
  const mod = (await import(`../shared/seed/people/${f}`)) as Record<string, { photo: string }[]>;
  for (const list of Object.values(mod)) for (const p of list) used.add(p.photo.replace("/people/", ""));
}
for (const x of EXCLUDED) used.delete(`${x}.webp`);
let removed = 0;
for (const f of readdirSync("public/people")) {
  if (!used.has(f)) {
    unlinkSync(`public/people/${f}`);
    removed++;
  }
}
console.log(`kept ${readdirSync("public/people").length}, removed ${removed}`);
