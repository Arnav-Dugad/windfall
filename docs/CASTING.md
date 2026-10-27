# Windfall casting brief (for roster-writing agents)

Windfall is a demo app where wealthy "Patrons" swipe through stories of "Seekers" carrying debt and gift money.
**Everyone is fictional.** The portraits are AI-generated (StyleGAN) faces of people who do not exist.

## Your job
For every portrait ID in your batch file, open its thumbnail and cast a fictional person who plausibly matches
the face (apparent age range, apparent gender presentation), then write their profile.

- Thumbnails: `C:\Users\rduga\Desktop\Windfall Website\.cache\faces\thumbs\<id>.jpg` (open with the Read tool)
- The `photo` field must be exactly `"/people/<id>.webp"`.
- **Skip** (leave out entirely) any portrait that looks like a child/teen (under ~20), shows two faces,
  or has obvious generation artifacts (melted features, garbled background faces). List skipped ids in your final report.

## Output
Write ONE TypeScript file (path given in your task). It must compile under strict TS:

```ts
import type { SeedSeeker } from "../../domain";
export const SEEKERS_<N>: SeedSeeker[] = [ /* … */ ];
```
Read `C:\Users\rduga\Desktop\Windfall Website\shared\domain.ts` for `SeedSeeker` (and `SeedPatron` if you cast Patrons).

## SeedSeeker rules
- `slug`: kebab-case `firstname-city-<first 4 chars of photo id>` (e.g. `amara-lagos-0065`). Must be unique.
- `firstName` only; culturally fitting for where you place them. `age` 21–79, consistent with the face.
- Place people across the whole world: real cities with accurate `lat`/`lng` (2 decimals) and ISO-3166 alpha-2
  `countryCode`; full English `country` name. Use the region emphasis in your task, but diaspora is fine —
  anyone can live anywhere. Never more than 25% of your batch in one country.
- `category`: spread evenly across `medical`, `student_loans`, `rent`, `small_business`, `emergency`.
- `headline` ≤ 80 chars: specific, warm, a little wry or hopeful. Never pitying or begging.
- `story`: first person, 100–160 words, 2–3 paragraphs separated by `\n\n`. Concrete: their work, what happened,
  what they've already done about it, what clearing it would change. Dignified, no melodrama, no religion,
  no real brands/hospitals/universities/employers, no real public figures, no politics.
- **Avoid stereotypes** — don't pick jobs, debts or hardships based on ethnicity or gender. Vary occupations
  widely (nurse, welder, teacher, coder, chef, farmer, bus driver, musician, accountant, tailor, etc).
- `breakdown`: 2–4 items, integer USD cents, summing to the goal. Goals vary: some $2,000–$9,000, most
  $10,000–$60,000, a few $80,000–$220,000. Round figures (whole dollars, ideally to $10).
- `verified`: true for ~75%. `fundedRatio` 0–0.93 varied (include a few ≥0.85 and some 0). `postedDaysAgo` 1–120.
- `updates`: 0–3 items, `daysAgo` < `postedDaysAgo`, `kind` "update" (1–2 sentences of progress) or "thanks"
  (only when fundedRatio > 0). Same voice as the story.
- Use plain double-quoted strings; escape inner double quotes; apostrophes are fine.

## Checks before you finish
Run (PowerShell or bash) from `C:\Users\rduga\Desktop\Windfall Website`:
`npx tsx -e "import('./shared/seed/people/<your file>.ts').then(m=>{const a=Object.values(m)[0];console.log(a.length, new Set(a.map(x=>x.slug)).size, a.every(x=>x.breakdown.reduce((s,b)=>s+b.amountCents,0)>0))})"`
It must import without errors; slug count must equal length.

Report back only: number of profiles written, skipped ids, category counts, number of distinct countries.
