/**
 * @file The token of every shortcode a page may use.
 *
 * Named here rather than written into each definition, so a definition and the
 * code that looks it up cannot spell the same shortcode two ways.
 */

/** What follows `[[` or `:::`, per shortcode. */
export const ShortcodeToken = {
  /** One card, holding whatever a page holds. */
  Card: "card",
  /** A row of cards, side by side. */
  Cards: "cards",
  /** A label-and-value list, as a definition list. */
  Fields: "fields",
  /** A short word set apart from the text around it. */
  Pill: "pill",
  /** A key on a keyboard. */
  Kbd: "kbd",
  /** The live plan list. */
  Plans: "plans",
} as const;

/** One of the tokens in {@link ShortcodeToken}. */
export type ShortcodeTokenValue = (typeof ShortcodeToken)[keyof typeof ShortcodeToken];
