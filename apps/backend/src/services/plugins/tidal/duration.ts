/**
 * @file Tidal duration parsing shared by the adapter's mappers and the search
 * document validation.
 */
import { type IsoDurationFormat, MS_PER_SECOND, parseIsoDurationMs } from "../_shared/duration.js";

/**
 * Tidal's period dialect: `PT5M41S` with fractional seconds allowed, and a
 * bare `PT` rejected, because an empty period is malformed metadata rather
 * than a zero-length recording.
 */
const TIDAL_DURATION_FORMAT: IsoDurationFormat = { fractionalSeconds: true, requireComponent: true };

/**
 * Parses a complete provider duration before it participates in identity scoring.
 *
 * @param duration - Numeric seconds or an ISO 8601 time period in {@link TIDAL_DURATION_FORMAT}.
 * @returns Milliseconds, or undefined for an absent or malformed period.
 */
export function parseDuration(duration: number | string | undefined): number | undefined {
  if (duration === undefined) return undefined;
  if (typeof duration === "string") return parseIsoDurationMs(duration, TIDAL_DURATION_FORMAT);
  return duration * MS_PER_SECOND;
}
