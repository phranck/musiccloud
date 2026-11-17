import { CaretDownIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Children, createContext, isValidElement, use, useMemo } from "react";

/* ---- Context for collapsible state -------------------------------- */
interface DashboardSectionContextValue {
  expanded: boolean;
  hasFooter: boolean;
  /**
   * Flips the section open or closed through the header's own toggle, or
   * `null` while the section has no toggle, which is the default.
   */
  toggleExpanded: (() => void) | null;
  /** The accessible name of the header's toggle, empty while there is none. */
  collapseButtonLabel: string;
}

const DashboardSectionContext = createContext<DashboardSectionContextValue>({
  expanded: true,
  hasFooter: false,
  toggleExpanded: null,
  collapseButtonLabel: "",
});

/* ---- Props -------------------------------------------------------- */

export interface DashboardSectionProps {
  children: ReactNode;
  /** When set, the section becomes collapsible. Body is hidden when false. */
  expanded?: boolean;
  /**
   * Receives the state the header's toggle asks for. Given together with
   * `expanded`, the header shows a caret button that opens and closes the
   * section; left out, the section has no toggle of its own, the default.
   */
  onExpandedChange?: (expanded: boolean) => void;
  /** The accessible name of that toggle, such as the section's title. Read only with `onExpandedChange`. */
  collapseButtonLabel?: string;
  className?: string;
}

export interface DashboardSectionHeaderProps {
  icon: ReactNode;
  title: ReactNode;
  /**
   * One line under the title that says what the card is for, in the muted small
   * type lmaa.space's section header uses. Absent by default, and then the
   * header shows the title alone.
   */
  subtitle?: string;
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

export function DashboardSection({
  children,
  expanded = true,
  onExpandedChange,
  collapseButtonLabel = "",
  className = "",
}: DashboardSectionProps) {
  const hasFooter = Children.toArray(children).some(
    (child) => isValidElement(child) && child.type === DashboardSectionFooter,
  );
  const contextValue = useMemo(
    () => ({
      expanded,
      hasFooter,
      toggleExpanded: onExpandedChange ? () => onExpandedChange(!expanded) : null,
      collapseButtonLabel,
    }),
    [expanded, hasFooter, onExpandedChange, collapseButtonLabel],
  );
  return (
    <DashboardSectionContext.Provider value={contextValue}>
      <div className={`bg-[var(--ds-section-body-bg)] rounded-xl shadow-sm ${className}`}>{children}</div>
    </DashboardSectionContext.Provider>
  );
}

/* ---- DashboardSection.Header -------------------------------------- */

function DashboardSectionHeader({
  icon,
  title,
  subtitle,
  addOn,
  renderAddOn,
  className = "",
}: DashboardSectionHeaderProps) {
  const { expanded, toggleExpanded, collapseButtonLabel } = use(DashboardSectionContext);
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
        {subtitle && <span className="block truncate text-xs font-sans text-[var(--ds-text-muted)]">{subtitle}</span>}
      </span>
      {(addOnContent || toggleExpanded) && (
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {addOnContent}
          {toggleExpanded && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={collapseButtonLabel}
              onClick={toggleExpanded}
              className="flex size-8 items-center justify-center rounded-control text-[var(--ds-text-muted)] hover:bg-[var(--ds-nav-hover-bg)] hover:text-[var(--ds-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-focus-ring)]"
            >
              <CaretDownIcon
                weight="duotone"
                className={`size-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </span>
      )}
    </div>
  );
}

/* ---- DashboardSection.Body ---------------------------------------- */

/** Props of {@link CollapseRegion}. */
interface CollapseRegionProps {
  /** Whether the region stands open at its content's full height, or closed at none. */
  expanded: boolean;
  /** What opens and closes. */
  children: ReactNode;
}

/**
 * Wraps the body of a section with its own toggle, so it grows and shrinks
 * instead of jumping, as lmaa.space's collapsible section does.
 *
 * The browser animates the height through one property: a grid whose single
 * row goes from `0fr` to `1fr` grows to the height its content needs, and
 * everything below is carried by ordinary layout. Nothing measures and nothing
 * runs per frame. The duration and the easing are the dashboard's motion tokens
 * `--ds-duration-base` and `--ds-ease`; under `prefers-reduced-motion` the
 * duration shortens to `--ds-duration-fast` rather than vanishing.
 *
 * The content stays in the document while closed, because an element that has
 * already left it cannot be animated out, and it is marked `inert`, so what
 * cannot be seen cannot be reached by keyboard either. The region clips its
 * content at every height, so a popover inside it must not rely on reaching
 * past the section's edge.
 *
 * @param props - See {@link CollapseRegionProps}.
 * @returns The region.
 */
function CollapseRegion({ expanded, children }: CollapseRegionProps) {
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-[var(--ds-duration-base)] ease-[var(--ds-ease)] motion-reduce:duration-[var(--ds-duration-fast)] ${
        expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      }`}
    >
      <div className="min-h-0 overflow-hidden" inert={!expanded}>
        {children}
      </div>
    </div>
  );
}

/**
 * The content of a {@link DashboardSection}.
 *
 * In a section with its own toggle (`onExpandedChange` given), the body opens
 * and closes through {@link CollapseRegion}. In a section whose visibility a
 * caller controls through `expanded` alone, the body leaves the document while
 * closed, as it always has there, because those callers render their own
 * controls into it and rely on that.
 *
 * @param props - See {@link DashboardSectionBodyProps}.
 * @returns The body, or `null` while a section without its own toggle is closed.
 */
function DashboardSectionBody({ children, className = "", flush = false }: DashboardSectionBodyProps) {
  const { expanded, hasFooter, toggleExpanded } = use(DashboardSectionContext);

  const baseClass = flush
    ? `flex flex-col overflow-hidden ${hasFooter ? "" : "rounded-b-xl"}`
    : "flex flex-col gap-3 p-3";
  const body = <div className={`${baseClass} ${className}`}>{children}</div>;

  if (toggleExpanded) return <CollapseRegion expanded={expanded}>{body}</CollapseRegion>;
  if (!expanded) return null;
  return body;
}

/* ---- DashboardSection.Footer -------------------------------------- */

/**
 * Card footer bar closing a {@link DashboardSection}. Action buttons live
 * here, right-aligned. That is a project-wide UI rule, so `justify-end` is the
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
