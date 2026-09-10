/**
 * @file The card geometry every surface derives from, in one place.
 *
 * A card states one radius, and everything nested in it follows from that
 * radius and the distance to it: a well inside the card, a control inside the
 * well. The frontend renders those as CSS custom properties and the email
 * renderer as resolved pixels, and both read the numbers from here, so a card
 * in an email is the same shape as the card on the page it came from.
 *
 * The radius itself is not here: it is a design token (`DesignTokens.cardRadius`)
 * an operator can change, and these are the insets that token is measured
 * against.
 */

/** Distance from the card's edge to a well inside it, matching `--mc-card-content-inset` (0.75rem). */
export const CARD_CONTENT_INSET_PX = 12;

/** Distance from a well's edge to a control inside it, matching `--mc-recessed-control-inset` (0.1875rem). */
export const RECESSED_CONTROL_INSET_PX = 3;

/**
 * The radius of a well sitting inside a card.
 *
 * Concentric rounding: the gap between the two curves stays constant only when
 * the inner radius is the outer one less the distance between them. Clamped at
 * zero, because a well further in than the radius sits past the curve and is
 * square.
 *
 * @param cardRadiusPx - The card's own outer radius in pixels.
 * @returns The well's radius in pixels.
 */
export function recessedSurfaceRadiusPx(cardRadiusPx: number): number {
  return Math.max(0, cardRadiusPx - CARD_CONTENT_INSET_PX);
}

/**
 * The radius of a raised control, such as a button, sitting inside a well.
 *
 * The same rule one level further in, so a button in a well in a card carries
 * the third radius of the same family rather than a chosen one.
 *
 * @param cardRadiusPx - The card's own outer radius in pixels.
 * @returns The control's radius in pixels.
 */
export function raisedControlRadiusPx(cardRadiusPx: number): number {
  return Math.max(0, recessedSurfaceRadiusPx(cardRadiusPx) - RECESSED_CONTROL_INSET_PX);
}
