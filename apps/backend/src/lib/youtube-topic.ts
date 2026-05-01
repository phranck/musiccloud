/**
 * @file Strip the YouTube auto-channel "- Topic" suffix from artist
 * names.
 *
 * YouTube auto-generates "<Artist> - Topic" channels for catalog tracks
 * that have no real artist channel uploaded. The suffix is purely a
 * YouTube artifact and pollutes downstream artist lookups: Spotify /
 * Last.fm / Deezer search queries containing "- Topic" return either
 * the (essentially empty) "Topic" placeholder profile or no match at
 * all, which then cascades into missing covers, wrong follower counts,
 * and a Last.fm-fallback chain that has no album-art data.
 *
 * Apply at the trust boundary where a YouTube channel title or video
 * channel-name fallback first becomes an "artist name" in our domain.
 * Two call sites today: the YouTube adapter (new resolves) and the
 * artist-info route (heals existing DB rows that were stored before
 * this fix).
 */

const TOPIC_SUFFIX_RE = /\s+-\s+Topic$/;

/**
 * Returns `name` with a trailing " - Topic" suffix removed, if present.
 * No-op for any other input. Idempotent. Trims before matching so the
 * regex's `$` anchor lines up with the actual end of the artist name
 * even when the caller passed surrounding whitespace.
 */
export function stripYouTubeTopicSuffix(name: string): string {
  return name.trim().replace(TOPIC_SUFFIX_RE, "");
}
