import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";
import { detectLocale, LOCALE_STORAGE_KEY, type Locale } from "./locales";
import deTranslations from "./translations/de.json";
import enTranslations from "./translations/en.json";

type Translations = Record<string, string>;

// Translations are bundled eagerly so they're available at first render —
// a lazy `import('./translations/${locale}.json')` would briefly show raw
// keys (e.g. "hero.placeholder") until the module resolves.
const TRANSLATIONS_BY_LOCALE: Record<Locale, Translations> = {
  de: deTranslations,
  en: enTranslations,
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

export function LocaleProvider({
  children,
  initialLocale: initialLocaleProp,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocaleProp ?? detectLocale());
  const translations = TRANSLATIONS_BY_LOCALE[locale] ?? TRANSLATIONS_BY_LOCALE.en;

  useEffect(() => {
    if (initialLocaleProp) return;
    // Persist so SSR pages can read it without an explicit switch
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.cookie = `${LOCALE_STORAGE_KEY}=${locale}; max-age=31536000; path=/; SameSite=Lax`;
  }, [initialLocaleProp, locale]);

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
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = use(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

export function useT() {
  return useLocale().t;
}
