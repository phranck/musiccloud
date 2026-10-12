/**
 * Picks the best Deezer artist image URL while filtering the default
 * silhouette placeholder. Deezer returns a stock silhouette image when
 * an artist has no real picture, and that must be treated as "no image".
 */

import { searchDeezerArtist } from "./artist-search.js";

/** The silhouette's image hash, which is the MD5 of the empty string. */
const EMPTY_MD5_MARKER = "d41d8cd98f00b204e9800998ecf8427e";

/** An artist picture path with no hash at all, which Deezer redirects to the silhouette. */
const EMPTY_HASH_PATH = "/images/artist//";

/**
 * Whether a Deezer artist picture URL is the placeholder rather than a picture.
 *
 * Deezer's API names the placeholder with an empty hash, such as
 * `https://cdn-images.dzcdn.net/images/artist//1000x1000-000000-80-0-0.jpg`,
 * and its CDN redirects that to the address under the empty-string MD5. Both
 * forms count, and so does a missing URL.
 *
 * @param url - A picture URL from a Deezer artist object.
 * @returns `true` when the URL shows no picture of the artist.
 */
export function isDeezerSilhouette(url: string | undefined): boolean {
  if (!url) return true;
  return url.includes(EMPTY_MD5_MARKER) || url.includes(EMPTY_HASH_PATH);
}

/**
 * The largest picture of a Deezer artist object that is not the placeholder.
 *
 * Every Deezer artist image the backend keeps goes through this, so an artist
 * without a picture reads as having none and the caller can take another
 * service's picture instead.
 *
 * @param hit - A Deezer artist object or search hit.
 * @returns The first real picture of `picture_xl`, `picture_big` and `picture_medium`, or `null`.
 */
export function pickDeezerArtistImage(hit: {
  picture_xl?: string;
  picture_big?: string;
  picture_medium?: string;
}): string | null {
  const candidates = [hit.picture_xl, hit.picture_big, hit.picture_medium];
  for (const url of candidates) {
    if (url && !isDeezerSilhouette(url)) return url;
  }
  return null;
}

/**
 * Looks an artist up on Deezer by name and returns their picture.
 *
 * @param name - The artist name to search for.
 * @returns The best search hit's real picture, or `null` when there is none or the lookup failed.
 */
export async function fetchDeezerArtistImage(name: string): Promise<string | null> {
  // The image cache falls back to Spotify and stores only what it found, so
  // a failed Deezer lookup is treated like a missing image here.
  const hit = await searchDeezerArtist(name).catch(() => null);
  if (!hit) return null;
  return pickDeezerArtistImage(hit);
}
