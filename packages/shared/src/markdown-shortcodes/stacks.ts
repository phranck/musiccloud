/**
 * @file The shortcodes that stand content beside or beneath other content.
 *
 * A card says where a block of content sits on the page. These say how the
 * pieces inside it are arranged, which Markdown has no way of expressing: two
 * paragraphs are always one above the other, and a symbol beside its sentence
 * is not something the syntax can ask for.
 *
 * The names are SwiftUI's, because the arrangement is the same one and a second
 * vocabulary for it would have to be learnt for nothing.
 */

import { ContentContext } from "../content-context.js";
import { MAX_CONTAINER_SPACING } from "./layout.js";
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
 * Stacks belong to the portal, for the same reason cards do.
 *
 * The arrangement is drawn by the portal's editorial stylesheet, and the site's
 * content surfaces have no such rules, so a stack written into a page there
 * would render as a plain sequence of blocks.
 */
const PORTAL_ONLY = ContentContext.DeveloperPortal;

/**
 * The custom property carrying the gap between the children of a stack.
 *
 * The figure lives in the stylesheet, where the page's spacing is decided.
 * Naming the property rather than the number is what keeps this from becoming a
 * second answer that drifts, and the editor's reference resolves it against the
 * page so a writer still sees the figure.
 */
export const STACK_DEFAULT_SPACING_TOKEN = "var(--mc-space-3)";

/** The largest fixed spacer a page may ask for. */
export const MAX_SPACER_SIZE = 400;

/** Where the children of a vertical stack stand, across the column. */
export const VStackAlignment = {
  Leading: "leading",
  Center: "center",
  Trailing: "trailing",
} as const;

/** One of the alignments in {@link VStackAlignment}. */
export type VStackAlignmentValue = (typeof VStackAlignment)[keyof typeof VStackAlignment];

/** How a vertical stack arranges its children when the page names nothing. */
export const VSTACK_DEFAULT_ALIGNMENT = VStackAlignment.Leading;

/** Where the children of a horizontal stack stand, down the row. */
export const HStackAlignment = {
  Top: "top",
  Center: "center",
  Bottom: "bottom",
  FirstTextBaseline: "firstTextBaseline",
} as const;

/** One of the alignments in {@link HStackAlignment}. */
export type HStackAlignmentValue = (typeof HStackAlignment)[keyof typeof HStackAlignment];

/** How a horizontal stack arranges its children when the page names nothing. */
export const HSTACK_DEFAULT_ALIGNMENT = HStackAlignment.Center;

/** Written out once, because it is both the documentation and the editor's example. */
const STACK_EXAMPLE = [
  '[[vstack alignment="leading" spacing=12 {',
  "## What you get",
  "",
  "Ordinary **Markdown**, and everything else besides.",
  "",
  '[[hstack alignment="center" spacing=8 {',
  '[[icon name="key" size=24]]',
  "A symbol and its sentence, side by side.",
  "}]]",
  "}]]",
].join("\n");

/** A container standing its children one beneath the other, as SwiftUI's VStack does. */
export const VSTACK_SHORTCODE = {
  token: ShortcodeToken.VStack,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Forbidden,
  placement: ShortcodePlacement.Block,
  body: ShortcodeBodyRule.Markdown,
  label: "VStack",
  description:
    "Stands its content one piece beneath the next, as a VStack does in SwiftUI. What you write between the braces is ordinary Markdown: headings, paragraphs, images, any other shortcode, and another stack. alignment places the children across the column and lines up the text in them at the same time, spacing sets the gap between them in pixels.",
  examples: [STACK_EXAMPLE],
  allowedContextMask: PORTAL_ONLY,
  params: [
    {
      name: "alignment",
      type: ShortcodeParamType.Enum,
      values: Object.values(VStackAlignment),
      defaultValue: VSTACK_DEFAULT_ALIGNMENT,
      label: "Where the children stand across the column. Lines up the text in them too",
    },
    {
      name: "spacing",
      type: ShortcodeParamType.Integer,
      min: 0,
      max: MAX_CONTAINER_SPACING,
      defaultLabel: STACK_DEFAULT_SPACING_TOKEN,
      label: "Gap between the children, in pixels",
    },
  ],
  tables: [
    {
      caption: "alignment: where the children of a VStack stand",
      columns: ["alignment", "Children stand", "Text in them"],
      rows: [
        [VStackAlignment.Leading, "against the left edge", "ranged left"],
        [VStackAlignment.Center, "in the middle", "centred"],
        [VStackAlignment.Trailing, "against the right edge", "ranged right"],
      ],
    },
  ],
} as const satisfies ShortcodeDefinition;

/** A container standing its children side by side, as SwiftUI's HStack does. */
export const HSTACK_SHORTCODE = {
  token: ShortcodeToken.HStack,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Forbidden,
  placement: ShortcodePlacement.Block,
  body: ShortcodeBodyRule.Markdown,
  label: "HStack",
  description:
    "Stands its content side by side, as an HStack does in SwiftUI. The content is the same as a VStack takes, so Markdown with shortcodes and further stacks. Every paragraph and every element becomes a column. When it gets too narrow the columns drop onto the next line instead of running off the page.",
  examples: ['[[hstack alignment="center" spacing=16 {\n[[icon name="key" size=32]]\nA symbol and its sentence.\n}]]'],
  allowedContextMask: PORTAL_ONLY,
  params: [
    {
      name: "alignment",
      type: ShortcodeParamType.Enum,
      values: Object.values(HStackAlignment),
      defaultValue: HSTACK_DEFAULT_ALIGNMENT,
      label: "Where the children stand down the row",
    },
    {
      name: "spacing",
      type: ShortcodeParamType.Integer,
      min: 0,
      max: MAX_CONTAINER_SPACING,
      defaultLabel: STACK_DEFAULT_SPACING_TOKEN,
      label: "Gap between the children, in pixels",
    },
  ],
  tables: [
    {
      caption: "alignment: where the children of an HStack stand",
      columns: ["alignment", "Children stand"],
      rows: [
        [HStackAlignment.Top, "flush with the top"],
        [HStackAlignment.Center, "halfway down"],
        [HStackAlignment.Bottom, "flush with the bottom"],
        [HStackAlignment.FirstTextBaseline, "on the baseline of their first line"],
      ],
    },
  ],
} as const satisfies ShortcodeDefinition;

/** A gap between two children of a stack, as SwiftUI's Spacer is. */
export const SPACER_SHORTCODE = {
  token: ShortcodeToken.Spacer,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Forbidden,
  placement: ShortcodePlacement.Block,
  label: "Spacer",
  description:
    "A gap, as a Spacer is in SwiftUI. With size it is exactly that tall or wide; without one it takes whatever room is left, so in an HStack it pushes its neighbours apart and in a VStack it does nothing unless the stack has a height of its own. Useful where one place wants more air than the stack's spacing gives it.",
  examples: ["[[spacer size=24]]", "[[hstack {\nleft\n[[spacer]]\nright\n}]]"],
  allowedContextMask: PORTAL_ONLY,
  params: [
    {
      name: "size",
      type: ShortcodeParamType.Integer,
      min: 0,
      max: MAX_SPACER_SIZE,
      defaultLabel: "as much room as is left",
      label: "Height or width in pixels, whichever way the stack runs",
    },
  ],
} as const satisfies ShortcodeDefinition;
