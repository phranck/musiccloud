/**
 * Deezer composition source. Combines artist-search + fan-count + image
 * + top-tracks helpers into a single ArtistPartial tagged "deezer".
 *
 * Returns null if the artist is not found at Deezer; downstream merge
 * skips the entry and falls through to the next source per strategy.
 */

import { fetchDeezerFanCount } from "../../plugins/deezer/artist-fans.js";
import { pickDeezerArtistImage } from "../../plugins/deezer/artist-image.js";
import { searchDeezerArtist } from "../../plugins/deezer/artist-search.js";
import { fetchDeezerArtistTopTracks } from "../../plugins/deezer/artist-top-tracks.js";
import type { ArtistPartial } from "../types.js";

export async function fetchDeezerArtistPartial(name: string): Promise<ArtistPartial | null> {
  const hit = await searchDeezerArtist(name);
  if (!hit) return null;

  const [fans, topTracks] = await Promise.all([
    fetchDeezerFanCount(String(hit.id)),
    fetchDeezerArtistTopTracks(hit.id, 3),
  ]);

  return {
    __source: "deezer",
    imageUrl: pickDeezerArtistImage(hit),
    followers: fans,
    topTracks,
  };
}
