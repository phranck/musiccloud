import type { NavItem } from "@musiccloud/shared";

import { AppFooter } from "@/components/layout/AppFooter";
import { LocaleProvider } from "@/i18n/context";

interface AppFooterIslandProps {
  navItems?: NavItem[];
}

const EMPTY_NAV_ITEMS: NavItem[] = [];

/**
 * Standalone React island for SSR Astro pages (e.g. share page, 404).
 * Wraps AppFooter in its own LocaleProvider since no global provider exists.
 */
export function AppFooterIsland({ navItems = EMPTY_NAV_ITEMS }: AppFooterIslandProps) {
  return (
    <LocaleProvider>
      <AppFooter navItems={navItems} />
    </LocaleProvider>
  );
}
