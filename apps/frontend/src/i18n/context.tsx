import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import csTranslations from "./translations/cs.json";
import deTranslations from "./translations/de.json";
import enTranslations from "./translations/en.json";
import esTranslations from "./translations/es.json";
import frTranslations from "./translations/fr.json";
import itTranslations from "./translations/it.json";
import nlTranslations from "./translations/nl.json";
import ptTranslations from "./translations/pt.json";
import trTranslations from "./translations/tr.json";
import { detectLocale, LOCALE_STORAGE_KEY, type Locale } from "./locales";

type Translations = Record<string, string>;

// Translations are bundled eagerly so they're available at first render —
// a lazy `import('./translations/${locale}.json')` would briefly show raw
// keys (e.g. "hero.placeholder") until the module resolves.
const TRANSLATIONS_BY_LOCALE: Record<Locale, Translations> = {
  cs: csTranslations,
  de: deTranslations,
  en: enTranslations,
  es: esTranslations,
  fr: frTranslations,
  it: itTranslations,
  nl: nlTranslations,
  pt: ptTranslations,
  tr: trTranslations,
};

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const LOCALE_EVENT = "musiccloud:locale-change";

function interpolate(template: string, vars?: Record<string, string>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

// useSyncExternalStore: detect locale synchronously on first render, no flash.
// Server snapshot falls back to "en"; client detects from localStorage + navigator.
const detectedLocale = () => detectLocale();
const serverLocale = () => "en" as Locale;
const noopSubscribe = () => () => {};

export function LocaleProvider({
  children,
  initialLocale: initialLocaleProp,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const detected = useSyncExternalStore(noopSubscribe, detectedLocale, serverLocale);
  const [locale, setLocaleState] = useState<Locale>(initialLocaleProp ?? detected);
  const translations = TRANSLATIONS_BY_LOCALE[locale] ?? TRANSLATIONS_BY_LOCALE.en;

  // Persist detected locale to cookie + localStorage on first mount
  // so SSR pages can read it even without explicit language switch
  useEffect(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.cookie = `${LOCALE_STORAGE_KEY}=${locale}; max-age=31536000; path=/; SameSite=Lax`;
  }, [locale]);

  // Sync with other islands on the same page via custom window event
  useEffect(() => {
    const handler = (e: Event) => {
      setLocaleState((e as CustomEvent<Locale>).detail);
    };
    window.addEventListener(LOCALE_EVENT, handler);
    return () => window.removeEventListener(LOCALE_EVENT, handler);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(LOCALE_STORAGE_KEY, l);
    // Also set cookie so SSR pages (share page) can read it
    document.cookie = `${LOCALE_STORAGE_KEY}=${l}; max-age=31536000; path=/; SameSite=Lax`;
    // Notify other LocaleProvider instances on the same page
    window.dispatchEvent(new CustomEvent(LOCALE_EVENT, { detail: l }));
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string>) => interpolate(translations[key] ?? key, vars),
    [translations],
  );

  return <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

export function useT() {
  return useLocale().t;
}
