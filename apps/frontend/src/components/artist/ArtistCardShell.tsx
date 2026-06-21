import type { ReactNode } from "react";
import { fullWidthEmbossedCardClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import {
  sectionCardFooterClassName,
  sectionCardFooterTextClassName,
  sectionCardHeaderClassName,
  sectionCardTitleClassName,
} from "@/components/cards/sectionCardChromeStyles";

interface ArtistCardShellProps {
  /** Card body content. */
  children: ReactNode;
  /** Overrides the default full-width embossed card class. */
  className?: string;
  /** Optional footer text rendered in the card's footer slot. */
  footer?: ReactNode;
  /** Optional title rendered in the card header; omitted for a chromeless shell. */
  title?: ReactNode;
}

/**
 * Chrome wrapper for a desktop artist-column card: an `EmbossedCard` with the
 * shared section header/title styling, a body, and an optional footer. When
 * neither `title` nor `footer` is given it renders the children bare (no header
 * or body padding), so a card can opt out of the titled chrome.
 */
export function ArtistCardShell({ children, className, footer, title }: ArtistCardShellProps) {
  return (
    <EmbossedCard className={className ?? fullWidthEmbossedCardClassName}>
      {title && (
        <EmbossedCard.Header className={sectionCardHeaderClassName}>
          <EmbossedCard.Header.Title className={sectionCardTitleClassName}>{title}</EmbossedCard.Header.Title>
        </EmbossedCard.Header>
      )}
      {title || footer ? <EmbossedCard.Body>{children}</EmbossedCard.Body> : children}
      {footer && (
        <EmbossedCard.Footer className={sectionCardFooterClassName}>
          <p className={sectionCardFooterTextClassName}>{footer}</p>
        </EmbossedCard.Footer>
      )}
    </EmbossedCard>
  );
}
