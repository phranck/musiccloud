/**
 * @file Duration parsing shared by the provider adapters.
 *
 * Providers write a recording's length either as an ISO 8601 period
 * (`PT3M45S`, Bandcamp's `P00H03M45S`) or as a clock string (`7:22`). Each
 * adapter reads its provider's form through one of the two parsers here and
 * maps a miss to the value its result contract has always used.
 */

/** Seconds in one hour, for the `H` component of a period. */
const SECONDS_PER_HOUR = 3600;

/** Seconds in one minute, for the `M` component of a period and the minutes of a clock string. */
const SECONDS_PER_MINUTE = 60;

/** Milliseconds in one second, the unit every parser returns. */
const MS_PER_SECOND = 1000;

/** The character between minutes and seconds in a clock string such as `7:22`. */
const CLOCK_SEPARATOR = ":";

/** How many parts a clock string has: `2`, minutes and seconds. Any other count is not a clock string. */
const CLOCK_PART_COUNT = 2;

/** The radix clock parts are read in: `10`. */
const DECIMAL_RADIX = 10;

/** Pattern text of an integer component such as the `3` in `3M`. */
const INTEGER_COMPONENT = "(\\d+)";

/** Pattern text of a seconds component that may carry a fraction, such as `41.5`. */
const FRACTIONAL_COMPONENT = "(\\d+(?:\\.\\d+)?)";

/**
 * The dialect of ISO 8601 period one provider writes. Every field is optional,
 * and the defaults describe the plain form `PT3M45S`: the `T` follows `P`,
 * seconds are whole, a bare `PT` reads as zero, and the period is the whole text.
 */
export interface IsoDurationFormat {
  /**
   * Whether the time designator `T` follows `P`. `true` (the default) reads
   * `PT3M45S` and rejects `P3M45S`. `false` reads Bandcamp's `P00H03M45S` and
   * rejects any text with a `T`.
   */
  timeDesignator?: boolean;
  /**
   * Whether the seconds component may carry a decimal fraction. `false` (the
   * default) rejects `PT41.5S` when the period is the whole text. `true` reads
   * it as 41500 milliseconds.
   */
  fractionalSeconds?: boolean;
  /**
   * Whether a period needs at least one component. `false` (the default) reads
   * a bare `PT` as zero. `true` rejects it.
   */
  requireComponent?: boolean;
  /**
   * Whether the period may sit inside longer text. `false` (the default) reads
   * only text that is a period from start to end. `true` reads the first
   * period found anywhere in the text, and stops it at the first character that
   * does not continue it.
   */
  embedded?: boolean;
}

/**
 * Builds the pattern for one period dialect.
 *
 * @param format - The dialect, with the defaults {@link IsoDurationFormat} names.
 * @returns A pattern whose groups 1 to 3 capture hours, minutes and seconds.
 */
function isoDurationPattern(format: IsoDurationFormat): RegExp {
  const designator = (format.timeDesignator ?? true) ? "PT" : "P";
  const seconds = format.fractionalSeconds ? FRACTIONAL_COMPONENT : INTEGER_COMPONENT;
  const period = `${designator}(?:${INTEGER_COMPONENT}H)?(?:${INTEGER_COMPONENT}M)?(?:${seconds}S)?`;
  return new RegExp(format.embedded ? period : `^${period}$`);
}

/**
 * Reads an ISO 8601 time period as milliseconds.
 *
 * Only hours, minutes and seconds are read, so a period with days, months or
 * years does not match the default dialect.
 *
 * @param text - The provider's duration text.
 * @param format - The provider's dialect. Defaults to the plain `PT3M45S` form
 *   described on {@link IsoDurationFormat}.
 * @returns The length in milliseconds, or `undefined` when the text is not a
 *   period of that dialect.
 */
export function parseIsoDurationMs(text: string, format: IsoDurationFormat = {}): number | undefined {
  const match = isoDurationPattern(format).exec(text);
  if (!match) return undefined;
  const [, hours, minutes, seconds] = match;
  if (format.requireComponent && hours === undefined && minutes === undefined && seconds === undefined) {
    return undefined;
  }
  return (
    (Number(hours ?? 0) * SECONDS_PER_HOUR + Number(minutes ?? 0) * SECONDS_PER_MINUTE + Number(seconds ?? 0)) *
    MS_PER_SECOND
  );
}

/**
 * Reads a clock string such as `7:22` (minutes and seconds) as milliseconds.
 *
 * Each part is read with `parseInt`, so leading digits count and anything after
 * them is ignored. A part without leading digits makes the result `NaN`.
 *
 * @param text - The provider's duration text.
 * @returns The length in milliseconds, or `undefined` when the text does not
 *   have exactly two parts around {@link CLOCK_SEPARATOR}.
 */
export function parseClockDurationMs(text: string): number | undefined {
  const parts = text.split(CLOCK_SEPARATOR);
  if (parts.length !== CLOCK_PART_COUNT) return undefined;
  const [minutes, seconds] = parts;
  return (
    (Number.parseInt(minutes, DECIMAL_RADIX) * SECONDS_PER_MINUTE + Number.parseInt(seconds, DECIMAL_RADIX)) *
    MS_PER_SECOND
  );
}
