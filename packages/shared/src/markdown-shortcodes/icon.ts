/**
 * @file The symbol shortcode, and the two alignments it reads.
 *
 * A page draws its symbols from Phosphor, always in the duotone weight, because
 * that is the weight the rest of the product is drawn in and a page that mixed
 * two would look like two products.
 *
 * The two alignments are kept apart on purpose. `alignment` is only ever about
 * the symbol and `textalignment` only ever about the text, so centring a symbol
 * that carries no text does not mean reaching for the text's alignment to do
 * it.
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

/**
 * Symbols belong to the portal, for the same reason cards and stacks do: the
 * rules that place one against its text live in the portal's editorial
 * stylesheet and nowhere else.
 */
const PORTAL_ONLY = ContentContext.DeveloperPortal;

/**
 * The edge length a symbol takes when the page names none.
 *
 * Stated here rather than in the renderer, so the reference and the page cannot
 * disagree about what a plain `[[icon]]` measures.
 */
export const ICON_DEFAULT_SIZE = 24;

/** The largest symbol a page may ask for. */
export const MAX_ICON_SIZE = 512;

/** Where the symbol itself stands, across the column. */
export const IconAlignment = {
  Leading: "leading",
  Center: "center",
  Trailing: "trailing",
} as const;

/** One of the alignments in {@link IconAlignment}. */
export type IconAlignmentValue = (typeof IconAlignment)[keyof typeof IconAlignment];

/**
 * Where the text sits against the symbol, under the names SwiftUI gives them.
 *
 * The renderer also reads them with a leading dot, in lower case and with a
 * hyphen, so `.topLeading`, `topleading` and `top-leading` all arrive as the
 * same alignment.
 */
export const IconTextAlignment = {
  Top: "top",
  Bottom: "bottom",
  Leading: "leading",
  Trailing: "trailing",
  Center: "center",
  TopLeading: "topLeading",
  TopTrailing: "topTrailing",
  BottomLeading: "bottomLeading",
  BottomTrailing: "bottomTrailing",
} as const;

/** One of the alignments in {@link IconTextAlignment}. */
export type IconTextAlignmentValue = (typeof IconTextAlignment)[keyof typeof IconTextAlignment];

/** Where a caption sits when the page names no text alignment. */
export const ICON_DEFAULT_TEXT_ALIGNMENT = IconTextAlignment.Trailing;

/** A Phosphor symbol in the running text, with its optional caption. */
export const ICON_SHORTCODE = {
  token: ShortcodeToken.Icon,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Forbidden,
  placement: ShortcodePlacement.Inline,
  label: "Symbol",
  description:
    "A Phosphor symbol in the text, always in the duotone weight. The name is the one Phosphor publishes, so x-circle rather than XCircle. alignment places the symbol and textalignment places the text: with text that is the caption beside it, without text it is the paragraph that follows, which then runs around the symbol.",
  examples: [
    '[[icon name="x-circle" size=96]]',
    '[[icon name="atom" size=96 alignment="center"]]',
    '[[icon name="key" size=96 text="## One key, every service" textalignment="trailing"]]',
    '[[icon name="key" size=96 textalignment="trailing"]]',
  ],
  allowedContextMask: PORTAL_ONLY,
  params: [
    {
      name: "name",
      type: ShortcodeParamType.String,
      required: true,
      label: "Name of the symbol, spelt as Phosphor publishes it",
    },
    {
      name: "size",
      type: ShortcodeParamType.Integer,
      min: 1,
      max: MAX_ICON_SIZE,
      defaultValue: ICON_DEFAULT_SIZE,
      label: "Edge length in pixels",
    },
    {
      name: "color",
      type: ShortcodeParamType.String,
      defaultLabel: "the colour of the text around it",
      label: "Colour, as a hex value with or without the hash, as a colour name, or as var(--token)",
    },
    {
      name: "alignment",
      type: ShortcodeParamType.Enum,
      values: Object.values(IconAlignment),
      defaultLabel: "wherever the shortcode stands in the text",
      label: "Where the symbol itself stands",
    },
    {
      name: "text",
      type: ShortcodeParamType.String,
      defaultLabel: "no caption, and the paragraph that follows runs around the symbol",
      label: "Caption beside the symbol, as Markdown. Headings and paragraphs are allowed",
    },
    {
      name: "textalignment",
      aliases: ["textAlignment", "text-alignment"],
      type: ShortcodeParamType.Enum,
      values: Object.values(IconTextAlignment),
      defaultLabel: "with text as trailing, without text nothing runs around it",
      label:
        "Where the text sits, named as in SwiftUI. It always means the text rather than the symbol: trailing puts the text on the right and the symbol therefore on the left",
    },
  ],
  tables: [
    {
      caption: "alignment: where the symbol stands",
      columns: ["alignment", "Symbol"],
      rows: [
        [IconAlignment.Leading, "against the left edge"],
        [IconAlignment.Center, "in the middle"],
        [IconAlignment.Trailing, "against the right edge"],
        ["left out", "wherever the shortcode stands in the text"],
      ],
    },
    {
      caption: "textalignment with text: the caption against the symbol",
      columns: ["textalignment", "Text sits", "Across that"],
      rows: [
        [IconTextAlignment.Trailing, "right, symbol left", "halfway down"],
        [IconTextAlignment.Leading, "left, symbol right", "halfway down"],
        [IconTextAlignment.TopTrailing, "right, symbol left", "flush with the top"],
        [IconTextAlignment.TopLeading, "left, symbol right", "flush with the top"],
        [IconTextAlignment.BottomTrailing, "right, symbol left", "flush with the bottom"],
        [IconTextAlignment.BottomLeading, "left, symbol right", "flush with the bottom"],
        [IconTextAlignment.Top, "above, symbol below", "centred across"],
        [IconTextAlignment.Bottom, "below, symbol above", "centred across"],
        [IconTextAlignment.Center, "over the middle of the symbol", "one on top of the other"],
        ["left out", "as trailing", "halfway down"],
      ],
    },
    {
      caption: "textalignment without text: the paragraph that follows runs around the symbol",
      columns: ["textalignment", "Symbol", "Paragraph"],
      rows: [
        ["trailing, topTrailing, bottomTrailing", "left", "runs down the right of it"],
        ["leading, topLeading, bottomLeading", "right", "runs down the left of it"],
        ["top, bottom, center", "nothing runs around it, alignment decides", "stands beneath"],
        ["left out", "in the run of the text", "carries on"],
      ],
    },
  ],
} as const satisfies ShortcodeDefinition;
