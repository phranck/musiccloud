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
 * How deeply containers may be nested before the renderer stops.
 *
 * A container holds page content and a container is page content, so without a
 * limit a document could nest without end and the render would not return. One
 * budget covers cards and stacks together, because they nest through each other
 * and two counters would let a document reach twice the depth either one
 * allows. Six is more than any real page needs and shallow enough that reaching
 * it is a mistake rather than a design.
 */
export const MAX_CONTAINER_DEPTH = 6;

/** The widest row the layout offers. Beyond this a card is too narrow to read. */
export const MAX_CARD_COLUMNS = 4;

/**
 * The widest gap a page may ask for between two children of a container.
 *
 * Read by the cards and by the stacks alike, because the reason is the same in
 * both: past this the pieces stop reading as one arrangement.
 */
export const MAX_CONTAINER_SPACING = 200;

/** How many cards stand side by side when a row names no number. */
export const DEFAULT_CARD_COLUMNS = 2;

/**
 * The heading a card carries, and the symbol beside it.
 *
 * A child rather than a shortcode of its own, so it means something inside a
 * card and nothing at the top level of a page.
 */
export const CARD_HEADER_SHORTCODE = {
  token: ShortcodeToken.Header,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Forbidden,
  placement: ShortcodePlacement.Block,
  body: ShortcodeBodyRule.OptionalMarkdown,
  label: "Card header",
  description:
    "What a card says it is, standing above its content and separated from it. Write one line as text=, and anything longer between braces. Both are Markdown, so a heading or a sentence work either way, and a symbol may stand before it.",
  examples: [
    '[[header text="## What you get" icon="task-square"]]',
    '[[header icon="task-square" {\n## What you get\n}]]',
  ],
  allowedContextMask: PORTAL_ONLY,
  params: [
    {
      name: "text",
      type: ShortcodeParamType.String,
      defaultLabel: "what stands between the braces",
      label: "What the header reads, where it is one line. Markdown",
    },
    {
      name: "icon",
      type: ShortcodeParamType.String,
      defaultLabel: "no symbol, only the text",
      label: "A symbol before the text, named as the icon shortcode names one",
    },
  ],
} as const satisfies ShortcodeDefinition;

/**
 * What a card is mostly made of.
 *
 * Naming it is what lets the other two stand anywhere in the card: with a body
 * of its own, the card no longer has to read everything that is not a header or
 * a footer as content.
 */
export const CARD_BODY_SHORTCODE = {
  token: ShortcodeToken.Body,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Forbidden,
  placement: ShortcodePlacement.Block,
  body: ShortcodeBodyRule.Markdown,
  label: "Card body",
  description:
    "A card's own content, which is ordinary Markdown. Name it where the card also carries a header or a footer; a card that carries neither needs no body, because all of it is one.",
  examples: ["[[body {\nOne resolve call, every service it can find.\n}]]"],
  allowedContextMask: PORTAL_ONLY,
  params: [],
} as const satisfies ShortcodeDefinition;

/** What a card closes with, separated from its content as the header is. */
export const CARD_FOOTER_SHORTCODE = {
  token: ShortcodeToken.Footer,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Forbidden,
  placement: ShortcodePlacement.Block,
  body: ShortcodeBodyRule.OptionalMarkdown,
  label: "Card footer",
  description:
    "What a card closes with, standing below its content and separated from it. Write one line as text=, and anything longer between braces, where a row holding a note and a button also fits.",
  examples: [
    '[[footer text="Every plan includes it."]]',
    '[[footer {\n[[hstack spacing=20 {\nEvery plan includes it.\n[[spacer]]\n[[button action="/signup" label="Get an API key" icon="key"]]\n}]]\n}]]',
  ],
  allowedContextMask: PORTAL_ONLY,
  params: [
    {
      name: "text",
      type: ShortcodeParamType.String,
      defaultLabel: "what stands between the braces",
      label: "What the footer reads, where it is one line. Markdown",
    },
  ],
} as const satisfies ShortcodeDefinition;

/** Written out once, because it is both the documentation and the editor's example. */
const CARD_SECTIONED_EXAMPLE = [
  "[[card",
  '  [[header text="## What you get" icon="task-square"]]',
  "  [[body {",
  "    One resolve call, every service it can find.",
  "  }]]",
  '  [[footer text="Every plan includes it."]]',
  "]]",
].join("\n");

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
    "A card, taking the full width of the column it stands in. Written with braces it holds ordinary Markdown: headings, paragraphs, lists, code, any other shortcode, a row of cards, and another card. Written without them it holds its own parts instead, in whatever order suits the writing, and the card decides where each goes.",
  examples: ["[[card {\n## What you get\n\nOne resolve call, every service it can find.\n}]]", CARD_SECTIONED_EXAMPLE],
  allowedContextMask: PORTAL_ONLY,
  params: [],
  children: [CARD_HEADER_SHORTCODE, CARD_BODY_SHORTCODE, CARD_FOOTER_SHORTCODE],
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
      max: MAX_CONTAINER_SPACING,
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
