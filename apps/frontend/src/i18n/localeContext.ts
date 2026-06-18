import { createContext, use } from "react";
import type { Locale } from "./locales";

/**
 * Shape of the locale context: the active locale, a setter, and the bound
 * translation function. Provided by `LocaleProvider` (in `context.tsx`) and
 * consumed via {@link useLocale} / {@link useT}.
 */
export interface LocaleContextValue {
  /** The currently active locale. */
  locale: Locale;
  /** Switches the active locale (persists + broadcasts to sibling islands). */
  setLocale: (l: Locale) => void;
  /** Translates a key against the active locale, interpolating `{var}` placeholders. */
  t: (key: string, vars?: Record<string, string>) => string;
}

/**
 * Locale context, `null` until a `LocaleProvider` mounts above the consumer.
 *
 * Lives in its own module — split from the `LocaleProvider` component — so
 * React Fast Refresh can hot-swap the provider during dev HMR without
 * recreating the context object. A file that mixes a component export with the
 * context/hook exports is not a valid Fast Refresh boundary: Vite invalidates
 * it on every edit, which transiently leaves a stale provider holding the old
 * context while `useLocale` reads the new one ("useLocale must be used within
 * LocaleProvider"). Keeping the context here avoids that. Production is
 * unaffected either way (no Fast Refresh); this is purely a dev-DX fix.
 */
export const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Reads the locale context. Throws when no `LocaleProvider` is an ancestor —
 * every island wraps its own provider, so a throw here flags a missing
 * wrapper rather than an expected null.
 *
 * @returns The active locale, its setter, and the translation function.
 */
export function useLocale(): LocaleContextValue {
  const ctx = use(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

/**
 * Convenience hook for the translation function alone — the common case where
 * a component needs `t` but not the locale or its setter.
 *
 * @returns The translation function bound to the active locale.
 */
export function useT(): LocaleContextValue["t"] {
  return useLocale().t;
}
