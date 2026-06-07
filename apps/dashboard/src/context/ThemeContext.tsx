import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";

export const ThemeName = {
  Light: "light",
  Dark: "dark",
  System: "system",
} as const;

type Theme = (typeof ThemeName)[keyof typeof ThemeName];

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  effectiveTheme: typeof ThemeName.Light | typeof ThemeName.Dark;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "dashboard-theme";

function getSystemTheme(): typeof ThemeName.Light | typeof ThemeName.Dark {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? ThemeName.Dark : ThemeName.Light;
}

function loadTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === ThemeName.Light || saved === ThemeName.Dark || saved === ThemeName.System) return saved;
  return ThemeName.System;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(loadTheme);
  const [systemTheme, setSystemTheme] = useState<typeof ThemeName.Light | typeof ThemeName.Dark>(getSystemTheme);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? ThemeName.Dark : ThemeName.Light);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const effectiveTheme: typeof ThemeName.Light | typeof ThemeName.Dark =
    theme === ThemeName.System ? systemTheme : theme;

  useEffect(() => {
    const root = document.documentElement;
    if (effectiveTheme === ThemeName.Dark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [effectiveTheme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
  }, []);

  const value = useMemo(() => ({ theme, setTheme, effectiveTheme }), [theme, setTheme, effectiveTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = use(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
