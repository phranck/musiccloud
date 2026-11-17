/**
 * @file The ladder's amounts as text: what a reader types, and what the site writes.
 *
 * The free field takes an amount rather than a number in one notation, so it
 * accepts what people actually type, `12.50`, `12,50`, `1,000` or `€ 20`, and
 * turns it into one shape while it is typed: digits, a full stop, and at most
 * two decimals. The field therefore never holds a value the rest of the ladder
 * cannot read.
 */

import { CENTS_PER_EURO, formatEuroCents } from "@musiccloud/shared";

/**
 * Turns an amount in euros into whole cents, as the backend stores money.
 *
 * @param amountEur - The amount in euros.
 * @returns The amount in cents, rounded to the nearest cent.
 */
export function eurosToCents(amountEur: number): number {
  return Math.round(amountEur * CENTS_PER_EURO);
}

/**
 * Writes an amount in euros the way the site writes money.
 *
 * @param amountEur - The amount in euros.
 * @returns Whole euros without decimals (`€20`), anything else with two (`€12.50`).
 */
export function formatEuro(amountEur: number): string {
  return formatEuroCents(eurosToCents(amountEur));
}

/** Digits after the decimal separator an amount may carry: 2. */
const DECIMAL_PLACES = 2;

/** Digits one group holds when a separator groups thousands, as in `1,000`: 3. */
const GROUP_SIZE = 3;

/** The decimal separator the site writes amounts with, as en-GB does. */
const DECIMAL_SEPARATOR = ".";

/**
 * Splits typed digits and separators into euros and cents.
 *
 * The last separator divides euros from cents, whichever of `.` and `,` it is,
 * unless exactly three digits follow it, in which case it groups thousands. So
 * `33.33` and `33,33` are both thirty-three euros and thirty-three cents, while
 * `1,000` and `1.000` are both a thousand.
 *
 * @param value - Digits, commas and full stops, in the order typed.
 * @returns The euros and the cents, the cents empty when none were typed.
 */
function splitAmount(value: string): { euros: string; cents: string } {
  const last = Math.max(value.lastIndexOf(","), value.lastIndexOf("."));
  const stripSeparators = (part: string) => part.replace(/[.,]/g, "");
  if (last < 0 || value.length - last - 1 === GROUP_SIZE) return { euros: stripSeparators(value), cents: "" };
  return { euros: stripSeparators(value.slice(0, last)), cents: stripSeparators(value.slice(last + 1)) };
}

/**
 * Normalizes a typed amount to the notation the site writes.
 *
 * Whitespace, currency signs and letters go, grouping separators go, the
 * decimal separator becomes a full stop, and the cents are cut to two digits. A
 * trailing separator survives, because somebody who has just typed `33.` is
 * about to type the cents.
 *
 * @param raw - Exactly what the field holds.
 * @returns The cleaned value, empty when nothing usable was typed.
 */
export function normalizeAmountInput(raw: string): string {
  const kept = raw.replace(/[^\d.,]/g, "");
  if (kept === "") return "";

  const { euros, cents } = splitAmount(kept);
  // One leading zero stays, so `0.50` can be typed, while `007` cannot.
  const wholePart = euros.replace(/^0+(?=\d)/, "");
  const endsOnSeparator = /[.,]$/.test(kept);
  if (cents === "" && !endsOnSeparator) return wholePart;

  return `${wholePart === "" ? "0" : wholePart}${DECIMAL_SEPARATOR}${cents.slice(0, DECIMAL_PLACES)}`;
}

/**
 * Reads a normalized amount as a number.
 *
 * @param value - A value {@link normalizeAmountInput} returned.
 * @returns The amount in euros, or `null` when the field holds no amount above zero.
 */
export function readAmountInput(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
