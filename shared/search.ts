import { CATEGORY_LABELS, type Category, type RequestCard } from "./domain";
import { COUNTRIES } from "./geo";
import { remainingCents } from "./money";

/**
 * Natural-language search, parsed on-device: "nurses in Kenya under $5K", "verified rent in Spain",
 * "students close to cleared over 20k". Returns structured filters plus a readable echo of what was understood.
 */
export interface ParsedQuery {
  category?: Category;
  countryCodes: string[];
  maxCents?: number;
  minCents?: number;
  verified?: boolean;
  closeToCleared?: boolean;
  terms: string[];
  chips: string[];
}

const CATEGORY_WORDS: [RegExp, Category][] = [
  [/\b(medical|hospital|surgery|health|icu|cancer|clinic|treatment|doctor|ambulance)\b/, "medical"],
  [/\b(student|students|loan|loans|college|university|degree|tuition|school)\b/, "student_loans"],
  [/\b(rent|eviction|landlord|housing|arrears|lease)\b/, "rent"],
  [/\b(business|shop|store|restaurant|bakery|cafe|café|startup|workshop|salon|farm)\b/, "small_business"],
  [/\b(emergency|flood|fire|storm|accident|funeral|car|repair|typhoon|earthquake)\b/, "emergency"],
];

const DEMONYMS: Record<string, string> = {
  kenyan: "KE", nigerian: "NG", ghanaian: "GH", mexican: "MX", brazilian: "BR", indian: "IN", filipino: "PH",
  american: "US", canadian: "CA", british: "GB", irish: "IE", spanish: "ES", french: "FR", german: "DE",
  italian: "IT", polish: "PL", japanese: "JP", korean: "KR", australian: "AU", vietnamese: "VN", colombian: "CO",
  argentine: "AR", chilean: "CL", peruvian: "PE", turkish: "TR", egyptian: "EG", moroccan: "MA",
};

const STOP = new Set(["in", "from", "the", "a", "an", "and", "of", "with", "for", "who", "people", "person", "under", "over", "below", "above", "less", "more", "than", "near", "debt", "debts", "show", "me", "find", "who", "are", "is", "need", "needs", "help"]);

function money(raw: string): number {
  const m = raw.replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d+)?)(k|m)?$/i);
  if (!m) return NaN;
  const n = Number(m[1]) * (m[2]?.toLowerCase() === "k" ? 1_000 : m[2]?.toLowerCase() === "m" ? 1_000_000 : 1);
  return Math.round(n * 100);
}

export function parseQuery(input: string): ParsedQuery {
  let q = ` ${input.toLowerCase().trim()} `;
  const out: ParsedQuery = { countryCodes: [], terms: [], chips: [] };

  // ("<" and ">" aren't word characters, so they sit outside the \b group.)
  const under = q.match(/(?:\b(?:under|below|less than|up to)|<)\s*\$?\s*([\d.,]+\s*[km]?)\b/);
  if (under && !isNaN(money(under[1]!))) {
    out.maxCents = money(under[1]!);
    q = q.replace(under[0], " ");
  }
  const over = q.match(/(?:\b(?:over|above|more than|at least)|>)\s*\$?\s*([\d.,]+\s*[km]?)\b/);
  if (over && !isNaN(money(over[1]!))) {
    out.minCents = money(over[1]!);
    q = q.replace(over[0], " ");
  }
  if (/\bverified\b/.test(q)) {
    out.verified = true;
    q = q.replace(/\bverified\b/, " ");
  }
  if (/\b(close to cleared|almost (?:there|cleared|done)|nearly (?:there|cleared)|closest)\b/.test(q)) {
    out.closeToCleared = true;
    q = q.replace(/\b(close to cleared|almost (?:there|cleared|done)|nearly (?:there|cleared)|closest)\b/, " ");
  }
  for (const [re, cat] of CATEGORY_WORDS) {
    if (re.test(q)) {
      out.category = cat;
      // Remove every word of that category ("rent arrears" → both), so none becomes a required search term.
      q = q.replace(new RegExp(re.source, "g"), " ");
      break;
    }
  }
  for (const c of COUNTRIES) {
    const re = new RegExp(`\\b${c.name.toLowerCase()}\\b`);
    if (re.test(q)) {
      out.countryCodes.push(c.code);
      q = q.replace(re, " ");
    }
  }
  for (const [word, code] of Object.entries(DEMONYMS)) {
    const re = new RegExp(`\\b${word}s?\\b`);
    if (re.test(q) && !out.countryCodes.includes(code)) {
      out.countryCodes.push(code);
      q = q.replace(re, " ");
    }
  }
  // Remaining words are free-text terms (occupations, cities…), singularised lightly.
  out.terms = q
    .split(/[^a-zà-ÿ'-]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));

  if (out.category) out.chips.push(CATEGORY_LABELS[out.category]);
  for (const code of out.countryCodes) out.chips.push(COUNTRIES.find((c) => c.code === code)?.name ?? code);
  if (out.maxCents) out.chips.push(`Under $${(out.maxCents / 100).toLocaleString("en-US")}`);
  if (out.minCents) out.chips.push(`Over $${(out.minCents / 100).toLocaleString("en-US")}`);
  if (out.verified) out.chips.push("Verified");
  if (out.closeToCleared) out.chips.push("Close to cleared");
  for (const t of out.terms) out.chips.push(`“${t}”`);
  return out;
}

/** Light stemming so "nurse" finds "nursing" and "teaching" finds "teacher". */
function stem(t: string) {
  return t.length > 4 ? t.replace(/(ing|ers|er|ed|es|e|s)$/, "") : t;
}

/** Amount filters apply to what's still needed — "under $5K" means it can be cleared for under $5K. */
export function searchCards(cards: RequestCard[], q: ParsedQuery): RequestCard[] {
  const hits = cards.filter((c) => {
    if (c.status !== "active") return false;
    const rem = remainingCents(c.goalCents, c.fundedCents);
    if (q.category && c.category !== q.category) return false;
    if (q.countryCodes.length && !q.countryCodes.includes(c.countryCode)) return false;
    if (q.maxCents !== undefined && rem > q.maxCents) return false;
    if (q.minCents !== undefined && rem < q.minCents) return false;
    if (q.verified && c.verification !== "verified") return false;
    if (q.terms.length) {
      const hay = `${c.firstName} ${c.city} ${c.country} ${c.headline} ${c.story}`.toLowerCase();
      if (!q.terms.every((t) => hay.includes(stem(t)))) return false;
    }
    return true;
  });
  return q.closeToCleared
    ? hits.sort((a, b) => b.fundedCents / b.goalCents - a.fundedCents / a.goalCents)
    : hits.sort((a, b) => remainingCents(a.goalCents, a.fundedCents) - remainingCents(b.goalCents, b.fundedCents));
}
