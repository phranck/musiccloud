import type { Locale } from "./locales";

type Translations = Record<string, string>;

const cache = new Map<Locale, Translations>();
const loaders: Record<Locale, () => Promise<{ default: Translations }>> = {
  de: () => import("./translations/de.json"),
  en: () => import("./translations/en.json"),
};

export async function loadTranslations(locale: Locale): Promise<Translations> {
  if (cache.has(locale)) return cache.get(locale)!;
  try {
    const mod = await loaders[locale]();
    cache.set(locale, mod.default as Translations);
    return mod.default as Translations;
  } catch {
    // Fallback to English
    const mod = await import("./translations/en.json");
    return mod.default as Translations;
  }
}

export function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string>): string => {
    const template = translations[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  };
}
