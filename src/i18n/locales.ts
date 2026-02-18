export const LOCALES = ["en", "de", "fr", "it", "es", "pt", "nl", "tr"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_META: Record<Locale, { flag: string; label: string }> = {
  en: { flag: "🇬🇧", label: "English" },
  de: { flag: "🇩🇪", label: "Deutsch" },
  fr: { flag: "🇫🇷", label: "Français" },
  it: { flag: "🇮🇹", label: "Italiano" },
  es: { flag: "🇪🇸", label: "Español" },
  pt: { flag: "🇵🇹", label: "Português" },
  nl: { flag: "🇳🇱", label: "Nederlands" },
  tr: { flag: "🇹🇷", label: "Türkçe" },
};

export const LOCALE_STORAGE_KEY = "mc:locale";

export function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const saved = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
  if (saved && LOCALES.includes(saved)) return saved;
  const browser = navigator.language.split("-")[0] as Locale;
  if (LOCALES.includes(browser)) return browser;
  return "en";
}

export function getLocaleFromCookie(value: string | undefined): Locale {
  if (value && LOCALES.includes(value as Locale)) return value as Locale;
  return "en";
}
