import type { NavItem } from "@musiccloud/shared";

import { AppFooter } from "@/components/layout/AppFooter";
import { LocaleProvider } from "@/i18n/context";
import type { Locale } from "@/i18n/locales";

interface AppFooterIslandProps {
  navItems?: NavItem[];
  /** Server-resolved locale, so SSR and client hydration agree (no mismatch). */
  initialLocale?: Locale;
}

const EMPTY_NAV_ITEMS: NavItem[] = [];

/**
 * Standalone React island for SSR Astro pages (e.g. share page, 404).
 * Wraps AppFooter in its own LocaleProvider since no global provider exists.
 */
export function AppFooterIsland({ navItems = EMPTY_NAV_ITEMS, initialLocale }: AppFooterIslandProps) {
  return (
    <LocaleProvider initialLocale={initialLocale}>
      <AppFooter navItems={navItems} />
    </LocaleProvider>
  );
}
