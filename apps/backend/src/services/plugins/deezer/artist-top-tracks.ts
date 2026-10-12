/**
 * Deezer artist top tracks fetcher. Returns ArtistTopTrack[] in the
 * shared API shape so artist-composition can splice them into the
 * canonical artist record without further mapping.
 */

import type { ArtistTopTrack } from "@musiccloud/shared";
import { deezerGet } from "./deezer-response.js";

interface DeezerTopTrack {
  title: string;
  duration: number;
  link: string;
  album: { title: string; cover_medium: string };
  artist: { name: string };
  contributors?: { name: string }[];
}

interface DeezerTopTracksResponse {
  data?: DeezerTopTrack[];
}

/**
 * Reads an artist's most played tracks on Deezer.
 *
 * @param artistId - The Deezer artist id.
 * @param limit - How many tracks to ask for.
 * @returns The tracks, empty when Deezer has none for the artist.
 * @throws {UpstreamUnavailableError} when Deezer did not answer.
 */
export async function fetchDeezerArtistTopTracks(artistId: number | string, limit = 3): Promise<ArtistTopTrack[]> {
  const data = await deezerGet<DeezerTopTracksResponse>(
    `/artist/${encodeURIComponent(String(artistId))}/top?limit=${limit}`,
    "artist top tracks",
  );
  return (data?.data ?? []).map(
    (t): ArtistTopTrack => ({
      title: t.title,
      artists: t.contributors?.length ? t.contributors.map((c) => c.name) : [t.artist.name],
      albumName: t.album.title ?? null,
      artworkUrl: t.album.cover_medium ?? null,
      durationMs: t.duration ? t.duration * 1000 : null,
      deezerUrl: t.link,
      shortId: null,
    }),
  );
}
