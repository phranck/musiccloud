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
 * The inset at which text sits inside an embossed card: the content inset
 * plus half the inner radius, which `glass.css` resolves as
 * `--mc-card-chrome-x` on the card from that card's own radius. A section
 * header's title stands at the same inset, so text written straight into a
 * card lines up with the titles of the cards around it. Read on the card
 * element itself, so it is only meaningful as that card's own padding.
 */
export const embossedCardTextInset = "var(--mc-card-chrome-x)";

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

/**
 * Inline style for the content of a `RecessedCard` that holds recessed wells of its own.
 *
 * A `RecessedCard` given no `radius` takes the card's inner radius from
 * `--mc-card-inner-radius-base` and `-sm`, which the `EmbossedCard` around it
 * publishes. A well inside another `RecessedCard` would take that same radius
 * and pinch at the corners. Set on the wrapper of such a card's content, this
 * moves every well inside it to {@link raisedControlRadius}, the level a
 * control standing inside a card takes, while the card itself keeps its
 * own. A well that states its `radius` keeps that.
 */
export const nestedRecessedSurfaceStyle: CSSProperties = {
  "--mc-card-inner-radius-base": raisedControlRadius,
  "--mc-card-inner-radius-sm": raisedControlRadius,
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
