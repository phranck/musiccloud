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
 *
 * Only {@link DashboardTab.Overview} is live today; the remaining tabs are
 * placeholders for later sub-projects (API access, keys, usage).
 */
export const DashboardTab = {
  /** Account overview — the only implemented dashboard panel. */
  Overview: "Overview",
  /** Request/manage API access (not yet implemented). */
  ApiAccess: "ApiAccess",
  /** API key management (not yet implemented). */
  ApiKeys: "ApiKeys",
  /** Usage + quota reporting (not yet implemented). */
  Usage: "Usage",
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

/**
 * Ordered sidebar navigation for the dashboard shell. Overview links to
 * `/dashboard`; the rest are disabled placeholders until their sub-projects ship.
 */
export const DASHBOARD_NAV: readonly DashboardNavItem[] = [
  { tab: DashboardTab.Overview, label: "Overview", href: "/dashboard", comingSoon: false },
  { tab: DashboardTab.ApiAccess, label: "API access", href: null, comingSoon: true },
  { tab: DashboardTab.ApiKeys, label: "API keys", href: null, comingSoon: true },
  { tab: DashboardTab.Usage, label: "Usage", href: null, comingSoon: true },
];
