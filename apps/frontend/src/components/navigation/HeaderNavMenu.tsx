import { type NavItem, NavTarget } from "@musiccloud/shared";
import { ListIcon } from "@phosphor-icons/react";
import { type MouseEvent, useEffect, useId, useRef, useState } from "react";

import { raisedControlRadius, recessedSurfaceRadius } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { useT } from "@/i18n/localeContext";
import { navHref, navLabel } from "@/lib/nav";

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

/** Raised-control radius — the switcher's indicator-cell radius, shared by the trigger and the dropdown panel. */
const RAISED_RADIUS_STYLE = {
  "--neu-radius-base": raisedControlRadius,
  "--neu-radius-sm": raisedControlRadius,
  borderRadius: "var(--neu-radius)",
} as React.CSSProperties;

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
  const t = useT();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  // While open, dismiss on an outside pointer press or Escape. Listeners are
  // scoped to the open state and removed when it closes or the menu unmounts.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <RecessedCard className="mc-glass-nav-track flex p-1" radius={recessedSurfaceRadius}>
        <RecessedCard.Body className="contents">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={t("nav.menu")}
            style={RAISED_RADIUS_STYLE}
            className="embossed-gradient-border mc-glass-nav-indicator mc-txt-nav-bright relative z-10 flex size-[34px] cursor-pointer items-center justify-center overflow-hidden rounded-lg border-none focus-visible:outline-2 focus-visible:outline-white/40 focus-visible:outline-offset-2"
          >
            <ListIcon weight="duotone" className="size-[18px]" aria-hidden="true" />
          </button>
        </RecessedCard.Body>
      </RecessedCard>

      {open && (
        <nav
          id={menuId}
          aria-label={t("nav.menu")}
          style={RAISED_RADIUS_STYLE}
          className="recessed-gradient-border mc-glass-nav-track absolute left-0 top-full mt-2 flex min-w-[10rem] flex-col gap-0.5 overflow-hidden p-1"
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
      )}
    </div>
  );
}
