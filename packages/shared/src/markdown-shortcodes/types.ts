/**
 * @file The vocabulary every shortcode definition is written in.
 *
 * A shortcode is declared once, here in the shape these types describe, and
 * everything else reads that declaration: the renderer that turns it into
 * HTML, the editor that colours it whilst somebody types, and the reference
 * panel that tells them what it takes. Anything a writer needs to know about a
 * shortcode therefore has exactly one place to be, and adding one cannot leave
 * the help behind.
 */

import type { ContentContextMask } from "../content-context.js";

/**
 * How a shortcode is written into a page.
 *
 * Two notations, because the two things they mark are different shapes.
 * `Bracket` covers everything with a token and attributes, and carries its
 * content between braces where it has any. `Braces` is the shortest inline
 * form, for a single word that is set differently rather than for something
 * with parameters.
 */
export const ShortcodeSyntax = {
  /** `[[token:target attribute=value]]`, optionally with a body in braces. */
  Bracket: "Bracket",
  /** `{{content}}`, inline. */
  Braces: "Braces",
} as const;

/** One of the notations in {@link ShortcodeSyntax}. */
export type ShortcodeSyntaxValue = (typeof ShortcodeSyntax)[keyof typeof ShortcodeSyntax];

/** Whether a shortcode becomes markup on the server or a component in the browser. */
export const ShortcodeRenderMode = {
  /** Rendered to HTML where the page is built. */
  Html: "Html",
  /** Hydrated in place, for the few that a reader interacts with. */
  Island: "Island",
} as const;

/** One of the modes in {@link ShortcodeRenderMode}. */
export type ShortcodeRenderModeValue = (typeof ShortcodeRenderMode)[keyof typeof ShortcodeRenderMode];

/** Whether a shortcode stands in a line of text or on lines of its own. */
export const ShortcodePlacement = {
  Inline: "Inline",
  Block: "Block",
} as const;

/** One of the placements in {@link ShortcodePlacement}. */
export type ShortcodePlacementValue = (typeof ShortcodePlacement)[keyof typeof ShortcodePlacement];

/** Whether a shortcode takes the value written after its colon. */
export const ShortcodeTargetRule = {
  Required: "Required",
  Optional: "Optional",
  Forbidden: "Forbidden",
} as const;

/** One of the rules in {@link ShortcodeTargetRule}. */
export type ShortcodeTargetRuleValue = (typeof ShortcodeTargetRule)[keyof typeof ShortcodeTargetRule];

/**
 * Whether a shortcode carries content between braces.
 *
 * `Markdown` makes it a container: what stands inside is page content and is
 * rendered exactly as the page around it, so any markup and any other
 * shortcode may stand there, including another container. `Forbidden` is
 * everything else, which draws one thing from its attributes alone.
 *
 * `OptionalMarkdown` is for the parts of a card, where one line is the common
 * case and a paragraph is the occasional one. Such a part reads its `text`
 * attribute where it carries no braces, so a footer holding a sentence is
 * written as one line rather than as three.
 *
 * `Children` is for a container that holds named parts and nothing else, such
 * as a fields list holding its entries. It carries no braces at all, because
 * there is no page content in it to put between them.
 */
export const ShortcodeBodyRule = {
  Forbidden: "Forbidden",
  Markdown: "Markdown",
  OptionalMarkdown: "OptionalMarkdown",
  Children: "Children",
} as const;

/** One of the rules in {@link ShortcodeBodyRule}. */
export type ShortcodeBodyRuleValue = (typeof ShortcodeBodyRule)[keyof typeof ShortcodeBodyRule];

/** What kind of value a parameter takes. */
export const ShortcodeParamType = {
  Boolean: "Boolean",
  Enum: "Enum",
  Integer: "Integer",
  String: "String",
} as const;

/** One of the types in {@link ShortcodeParamType}. */
export type ShortcodeParamTypeValue = (typeof ShortcodeParamType)[keyof typeof ShortcodeParamType];

/** A parameter's value once the parser has read it against its definition. */
export type ShortcodeParamValue = boolean | number | string;

/**
 * One parameter a shortcode accepts.
 *
 * @property name - What the attribute is called, as it is written.
 * @property type - Which of {@link ShortcodeParamType} the value is read as.
 * @property aliases - Other spellings that reach the same parameter, for the
 *   ones whose name has an obvious second form.
 * @property defaultValue - What the parser supplies when the attribute is left
 *   out. Mutually exclusive with `defaultLabel`.
 * @property defaultLabel - What holds when it is left out, where that is not a
 *   value the parser can supply. Some defaults are decided further down, by the
 *   renderer or by the stylesheet, and naming the figure here would state it
 *   twice. What goes in is either a sentence or the custom property carrying
 *   the value, written as `var(--token)`, which the reference resolves against
 *   the page so it shows the figure without holding a copy of it.
 * @property label - The parameter's name in the words an editor would use.
 * @property min - Lowest accepted value, for an integer.
 * @property max - Highest accepted value, for an integer.
 * @property required - Whether leaving it out is an error.
 * @property values - The names an enum accepts.
 */
export interface ShortcodeParamDefinition {
  name: string;
  type: ShortcodeParamTypeValue;
  aliases?: readonly string[];
  defaultValue?: ShortcodeParamValue;
  defaultLabel?: string;
  label?: string;
  min?: number;
  max?: number;
  required?: boolean;
  values?: readonly string[];
}

/**
 * A table shown in the editor's reference under a shortcode's parameters.
 *
 * For the few whose accepted values are easier to look up than to describe. A
 * sentence naming all of them is one nobody reads twice.
 *
 * @property caption - What the table answers, shown above it.
 * @property columns - The headings, left to right.
 * @property rows - One entry per row, each holding as many cells as there are
 *   columns.
 */
export interface ShortcodeTable {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}

/**
 * One shortcode, declared once.
 *
 * @property token - What follows `[[`, or the whole content for the braces
 *   form.
 * @property syntax - Which of {@link ShortcodeSyntax} it is written in.
 * @property renderMode - Whether it becomes markup or a hydrated component.
 * @property target - Whether it takes the value after its colon.
 * @property placement - Whether it stands in a line or on lines of its own.
 * @property label - Its name in the words an editor would use.
 * @property description - What it does, in one or two sentences.
 * @property examples - Working examples, each one a writer can copy and use.
 * @property params - Every attribute it accepts.
 * @property allowedContextMask - Which content contexts it may be used in. A
 *   page in one context cannot reach a shortcode that belongs to the other, so
 *   this is what keeps the portal's vocabulary and the site's apart where they
 *   differ.
 * @property body - Whether it carries content between braces. Absent means
 *   {@link ShortcodeBodyRule.Forbidden}.
 * @property tables - Value tables shown under the parameter list.
 * @property children - Shortcodes that may appear inside this one. A child
 *   token is resolved against this list rather than against the document's, so
 *   a name can mean something in one place and nothing at the top level.
 */
export interface ShortcodeDefinition {
  token: string;
  syntax: ShortcodeSyntaxValue;
  renderMode: ShortcodeRenderModeValue;
  target: ShortcodeTargetRuleValue;
  placement: ShortcodePlacementValue;
  label: string;
  description: string;
  examples: readonly string[];
  params: readonly ShortcodeParamDefinition[];
  allowedContextMask: ContentContextMask;
  body?: ShortcodeBodyRuleValue;
  tables?: readonly ShortcodeTable[];
  children?: readonly ShortcodeDefinition[];
}
