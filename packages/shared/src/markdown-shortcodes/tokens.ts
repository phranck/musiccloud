/**
 * @file The token of every shortcode a page may use.
 *
 * Named here rather than written into each definition, so a definition and the
 * code that looks it up cannot spell the same shortcode two ways.
 */

/** What follows `[[`, per shortcode. */
export const ShortcodeToken = {
  /** One card, holding whatever a page holds. */
  Card: "card",
  /** A row of cards, side by side. */
  Cards: "cards",
  /** A label-and-value list, as a definition list. */
  Fields: "fields",
  /** One entry of such a list. */
  Field: "field",
  /** What a card says it is, above its content. */
  Header: "header",
  /** A card's own content. */
  Body: "body",
  /** What a card closes with. */
  Footer: "footer",
  /** A short word set apart from the text around it. */
  Pill: "pill",
  /** A key on a keyboard. */
  Kbd: "kbd",
  /** The live plan list. */
  Plans: "plans",
  /** A command on a page, with its label and its symbol. */
  Button: "button",
  /** A Phosphor symbol, in the text or beside its caption. */
  Icon: "icon",
  /** A container standing its children one beneath the next. */
  VStack: "vstack",
  /** A container standing its children side by side. */
  HStack: "hstack",
  /** A gap between two children of a stack. */
  Spacer: "spacer",
  /** A picture, with its optional caption. */
  Image: "image",
  /** A PDF, linked as a card. */
  Pdf: "pdf",
  /** An embedded YouTube video. */
  YouTube: "youtube",
} as const;

/** One of the tokens in {@link ShortcodeToken}. */
export type ShortcodeTokenValue = (typeof ShortcodeToken)[keyof typeof ShortcodeToken];
