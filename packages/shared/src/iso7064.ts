/**
 * @file The modulus 97 check of ISO/IEC 7064, which both an IBAN (ISO 13616)
 * and a creditor reference (ISO 11649) carry.
 *
 * Both checks move their first four characters to the end, read every letter
 * as a two-digit number and take the remainder modulo 97. A sound value leaves
 * {@link ISO7064_VALID_REMAINDER}. One implementation serves both, so the two
 * checks cannot drift apart.
 */

/** The modulus of the check: 97. */
const MODULUS = 97;

/** The remainder a sound IBAN or creditor reference leaves: 1. */
export const ISO7064_VALID_REMAINDER = 1;

/** Characters the check moves from the front to the end before computing: 4. */
const ROTATION = 4;

/** What the letter `A` stands for, where `A` is 10 and `Z` is 35. */
const LETTER_OFFSET = 10;

/** Character code of `A`, which the letter values are counted from. */
const CHAR_CODE_A = 65;

/** The base each digit is shifted by while the remainder is taken: 10. */
const DECIMAL_BASE = 10;

/**
 * Takes the remainder modulo 97 of a value written in letters and digits.
 *
 * Each letter stands for a two-digit number, so the number is far too large
 * for a JavaScript number, and the remainder is taken digit by digit instead.
 * Case carries no meaning, because ISO/IEC 7064 reads `a` and `A` alike.
 *
 * @param value - Letters and digits, with no separators.
 * @returns The remainder, 0 to 96.
 */
export function iso7064Mod97(value: string): number {
  let remainder = 0;
  for (const character of value.toUpperCase()) {
    const digits = /[A-Z]/.test(character) ? String(character.charCodeAt(0) - CHAR_CODE_A + LETTER_OFFSET) : character;
    for (const digit of digits) {
      remainder = (remainder * DECIMAL_BASE + Number(digit)) % MODULUS;
    }
  }
  return remainder;
}

/**
 * Checks the two check digits of a value that carries them in its third and
 * fourth characters, as an IBAN and a creditor reference both do.
 *
 * @param value - The value without spaces, already matched against its own
 *   pattern by the caller.
 * @returns `true` when the check digits hold.
 */
export function checkDigitsHold(value: string): boolean {
  const rotated = value.slice(ROTATION) + value.slice(0, ROTATION);
  return iso7064Mod97(rotated) === ISO7064_VALID_REMAINDER;
}
