import {
  DEFAULT_STREAM_FORMAT,
  JAMENDO_FORMAT_ORDER,
  type JamendoAudioFormat,
  swapDownloadFormat,
} from "@musiccloud/shared";
import { CaretDownIcon, CheckIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { type CSSProperties, useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { raisedControlRadius, recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { useDismissableLayer } from "@/components/ui/useDismissableLayer";
import { useT } from "@/i18n/localeContext";
import { cn } from "@/lib/utils";

/** Short display labels for the download-format selector. Technical codec names
 *  are locale-independent, so they live here rather than in the i18n catalogue. */
const DOWNLOAD_FORMAT_LABELS: Record<JamendoAudioFormat, string> = {
  mp31: "MP3",
  mp32: "MP3-HD",
  ogg: "OGG",
  flac: "FLAC",
};

/** Hover tooltip per format: codec + data rate ("Datenrate"). These Jamendo
 *  delivery formats expose no resolution, so none is shown. Locale-independent
 *  like the labels, so kept here rather than in the i18n catalogue. */
const DOWNLOAD_FORMAT_TOOLTIPS: Record<JamendoAudioFormat, string> = {
  mp31: "MP3 · 96 kbps",
  mp32: "MP3 · 256 kbps (VBR)",
  ogg: "Ogg Vorbis",
  flac: "FLAC · lossless",
};

/** Raised-control radius for the floating menu panel. */
const RAISED_RADIUS_STYLE = {
  "--neu-radius-base": raisedControlRadius,
  "--neu-radius-sm": raisedControlRadius,
  borderRadius: "var(--neu-radius)",
} as CSSProperties;

/** Gap between the dropdown's bottom edge and the menu panel. */
const MENU_GAP_PX = 8;

/** Viewport-fixed position of the menu panel, right-aligned to the dropdown. */
interface MenuPosition {
  top: number;
  right: number;
}

interface CcDownloadControlProps {
  /** Format-agnostic Jamendo download URL — its last path segment is the format,
   *  swapped to the selected format via {@link swapDownloadFormat}. */
  downloadUrl: string;
  /** Accessible label for the format dropdown trigger and its menu. */
  formatAriaLabel: string;
}

/**
 * The CC download control: a download button plus a format selector that share
 * one selected format (default {@link DEFAULT_STREAM_FORMAT}, i.e. MP3-HD).
 *
 * The download button always points at the currently selected format's download
 * URL; the dropdown shows the selected format's label beside a caret and opens a
 * menu of all four formats (MP3 / MP3-HD / OGG / FLAC). All formats are always
 * offered — a download decodes nothing, so browser codec support is irrelevant.
 *
 * The menu is a disclosure (`aria-haspopup` + `aria-expanded` → a labelled
 * `role="menu"` of `role="menuitemradio"` options) that dismisses on an outside
 * pointer press, Escape, scroll, and after a format is chosen. It renders in a
 * portal on `document.body` (viewport-fixed, right-aligned) so the card's
 * `overflow-hidden` cannot clip it; {@link useDismissableLayer} treats both the
 * trigger container and the portal panel as "inside".
 *
 * @param downloadUrl - The format-agnostic download URL.
 * @param formatAriaLabel - Accessible name for the format dropdown.
 */
export function CcDownloadControl({ downloadUrl, formatAriaLabel }: CcDownloadControlProps) {
  const t = useT();
  const [format, setFormat] = useState<JamendoAudioFormat>(DEFAULT_STREAM_FORMAT);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismissableLayer(open, close, containerRef, menuRef);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  // Position the portal menu just below the trigger, right-aligned, in a pre-paint
  // layout effect on open — not inside the toggle's state updater (an impure
  // updater React's strict double-invoke would run twice).
  useLayoutEffect(() => {
    if (!open) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + MENU_GAP_PX, right: window.innerWidth - rect.right });
  }, [open]);

  const selectFormat = useCallback((next: JamendoAudioFormat) => {
    setFormat(next);
    setOpen(false);
  }, []);

  return (
    <div className="flex gap-2">
      <RecessedCard className={cn(recessedControlInsetClassName, "min-w-0 flex-1")}>
        <RecessedCard.Body>
          <EmbossedButton
            href={swapDownloadFormat(downloadUrl, format)}
            download
            className="flex w-full items-center justify-center gap-2.5 px-3 py-2.5 text-sm font-medium text-text-primary no-underline"
          >
            <DownloadSimpleIcon weight="duotone" className="size-5 flex-shrink-0" aria-hidden="true" />
            <span className="truncate leading-none">{t("cc.download")}</span>
          </EmbossedButton>
        </RecessedCard.Body>
      </RecessedCard>

      <div ref={containerRef} className="relative flex-shrink-0">
        <RecessedCard className={recessedControlInsetClassName}>
          <RecessedCard.Body>
            <EmbossedButton
              as="button"
              onClick={toggle}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={menuId}
              aria-label={formatAriaLabel}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-text-primary"
            >
              <span className="leading-none">{DOWNLOAD_FORMAT_LABELS[format]}</span>
              <CaretDownIcon weight="bold" className="size-5 flex-shrink-0" aria-hidden="true" />
            </EmbossedButton>
          </RecessedCard.Body>
        </RecessedCard>

        {open &&
          position &&
          createPortal(
            // Positioning wrapper carries `fixed` on its own: the inner visual
            // panel uses `recessed-gradient-border`, whose `position: relative`
            // (in glass.css) would otherwise beat the Tailwind `fixed` utility and
            // drop the menu out of place.
            <div ref={menuRef} className="fixed z-50" style={{ top: position.top, right: position.right }}>
              <div
                id={menuId}
                role="menu"
                aria-label={formatAriaLabel}
                style={RAISED_RADIUS_STYLE}
                className="recessed-gradient-border mc-glass-nav-track flex min-w-[10rem] flex-col gap-0.5 overflow-hidden p-1"
              >
                {JAMENDO_FORMAT_ORDER.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="menuitemradio"
                    aria-checked={option === format}
                    onClick={() => selectFormat(option)}
                    title={DOWNLOAD_FORMAT_TOOLTIPS[option]}
                    className="mc-glass-nav-indicator mc-txt-nav-normal flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150"
                  >
                    <CheckIcon
                      weight="bold"
                      className={cn("size-4 flex-shrink-0", option === format ? "opacity-100" : "opacity-0")}
                      aria-hidden="true"
                    />
                    <span className="truncate leading-none">{DOWNLOAD_FORMAT_LABELS[option]}</span>
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}
