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
 * @param children - The card body content.
 */
export function SectionCardShell({ title, footer, animated = false, className, children }: SectionCardShellProps) {
  return (
    <EmbossedCard className={cn(className ?? fullWidthEmbossedCardClassName, animated && "animate-zoom-in")}>
      {title && (
        <EmbossedCard.Header className={sectionCardHeaderClassName}>
          <EmbossedCard.Header.Title className={sectionCardTitleClassName}>{title}</EmbossedCard.Header.Title>
        </EmbossedCard.Header>
      )}
      {title || footer ? <EmbossedCard.Body>{children}</EmbossedCard.Body> : children}
      {footer && <EmbossedCard.Footer className={sectionCardFooterClassName}>{footer}</EmbossedCard.Footer>}
    </EmbossedCard>
  );
}
