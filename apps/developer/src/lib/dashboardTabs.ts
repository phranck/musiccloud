/**
 * @file Dashboard sidebar-tab domain namespace + nav-item config.
 *
 * The dashboard shell highlights one sidebar entry as active. Modelling the tab
 * key as a PascalCase `as const` namespace (per the project domain-literals
 * policy) keeps the `active` prop free of inline discriminant literals and gives
 * the layout a typed value to compare against. The nav-item list is the single
 * source of truth for the sidebar so the labels and "coming soon" state live in
 * one place rather than being hand-written in the template.
 */

/**
 * Sidebar tab keys for the developer dashboard.
 */
export const DashboardTab = {
  /** Account overview. */
  Overview: "Overview",
  /** Projects: the plan, the registrations and the quota they share. */
  Projects: "Projects",
  /** Request API access + review-status history. */
  ApiAccess: "ApiAccess",
  /** Quotas + key usage at a glance. */
  Usage: "Usage",
  /** Account contact details the operator needs in order to reach a person. */
  Profile: "Profile",
} as const;

/** A {@link DashboardTab} member value. */
export type DashboardTabValue = (typeof DashboardTab)[keyof typeof DashboardTab];

/**
 * A single sidebar navigation entry.
 *
 * @property tab - The {@link DashboardTab} key this entry represents.
 * @property label - Human-readable sidebar label.
 * @property href - Target path when the entry is live; `null` for placeholders.
 * @property comingSoon - When `true`, the entry renders dimmed and unclickable
 *   with a "Soon" marker.
 */
export interface DashboardNavItem {
  tab: DashboardTabValue;
  label: string;
  href: string | null;
  comingSoon: boolean;
}

/** Ordered sidebar navigation for the dashboard shell. */
export const DASHBOARD_NAV: readonly DashboardNavItem[] = [
  { tab: DashboardTab.Overview, label: "Overview", href: "/dashboard", comingSoon: false },
  { tab: DashboardTab.Projects, label: "Projects", href: "/dashboard/projects", comingSoon: false },
  { tab: DashboardTab.ApiAccess, label: "API access", href: "/dashboard/api-access", comingSoon: false },
  { tab: DashboardTab.Usage, label: "Usage", href: "/dashboard/usage", comingSoon: false },
  { tab: DashboardTab.Profile, label: "Profile", href: "/dashboard/profile", comingSoon: false },
];
