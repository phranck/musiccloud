import type { NavItem } from "@musiccloud/shared";

import { AppFooter } from "@/components/layout/AppFooter";

interface AppFooterIslandProps {
  navItems?: NavItem[];
}

const EMPTY_NAV_ITEMS: NavItem[] = [];

/**
 * Standalone React island for SSR Astro pages (e.g. share page, 404).
 */
export function AppFooterIsland({ navItems = EMPTY_NAV_ITEMS }: AppFooterIslandProps) {
  return <AppFooter navItems={navItems} />;
}
