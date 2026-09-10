/**
 * @file The button shortcode.
 *
 * Markdown writes a link, and a link is the right thing for a word inside a
 * sentence. A page's call to action is not that: it is a target big enough to
 * hit, set apart from the text, and it usually carries a symbol. That is what
 * this is for, and it is the reason a page cannot be written without it.
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
 * Buttons belong to the portal.
 *
 * The portal's stylesheet draws `button` and its two treatments, and the site
 * draws its commands as its own components, so a button written into a page
 * there would render as a bare link.
 */
const PORTAL_ONLY = ContentContext.DeveloperPortal;

/** How loudly a button asks to be pressed. */
export const ButtonTone = {
  /** The action the page is for, in the accent colour. */
  Accent: "accent",
  /** Everything else, in the surface's own neutrals. */
  Neutral: "neutral",
} as const;

/** One of the tones in {@link ButtonTone}. */
export type ButtonToneValue = (typeof ButtonTone)[keyof typeof ButtonTone];

/** How a button reads when the page says nothing. */
export const BUTTON_DEFAULT_TONE = ButtonTone.Accent;

/** A command on a page: a label, where it goes, and usually a symbol. */
export const BUTTON_SHORTCODE = {
  token: ShortcodeToken.Button,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Forbidden,
  placement: ShortcodePlacement.Inline,
  label: "Button",
  description:
    "A command rather than a link: a target big enough to hit, set apart from the text around it. action is where it goes, either a path on this site or a full https address. Put two beside each other by writing each on its own line inside an hstack.",
  examples: [
    '[[button action="/signup" label="Get an API key" icon="key"]]',
    '[[button action="/docs" label="Read the docs" icon="book-open" tone="neutral"]]',
    '[[hstack spacing=12 {\n[[button action="/signup" label="Get an API key" icon="key"]]\n[[button action="/docs" label="Read the docs" tone="neutral"]]\n}]]',
  ],
  allowedContextMask: PORTAL_ONLY,
  params: [
    {
      name: "action",
      type: ShortcodeParamType.String,
      required: true,
      label: "Where it goes: a path on this site, or a full https address",
    },
    {
      name: "label",
      type: ShortcodeParamType.String,
      required: true,
      label: "What the button reads",
    },
    {
      name: "icon",
      type: ShortcodeParamType.String,
      defaultLabel: "no symbol, only the label",
      label: "A symbol before the label, named as the icon shortcode names one",
    },
    {
      name: "tone",
      type: ShortcodeParamType.Enum,
      values: Object.values(ButtonTone),
      defaultValue: BUTTON_DEFAULT_TONE,
      label: "How loudly it asks to be pressed",
    },
  ],
  tables: [
    {
      caption: "tone: which of the two treatments a button takes",
      columns: ["tone", "Use it for"],
      rows: [
        [ButtonTone.Accent, "the action the page is for, and only one of them per page"],
        [ButtonTone.Neutral, "everything beside it"],
      ],
    },
  ],
} as const satisfies ShortcodeDefinition;
