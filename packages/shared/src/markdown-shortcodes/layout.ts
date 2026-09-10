/**
 * @file The shortcodes that arrange a page rather than mark up its text.
 *
 * Both portal pages are built from cards: one across the full column, or
 * several side by side. Markdown has no way to say that, which is why those
 * pages were markup and every layout change was a deployment.
 */

import { ContentContext } from "../content-context.js";
import { ShortcodeToken } from "./tokens.js";
import {
  ShortcodeBodyRule,
  type ShortcodeDefinition,
  ShortcodeParamType,
  ShortcodePlacement,
  ShortcodeRenderMode,
  ShortcodeSyntax,
  ShortcodeTargetRule,
} from "./types.js";

/**
 * Cards belong to the portal, and only there.
 *
 * The portal's stylesheet gives `mc-card` the surface the hand-written pages
 * used; the site's has no such surface, so a card written into a page there
 * would render as an unstyled block. This is what the context mask is for, and
 * it is a smaller promise than offering the shortcode everywhere and having it
 * look wrong in one place. Extending it to the site is a stylesheet away.
 */
const PORTAL_ONLY = ContentContext.DeveloperPortal;

/**
 * The custom property carrying the gap between cards in a row.
 *
 * The value itself lives in the stylesheet, where the page's spacing is
 * decided. Naming the property rather than the figure is what keeps this from
 * becoming a second answer that drifts, and the editor's reference resolves it
 * against the page so a writer still sees the number.
 */
export const CARD_ROW_DEFAULT_SPACING_TOKEN = "var(--mc-space-5)";

/**
 * How deeply cards may be nested before the renderer stops.
 *
 * A card holds page content and a card is page content, so without a limit a
 * document could nest without end and the render would not return. Three is
 * more than any real page needs and shallow enough that reaching it is a
 * mistake rather than a design.
 */
export const MAX_CARD_DEPTH = 3;

/** The widest row the layout offers. Beyond this a card is too narrow to read. */
export const MAX_CARD_COLUMNS = 4;

/** How many cards stand side by side when a row names no number. */
export const DEFAULT_CARD_COLUMNS = 2;

/** Written out once, because it is both the documentation and the editor's example. */
const CARD_ROW_EXAMPLE = [
  "[[cards columns=2 {",
  "[[card {",
  "## Start here",
  "",
  "Create a project, then a registration under it.",
  "}]]",
  "",
  "[[card {",
  "## Then build",
  "",
  "Send your key with every request.",
  "}]]",
  "}]]",
].join("\n");

/**
 * One card, holding whatever a page holds.
 *
 * Renders the portal's own card surface rather than a bare container, so a card
 * written into a page is the same shape as the ones the hand-written pages
 * used, and a change to the card geometry reaches both.
 */
export const CARD_SHORTCODE = {
  token: ShortcodeToken.Card,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Forbidden,
  placement: ShortcodePlacement.Block,
  body: ShortcodeBodyRule.Markdown,
  label: "Card",
  description:
    "A card, taking the full width of the column it stands in. What you write between the braces is ordinary Markdown: headings, paragraphs, lists, code, any other shortcode, and another card. Put several inside a row to stand them side by side.",
  examples: ["[[card {\n## What you get\n\nOne resolve call, every service it can find.\n}]]"],
  allowedContextMask: PORTAL_ONLY,
  params: [],
} as const satisfies ShortcodeDefinition;

/**
 * A row of cards, side by side, wrapping when the screen is narrow.
 *
 * The number of columns is what a page decides; when to abandon them is what
 * the stylesheet decides, because that depends on the reader's screen rather
 * than on the content.
 */
export const CARD_ROW_SHORTCODE = {
  token: ShortcodeToken.Cards,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Forbidden,
  placement: ShortcodePlacement.Block,
  body: ShortcodeBodyRule.Markdown,
  label: "Card row",
  description:
    "Stands the cards inside it side by side. On a narrow screen they drop underneath each other instead of getting too thin to read, which the stylesheet decides rather than the page.",
  examples: [CARD_ROW_EXAMPLE],
  allowedContextMask: PORTAL_ONLY,
  params: [
    {
      name: "columns",
      type: ShortcodeParamType.Integer,
      min: 1,
      max: MAX_CARD_COLUMNS,
      defaultValue: DEFAULT_CARD_COLUMNS,
      label: "How many cards stand beside each other on a wide screen",
    },
    {
      name: "spacing",
      type: ShortcodeParamType.Integer,
      min: 0,
      max: 200,
      defaultLabel: CARD_ROW_DEFAULT_SPACING_TOKEN,
      label: "Gap between the cards, in pixels",
    },
  ],
  tables: [
    {
      caption: "columns: what a row looks like on a wide screen",
      columns: ["columns", "Cards"],
      rows: [
        ["1", "one after another, each the full width"],
        ["2", "two abreast, which is the default"],
        ["3", "three abreast, for short cards"],
        [String(MAX_CARD_COLUMNS), "as many as the layout offers"],
      ],
    },
  ],
  children: [CARD_SHORTCODE],
} as const satisfies ShortcodeDefinition;
