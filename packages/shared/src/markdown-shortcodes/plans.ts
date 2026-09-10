/**
 * @file The live plan list as a shortcode.
 *
 * The first one here that a reader interacts with, and therefore the first that
 * is hydrated in place rather than rendered to markup. A plan list typed into
 * Markdown would be a copy of the tiers table that nobody keeps in step, and a
 * price is exactly the kind of figure that must never be written twice.
 */

import { ContentContext } from "../content-context.js";
import { ShortcodeToken } from "./tokens.js";
import {
  type ShortcodeDefinition,
  ShortcodeParamType,
  ShortcodePlacement,
  ShortcodeRenderMode,
  ShortcodeSyntax,
  ShortcodeTargetRule,
} from "./types.js";

/** The plans are a portal subject, and the site has no page that shows them. */
const PORTAL_ONLY = ContentContext.DeveloperPortal;

/**
 * The heading a plan list carries when a page names none.
 *
 * It shares a line with the billing switch, which is why it is a parameter at
 * all rather than a Markdown heading a page writes above the shortcode.
 */
export const PLANS_DEFAULT_HEADING = "Available plans";

/**
 * The longest heading a plan list accepts.
 *
 * It sits opposite the billing switch on one line, so a long one either wraps
 * the switch onto a second line or squeezes it. The bound is what a heading
 * needs rather than what a field can hold.
 */
export const PLANS_MAX_HEADING_LENGTH = 60;

/**
 * The attribute the rendered placeholder carries, so the portal can find it.
 *
 * Named here rather than in the renderer, because the page that hydrates the
 * placeholder looks for exactly this and the two must agree.
 */
export const PLANS_PLACEHOLDER_ATTRIBUTE = "data-mc-plans";

/** The live plans, with their prices and the monthly/yearly switch. */
export const PLANS_SHORTCODE = {
  token: ShortcodeToken.Plans,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Island,
  target: ShortcodeTargetRule.Forbidden,
  placement: ShortcodePlacement.Block,
  label: "Plans",
  description:
    "Every plan as it stands right now, with its request limits, its features and its price, and a switch between monthly and yearly. The list comes from the plans themselves, so it follows whatever the dashboard says without this page being touched.",
  examples: ["[[plans]]", '[[plans heading="What each plan gives you"]]'],
  allowedContextMask: PORTAL_ONLY,
  params: [
    {
      name: "heading",
      type: ShortcodeParamType.String,
      defaultValue: PLANS_DEFAULT_HEADING,
      label: "Heading above the plans, sharing its line with the billing switch",
    },
  ],
} as const satisfies ShortcodeDefinition;
