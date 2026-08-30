/**
 * @file The symbol each dashboard rail entry carries.
 *
 * The rail is the API reference's rail, and there every entry has an icon
 * before its label. Keeping the mapping beside the nav config rather than in
 * the template means one entry cannot pick up a different symbol in a second
 * place, exactly as `api-reference-section-icons.ts` does for the reference.
 */
import { DashboardTab, type DashboardTabValue } from "@/lib/dashboardTabs";
import { CategoryIcon, DataIcon, DiagramIcon, ProfileIcon } from "@/lib/icons";

/** One symbol per destination, in the rail and nowhere else so far. */
const DASHBOARD_NAV_ICONS = {
  [DashboardTab.Overview]: CategoryIcon,
  [DashboardTab.Projects]: DataIcon,
  [DashboardTab.Usage]: DiagramIcon,
  [DashboardTab.Profile]: ProfileIcon,
} as const;

/**
 * The icon for a rail entry.
 *
 * @param tab - The destination the entry leads to.
 * @returns Its Iconsax symbol.
 */
export function iconForDashboardTab(tab: DashboardTabValue) {
  return DASHBOARD_NAV_ICONS[tab];
}
