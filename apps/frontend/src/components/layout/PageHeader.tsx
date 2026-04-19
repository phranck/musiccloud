import type { NavItem } from "@musiccloud/shared";
import type { MouseEvent } from "react";

import { LanguageSwitcher } from "@/components/navigation/LanguageSwitcher";
import { InfoButton } from "@/components/ui/InfoButton";
import { OVERLAY_OPEN_EVENT, isOverlayActive } from "@/context/OverlayContext";

interface PageHeaderProps {
  /** Show the circular info button (landing page and result pages only) */
  showInfoButton?: boolean;
  onInfoClick?: () => void;
  /** Items from the admin nav editor (header). Empty array hides the inline list. */
  navItems?: NavItem[];
}

const EMPTY_NAV_ITEMS: NavItem[] = [];

function navHref(item: NavItem): string {
  return item.url ?? (item.pageSlug ? `/${item.pageSlug}` : "#");
}

function navLabel(item: NavItem): string {
  return item.label || item.pageTitle || item.url || "—";
}

function isOverlayModeItem(item: NavItem): boolean {
  return (
    item.pageSlug !== null &&
    item.pageDisplayMode !== null &&
    item.pageDisplayMode !== "fullscreen"
  );
}

function handleNavClick(event: MouseEvent<HTMLAnchorElement>, item: NavItem): void {
  // Only intercept primary-button clicks without modifier keys — anything else
  // (middle-click, ctrl+click, cmd+click, shift+click) keeps the default
  // browser behaviour so new-tab / copy-link continue to work.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  if (item.target === "_blank") return;
  if (!isOverlayModeItem(item)) return;
  if (!isOverlayActive()) return; // no island mounted → fall back to full navigation
  event.preventDefault();
  window.dispatchEvent(
    new CustomEvent(OVERLAY_OPEN_EVENT, { detail: { slug: item.pageSlug as string, source: "header" } }),
  );
}

/**
 * Fixed top-right header bar: optional admin-managed nav links, Language Switcher,
 * optional Info Button. Must be rendered inside a LocaleProvider.
 */
export function PageHeader({ showInfoButton = false, onInfoClick, navItems = EMPTY_NAV_ITEMS }: PageHeaderProps) {
  return (
    <div className="fixed top-4 right-4 z-40 hidden sm:flex items-center gap-3">
      {navItems.length > 0 && (
        <nav aria-label="Header navigation" className="flex items-center gap-4 mr-2 text-sm">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={navHref(item)}
              target={item.target === "_blank" ? "_blank" : undefined}
              rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
              onClick={(e) => handleNavClick(e, item)}
              className="text-text-secondary hover:text-text-primary transition-colors duration-150"
            >
              {navLabel(item)}
            </a>
          ))}
        </nav>
      )}
      <div className="flex items-center gap-1">
        <LanguageSwitcher />
        {showInfoButton && onInfoClick && <InfoButton onClick={onInfoClick} />}
      </div>
    </div>
  );
}
