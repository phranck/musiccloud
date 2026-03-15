/**
 * Shared resolver thresholds.
 *
 * Keep these in a standalone module so adapters can import them without
 * creating a cycle back into resolver.ts.
 */
export const MATCH_MIN_CONFIDENCE = 0.6;
export const LINK_QUALITY_THRESHOLD = 0.6;
export const AUTO_SELECT_THRESHOLD = 0.9;
export const CANDIDATE_MIN_CONFIDENCE = 0.4;
export const MAX_CANDIDATES = 8;
export const SEARCH_FALLBACK_CONFIDENCE = 0.5;
