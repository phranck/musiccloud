import type { ReactNode } from "react";
import { Children, createContext, isValidElement, use, useMemo } from "react";

/* ---- Context for collapsible state -------------------------------- */
interface DashboardSectionContextValue {
  expanded: boolean;
  hasFooter: boolean;
}

const DashboardSectionContext = createContext<DashboardSectionContextValue>({ expanded: true, hasFooter: false });

/* ---- Props -------------------------------------------------------- */

export interface DashboardSectionProps {
  children: ReactNode;
  /** When set, the section becomes collapsible. Body is hidden when false. */
  expanded?: boolean;
  className?: string;
}

export interface DashboardSectionHeaderProps {
  icon: ReactNode;
  title: ReactNode;
  /** Optional right-aligned content (e.g. a toggle switch). */
  addOn?: ReactNode;
  renderAddOn?: () => ReactNode;
  className?: string;
}

export interface DashboardSectionFooterProps {
  children: ReactNode;
  className?: string;
}

export interface DashboardSectionBodyProps {
  children: ReactNode;
  className?: string;
  flush?: boolean;
}

export interface DashboardSectionItemProps {
  icon: ReactNode;
  label: string;
  badge?: number;
  active?: boolean;
  addOn?: ReactNode;
  className?: string;
  onClick?: () => void;
}

/* ---- DashboardSection (root container) ---------------------------- */

export function DashboardSection({ children, expanded = true, className = "" }: DashboardSectionProps) {
  const hasFooter = Children.toArray(children).some(
    (child) => isValidElement(child) && child.type === DashboardSectionFooter,
  );
  const contextValue = useMemo(() => ({ expanded, hasFooter }), [expanded, hasFooter]);
  return (
    <DashboardSectionContext.Provider value={contextValue}>
      <div className={`bg-[var(--ds-section-body-bg)] rounded-xl shadow-sm ${className}`}>{children}</div>
    </DashboardSectionContext.Provider>
  );
}

/* ---- DashboardSection.Header -------------------------------------- */

function DashboardSectionHeader({ icon, title, addOn, renderAddOn, className = "" }: DashboardSectionHeaderProps) {
  const { expanded } = use(DashboardSectionContext);
  const addOnContent = renderAddOn ? renderAddOn() : addOn;

  return (
    <div
      className={`flex items-center gap-2 px-4 py-1.5 bg-[var(--ds-section-header-bg)] transition-[border-radius] duration-200 ${
        expanded ? "rounded-t-xl" : "rounded-xl"
      } ${className}`}
    >
      <span className="shrink-0 text-[var(--ds-text-muted)]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-medium font-serif text-[var(--ds-text)]">{title}</span>
      </span>
      {addOnContent && <span className="ml-auto flex shrink-0 items-center gap-2">{addOnContent}</span>}
    </div>
  );
}

/* ---- DashboardSection.Body ---------------------------------------- */

function DashboardSectionBody({ children, className = "", flush = false }: DashboardSectionBodyProps) {
  const { expanded, hasFooter } = use(DashboardSectionContext);

  if (!expanded) return null;

  const baseClass = flush
    ? `flex flex-col overflow-hidden ${hasFooter ? "" : "rounded-b-xl"}`
    : "flex flex-col gap-3 p-3";
  return <div className={`${baseClass} ${className}`}>{children}</div>;
}

/* ---- DashboardSection.Footer -------------------------------------- */

/**
 * Card footer bar closing a {@link DashboardSection}. Action buttons live
 * here, right-aligned — a project-wide UI rule, so `justify-end` is the
 * built-in default rather than something each call site re-declares.
 */
function DashboardSectionFooter({ children, className = "" }: DashboardSectionFooterProps) {
  return (
    <div
      className={`flex items-center justify-end gap-2 px-4 py-2.5 bg-[var(--ds-section-header-bg)] rounded-b-xl ${className}`}
    >
      {children}
    </div>
  );
}

/* ---- DashboardSection.Item ---------------------------------------- */

function DashboardSectionItem({
  icon,
  label,
  badge,
  active,
  addOn,
  className = "",
  onClick,
}: DashboardSectionItemProps) {
  // text-left neutralises the browser's centered text-align default on the
  // <button> variant, so clickable items align like the static div variant.
  const itemClass = `flex items-center gap-3 py-2 px-3 rounded-control text-left text-sm font-medium ${
    active
      ? "bg-[var(--ds-nav-active-bg)] text-[var(--ds-nav-active-text)]"
      : "text-[var(--ds-nav-text)] hover:bg-[var(--ds-nav-hover-bg)] hover:text-[var(--ds-nav-hover-text)]"
  } ${className}`;

  const content = (
    <>
      <span className="shrink-0 opacity-70">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <>
          <span className="ml-auto h-5 min-w-5 flex items-center justify-center px-1.5 rounded-full text-xs font-medium bg-[var(--ds-surface-hover)] text-[var(--ds-text-muted)] shrink-0">
            {badge}
          </span>
          <span className="w-3.5 shrink-0" />
        </>
      )}
      {addOn}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={itemClass} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={itemClass}>{content}</div>;
}

/* ---- Sub-component assignment ------------------------------------- */

DashboardSection.Header = DashboardSectionHeader;
DashboardSection.Body = DashboardSectionBody;
DashboardSection.Footer = DashboardSectionFooter;
DashboardSection.Item = DashboardSectionItem;
