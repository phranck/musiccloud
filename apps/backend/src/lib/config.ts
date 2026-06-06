/** Artist/profile cache TTL. Track and album rows no longer expire by `updated_at`; preview freshness lives in preview tables. */
export const CACHE_TTL_MS = 48 * 60 * 60 * 1000;
