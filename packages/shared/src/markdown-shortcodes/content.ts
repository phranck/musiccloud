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

/** How a fields list arranges its labels against their values. */
export const FieldsLayoutMode = {
  /** Labels in a column, values beside them. */
  Columns: "columns",
  /** Each label above its value, which is how a set of short statements reads. */
  Stacked: "stacked",
} as const;

/** One of the modes in {@link FieldsLayoutMode}. */
export type FieldsLayoutModeValue = (typeof FieldsLayoutMode)[keyof typeof FieldsLayoutMode];

/** How a fields list is arranged when it says nothing. */
export const FIELDS_DEFAULT_LAYOUT = FieldsLayoutMode.Columns;

/** How the label is set inside the column it stands in. */
export const FieldsAlignment = {
  /** Against the edge the text starts at, which is where a label is read from. */
  Leading: "leading",
  /** Against the values, which lines the two columns up where labels differ in length. */
  Trailing: "trailing",
} as const;

/** One of the alignments in {@link FieldsAlignment}. */
export type FieldsAlignmentValue = (typeof FieldsAlignment)[keyof typeof FieldsAlignment];

/** How a label is set when the list says nothing. */
export const FIELDS_DEFAULT_ALIGNMENT = FieldsAlignment.Leading;

/** The tone a pill takes when none is named. */
export const PILL_DEFAULT_TONE = "neutral";

/** How a pill's text is cased when nothing says otherwise. */
export const PILL_DEFAULT_CASE = "none";

/**
 * One entry of a fields list: a label, and what stands beside it.
 *
 * A child rather than a shortcode of its own, so it means something inside a
 * fields list and nothing at the top level of a page.
 *
 * Both halves are Markdown, which is the whole reason this is a container
 * rather than an attribute: a label may carry a link or a piece of code, and a
 * value may run to several sentences.
 */
export const FIELD_SHORTCODE = {
  token: ShortcodeToken.Field,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Forbidden,
  placement: ShortcodePlacement.Block,
  body: ShortcodeBodyRule.Markdown,
  label: "Field",
  description:
    "One entry of a fields list: the label, and between the braces what stands beside it. Both are Markdown, so a label may carry a piece of code and a value may run to more than a sentence.",
  examples: ['[[field label="Method" {\n`GET`\n}]]'],
  allowedContextMask: EVERY_CONTENT_CONTEXT,
  params: [
    {
      name: "label",
      type: ShortcodeParamType.String,
      required: true,
      label: "What the entry is called. Markdown",
    },
  ],
} as const satisfies ShortcodeDefinition;

/** Written out once, because it is both the documentation and the editor's example. */
const FIELDS_EXAMPLE = [
  "[[fields {",
  '[[field label="Method" {',
  "`GET`",
  "}]]",
  '[[field label="Path" {',
  "`/api/v1/resolve`",
  "}]]",
  '[[field label="Authentication" {',
  "Registration key",
  "}]]",
  "}]]",
].join("\n");

/**
 * A list of labels and their values, set as a definition list.
 *
 * The column widths are the only thing a writer sets, because everything else
 * about how it looks belongs to the stylesheet.
 */
export const FIELDS_SHORTCODE = {
  token: ShortcodeToken.Fields,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Forbidden,
  placement: ShortcodePlacement.Block,
  body: ShortcodeBodyRule.Markdown,
  label: "Fields",
  description:
    "A list of labels and the values beside them, as you would document an endpoint. Each entry is a field, and both its halves are Markdown. The labels line up in a column of their own, whose width and alignment the list decides.",
  examples: [
    FIELDS_EXAMPLE,
    '[[fields width=160 align="trailing" {\n[[field label="Name" {\nmusiccloud\n}]]\n[[field label="Licence" {\nMIT\n}]]\n}]]',
    '[[fields layout="stacked" {\n[[field label="The free plan stays free" {\nPaid plans will add capacity. They will not take away what you have today.\n}]]\n}]]',
  ],
  allowedContextMask: EVERY_CONTENT_CONTEXT,
  params: [
    {
      name: "layout",
      type: ShortcodeParamType.Enum,
      values: [FieldsLayoutMode.Columns, FieldsLayoutMode.Stacked],
      defaultValue: FIELDS_DEFAULT_LAYOUT,
      label: "Whether each value stands beside its label or underneath it",
    },
    {
      name: "width",
      aliases: ["labelWidth"],
      type: ShortcodeParamType.String,
      defaultValue: FIELDS_DEFAULT_LABEL_WIDTH,
      label: `Width of the label column: a bare figure is pixels, and a quoted "20%" is a share of the list. "${FIELDS_AUTO_LABEL_WIDTH}" sets it to the longest label, which is the default. Ignored when stacked`,
    },
    {
      name: "align",
      type: ShortcodeParamType.Enum,
      values: Object.values(FieldsAlignment),
      defaultValue: FIELDS_DEFAULT_ALIGNMENT,
      label: "How the label is set inside its column. Ignored when stacked, where a label starts the line",
    },
    {
      name: "gap",
      type: ShortcodeParamType.String,
      defaultValue: FIELDS_DEFAULT_GAP,
      label:
        "Gap between the labels and their values, as a CSS length. Ignored when stacked, where the spacing follows the reading",
    },
  ],
  children: [FIELD_SHORTCODE],
  tables: [
    {
      caption: "layout: how a list reads",
      columns: ["layout", "Use it for"],
      rows: [
        [FieldsLayoutMode.Columns, "labels and values that line up, such as an endpoint's method and path"],
        [FieldsLayoutMode.Stacked, "a statement and the sentence explaining it, where the value is prose"],
      ],
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
