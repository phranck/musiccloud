/**
 * @file Builds the payloads the CC repository persists for a resolved Jamendo
 * track, album or artist.
 *
 * The resolve route (`routes/cc-resolve.ts`) hands these payloads to
 * `CcRepository`, so the share page later reads the whole entity, its
 * tracklist or its top tracks from the database without calling Jamendo.
 */

import type { PersistCcAlbumData, PersistCcArtistData, PersistCcTrackData } from "../../db/repository.js";
import { CC_TRACK_FIELDS, type CcAlbum, type CcArtist, type CcTrack, pickTrackFields } from "./jamendo/types.js";

/**
 * The position of the first track of an album tracklist. Album positions are
 * 1-based, so the share page reads `albumPosition` back as the track number.
 */
const FIRST_ALBUM_POSITION = 1;

/**
 * Projects a resolved {@link CcTrack} to the DB persist payload. Shared by the
 * resolve route's single track, album tracklist and artist top tracks, so the
 * share page can read the full entity from the DB. The fields come from
 * {@link CC_TRACK_FIELDS}. The detail fields (`albumPosition`/`musicInfo`/
 * `stats`/`pro*`) are populated only when the source fetch included them
 * (single-track resolve with `include=musicinfo+stats+licenses`); list contexts
 * leave them undefined and override the position fields per index.
 *
 * @param track - The resolved CC track.
 * @returns The flattened persist payload.
 */
export function ccTrackToPersistData(track: CcTrack): PersistCcTrackData {
  return pickTrackFields(track, CC_TRACK_FIELDS);
}

/**
 * Builds the persist payload of a resolved CC album together with its
 * tracklist. Each track gets its 1-based position from its index, starting at
 * {@link FIRST_ALBUM_POSITION}, because Jamendo returns the tracklist in
 * release order and the share page reads it back in that order.
 *
 * @param album - The resolved CC album.
 * @param tracks - The album's tracks in release order.
 * @returns The album persist payload with its tracklist.
 */
export function ccAlbumToPersistData(album: CcAlbum, tracks: CcTrack[]): PersistCcAlbumData {
  return {
    jamendoId: album.jamendoId,
    name: album.name,
    jamendoArtistId: album.jamendoArtistId,
    artistName: album.artistName,
    artworkUrl: album.artworkUrl,
    releaseDate: album.releaseDate,
    zipUrl: album.zipUrl,
    shareUrl: album.shareUrl,
    tracks: tracks.map((track, index) => ({
      ...ccTrackToPersistData(track),
      albumPosition: index + FIRST_ALBUM_POSITION,
    })),
  };
}

/**
 * Builds the persist payload of a resolved CC artist together with its top
 * tracks. Each track gets its 0-based popularity rank from its index, because
 * Jamendo returns the tracks in popularity order and the share page reads the
 * column back in rank order.
 *
 * @param artist - The resolved CC artist.
 * @param topTracks - The artist's most-popular tracks, descending.
 * @returns The artist persist payload with its top tracks.
 */
export function ccArtistToPersistData(artist: CcArtist, topTracks: CcTrack[]): PersistCcArtistData {
  return {
    jamendoId: artist.jamendoId,
    name: artist.name,
    imageUrl: artist.imageUrl,
    website: artist.website,
    shareUrl: artist.shareUrl,
    topTracks: topTracks.map((track, index) => ({ ...ccTrackToPersistData(track), artistTopPosition: index })),
  };
}
