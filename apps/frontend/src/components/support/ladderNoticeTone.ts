/**
 * @file The tones a `LadderNotice` is drawn in, apart from the component so the
 * component file exports components only.
 */

/**
 * What a notice tells the reader, which decides its mark and its colors.
 *
 * - `Info`: something to read before acting, such as a tab's notice. The default.
 * - `Success`: something that has already happened, such as a payment reference
 *   being ready.
 */
export const LadderNoticeTone = {
  Info: "info",
  Success: "success",
} as const;

/** One of the tones in {@link LadderNoticeTone}. */
export type LadderNoticeToneValue = (typeof LadderNoticeTone)[keyof typeof LadderNoticeTone];
