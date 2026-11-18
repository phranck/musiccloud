import type { CSSProperties, ReactNode } from "react";

import { contentCardInset } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";

/**
 * What a content card publishes on top of `EmbossedCard`'s own geometry.
 *
 * `--mc-card-content-inset` is the distance at which the card holds its
 * content, and `EmbossedCard` derives `--mc-card-inner-radius-base` and `-sm`
 * from it. Setting it to the card's padding keeps every recessed well inside
 * the card concentric with it: the outer radius less {@link contentCardInset}.
 */
const CONTENT_CARD_STYLE = { "--mc-card-content-inset": contentCardInset } as CSSProperties;

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
 * A card standing on a page and holding content: an `EmbossedCard` with
 * {@link contentCardInset} as its padding on all four sides.
 *
 * Every card of a content page takes this one surface and this one padding,
 * whether it holds a written section, a transfer, a route or a sponsor, so no
 * two cards on a page differ in material or inset. A recessed well inside it
 * takes the radius the card derives for it.
 *
 * @param props - See {@link ContentCardProps}.
 * @returns The card.
 */
export function ContentCard({ children, className }: ContentCardProps) {
  return (
    <EmbossedCard className={className} padding={contentCardInset} style={CONTENT_CARD_STYLE}>
      {children}
    </EmbossedCard>
  );
}
