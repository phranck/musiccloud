import type { CSSProperties, ReactNode } from "react";

import { contentCardPadding } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";

/** Props of {@link ContentCard}. */
export interface ContentCardProps {
  /** What the card holds: text, wells, controls. */
  children: ReactNode;
  /**
   * Classes of the card. Layout classes such as `flex flex-col gap-3` reach
   * the content too, because `EmbossedCard`'s content surface inherits the
   * root's flex layout.
   */
  className?: string;
}

/**
 * The content inset a content card publishes, its padding, so a recessed well
 * inside derives its radius from the padding it actually stands in rather than
 * from `EmbossedCard`'s default inset.
 */
const CONTENT_CARD_STYLE = { "--mc-card-content-inset": contentCardPadding } as CSSProperties;

/**
 * A card standing on a page and holding content: an `EmbossedCard` with
 * `contentCardPadding` on all four sides, the card radius in lmaa.space's
 * proportion of padding to radius.
 *
 * Every card of a content page takes this one surface and this one padding,
 * whether it holds a written section, a transfer, a route or a sponsor, so no
 * two cards on a page differ in material or inset. The padding is also the
 * inset the card's wells derive their radius from, so a recessed well inside
 * stays concentric with it.
 *
 * @param props - See {@link ContentCardProps}.
 * @returns The card.
 */
export function ContentCard({ children, className }: ContentCardProps) {
  return (
    <EmbossedCard className={className} padding={contentCardPadding} style={CONTENT_CARD_STYLE}>
      {children}
    </EmbossedCard>
  );
}
