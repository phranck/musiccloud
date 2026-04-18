import type { NavItem } from "@musiccloud/shared";

import { fetchNavigation } from "@/api/client";

/**
 * SSR helper: load both header and footer navigation in one round-trip.
 * Returns empty arrays on failure so consumers never need to null-check.
 */
export async function loadNav(): Promise<{ header: NavItem[]; footer: NavItem[] }> {
  const [header, footer] = await Promise.all([fetchNavigation("header"), fetchNavigation("footer")]);
  return { header, footer };
}
