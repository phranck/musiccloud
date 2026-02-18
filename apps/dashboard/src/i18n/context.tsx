import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { detectLocale, LOCALE_STORAGE_KEY, type Locale } from "./locales";

type Translations = Record<string, string>;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function interpolate(template: string, vars?: Record<string, string>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);
  const [translations, setTranslations] = useState<Translations>({});

  useEffect(() => {
    import(`./translations/${locale}.json`)
      .then((mod) => setTranslations(mod.default as Translations))
      .catch(() => {
        import("./translations/en.json").then((mod) =>
          setTranslations(mod.default as Translations),
        );
      });
  }, [locale]);

  function setLocale(l: Locale) {
    localStorage.setItem(LOCALE_STORAGE_KEY, l);
    setLocaleState(l);
  }

  function t(key: string, vars?: Record<string, string>): string {
    return interpolate(translations[key] ?? key, vars);
  }

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
