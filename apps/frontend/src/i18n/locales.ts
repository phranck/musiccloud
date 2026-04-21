export { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from "@musiccloud/shared";

import { LOCALES, type Locale } from "@musiccloud/shared";

export const LOCALE_META: Record<Locale, { flag: string; label: string }> = {
  en: { flag: "🇬🇧", label: "English" },
  de: { flag: "🇩🇪", label: "Deutsch" },
};

export const LOCALE_STORAGE_KEY = "mc:locale";

export function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const saved = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
  if (saved && (LOCALES as readonly string[]).includes(saved)) return saved;
  const browser = navigator.language.split("-")[0] as Locale;
  if ((LOCALES as readonly string[]).includes(browser)) return browser;
  return "en";
}

export function getLocaleFromCookie(value: string | undefined): Locale {
  if (value && (LOCALES as readonly string[]).includes(value as Locale)) return value as Locale;
  return "en";
}
