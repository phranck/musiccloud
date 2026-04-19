import type { NavItem } from "@musiccloud/shared";

import { PageHeader } from "@/components/layout/PageHeader";
import { LocaleProvider } from "@/i18n/context";

interface PageHeaderIslandProps {
  navItems?: NavItem[];
}

const EMPTY_NAV_ITEMS: NavItem[] = [];

/**
 * Standalone React island for SSR Astro pages (e.g. share page).
 * Wraps PageHeader in its own LocaleProvider since no global provider exists.
 */
export function PageHeaderIsland({ navItems = EMPTY_NAV_ITEMS }: PageHeaderIslandProps) {
  return (
    <LocaleProvider>
      <PageHeader navItems={navItems} />
    </LocaleProvider>
  );
}
