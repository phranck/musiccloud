import type { ReactNode } from "react";

import { embossedCardContentInset } from "@/components/cards/cardGeometry";
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
 * A card standing on a page and holding content: an `EmbossedCard` with the
 * card content inset (`embossedCardContentInset`, 12px) as its padding on all
 * four sides, the padding lmaa.space gives its cards.
 *
 * Every card of a content page takes this one surface and this one padding,
 * whether it holds a written section, a transfer, a route or a sponsor, so no
 * two cards on a page differ in material or inset. The padding is the inset
 * `EmbossedCard` derives its wells' radius from, so a recessed well inside it
 * stays concentric with it.
 *
 * @param props - See {@link ContentCardProps}.
 * @returns The card.
 */
export function ContentCard({ children, className }: ContentCardProps) {
  return (
    <EmbossedCard className={className} padding={embossedCardContentInset}>
      {children}
    </EmbossedCard>
  );
}
