import { dashboardCopy } from "@/copy/dashboard";

/**
 * The mark beside a project's limits when an operator has overridden its plan.
 *
 * The project list, the API key list and the application page show it, so it
 * lives once. It keeps its own case and tracking because one of those places
 * is a section header that sets both.
 *
 * @returns The "Custom" badge.
 */
export function CustomLimitBadge() {
  return (
    <span className="rounded bg-[var(--ds-badge-review-bg)] px-1.5 py-0.5 text-xs font-semibold text-[var(--ds-badge-review-text)] normal-case tracking-normal">
      {dashboardCopy.developer.clientCustomBadge}
    </span>
  );
}
