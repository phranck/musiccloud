/**
 * @file Artwork policy with separate recording-cover and artist-image boundaries.
 *
 * Recording covers must describe the release, not a video frame. YouTube images
 * are therefore excluded even as recording fallbacks. Artist images retain their
 * separate policy so a valid channel portrait is not mistaken for a cover.
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
 * Bounded metadata refresh order when a stored recording lacks an allowed cover.
 * Other validated providers may still supply covers with their normal matches;
 * this list limits extra artwork-only work rather than declaring capabilities.
 */
export const RECORDING_ARTWORK_LOOKUP_SERVICES = [PREFERRED_ARTWORK_SERVICE, "deezer"] as const;

/** Video thumbnails and YouTube-owned image hosts are not recording-cover sources. */
const YOUTUBE_ARTWORK_DOMAINS = [
  "ytimg.com",
  "youtube.com",
  "googlevideo.com",
  "yt3.ggpht.com",
  "yt3.googleusercontent.com",
];

/**
 * Classifies an artwork host without fetching it, including protocol-relative URLs.
 *
 * @param url - Stored or upstream image address.
 * @param domain - Exact domain whose subdomains share the same source policy.
 * @returns Whether the parsed host belongs to that domain, not a lookalike.
 */
function artworkHasDomain(url: string, domain: string): boolean {
  try {
    const hostname = new URL(url.startsWith("//") ? `https:${url}` : url).hostname.replace(/\.$/, "");
    return hostname === domain || hostname.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

/**
 * Identifies YouTube image sources for recording-cover reads and writes.
 *
 * @param url - Image address from source metadata, a match, or a stored row.
 * @returns Whether it is a known YouTube image/video host; makes no network call.
 */
export function isYouTubeArtworkUrl(url: string): boolean {
  return YOUTUBE_ARTWORK_DOMAINS.some((domain) => artworkHasDomain(url, domain));
}

/**
 * Chooses recording artwork without borrowing YouTube imagery as a fallback.
 *
 * Valid existing covers win, so catalogue enrichment cannot replace an operator's
 * good cover. Source-service filtering also rejects video images on another CDN.
 * Artist portraits deliberately continue through {@link pickArtworkUrl} instead.
 *
 * @param own - Existing or source recording cover, if any.
 * @param borrowed - Validated recording matches, empty for a read-only filter.
 * @param ownService - Provider of this image when known from fresh metadata.
 *   Do not pass a cached recording's original service: its cover may be borrowed.
 * @returns An allowed cover, or undefined for the existing UI placeholder.
 */
export function pickRecordingArtworkUrl(
  own: string | undefined,
  borrowed: readonly ArtworkCandidate[] = [],
  ownService?: string,
): string | undefined {
  return pickArtworkUrl(
    isRecordingArtworkCandidate({ service: ownService ?? "", artworkUrl: own }) ? own : undefined,
    borrowed.filter(isRecordingArtworkCandidate),
  );
}

/**
 * Applies image provenance and hostname restrictions before cover preference.
 *
 * @param candidate - Provider observation, or a stored URL with unknown provenance.
 * @returns Whether the image may enter recording-cover selection.
 */
function isRecordingArtworkCandidate(candidate: ArtworkCandidate): boolean {
  if (!candidate.artworkUrl) return false;
  return (
    !["youtube", "youtube-music", "apple-music"].includes(candidate.service) &&
    !isYouTubeArtworkUrl(candidate.artworkUrl) &&
    !isAppleArtworkUrl(candidate.artworkUrl)
  );
}

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
  return artworkHasDomain(url, APPLE_ARTWORK_DOMAIN);
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
