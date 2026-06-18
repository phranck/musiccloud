import type { NavItem } from "@musiccloud/shared";

import { PageHeader } from "@/components/layout/PageHeader";
import { LocaleProvider } from "@/i18n/context";
import type { Locale } from "@/i18n/locales";

interface PageHeaderIslandProps {
  navItems?: NavItem[];
  /** Server-resolved locale, so SSR and client hydration agree (no mismatch). */
  initialLocale?: Locale;
}

const EMPTY_NAV_ITEMS: NavItem[] = [];

/**
 * Standalone React island for SSR Astro pages (e.g. share page).
 * Wraps PageHeader in its own LocaleProvider since no global provider exists.
 */
export function PageHeaderIsland({ navItems = EMPTY_NAV_ITEMS, initialLocale }: PageHeaderIslandProps) {
  return (
    <LocaleProvider initialLocale={initialLocale}>
      <PageHeader navItems={navItems} />
    </LocaleProvider>
  );
}
