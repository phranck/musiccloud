/**
 * Shared resolver thresholds.
 *
 * Kept in a standalone module so individual adapters can import them
 * without dragging `resolver.ts` (which imports from several adapters
 * and would create a cycle otherwise).
 *
 * The numeric values are empirical: picked by observing resolve
 * outcomes on a broad set of real inputs and tuning until both
 * false-positive "wrong track" matches and false-negative "nothing
 * found" results stayed acceptably rare. Changing any of them has
 * visible product effects on the disambiguation UX, so a change
 * should come with a note on what it fixes.
 */

/**
 * Minimum score for an adapter's `searchTrack` to report a result as
 * `found`. Below this, the adapter-level search returns a miss even if
 * the underlying API returned a row. Tracked in parallel at the
 * cross-service level by `LINK_QUALITY_THRESHOLD` (same value today,
 * but conceptually separate).
 */
export const MATCH_MIN_CONFIDENCE = 0.6;

/**
 * Minimum score for a link to survive into the final resolved result.
 * Protects the UI from showing chips that point to the wrong track.
 * "Search fallback" links (e.g. a synthesised YouTube search URL)
 * bypass this because they are explicitly labelled as fallback.
 */
export const LINK_QUALITY_THRESHOLD = 0.6;

/**
 * Confidence at which a text search skips disambiguation and auto-resolves
 * the top candidate. Set high because a wrong auto-resolve is worse UX
 * than one extra click on the disambiguation list.
 */
export const AUTO_SELECT_THRESHOLD = 0.9;

/**
 * Minimum score for a candidate to appear in the disambiguation list.
 * Low on purpose: marginal candidates can still be the one the user
 * wants, and the UI already ranks them so the best one surfaces first.
 */
export const CANDIDATE_MIN_CONFIDENCE = 0.4;

/**
 * Hard cap on the disambiguation list length. Beyond this the list
 * stops being useful for a human to scan; the adapter returns more,
 * we just do not render them.
 */
export const MAX_CANDIDATES = 8;

/**
 * Hard cap from Spotify Web API /search (effective 2026-02-11).
 * MAX_CANDIDATES must stay <= this value or candidate lists will be
 * silently truncated upstream.
 */
export const SPOTIFY_SEARCH_LIMIT_MAX = 10;

if (MAX_CANDIDATES > SPOTIFY_SEARCH_LIMIT_MAX) {
  throw new Error(
    `MAX_CANDIDATES (${MAX_CANDIDATES}) exceeds SPOTIFY_SEARCH_LIMIT_MAX (${SPOTIFY_SEARCH_LIMIT_MAX})`,
  );
}

/**
 * Confidence for synthesised "search on X" fallback links (currently
 * only the YouTube search fallback). Kept below `LINK_QUALITY_THRESHOLD`
 * on purpose: without the `isSearchFallback` bypass they would be
 * filtered out, which is the right default for any other non-fallback
 * match with the same score.
 */
export const SEARCH_FALLBACK_CONFIDENCE = 0.5;
