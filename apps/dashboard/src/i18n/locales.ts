export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_STORAGE_KEY = "mc-dashboard:locale";

export const LOCALE_META: Record<Locale, { flag: string; label: string }> = {
  en: { flag: "🇬🇧", label: "English" },
  de: { flag: "🇩🇪", label: "Deutsch" },
};

export function detectLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
  if (stored && LOCALES.includes(stored)) return stored;
  const lang = navigator.language.slice(0, 2).toLowerCase();
  return LOCALES.includes(lang as Locale) ? (lang as Locale) : "en";
}
