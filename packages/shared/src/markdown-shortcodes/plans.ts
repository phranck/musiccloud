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
  ShortcodePlacement,
  ShortcodeRenderMode,
  ShortcodeSyntax,
  ShortcodeTargetRule,
} from "./types.js";

/** The plans are a portal subject, and the site has no page that shows them. */
const PORTAL_ONLY = ContentContext.DeveloperPortal;

/**
 * The attribute the rendered placeholder carries, so the portal can find it.
 *
 * Named here rather than in the renderer, because the page that hydrates the
 * placeholder looks for exactly this and the two must agree.
 */
export const PLANS_PLACEHOLDER_ATTRIBUTE = "data-mc-plans";

/**
 * The live plans, with their prices and the monthly/yearly switch.
 *
 * It takes nothing, on purpose. Everything a plan shows already lives on the
 * plan: its name, its colour, its icon, its limits, its features, its price and
 * whether it can be chosen. A page saying `[[plans]]` is saying "the plans go
 * here", and nothing else is its business.
 */
export const PLANS_SHORTCODE = {
  token: ShortcodeToken.Plans,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Island,
  target: ShortcodeTargetRule.Forbidden,
  placement: ShortcodePlacement.Block,
  label: "Plans",
  description:
    "Every plan as it stands right now, with its request limits, its features and its price, and a switch between monthly and yearly. Everything it shows comes from the plans themselves, so it follows whatever the dashboard says without this page being touched.",
  examples: ["[[plans]]"],
  allowedContextMask: PORTAL_ONLY,
  params: [],
} as const satisfies ShortcodeDefinition;
