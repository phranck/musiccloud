/**
 * @file Which cover a resolved track, album or artist keeps.
 *
 * The Apple Developer Program License Agreement (section 3.3.6(D), version of
 * August 18, 2026) allows Apple Music artwork only together with playback
 * through MusicKit, and musiccloud plays no Apple Music content. So no Apple
 * cover is kept. The Apple Music adapter already returns none; the rule here
 * also catches an Apple cover that arrives another way, such as the `og:image`
 * scraped from an Apple Music page. Decided in issue #622.
 */

/** The domain Apple Music serves artwork from, through numbered subdomains such as `is1-ssl`. */
const APPLE_ARTWORK_DOMAIN = "mzstatic.com";

/**
 * The service whose cover is borrowed first when an entity has none of its own
 * to keep, because its artwork is consistently large and square.
 */
const PREFERRED_ARTWORK_SERVICE = "spotify";

/**
 * A cover another service returned for the same track, album or artist.
 *
 * @property service - The service that returned it.
 * @property artworkUrl - The cover's URL, absent when the service sent none.
 */
export interface ArtworkCandidate {
  service: string;
  artworkUrl?: string;
}

/**
 * Whether an image is Apple's.
 *
 * @param url - An artwork or picture URL. A string that does not parse as a URL
 *   is not Apple's.
 * @returns `true` when the URL's host is `mzstatic.com` or one of its
 *   subdomains.
 */
export function isAppleArtworkUrl(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }
  return hostname === APPLE_ARTWORK_DOMAIN || hostname.endsWith(`.${APPLE_ARTWORK_DOMAIN}`);
}

/**
 * Picks the cover an entity keeps: its own unless that is Apple's, else
 * Spotify's, else the first cover another service supplied, else none.
 *
 * @param own - The cover the entity's source service returned, if any.
 * @param borrowed - Covers other matched services returned, in the order a
 *   cover should be preferred after Spotify's. Apple's are skipped.
 * @returns The cover's URL, or `undefined` when no cover may be kept, in which
 *   case the interface shows its placeholder.
 */
export function pickArtworkUrl(own: string | undefined, borrowed: readonly ArtworkCandidate[]): string | undefined {
  if (own && !isAppleArtworkUrl(own)) return own;
  const usable = borrowed.filter((candidate) => candidate.artworkUrl && !isAppleArtworkUrl(candidate.artworkUrl));
  return (usable.find((candidate) => candidate.service === PREFERRED_ARTWORK_SERVICE) ?? usable[0])?.artworkUrl;
}
