import { CARD_CONTENT_INSET_PX, RECESSED_CONTROL_INSET_PX } from "@musiccloud/shared";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Root of the geometry cascade. Resolves to the SSR-injected `--mc-card-radius`
// (the design-token `cardRadius`, default 32px = 2rem) so a saved token blob
// re-rounds every card at runtime; every nested radius derives from it.
export const embossedCardOuterRadius = "var(--mc-card-radius, 2rem)";
// The two insets come from the shared geometry, because the email renderer
// derives the same radii from the same numbers and a card in an email has to
// be the shape of the card on the page.
export const embossedCardContentInset = `${CARD_CONTENT_INSET_PX}px`;
export const recessedSurfaceRadius = `calc(${embossedCardOuterRadius} - ${embossedCardContentInset})`;
export const recessedControlInset = `${RECESSED_CONTROL_INSET_PX}px`;
export const raisedControlRadius = `calc(${recessedSurfaceRadius} - ${recessedControlInset})`;
/**
 * How far text standing on the page above an embossed card is drawn in from
 * the card's edge: half the card's outer radius, 14px at the 28px radius, so
 * the text begins where the curve gives way to the straight edge. Text inside
 * a padded card does not take it, because the padding already holds it off the
 * curve. `MarkdownHtml` publishes it as `--mc-card-text-inset` for headings
 * that introduce a card.
 */
export const cardTextInset = `calc(${embossedCardOuterRadius} / 2)`;

/** The padding of a content card in pixels, wider than lmaa.space's 12px because musiccloud's corners are rounder: 16px. */
const CONTENT_CARD_PADDING_PX = 16;

/**
 * The padding of a content card, {@link CONTENT_CARD_PADDING_PX} on all four
 * sides. `ContentCard` publishes it as the card's content inset too, so a well
 * inside stays concentric with the card: 12px at the 28px radius.
 */
export const contentCardPadding = `${CONTENT_CARD_PADDING_PX}px`;

const CONTROL_RADIUS_BASE = `max(4px, calc(var(--mc-recessed-radius-base, ${recessedSurfaceRadius}) - var(--mc-recessed-padding, ${recessedControlInset})))`;
const CONTROL_RADIUS_SM = `max(4px, calc(var(--mc-recessed-radius-sm, var(--mc-recessed-radius-base, ${recessedSurfaceRadius})) - var(--mc-recessed-padding, ${recessedControlInset})))`;

/**
 * Inline style giving a raised control (e.g. {@link import("@/components/ui/EmbossedButton").EmbossedButton}
 * or the list-row track cell) the corner radius of the surrounding `RecessedCard`
 * minus its padding. Sets `--neu-radius-base`/`-sm` plus `border-radius` so the
 * gradient-border arc stays aligned with the rounded corner.
 */
export const embossedControlRadiusStyle: CSSProperties = {
  "--neu-radius-base": CONTROL_RADIUS_BASE,
  "--neu-radius-sm": CONTROL_RADIUS_SM,
  borderRadius: "var(--neu-radius)",
} as CSSProperties;

export const outerEmbossedCardClassName = "w-full max-w-full sm:max-w-lg mx-auto p-0";
export const fullWidthEmbossedCardClassName = "w-full p-0";
export const recessedControlInsetClassName = "p-[var(--mc-recessed-control-inset)]";
export const recessedControlHeightClassName = "h-[47px]";
export const recessedControlSizeClassName = "size-[47px]";
/**
 * Stack of a grouped list of rows inside a recessed well. The gap between rows
 * is the `--mc-gap-list` token, which is what lets the small interior corners
 * of neighboring rows read as one rounded block.
 */
export const groupedListClassName = "flex flex-col gap-[var(--mc-gap-list,0.125rem)]";

/**
 * Builds the outer class string shared by every embossed media/section card
 * that joins the share-page entrance animation.
 *
 * `animate-zoom-in` stays CSS deliberately (MC-029 Task 2.5 exception): the
 * same card renders in the share page's SSR stream (bot-visible enter, no
 * hydration), and a split mechanism (GSAP on the landing flow, CSS on share)
 * would duplicate the motion definition. The keyframe is transform+opacity
 * only, so it complies with the compositor-only policy as-is.
 *
 * @param animated - When true, appends the `animate-zoom-in` entrance keyframe.
 * @param className - Optional caller-supplied extra classes merged last.
 * @returns The merged class string for the card's outer `EmbossedCard`.
 */
export function animatedOuterEmbossedCardClassName(animated: boolean, className?: string): string {
  return cn(outerEmbossedCardClassName, animated && "animate-zoom-in", className);
}
