import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Root of the geometry cascade. Resolves to the SSR-injected `--mc-card-radius`
// (the design-token `cardRadius`, default 32px = 2rem) so a saved token blob
// re-rounds every card at runtime; every nested radius derives from it.
export const embossedCardOuterRadius = "var(--mc-card-radius, 2rem)";
export const embossedCardContentInset = "0.75rem";
export const recessedSurfaceRadius = `calc(${embossedCardOuterRadius} - ${embossedCardContentInset})`;
export const recessedControlInset = "0.1875rem";
export const raisedControlRadius = `calc(${recessedSurfaceRadius} - ${recessedControlInset})`;

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
