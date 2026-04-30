/**
 * Picks the best Deezer artist image URL while filtering the default
 * silhouette placeholder. Deezer returns a stock silhouette image when
 * an artist has no real picture; that URL contains the empty-string MD5
 * `d41d8cd98f00b204e9800998ecf8427e` and must be treated as "no image".
 */

import { searchDeezerArtist } from "./artist-search.js";

const EMPTY_MD5_MARKER = "d41d8cd98f00b204e9800998ecf8427e";

export function isDeezerSilhouette(url: string | undefined): boolean {
  if (!url) return true;
  return url.includes(EMPTY_MD5_MARKER);
}

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

export async function fetchDeezerArtistImage(name: string): Promise<string | null> {
  const hit = await searchDeezerArtist(name);
  if (!hit) return null;
  return pickDeezerArtistImage(hit);
}
