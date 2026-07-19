import type { NavItem } from "@musiccloud/shared";

import { PageHeader } from "@/components/layout/PageHeader";

interface PageHeaderIslandProps {
  navItems?: NavItem[];
}

const EMPTY_NAV_ITEMS: NavItem[] = [];

/**
 * Standalone React island for SSR Astro pages (e.g. share page).
 */
export function PageHeaderIsland({ navItems = EMPTY_NAV_ITEMS }: PageHeaderIslandProps) {
  return <PageHeader navItems={navItems} />;
}
