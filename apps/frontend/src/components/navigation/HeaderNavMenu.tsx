import { type NavItem, NavTarget } from "@musiccloud/shared";
import { ListIcon } from "@phosphor-icons/react";
import { type MouseEvent, useCallback, useId, useRef, useState } from "react";

import { recessedSurfaceRadius } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import {
  HEADER_CONTROL_RAISED_CLASS,
  HEADER_CONTROL_TRACK_CLASS,
  HEADER_RAISED_RADIUS_STYLE,
} from "@/components/navigation/headerControlStyle";
import { useDismissableLayer } from "@/components/ui/useDismissableLayer";
import { commonCopy } from "@/copy/common";
import { navHref, navLabel } from "@/lib/nav";
import { cn } from "@/lib/utils";

interface HeaderNavMenuProps {
  /** Admin-managed header nav links to list in the dropdown. */
  navItems: NavItem[];
  /**
   * Shared overlay-aware click handler from {@link PageHeader}: opens an overlay
   * for overlay-mode pages, otherwise lets the link navigate. The menu closes
   * itself afterwards regardless of which path the handler takes.
   */
  onNavClick: (event: MouseEvent<HTMLAnchorElement>, item: NavItem) => void;
}

/**
 * Header navigation: a glass hamburger button — built from the same recessed
 * segmented-control track + raised icon button as the Day/Night and Language
 * switchers, so it reads as one of them — that toggles a dropdown listing the
 * admin-managed header nav links.
 *
 * Used on every viewport, so the navigation looks identical across platforms. It
 * is a disclosure (button `aria-expanded` + `aria-controls` → a labelled `<nav>`
 * panel), and closes on outside pointer press, on Escape, and after a link is
 * chosen.
 */
export function HeaderNavMenu({ navItems, onNavClick }: HeaderNavMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);

  // While open, dismiss on an outside pointer press or Escape.
  useDismissableLayer(open, close, containerRef);

  return (
    <div ref={containerRef} className="relative">
      <RecessedCard className={HEADER_CONTROL_TRACK_CLASS} radius={recessedSurfaceRadius}>
        <RecessedCard.Body className="contents">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={commonCopy.navigation.menu}
            style={HEADER_RAISED_RADIUS_STYLE}
            className={cn(HEADER_CONTROL_RAISED_CLASS, "w-[34px]")}
          >
            <ListIcon weight="duotone" className="size-[18px]" aria-hidden="true" />
          </button>
        </RecessedCard.Body>
      </RecessedCard>

      {open && (
        // Positioning wrapper carries `absolute` on its own: the inner panel uses
        // `recessed-gradient-border`, whose `position: relative` (glass.css) would
        // otherwise beat the Tailwind `absolute` utility — leaving the panel in
        // flow, which widened the trigger track to the menu's width. The wrapper
        // keeps the panel out of flow so the hamburger button keeps its size.
        <div className="absolute left-0 top-full z-50 mt-2">
          <nav
            id={menuId}
            aria-label={commonCopy.navigation.menu}
            style={HEADER_RAISED_RADIUS_STYLE}
            className="recessed-gradient-border mc-glass-nav-track flex min-w-[10rem] origin-top animate-menu-drop-in flex-col gap-0.5 overflow-hidden p-1"
          >
            {navItems.map((item) => (
              <a
                key={item.id}
                href={navHref(item)}
                target={item.target === NavTarget.Blank ? NavTarget.Blank : undefined}
                rel={item.target === NavTarget.Blank ? "noopener noreferrer" : undefined}
                onClick={(event) => {
                  onNavClick(event, item);
                  setOpen(false);
                }}
                className="mc-glass-nav-indicator mc-nav-item mc-txt-nav-normal rounded-lg px-3 py-2 transition-colors duration-150"
              >
                {navLabel(item)}
              </a>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
