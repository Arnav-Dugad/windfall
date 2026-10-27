/**
 * On-device translation with Chrome's built-in AI APIs (Translator + LanguageDetector). Nothing leaves the
 * browser, and everything is feature-detected: where the APIs don't exist, callers simply hide the button.
 */

interface TranslatorInstance {
  translate(text: string): Promise<string>;
}
interface TranslatorStatic {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<"unavailable" | "downloadable" | "downloading" | "available">;
  create(o: { sourceLanguage: string; targetLanguage: string }): Promise<TranslatorInstance>;
}
interface DetectorStatic {
  create(): Promise<{ detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]> }>;
}

const g = globalThis as unknown as { Translator?: TranslatorStatic; LanguageDetector?: DetectorStatic };

export const translationSupported = () => typeof g.Translator?.create === "function";

/** The reader's language, as a bare BCP 47 primary tag ("pt-BR" → "pt"). */
export const targetLanguage = () => (navigator.language || "en").split("-")[0]!.toLowerCase();

async function detect(text: string): Promise<string> {
  try {
    if (!g.LanguageDetector) return "en";
    const d = await g.LanguageDetector.create();
    const [best] = await d.detect(text.slice(0, 600));
    return best && best.confidence > 0.5 && best.detectedLanguage !== "und" ? best.detectedLanguage.split("-")[0]! : "en";
  } catch {
    return "en"; // stories are written in English unless we can tell otherwise
  }
}

/** Returns the language pair if this text can be translated for this reader, else null. */
export async function translationPair(text: string): Promise<{ source: string; target: string } | null> {
  if (!translationSupported()) return null;
  const target = targetLanguage();
  const source = await detect(text);
  if (source === target) return null;
  try {
    const a = await g.Translator!.availability({ sourceLanguage: source, targetLanguage: target });
    return a === "unavailable" ? null : { source, target };
  } catch {
    return null;
  }
}

const cache = new Map<string, Promise<TranslatorInstance>>();

/** Translates several strings with one translator (created on first use — may download a language pack). */
export async function translateAll(texts: string[], pair: { source: string; target: string }): Promise<string[]> {
  const key = `${pair.source}>${pair.target}`;
  if (!cache.has(key)) cache.set(key, g.Translator!.create({ sourceLanguage: pair.source, targetLanguage: pair.target }));
  try {
    const t = await cache.get(key)!;
    return await Promise.all(texts.map((s) => (s.trim() ? t.translate(s) : s)));
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

export function languageName(code: string) {
  try {
    return new Intl.DisplayNames([navigator.language], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
