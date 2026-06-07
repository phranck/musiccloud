import { CaretDownIcon } from "@phosphor-icons/react";
import { useMatch } from "react-router";

function SidebarBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="h-5 min-w-5 flex items-center justify-center px-1.5 rounded-full text-xs font-medium bg-[var(--ds-surface-hover)] text-[var(--ds-text-muted)] shrink-0">
      {count}
    </span>
  );
}

interface CollapsibleSidebarGroupProps {
  routeMatch: string;
  storageKey: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  children: React.ReactNode;
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  noRail?: boolean;
  /** Optional trailing element rendered next to the header (e.g. quick-action button). Sits outside the toggle button to avoid nested-button HTML. */
  trailingAction?: React.ReactNode;
}

export function CollapsibleSidebarGroup({
  routeMatch,
  storageKey,
  icon,
  label,
  badge,
  children,
  open,
  onOpenChange,
  noRail = false,
  trailingAction,
}: CollapsibleSidebarGroupProps) {
  const isGroupActive = !!useMatch(routeMatch);
  const actualOpen = isGroupActive || open;

  function toggleOpen() {
    const next = !actualOpen;
    localStorage.setItem(storageKey, String(next));
    onOpenChange?.(next);
  }

  return (
    <div className="group">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={actualOpen}
          className="flex flex-1 items-center gap-3 px-3 py-2 rounded-control text-sm font-medium text-left select-none text-[var(--ds-nav-text)] hover:bg-[var(--ds-nav-hover-bg)] hover:text-[var(--ds-nav-hover-text)] transition-colors"
        >
          <span className="shrink-0 opacity-70">{icon}</span>
          <span className="flex-1">{label}</span>
          {badge !== undefined && <SidebarBadge count={badge} />}
          <CaretDownIcon
            weight="duotone"
            className={`w-3.5 h-3.5 opacity-50 transition-transform duration-200 ease-out ${actualOpen ? "rotate-180" : ""}`}
          />
        </button>
        {trailingAction && <div className="flex items-center pl-1">{trailingAction}</div>}
      </div>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          actualOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-70"
        }`}
      >
        <div className="overflow-hidden">
          <div className={`mt-0.5 space-y-0.5 ${noRail ? "" : "ml-3 pl-3 border-l border-[var(--ds-border)]"}`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
