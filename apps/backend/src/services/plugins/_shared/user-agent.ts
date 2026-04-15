/**
 * @file Shared desktop browser User-Agent string for HTML-scraping adapters.
 *
 * Many streaming services either gate their public pages behind a bot
 * check or serve stripped-down content to clients they do not recognise
 * as browsers. Presenting a plausible desktop Chrome identifier unlocks
 * the normal page layout (OG tags, SSR HTML, embedded JSON) that the
 * scraper-based adapters rely on.
 *
 * This constant is imported by every adapter that needs it instead of
 * redefined per file, so a future bump (e.g. to silence deprecation
 * warnings or dodge a new anti-bot rule) happens in one place.
 */
export const SCRAPER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
