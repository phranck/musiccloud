/**
 * @file Shared builders for the CC (Jamendo) share payloads.
 *
 * The live resolve route ({@link file://./../../routes/cc-resolve.ts}) and the
 * persistent share-page loader both need the same projection: the wire-format CC
 * entity plus the right-column {@link ArtistInfoResponse} (the artist's popular
 * tracks + similar tracks, built live from Jamendo). They differ only in the
 * wrapper field — the resolve response carries the DB `id`, the share-page
 * response carries `og` meta — so the expensive, shared core lives here and each
 * caller wraps it into its own response shape. Keeping it in one place means the
 * share page and the live view always render from identical data.
 */
import type { ApiCcAlbum, ApiCcArtist, ApiCcTrack, ArtistInfoResponse } from "@musiccloud/shared";
import { buildCcArtistInfo } from "./cc-artist-info.js";
import { getCcArtistTopTracks } from "./jamendo/client.js";
import type { CcAlbum, CcArtist, CcTrack } from "./jamendo/types.js";

/**
 * Projects a resolved CC track to its wire shape. Shared by the track, album and
 * artist payloads so the track projection stays defined in exactly one place.
 *
 * @param track - The resolved CC track.
 * @returns The wire-format CC track.
 */
export function toApiCcTrack(track: CcTrack): ApiCcTrack {
  return {
    jamendoId: track.jamendoId,
    title: track.title,
    artistName: track.artistName,
    jamendoArtistId: track.jamendoArtistId,
    albumName: track.albumName,
    artworkUrl: track.artworkUrl,
    durationMs: track.durationMs,
    releaseDate: track.releaseDate,
    licenseCcurl: track.licenseCcurl,
    streamUrl: track.streamUrl,
    downloadUrl: track.downloadUrl,
    downloadAllowed: track.downloadAllowed,
    waveform: track.waveform,
    shareUrl: track.shareUrl,
    musicInfo: track.musicInfo,
    stats: track.stats,
    // Only the single-track resolve fetches licenses; elide the `false` so the
    // album/artist `tracks[]` arrays (no include) stay schlank on the wire.
    proLicensing: track.proLicensing || undefined,
    proUrl: track.proUrl,
  };
}

/**
 * Builds just the CC-track right-column artist info (the track artist's popular
 * tracks + similar tracks + profile) from Jamendo. Split out from the core track
 * card so the share page / live result render the card immediately and load this
 * async (~4 throttled Jamendo calls) via `/api/v1/cc/artist-info`.
 *
 * @param artistName - The track artist's name (column header context).
 * @param jamendoArtistId - The Jamendo artist id whose column to build.
 * @returns The {@link ArtistInfoResponse} for the shared artist column.
 */
export async function buildCcTrackArtistInfo(artistName: string, jamendoArtistId: string): Promise<ArtistInfoResponse> {
  return buildCcArtistInfo(artistName, jamendoArtistId, await getCcArtistTopTracks(jamendoArtistId));
}

/** The shared core of a CC-album share payload: the wire album (with its tracks) + its right column. */
export interface CcAlbumPayload {
  album: ApiCcAlbum;
  artistInfo: ArtistInfoResponse;
}

/**
 * Builds the shared CC-album payload: the wire-format album with its inlined
 * tracks plus the right-column artist info (the album's tracks as the popular
 * column + similar tracks).
 *
 * @param album - The resolved CC album.
 * @param tracks - The album's tracks in release order.
 * @returns The wire album and its {@link ArtistInfoResponse}.
 */
export async function buildCcAlbumPayload(album: CcAlbum, tracks: CcTrack[]): Promise<CcAlbumPayload> {
  const apiAlbum: ApiCcAlbum = {
    jamendoId: album.jamendoId,
    name: album.name,
    artistName: album.artistName,
    artworkUrl: album.artworkUrl,
    releaseDate: album.releaseDate,
    zipUrl: album.zipUrl,
    shareUrl: album.shareUrl,
    tracks: tracks.map(toApiCcTrack),
  };
  const artistInfo = await buildCcArtistInfo(album.artistName, album.jamendoArtistId, tracks);
  return { album: apiAlbum, artistInfo };
}

/** The shared core of a CC-artist share payload: the wire artist (with its top tracks) + its right column. */
export interface CcArtistPayload {
  artist: ApiCcArtist;
  artistInfo: ArtistInfoResponse;
}

/**
 * Builds the shared CC-artist payload: the wire-format artist with its inlined
 * top tracks plus the right-column artist info (the artist's top tracks as the
 * popular column + similar tracks).
 *
 * @param artist - The resolved CC artist.
 * @param topTracks - The artist's most-popular tracks, descending.
 * @returns The wire artist and its {@link ArtistInfoResponse}.
 */
export async function buildCcArtistPayload(artist: CcArtist, topTracks: CcTrack[]): Promise<CcArtistPayload> {
  const apiArtist: ApiCcArtist = {
    jamendoId: artist.jamendoId,
    name: artist.name,
    website: artist.website,
    imageUrl: artist.imageUrl,
    shareUrl: artist.shareUrl,
    topTracks: topTracks.map(toApiCcTrack),
  };
  const artistInfo = await buildCcArtistInfo(artist.name, artist.jamendoId, topTracks);
  return { artist: apiArtist, artistInfo };
}
