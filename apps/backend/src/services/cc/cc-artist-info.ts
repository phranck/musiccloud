/**
 * Builds the wire `ArtistInfoResponse` for the Creative-Commons right column
 * from Jamendo data, so a CC result reuses the commercial `AnimatedArtistColumn`
 * (Popular Tracks + Similar Tracks + Events) verbatim — only the data source
 * differs. Jamendo supplies neither artist profile nor events nor a similar-
 * artists graph, so `profile` is null, `events` is empty (those cards self-hide),
 * and "similar artists" is realised as similar TRACKS by other artists.
 */

import type { ArtistInfoResponse, ArtistTopTrack, SimilarArtistTrack } from "@musiccloud/shared";
import { ccCandidateId } from "./cc-resolver.js";
import { getSimilarCcTracks } from "./jamendo/client.js";
import type { CcTrack } from "./jamendo/types.js";

/** Upper bound on similar tracks shown in the column. */
const CC_SIMILAR_TRACKS_LIMIT = 12;

/**
 * Maps a CC track to the wire {@link ArtistTopTrack} shape the shared artist
 * column consumes. The `deezerUrl` slot carries the `jamendo:<id>` candidate id
 * so a row click resolves through the CC endpoint (the column's resolve handler
 * reads exactly that field). `shortId` is null — CC column tracks are not
 * persisted until the row is clicked.
 *
 * @param track - A CC track from the column or the similar list.
 * @returns The track in the shape the shared artist column renders.
 */
function toArtistTopTrack(track: CcTrack): ArtistTopTrack {
  return {
    title: track.title,
    artists: [track.artistName],
    albumName: track.albumName ?? null,
    artworkUrl: track.artworkUrl ?? null,
    durationMs: track.durationMs ?? null,
    deezerUrl: ccCandidateId(track.jamendoId),
    shortId: null,
  };
}

/**
 * Builds the CC artist-column payload from Jamendo: `topTracks` are the supplied
 * column tracks (an album's tracks, or an artist's / a track-artist's top
 * tracks), and `similarArtistTracks` are tracks by OTHER artists similar to the
 * column's first track (Jamendo `GET /tracks/similar`). Same-artist results are
 * filtered out so "similar tracks" is genuinely other artists. `profile` is null
 * and `events` empty.
 *
 * One throttled Jamendo call (`getSimilarCcTracks`); skipped when there is no
 * seed track.
 *
 * @param artistName - The entity's artist name (column header context).
 * @param columnTracks - The "popular tracks" position: album tracks or top tracks.
 * @returns The artist-info payload for the shared `AnimatedArtistColumn`.
 * @throws Error on Jamendo API failure (see `jamendoFetch`).
 */
export async function buildCcArtistInfo(artistName: string, columnTracks: CcTrack[]): Promise<ArtistInfoResponse> {
  const seed = columnTracks[0];
  const similarRaw = seed ? await getSimilarCcTracks(seed.jamendoId, CC_SIMILAR_TRACKS_LIMIT * 2) : [];
  const similarArtistTracks: SimilarArtistTrack[] = similarRaw
    .filter((track) => track.jamendoArtistId !== seed?.jamendoArtistId)
    .slice(0, CC_SIMILAR_TRACKS_LIMIT)
    .map((track) => ({ artistName: track.artistName, track: toArtistTopTrack(track) }));

  return {
    artistName,
    topTracks: columnTracks.map(toArtistTopTrack),
    profile: null,
    events: [],
    similarArtistTracks,
  };
}
