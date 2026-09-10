/**
 * @file The shortcodes editorial content is written with.
 *
 * Three so far, all of them about setting a piece of text differently from the
 * prose around it. Layout shortcodes live beside these once they exist, in a
 * file of their own, so this one stays about content rather than about
 * arrangement.
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

/** Everything editorial content may use, on the site and in the portal alike. */
const EVERY_CONTENT_CONTEXT = ContentContext.Frontend | ContentContext.DeveloperPortal;

/**
 * Width of the label column when a fields list names none.
 *
 * `max-content` sets the column to the longest label, which is what keeps the
 * values aligned without anybody measuring them.
 */
export const FIELDS_DEFAULT_LABEL_WIDTH = "max-content";

/** The value that asks for {@link FIELDS_DEFAULT_LABEL_WIDTH} explicitly. */
export const FIELDS_AUTO_LABEL_WIDTH = "auto";

/** Gap between the label column and the value column when none is named. */
export const FIELDS_DEFAULT_GAP = "1.1rem";

/** The tone a pill takes when none is named. */
export const PILL_DEFAULT_TONE = "neutral";

/** How a pill's text is cased when nothing says otherwise. */
export const PILL_DEFAULT_CASE = "none";

/** Written out once, because it is both the documentation and the editor's example. */
const FIELDS_EXAMPLE = [
  ":::fields",
  "Method: `GET`",
  "Path: `/api/v1/resolve`",
  "Authentication: Registration key",
  ":::",
].join("\n");

/**
 * A list of labels and their values, set as a definition list.
 *
 * The column widths are the only thing a writer sets, because everything else
 * about how it looks belongs to the stylesheet.
 */
export const FIELDS_SHORTCODE = {
  token: ShortcodeToken.Fields,
  syntax: ShortcodeSyntax.Fence,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Forbidden,
  placement: ShortcodePlacement.Block,
  body: ShortcodeBodyRule.Markdown,
  label: "Fields",
  description:
    "A list of labels and the values beside them, as you would document an endpoint. Each line is written as `Label: value`, and the value is ordinary Markdown, so a link or a piece of code works there. The labels line up in a column of their own.",
  examples: [FIELDS_EXAMPLE, ":::fields labelWidth=8rem gap=2rem\nName: musiccloud\nLicence: MIT\n:::"],
  allowedContextMask: EVERY_CONTENT_CONTEXT,
  params: [
    {
      name: "labelWidth",
      type: ShortcodeParamType.String,
      defaultValue: FIELDS_DEFAULT_LABEL_WIDTH,
      label: `Width of the label column, as a CSS length. "${FIELDS_AUTO_LABEL_WIDTH}" is the default written out`,
    },
    {
      name: "gap",
      type: ShortcodeParamType.String,
      defaultValue: FIELDS_DEFAULT_GAP,
      label: "Gap between the labels and their values, as a CSS length",
    },
  ],
} as const satisfies ShortcodeDefinition;

/**
 * A short word set apart from the text around it.
 *
 * The tone says what kind of thing it marks, and the stylesheet decides what
 * each tone looks like, so a page never names a colour.
 */
export const PILL_SHORTCODE = {
  token: ShortcodeToken.Pill,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Required,
  placement: ShortcodePlacement.Inline,
  label: "Pill",
  description:
    "A short word set apart from the sentence it stands in, for a status, a version or a label. What follows the colon is the text. The tone says what kind of thing it is, and the stylesheet decides what that looks like.",
  examples: ["[[pill:Beta]]", "[[pill:Deprecated tone=alert case=upper]]", "[[pill:Stable tone=success]]"],
  allowedContextMask: EVERY_CONTENT_CONTEXT,
  params: [
    {
      name: "tone",
      type: ShortcodeParamType.Enum,
      values: ["alert", "info", "neutral", "success"],
      defaultValue: PILL_DEFAULT_TONE,
      label: "What kind of thing the pill marks",
    },
    {
      name: "case",
      type: ShortcodeParamType.Enum,
      values: ["none", "upper", "lower"],
      defaultValue: PILL_DEFAULT_CASE,
      label: "How the text is cased, leaving what you typed alone by default",
    },
  ],
  tables: [
    {
      caption: "tone: what a pill says about the thing it marks",
      columns: ["tone", "Use it for"],
      rows: [
        ["neutral", "a plain label, which is the default"],
        ["info", "something worth noticing, such as a version"],
        ["success", "something available and working"],
        ["alert", "something removed, deprecated or broken"],
      ],
    },
  ],
} as const satisfies ShortcodeDefinition;

/**
 * A key on a keyboard.
 *
 * The shortest notation of the three, because it takes nothing but the key
 * itself and appears in the middle of a sentence.
 */
export const KBD_SHORTCODE = {
  token: ShortcodeToken.Kbd,
  syntax: ShortcodeSyntax.Braces,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Required,
  placement: ShortcodePlacement.Inline,
  label: "Key",
  description:
    "A key on a keyboard, set as one. Write the key between double braces, exactly as it is printed on the keycap.",
  examples: ["Press {{Esc}} to close the dialog.", "{{Cmd}} + {{K}} opens the search."],
  allowedContextMask: EVERY_CONTENT_CONTEXT,
  params: [],
} as const satisfies ShortcodeDefinition;
