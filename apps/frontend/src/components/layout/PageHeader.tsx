import type { NavItem } from "@musiccloud/shared";
import type { MouseEvent } from "react";

import { LanguageSwitcher } from "@/components/navigation/LanguageSwitcher";
import { isOverlayActive, OVERLAY_OPEN_EVENT } from "@/context/OverlayContext";
import { trackContentPageClick } from "@/lib/analytics";
import { navHref, navLabel } from "@/lib/nav";

interface PageHeaderProps {
  /** Items from the admin nav editor (header). Empty array hides the inline list. */
  navItems?: NavItem[];
}

const EMPTY_NAV_ITEMS: NavItem[] = [];

function isOverlayModeItem(item: NavItem): boolean {
  return item.pageSlug !== null && item.pageDisplayMode !== null && item.pageDisplayMode !== "fullscreen";
}

function trackNavItem(item: NavItem): void {
  if (!item.pageSlug) return;
  trackContentPageClick({
    slug: item.pageSlug,
    label: navLabel(item),
    surface: "header_nav",
    openMode: item.target === "_blank" ? "external" : isOverlayModeItem(item) ? "overlay" : "fullscreen",
  });
}

function handleNavClick(event: MouseEvent<HTMLAnchorElement>, item: NavItem): void {
  trackNavItem(item);
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
 * Top-right header bar: optional admin-managed nav links + Language Switcher.
 * Must be rendered inside a LocaleProvider.
 */
export function PageHeader({ navItems = EMPTY_NAV_ITEMS }: PageHeaderProps) {
  return (
    <div className="absolute top-3 right-3 z-50 flex max-w-[calc(100vw-1.5rem)] animate-slide-down-in items-center gap-2 sm:fixed sm:top-4 sm:right-4 sm:gap-3">
      {navItems.length > 0 && (
        <nav aria-label="Header navigation" className="flex items-center gap-3 text-xs sm:gap-4 sm:mr-2 sm:text-sm">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={navHref(item)}
              target={item.target === "_blank" ? "_blank" : undefined}
              rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
              onClick={(e) => handleNavClick(e, item)}
              className="text-text-primary/85 hover:text-text-primary transition-colors duration-150"
            >
              {navLabel(item)}
            </a>
          ))}
        </nav>
      )}
      <LanguageSwitcher />
    </div>
  );
}
