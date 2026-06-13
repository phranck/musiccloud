import { type NavItem, NavTarget, PageDisplayMode } from "@musiccloud/shared";
import type { MouseEvent } from "react";

import { DayNightSwitcher } from "@/components/navigation/DayNightSwitcher";
import { LanguageSwitcher } from "@/components/navigation/LanguageSwitcher";
import { isOverlayActive, OVERLAY_OPEN_EVENT } from "@/context/OverlayContext";
import { sendNavInteractionSignal } from "@/lib/analytics/navSignals";
import { navHref, navLabel } from "@/lib/nav";

interface PageHeaderProps {
  /** Items from the admin nav editor (header). Empty array hides the inline list. */
  navItems?: NavItem[];
}

const EMPTY_NAV_ITEMS: NavItem[] = [];

const OverlaySource = {
  Header: "header",
} as const;

function isOverlayModeItem(item: NavItem): boolean {
  return item.pageSlug !== null && item.pageDisplayMode !== null && item.pageDisplayMode !== PageDisplayMode.Fullscreen;
}

function handleNavClick(event: MouseEvent<HTMLAnchorElement>, item: NavItem): void {
  // Only intercept primary-button clicks without modifier keys — anything else
  // (middle-click, ctrl+click, cmd+click, shift+click) keeps the default
  // browser behaviour so new-tab / copy-link continue to work.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  sendNavInteractionSignal(item);
  if (item.target === NavTarget.Blank) return;
  if (!isOverlayModeItem(item)) return;
  if (!isOverlayActive()) return; // no island mounted → fall back to full navigation
  event.preventDefault();
  window.dispatchEvent(
    new CustomEvent(OVERLAY_OPEN_EVENT, { detail: { slug: item.pageSlug as string, source: OverlaySource.Header } }),
  );
}

/**
 * Top-right header bar: optional admin-managed nav links + Day-Night
 * Switcher + Language Switcher. Must be rendered inside a LocaleProvider.
 */
export function PageHeader({ navItems = EMPTY_NAV_ITEMS }: PageHeaderProps) {
  return (
    // `animate-slide-down-in` stays CSS deliberately (MC-029 Task 2.5
    // exception): PageHeaderIsland hydrates at client:idle, so the SSR markup
    // must animate from parse — a GSAP entrance would start only after idle
    // hydration with a visible delay.
    <div className="absolute top-3 right-3 z-50 flex max-w-[calc(100vw-1.5rem)] animate-slide-down-in items-center gap-2 sm:fixed sm:top-4 sm:right-4 sm:gap-3">
      {navItems.length > 0 && (
        <nav aria-label="Header navigation" className="flex items-center gap-3 text-sm sm:gap-4 sm:mr-2">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={navHref(item)}
              target={item.target === NavTarget.Blank ? NavTarget.Blank : undefined}
              rel={item.target === NavTarget.Blank ? "noopener noreferrer" : undefined}
              onClick={(e) => handleNavClick(e, item)}
              className="text-text-primary/85 hover:text-text-primary transition-colors duration-150"
            >
              {navLabel(item)}
            </a>
          ))}
        </nav>
      )}
      <DayNightSwitcher />
      <LanguageSwitcher />
    </div>
  );
}
