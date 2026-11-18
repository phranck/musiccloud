/**
 * @file The type sizes of the support ladder and the sponsor wall.
 *
 * Both stand on a content page beside the page's own text, so they read at the
 * page's size rather than at the size of a control. Each role is one class
 * literal here, so every component names the role and the sizes change in one
 * place. The sizes follow lmaa.space wherever lmaa stays above the floors of
 * 17px for text, 15px for labels and 13px for the smallest print; where lmaa
 * sets text smaller, such as 15.75px inside its cards, the text floor holds.
 */

/**
 * Text to read, such as a tab's description or a card's explanation: 18px
 * (`text-lg`), in the card text color `--mc-text-card` from `global.css`,
 * `#eeeeee` by day and at night.
 */
export const SUPPORT_TEXT_CLASS = "text-lg text-[var(--mc-text-card)]";

/** The size of {@link SUPPORT_TEXT_CLASS} alone, for text whose color a tone decides: 18px (`text-lg`). */
export const SUPPORT_TEXT_SIZE_CLASS = "text-lg";

/** A label or a button's caption: 16px (`text-base`), semibold, in the primary color. */
export const SUPPORT_LABEL_CLASS = "text-base font-semibold text-text-primary";

/** What qualifies a figure, such as "per month" after an amount: 16px (`text-base`), medium, dimmed. */
export const SUPPORT_QUALIFIER_CLASS = "text-base font-medium text-text-secondary";

/** A card's title: 24px (`text-2xl`), as lmaa.space sets it, semibold, in the primary color. */
export const SUPPORT_CARD_TITLE_CLASS = "text-2xl font-semibold text-text-primary";

/** A suggested amount's figure: 22.5px, as lmaa.space sets it, bold, in the primary color. */
export const SUPPORT_FIGURE_CLASS = "text-[22.5px] leading-none font-bold tabular-nums text-text-primary";

/** The smallest print, such as a character counter or a note under a field: 14px (`text-sm`). */
export const SUPPORT_SMALL_PRINT_CLASS = "text-sm";

/**
 * The size of a button of the ladder and the wall, as lmaa.space sets its
 * buttons: 40.5px high (`--mc-support-step-9`) with 18px on either side
 * (`--mc-support-step-4`), from the spacing scale in `global.css`.
 */
export const SUPPORT_BUTTON_SIZE_CLASS = "h-[var(--mc-support-step-9)] px-[var(--mc-support-step-4)] py-0";

/**
 * A tab of the ladder's switch, as lmaa.space sets its tabs: 36px high (`h-9`)
 * with 18px on either side (`--mc-support-step-4`). The caption keeps the
 * size the site's button text level gives it, 15px.
 */
export const SUPPORT_TAB_CELL_CLASS = "h-9 py-0 px-[var(--mc-support-step-4)]";
