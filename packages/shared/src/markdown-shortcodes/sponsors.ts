/**
 * @file The sponsor wall as a shortcode.
 *
 * The wall is hydrated on the site, so the shortcode is an island part: the
 * backend renders its texts and writes them into a marker, as `sponsor-wall.ts`
 * in this package describes, and the site reads who is on the wall from the
 * public sponsors route. A page names the texts and nothing about the sponsors,
 * because those come from the dashboard.
 */

import { ContentContext } from "../content-context.js";
import { SPONSOR_WALL_MISSING_PLACEHOLDER } from "../sponsor-wall.js";
import { ShortcodeToken } from "./tokens.js";
import {
  type ShortcodeDefinition,
  ShortcodeParamType,
  ShortcodePlacement,
  ShortcodeRenderMode,
  ShortcodeSyntax,
  ShortcodeTargetRule,
} from "./types.js";

/** The wall belongs to the site's support page, and the portal has none. */
const SITE_ONLY = ContentContext.Frontend;

/** Who carries this year's running costs, as a moving row of cards. */
export const SPONSORS_SHORTCODE = {
  token: ShortcodeToken.Sponsors,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Island,
  target: ShortcodeTargetRule.Forbidden,
  placement: ShortcodePlacement.Block,
  allowedContextMask: SITE_ONLY,
  label: "Sponsors",
  description:
    "Who carries this year's running costs: a card per published sponsor whose year still runs, with picture, name, profiles, their sentence and the days left, and a sentence on how much of the year is covered. From the third card on the row moves by itself. With no sponsor, a placeholder card invites the first one and opens the ladder's sponsor tab. Every sponsor comes from the dashboard.",
  examples: [
    '[[sponsors text="They carry this year." missing="{missing} are still missing this year." emptyAction="Become the first sponsor"]]',
  ],
  params: [
    { name: "text", type: ShortcodeParamType.String, label: "How the block is introduced. Markdown" },
    {
      name: "covered",
      type: ShortcodeParamType.String,
      label: "What it says once the year's costs are covered. Markdown",
    },
    {
      name: "missing",
      type: ShortcodeParamType.String,
      label: `What it says while they are not. Markdown. ${SPONSOR_WALL_MISSING_PLACEHOLDER} stands for the amount still outstanding`,
    },
    {
      name: "empty",
      type: ShortcodeParamType.String,
      label: "What stands in the row's place while nobody is on it. Markdown; the first paragraph is the headline",
    },
    { name: "emptyAction", type: ShortcodeParamType.String, label: "The placeholder button's label" },
  ],
} as const satisfies ShortcodeDefinition;
