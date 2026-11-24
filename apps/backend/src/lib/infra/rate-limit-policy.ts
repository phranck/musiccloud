/**
 * @file The windows every limiter is enforced over, and the fixed per-IP
 * ceilings the public document states.
 *
 * `rate-limiter.ts` builds every limiter from these values, the usage read
 * counts its live windows over the same ones, and the public descriptions
 * interpolate them, so a window changed here changes all three together. They
 * live apart from the limiters because that module starts cleanup timers when
 * it loads and route tests replace it with a mock, whilst documentation and
 * tests need the values without either.
 */

/** One second in milliseconds, which turns a window into the seconds a check reports and the descriptions state. */
export const SECOND_MS = 1000;

/** Seconds in one hour, which turns {@link DAY_WINDOW_MS} into the hours the descriptions state. */
const SECONDS_PER_HOUR = 60 * 60;

/**
 * One minute in milliseconds, the window every per-minute limit is enforced
 * over. The usage read in `services/api-usage-report.ts` counts the live minute
 * over it.
 */
export const MINUTE_WINDOW_MS = 60_000;

/**
 * Twenty-four hours in milliseconds, the window every per-day limit is enforced
 * over. The usage read counts the live day over it, and the retention sweeps
 * under `services/` count their days in it.
 */
export const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** {@link MINUTE_WINDOW_MS} in whole seconds, as the public descriptions of a per-minute limit state it: 60. */
export const MINUTE_WINDOW_SECONDS = MINUTE_WINDOW_MS / SECOND_MS;

/** {@link DAY_WINDOW_MS} in whole hours, as the public descriptions of a per-day limit state it: 24. */
export const DAY_WINDOW_HOURS = DAY_WINDOW_MS / SECOND_MS / SECONDS_PER_HOUR;

/**
 * What the shared public-data bucket (`apiRateLimiter`) admits per client IP in
 * one {@link MINUTE_WINDOW_MS}: 10.
 */
export const PUBLIC_DATA_REQUESTS_PER_MINUTE = 10;

/**
 * The global ceiling every route shares per client IP in one
 * {@link MINUTE_WINDOW_MS}: 300. `server.ts` gives it to the rate-limit plugin.
 */
export const GLOBAL_REQUESTS_PER_MINUTE = 300;
