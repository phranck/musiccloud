/**
 * @file The ISO 11649 creditor reference.
 *
 * A transfer carries either a sentence or a reference, never both. The
 * reference is the half that survives the journey: the GiroCode marks it as not
 * to be altered by the payer, and its two check digits say on arrival whether
 * it came through intact.
 *
 * Checking it is musiccloud's own; issuing, normalizing and printing one are
 * ported from lmaa.space (`packages/shared/src/utils/creditor-reference.ts`) on
 * top of the same modulus 97 in `iso7064.ts`.
 */

import { checkDigitsHold, iso7064Mod97 } from "./iso7064.js";

/** A finished reference, upper-cased: `RF`, two check digits and 1 to 21 letters or digits. */
const REFERENCE_PATTERN = /^RF[0-9]{2}[A-Z0-9]{1,21}$/;

/** Only letters and digits, with no separator or punctuation between them. */
const BODY_PATTERN = /^[A-Za-z0-9]+$/;

/** What follows `RF` and the two check digits, at most, per ISO 11649 clause 5: 21. */
export const MAX_CREDITOR_REFERENCE_BODY = 21;

/**
 * The characters a drawn reference body is made of: 32 of them.
 *
 * Upper case only, because ISO/IEC 7064 reads `a` and `A` alike and a reference
 * a bank upper-cased must still match the row it was issued for. `I`, `L`, `O`
 * and `U` are left out, because somebody types this into a banking app and reads
 * it back off a statement, where `O` against `0` and `I` against `1` are the
 * mistakes people actually make.
 */
export const REFERENCE_BODY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** The value a byte can take, which the random draw rejects above: 256. */
const BYTE_VALUES = 256;

/** ISO 11649 clause 6: the check digits are this less the remainder: 98. */
const CHECK_BASE = 98;

/** Characters a printed reference is grouped into: 4, per ISO 11649 Annex A. */
const PRINT_GROUP = 4;

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

/**
 * Builds a creditor reference around a body of your own choosing.
 *
 * @param body - Letters and digits, 1 to {@link MAX_CREDITOR_REFERENCE_BODY}, without separators.
 * @returns The finished reference, such as `RF18539007547034` for the body `539007547034`.
 * @throws RangeError when the body is empty, too long, or carries anything but letters and digits.
 */
export function buildCreditorReference(body: string): string {
  if (body.length === 0 || body.length > MAX_CREDITOR_REFERENCE_BODY) {
    throw new RangeError(`A creditor reference body holds 1 to ${MAX_CREDITOR_REFERENCE_BODY} characters.`);
  }
  if (!BODY_PATTERN.test(body)) {
    throw new RangeError("A creditor reference body holds letters and digits only.");
  }
  // Clause 6: append `RF00`, take the remainder, and the check digits are 98 less it.
  const check = CHECK_BASE - iso7064Mod97(`${body}RF00`);
  return `RF${String(check).padStart(2, "0")}${body}`;
}

/**
 * Turns a reference as it arrived into the form it is stored under: without
 * spaces and upper-cased, because every reference is drawn in upper case.
 *
 * @param reference - The reference as it arrived, spaces and any case allowed.
 * @returns The reference as it is stored, or `null` when it does not hold up.
 */
export function normalizeCreditorReference(reference: string): string | null {
  const compact = reference.replace(/\s+/g, "").toUpperCase();
  return isValidCreditorReference(compact) ? compact : null;
}

/**
 * Groups a reference into fours, which is how ISO 11649 Annex A prints one.
 * The spaces are presentation and not part of the value.
 *
 * @param reference - The reference, with or without spaces.
 * @returns The reference in groups of four, such as `RF18 5390 0754 7034`.
 */
export function formatCreditorReference(reference: string): string {
  return reference
    .replace(/\s+/g, "")
    .replace(new RegExp(`(.{${PRINT_GROUP}})`, "g"), "$1 ")
    .trim();
}

/**
 * Draws a body from {@link REFERENCE_BODY_ALPHABET}, which holds 5 bits per character.
 *
 * Rejection sampling, so every character is equally likely: a byte taken modulo
 * an alphabet that does not divide 256 would favor the characters at its start.
 *
 * @param length - How many characters to draw.
 * @param randomValues - Fills a buffer of the given size with cryptographically secure bytes.
 * @returns The drawn characters.
 */
export function randomReferenceBody(length: number, randomValues: (size: number) => Uint8Array): string {
  const alphabet = REFERENCE_BODY_ALPHABET;
  const ceiling = Math.floor(BYTE_VALUES / alphabet.length) * alphabet.length;
  let drawn = "";
  while (drawn.length < length) {
    for (const byte of randomValues(length)) {
      if (byte >= ceiling) continue;
      drawn += alphabet[byte % alphabet.length];
      if (drawn.length === length) break;
    }
  }
  return drawn;
}
