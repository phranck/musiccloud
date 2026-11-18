/**
 * @file The type sizes of the support ladder and the sponsor wall.
 *
 * Both stand on a content page beside the page's own text, so they read at the
 * page's size rather than at the size of a control. Each role is one class
 * literal here, so every component names the role and the sizes change in one
 * place. The floors are 17px for text, 15px for labels and 13px for the
 * smallest print.
 */

/** Text to read, such as a tab's description or a card's explanation: 18px (`text-lg`), dimmed. */
export const SUPPORT_TEXT_CLASS = "text-lg text-text-secondary";

/** The size of {@link SUPPORT_TEXT_CLASS} alone, for text whose color a tone decides: 18px (`text-lg`). */
export const SUPPORT_TEXT_SIZE_CLASS = "text-lg";

/** A label or a button's caption: 16px (`text-base`), semibold, in the primary color. */
export const SUPPORT_LABEL_CLASS = "text-base font-semibold text-text-primary";

/** What qualifies a figure, such as "per month" after an amount: 16px (`text-base`), medium, dimmed. */
export const SUPPORT_QUALIFIER_CLASS = "text-base font-medium text-text-secondary";

/** A card's title: 20px (`text-xl`), semibold, in the primary color. */
export const SUPPORT_CARD_TITLE_CLASS = "text-xl font-semibold text-text-primary";

/** The smallest print, such as a character counter or a note under a field: 14px (`text-sm`). */
export const SUPPORT_SMALL_PRINT_CLASS = "text-sm";
