import { CaretDownIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
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
  globalOpenState?: boolean | null;
  globalOpenVersion?: number;
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
  globalOpenState = null,
  globalOpenVersion = 0,
  onOpenChange,
  noRail = false,
  trailingAction,
}: CollapsibleSidebarGroupProps) {
  const isGroupActive = !!useMatch(routeMatch);
  const [localOpen, setLocalOpen] = useState(() => {
    const stored = localStorage.getItem(storageKey) === "true";
    return isGroupActive || stored;
  });

  useEffect(() => {
    if (!isGroupActive) return;
    setLocalOpen(true);
  }, [isGroupActive]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: globalOpenVersion is an intentional trigger to re-run the effect even when globalOpenState has not changed (e.g. repeated "collapse all" clicks).
  useEffect(() => {
    if (globalOpenState === null) return;
    setLocalOpen(globalOpenState);
    localStorage.setItem(storageKey, String(globalOpenState));
  }, [globalOpenState, globalOpenVersion, storageKey]);

  useEffect(() => {
    onOpenChange?.(localOpen);
  }, [localOpen, onOpenChange]);

  function toggleOpen() {
    setLocalOpen((current) => {
      const next = !current;
      localStorage.setItem(storageKey, String(next));
      return next;
    });
  }

  return (
    <div className="group">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={localOpen}
          className="flex flex-1 items-center gap-3 px-3 py-2 rounded-control text-sm font-medium text-left select-none text-[var(--ds-nav-text)] hover:bg-[var(--ds-nav-hover-bg)] hover:text-[var(--ds-nav-hover-text)] transition-colors"
        >
          <span className="shrink-0 opacity-70">{icon}</span>
          <span className="flex-1">{label}</span>
          {badge !== undefined && <SidebarBadge count={badge} />}
          <CaretDownIcon
            weight="duotone"
            className={`w-3.5 h-3.5 opacity-50 transition-transform duration-200 ease-out ${localOpen ? "rotate-180" : ""}`}
          />
        </button>
        {trailingAction && <div className="flex items-center pl-1">{trailingAction}</div>}
      </div>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          localOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-70"
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

export function sidebarGroupItemClass({ isActive }: { isActive: boolean }): string {
  return `flex items-center gap-2 px-3 py-1.5 rounded-control text-sm font-medium ${
    isActive
      ? "bg-[var(--ds-nav-active-bg)] text-[var(--ds-nav-active-text)]"
      : "text-[var(--ds-nav-text)] hover:bg-[var(--ds-nav-hover-bg)] hover:text-[var(--ds-nav-hover-text)]"
  }`;
}
