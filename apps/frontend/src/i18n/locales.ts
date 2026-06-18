export { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from "@musiccloud/shared";

import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from "@musiccloud/shared";

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

/**
 * Picks the first supported {@link Locale} from an `Accept-Language` header, or
 * {@link DEFAULT_LOCALE} when none match. Compares only the primary subtag
 * (e.g. `de` from `de-DE`), mirroring the client's `navigator.language` check in
 * {@link detectLocale}.
 *
 * @param header Raw `Accept-Language` header value (may be null/undefined).
 */
function parseAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  for (const part of header.split(",")) {
    const tag = part.trim().split(";")[0]?.split("-")[0]?.toLowerCase();
    if (tag && (LOCALES as readonly string[]).includes(tag)) return tag as Locale;
  }
  return DEFAULT_LOCALE;
}

/**
 * Resolves the request locale the same way the client {@link detectLocale} does —
 * persisted cookie first, then the browser's `Accept-Language` preference, then
 * {@link DEFAULT_LOCALE} — so the server SSRs the locale the client will hydrate
 * with and no hydration mismatch occurs.
 *
 * @param cookieValue The `mc:locale` cookie value (may be undefined).
 * @param acceptLanguage The request's `Accept-Language` header (may be null/undefined).
 */
export function getRequestLocale(cookieValue: string | undefined, acceptLanguage: string | null | undefined): Locale {
  if (cookieValue && isLocale(cookieValue)) return cookieValue;
  return parseAcceptLanguage(acceptLanguage);
}
