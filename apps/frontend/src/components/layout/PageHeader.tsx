import { type NavItem, NavTarget, PageDisplayMode } from "@musiccloud/shared";
import type { MouseEvent } from "react";

import { DayNightSwitcher } from "@/components/navigation/DayNightSwitcher";
import { HeaderNavMenu } from "@/components/navigation/HeaderNavMenu";
import { LanguageSwitcher } from "@/components/navigation/LanguageSwitcher";
import { ResolveModeIndicator } from "@/components/navigation/ResolveModeIndicator";
import { isOverlayActive, OVERLAY_OPEN_EVENT } from "@/context/useOverlay";
import { useIsClient } from "@/hooks/useIsClient";
import { sendNavInteractionSignal } from "@/lib/analytics/navSignals";
import { cn } from "@/lib/utils";

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
  const isClient = useIsClient();

  // The whole nav bar stays `invisible` until hydration completes, then reveals
  // with the `animate-slide-down-in` entrance. The DayNightSwitcher reads the
  // persisted mode from localStorage, which is client-only: rendering it during
  // SSR would flash the default icon before the stored one. Gating the bar on
  // `useIsClient()` hides that swap and lets the slide-in play once, on reveal.
  const barBase =
    "absolute top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 flex max-w-[calc(100vw-1.5rem)] sm:fixed sm:top-[calc(env(safe-area-inset-top)+1rem)]";
  const reveal = isClient ? "animate-slide-down-in" : "invisible";

  return (
    <>
      <div className={cn(barBase, "left-3 items-center gap-2 sm:left-4 sm:gap-3", reveal)}>
        {navItems.length > 0 && <HeaderNavMenu navItems={navItems} onNavClick={handleNavClick} />}
        <ResolveModeIndicator />
      </div>
      <div className={cn(barBase, "right-3 items-start gap-2 sm:right-4 sm:gap-3", reveal)}>
        <DayNightSwitcher />
        <LanguageSwitcher />
      </div>
    </>
  );
}
