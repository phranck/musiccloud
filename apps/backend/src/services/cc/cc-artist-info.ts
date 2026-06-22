/**
 * Builds the wire `ArtistInfoResponse` for the Creative-Commons right column
 * from Jamendo data, so a CC result reuses the commercial `AnimatedArtistColumn`
 * (Profile + Popular Tracks + Similar Tracks + Events) verbatim — only the data
 * source differs. The profile (image, genres, bio) comes from Jamendo's
 * `/artists?include=musicinfo`; popularity/followers/scrobbles stay null and
 * `similarArtists` empty because Jamendo exposes no listener counts and no
 * similar-artist graph. `events` is empty (that card self-hides), and "similar
 * artists" is realised as similar TRACKS by other artists.
 */

import type { ArtistInfoResponse, ArtistProfile, ArtistTopTrack, SimilarArtistTrack } from "@musiccloud/shared";
import { ccCandidateId } from "./cc-resolver.js";
import { getCcArtistMusicInfo, getSimilarCcTracks } from "./jamendo/client.js";
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
 * Builds the CC artist-column payload from Jamendo: `profile` carries the
 * artist's image, genres and bio (Jamendo `/artists?include=musicinfo`),
 * `topTracks` are the supplied column tracks (an album's tracks, or an artist's
 * / a track-artist's top tracks), and `similarArtistTracks` are tracks by OTHER
 * artists similar to the column's first track. Same-artist results are filtered
 * out so "similar tracks" is genuinely other artists.
 *
 * `popularity`/`followers`/`scrobbles` stay null and `similarArtists` empty —
 * Jamendo carries no listener counts and no similar-artist graph, and no
 * surrogate is invented. `events` is empty (that card self-hides).
 *
 * Two throttled Jamendo calls: `getCcArtistMusicInfo` for the profile, plus
 * `getSimilarCcTracks` (skipped when there is no seed track). Both funnel
 * through `jamendoFetch`, so the shared burst throttle still holds.
 *
 * @param artistName - The entity's artist name (column header context).
 * @param jamendoArtistId - The Jamendo artist id whose profile to fetch.
 * @param columnTracks - The "popular tracks" position: album tracks or top tracks.
 * @returns The artist-info payload for the shared `AnimatedArtistColumn`.
 * @throws Error on Jamendo API failure (see `jamendoFetch`).
 */
export async function buildCcArtistInfo(
  artistName: string,
  jamendoArtistId: string,
  columnTracks: CcTrack[],
): Promise<ArtistInfoResponse> {
  const seed = columnTracks[0];
  const similarRaw = seed ? await getSimilarCcTracks(seed.jamendoId, CC_SIMILAR_TRACKS_LIMIT * 2) : [];
  const similarArtistTracks: SimilarArtistTrack[] = similarRaw
    .filter((track) => track.jamendoArtistId !== seed?.jamendoArtistId)
    .slice(0, CC_SIMILAR_TRACKS_LIMIT)
    .map((track) => ({ artistName: track.artistName, track: toArtistTopTrack(track) }));

  const musicInfo = await getCcArtistMusicInfo(jamendoArtistId);
  const profile: ArtistProfile | null = musicInfo
    ? {
        imageUrl: musicInfo.imageUrl,
        genres: musicInfo.genres,
        bioSummary: musicInfo.bioSummary,
        popularity: null,
        followers: null,
        scrobbles: null,
        similarArtists: [],
      }
    : null;

  return {
    artistName,
    topTracks: columnTracks.map(toArtistTopTrack),
    profile,
    events: [],
    similarArtistTracks,
  };
}
