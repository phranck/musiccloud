import { type NavItem, NavTarget, PageDisplayMode } from "@musiccloud/shared";
import type { MouseEvent } from "react";

import { DayNightSwitcher } from "@/components/navigation/DayNightSwitcher";
import { HeaderNavMenu } from "@/components/navigation/HeaderNavMenu";
import { LanguageSwitcher } from "@/components/navigation/LanguageSwitcher";
import { ResolveModeIndicator } from "@/components/navigation/ResolveModeIndicator";
import { isOverlayActive, OVERLAY_OPEN_EVENT } from "@/context/useOverlay";
import { sendNavInteractionSignal } from "@/lib/analytics/navSignals";

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
 * Header bars pinned to the top corners. LEFT: the admin-managed nav links,
 * collapsed into a glass hamburger menu on every viewport (see
 * {@link HeaderNavMenu}). RIGHT: the Day/Night switcher + the Language switcher.
 * Must be rendered inside a LocaleProvider.
 *
 * The DayNightSwitcher drives the `dayNightMode` store, which feeds the sky
 * driver's dayness and — via the reverse `--g-dayness` publish channel — the
 * glass material's day↔night cross-fade.
 */
export function PageHeader({ navItems = EMPTY_NAV_ITEMS }: PageHeaderProps) {
  // `animate-slide-down-in` stays CSS deliberately (MC-029 Task 2.5 exception):
  // PageHeaderIsland hydrates at client:idle, so the SSR markup must animate
  // from parse — a GSAP entrance would start only after idle hydration with a
  // visible delay.
  return (
    <>
      <div className="absolute top-3 left-3 z-50 flex max-w-[calc(100vw-1.5rem)] animate-slide-down-in items-center gap-2 sm:fixed sm:top-4 sm:left-4 sm:gap-3">
        {navItems.length > 0 && <HeaderNavMenu navItems={navItems} onNavClick={handleNavClick} />}
        <ResolveModeIndicator />
      </div>
      <div className="absolute top-3 right-3 z-50 flex max-w-[calc(100vw-1.5rem)] animate-slide-down-in items-start gap-2 sm:fixed sm:top-4 sm:right-4 sm:gap-3">
        <DayNightSwitcher />
        <LanguageSwitcher />
      </div>
    </>
  );
}
