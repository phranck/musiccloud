import { JAMENDO_FORMAT_ORDER, type JamendoAudioFormat, swapDownloadFormat } from "@musiccloud/shared";
import { CaretDownIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { type CSSProperties, useCallback, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { raisedControlRadius, recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { useDismissableLayer } from "@/components/ui/useDismissableLayer";
import { cn } from "@/lib/utils";

/**
 * Per-format download labels. Technical format names (codec + bitrate) are
 * locale-independent, so they live here rather than in the i18n catalogue.
 */
const DOWNLOAD_FORMAT_LABELS: Record<JamendoAudioFormat, string> = {
  mp31: "MP3 · 96 kbit/s",
  mp32: "MP3 · 256 kbit/s",
  ogg: "OGG Vorbis",
  flac: "FLAC",
};

/** Raised-control radius for the trigger button and the floating menu panel. */
const RAISED_RADIUS_STYLE = {
  "--neu-radius-base": raisedControlRadius,
  "--neu-radius-sm": raisedControlRadius,
  borderRadius: "var(--neu-radius)",
} as CSSProperties;

/** Gap between the trigger's bottom edge and the menu panel. */
const MENU_GAP_PX = 8;

/** Viewport-fixed position of the menu panel, right-aligned to the trigger. */
interface MenuPosition {
  top: number;
  right: number;
}

interface CcDownloadMenuProps {
  /** Format-agnostic Jamendo download URL — its last path segment is the format,
   *  swapped per option via {@link swapDownloadFormat}. */
  downloadUrl: string;
  /** Accessible label for the trigger button and the menu panel. */
  ariaLabel: string;
}

/**
 * A square dropdown button beside the CC download button that opens a menu of
 * every Jamendo download format (mp31 / mp32 / ogg / flac). Unlike the player's
 * streaming selector, all four formats are always offered — a download plays
 * nothing, so browser codec support is irrelevant.
 *
 * It is a disclosure (`aria-haspopup` + `aria-expanded` → a labelled
 * `role="menu"` panel of `role="menuitem"` download links) that dismisses on an
 * outside pointer press, on Escape, on scroll, and after a format is chosen.
 *
 * The panel renders in a portal on `document.body`, viewport-fixed and
 * right-aligned to the trigger, so the card's `overflow-hidden` cannot clip it.
 * {@link useDismissableLayer} treats both the trigger container and the portal
 * panel as "inside" so a press on a menu item is not swallowed as an outside
 * dismiss before the download link fires.
 *
 * @param downloadUrl - The format-agnostic download URL.
 * @param ariaLabel - Accessible name for the trigger and menu.
 */
export function CcDownloadMenu({ downloadUrl, ariaLabel }: CcDownloadMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismissableLayer(open, close, containerRef, menuRef);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      if (prev) return false;
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setPosition({ top: rect.bottom + MENU_GAP_PX, right: window.innerWidth - rect.right });
      return true;
    });
  }, []);

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <RecessedCard className={cn(recessedControlInsetClassName, "h-full")}>
        <RecessedCard.Body className="h-full">
          <EmbossedButton
            as="button"
            onClick={toggle}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={ariaLabel}
            className="flex aspect-square h-full items-center justify-center px-0 py-0 text-text-primary"
          >
            <CaretDownIcon weight="bold" className="size-5 flex-shrink-0" aria-hidden="true" />
          </EmbossedButton>
        </RecessedCard.Body>
      </RecessedCard>

      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={ariaLabel}
            style={{ ...RAISED_RADIUS_STYLE, top: position.top, right: position.right }}
            className="recessed-gradient-border mc-glass-nav-track fixed z-50 flex min-w-[12rem] flex-col gap-0.5 overflow-hidden p-1"
          >
            {JAMENDO_FORMAT_ORDER.map((format) => (
              <a
                key={format}
                role="menuitem"
                href={swapDownloadFormat(downloadUrl, format)}
                download
                onClick={close}
                className="mc-glass-nav-indicator mc-txt-nav-normal flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm no-underline transition-colors duration-150"
              >
                <DownloadSimpleIcon weight="duotone" className="size-4 flex-shrink-0" aria-hidden="true" />
                <span className="truncate leading-none">{DOWNLOAD_FORMAT_LABELS[format]}</span>
              </a>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
