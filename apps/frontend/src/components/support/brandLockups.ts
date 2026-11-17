/**
 * @file The brand lockups the support ladder shows beside a payment card's heading.
 *
 * The files in `src/assets/brands` stay exactly as their owners publish them.
 * The site's cards are dark glass, where the published blue and black would
 * sink into the ground, so the ladder shows a white rendition of each. The
 * rendition is derived from the published file here rather than kept as a
 * second file, so the two cannot drift apart. SEPA's yellow euro keeps its
 * color.
 */

import type { SupportBrandIconValue } from "@musiccloud/shared";
import { SupportBrandIcon } from "@musiccloud/shared";

import githubLockupSvg from "@/assets/brands/github-lockup.svg?raw";
import paypalLockupSvg from "@/assets/brands/paypal-lockup.svg?raw";
import sepaLockupSvg from "@/assets/brands/sepa-lockup.svg?raw";

/** The lockup's main color on the site's cards. */
const MARK = "#ffffff";

/** PayPal's lighter blue on the site's cards, a step back from the white. */
const MARK_SECONDARY = "#b3b3b3";

/** PayPal's darkest blue on the site's cards, where the two Ps overlap. */
const MARK_SHADOW = "#808080";

/** Width of a lockup beside a card heading, in pixels: 96. Its height follows from the file. */
export const BRAND_LOCKUP_WIDTH_PX = 96;

/**
 * Each brand's published file, and each of its colors as the file writes it
 * with the color the site draws instead.
 */
const LOCKUPS: Record<SupportBrandIconValue, { svg: string; colors: Record<string, string> }> = {
  [SupportBrandIcon.Github]: { svg: githubLockupSvg, colors: { black: MARK } },
  [SupportBrandIcon.Paypal]: {
    svg: paypalLockupSvg,
    colors: { "#003087": MARK, "#0070e0": MARK_SECONDARY, "#001c64": MARK_SHADOW },
  },
  [SupportBrandIcon.Sepa]: { svg: sepaLockupSvg, colors: { "rgb(13.72549%,31.372549%,66.27451%)": MARK } },
};

/**
 * Redraws an SVG in other colors.
 *
 * @param svg - The SVG's text.
 * @param colors - Each color as the text writes it, and its replacement.
 * @returns The text with every occurrence of each color replaced.
 */
function recolorSvg(svg: string, colors: Record<string, string>): string {
  return Object.entries(colors).reduce(
    (text, [published, replacement]) => text.replaceAll(published, replacement),
    svg,
  );
}

/**
 * The site's rendition of a brand's lockup, as an address an `img` can show.
 *
 * A `data:` address, which the site's `img-src` admits, because the rendition
 * exists only here and has no file to point at.
 *
 * @param icon - The brand.
 * @returns A `data:image/svg+xml` address.
 */
export function brandLockupUrl(icon: SupportBrandIconValue): string {
  const lockup = LOCKUPS[icon];
  return `data:image/svg+xml,${encodeURIComponent(recolorSvg(lockup.svg, lockup.colors))}`;
}
