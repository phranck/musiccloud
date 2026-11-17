/**
 * @file The ISO 11649 creditor reference.
 *
 * A transfer carries either a sentence or a reference, never both. The
 * reference is the half that survives the journey: the GiroCode marks it as not
 * to be altered by the payer, and its two check digits say on arrival whether
 * it came through intact.
 */

import { checkDigitsHold } from "./iso7064.js";

/** A finished reference, upper-cased: `RF`, two check digits and 1 to 21 letters or digits. */
const REFERENCE_PATTERN = /^RF[0-9]{2}[A-Z0-9]{1,21}$/;

/**
 * Says whether a reference is well formed and undamaged.
 *
 * Case carries no meaning, because ISO/IEC 7064 reads `a` and `A` alike, so a
 * reference a banking app lower-cased still holds.
 *
 * @param reference - The reference as written, spaces and any case allowed.
 * @returns `true` when the shape and the check digits both hold.
 */
export function isValidCreditorReference(reference: string): boolean {
  const compact = reference.replace(/\s+/g, "").toUpperCase();
  return REFERENCE_PATTERN.test(compact) && checkDigitsHold(compact);
}
