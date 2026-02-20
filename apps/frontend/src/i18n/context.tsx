import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { LOCALE_STORAGE_KEY, detectLocale, type Locale } from "./locales";

type Translations = Record<string, string>;

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

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const initialLocale = useSyncExternalStore(noopSubscribe, detectedLocale, serverLocale);
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [translations, setTranslations] = useState<Translations>({});

  // Sync with other islands on the same page via custom window event
  useEffect(() => {
    const handler = (e: Event) => {
      setLocaleState((e as CustomEvent<Locale>).detail);
    };
    window.addEventListener(LOCALE_EVENT, handler);
    return () => window.removeEventListener(LOCALE_EVENT, handler);
  }, []);

  // Load translation file whenever locale changes
  useEffect(() => {
    import(`./translations/${locale}.json`)
      .then((mod) => setTranslations(mod.default as Translations))
      .catch(() =>
        import("./translations/en.json").then((mod) =>
          setTranslations(mod.default as Translations)
        )
      );
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(LOCALE_STORAGE_KEY, l);
    // Also set cookie so SSR pages (share page) can read it
    document.cookie = `${LOCALE_STORAGE_KEY}=${l}; max-age=31536000; path=/; SameSite=Lax`;
    // Notify other LocaleProvider instances on the same page
    window.dispatchEvent(new CustomEvent(LOCALE_EVENT, { detail: l }));
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string>) =>
      interpolate(translations[key] ?? key, vars),
    [translations]
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

export function useT() {
  return useLocale().t;
}
