import { CircleNotchIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { fullWidthEmbossedCardClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import {
  sectionCardFooterClassName,
  sectionCardHeaderClassName,
  sectionCardTitleClassName,
} from "@/components/cards/sectionCardChromeStyles";
import { cn } from "@/lib/utils";

interface SectionCardShellProps {
  /** Card title rendered in the embossed header; omitted for a chromeless shell. */
  title?: ReactNode;
  /**
   * Optional trailing control aligned to the header's right edge (e.g. a list/grid
   * view toggle). Lives inside the titled header row (so it respects the header's
   * `chrome-x` inset instead of an absolute `EmbossedCard.Header.AddOn`), pushed
   * right after the title + refresh spinner. Only rendered when {@link title} is.
   */
  headerAddOn?: ReactNode;
  /**
   * Optional footer content rendered in the card's footer slot. Any node — a
   * credit line (wrap it in {@link import("./SectionCardFooterText").SectionCardFooterText})
   * or a pager.
   */
  footer?: ReactNode;
  /** When true, appends the shared `animate-zoom-in` entrance keyframe. */
  animated?: boolean;
  /**
   * Outer card class. Each card family passes its own base width class
   * (`fullWidthEmbossedCardClassName` for the desktop artist column,
   * `outerEmbossedCardClassName` for the centered landing/share cards). Defaults
   * to the full-width artist-column class when omitted.
   */
  className?: string;
  /**
   * When true, the card signals an in-flight content refresh while the previous
   * content stays visible: a spinner appears in the header's trailing slot and
   * the body is blurred + click-disabled. The artist-column cards set this during
   * the async re-fetch after a track swap, so the column reads as "updating"
   * instead of looking frozen with stale rows.
   */
  isRefreshing?: boolean;
  /** Card body content. */
  children: ReactNode;
}

/**
 * Shared chrome wrapper for a titled section card: an `EmbossedCard` with the
 * common section header/title styling, a body, and an optional footer.
 *
 * Used by the desktop artist-column cards (via the `ArtistCardShell` alias) and
 * by the commercial `ServicesCard` / Creative-Commons `CcInfoCard`, so the
 * header/title/footer chrome and the geometry-token cascade live in one place.
 * The outer width and entrance animation stay per-family: the base width class
 * is passed as `className` and the optional zoom-in is toggled via `animated`.
 *
 * When neither `title` nor `footer` is given the children render bare (no header
 * or body padding), so a card can opt out of the titled chrome.
 *
 * @param title - Optional header title node.
 * @param footer - Optional footer text node.
 * @param animated - When true, plays the shared zoom-in entrance.
 * @param className - Outer card class (defaults to the full-width artist class).
 * @param isRefreshing - When true, shows the header refresh spinner and blurs the body.
 * @param children - The card body content.
 */
export function SectionCardShell({
  title,
  headerAddOn,
  footer,
  animated = false,
  className,
  isRefreshing = false,
  children,
}: SectionCardShellProps) {
  return (
    <EmbossedCard className={cn(className ?? fullWidthEmbossedCardClassName, animated && "animate-zoom-in")}>
      {title && (
        // Flex row (not a trailing AddOn, which absolute-positions to the
        // padding-box edge and would ignore the header's `chrome-x` inset): the
        // title keeps its place and the spinner sits inside the same padding,
        // flush with the title's right inset.
        <EmbossedCard.Header className={cn(sectionCardHeaderClassName, "flex items-center gap-2")}>
          <EmbossedCard.Header.Title className={sectionCardTitleClassName}>{title}</EmbossedCard.Header.Title>
          {isRefreshing && (
            <CircleNotchIcon
              className="size-4 shrink-0 animate-spin text-text-secondary"
              weight="bold"
              aria-hidden="true"
            />
          )}
          {headerAddOn && <div className="ml-auto flex items-center">{headerAddOn}</div>}
        </EmbossedCard.Header>
      )}
      {title || footer ? (
        <EmbossedCard.Body
          className={cn(
            "transition-[filter,opacity] duration-300",
            isRefreshing && "pointer-events-none select-none blur-[1.5px] opacity-55",
          )}
        >
          {children}
        </EmbossedCard.Body>
      ) : (
        children
      )}
      {footer && <EmbossedCard.Footer className={sectionCardFooterClassName}>{footer}</EmbossedCard.Footer>}
    </EmbossedCard>
  );
}
