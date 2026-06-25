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
import type { CcAlbumShareRow, CcArtistShareRow, CcTrackShareRow, PersistCcTrackData } from "../../db/repository.js";
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
 * Maps a {@link CcTrackShareRow} (DB read) to the {@link CcTrack} domain shape so
 * the share-page loader builds the wire payload from the DB instead of refetching
 * from Jamendo. Coerces the `integer` 0/1 flags to booleans and `null` columns to
 * `undefined` (the domain type uses optionals, not nulls).
 *
 * @param row - The cc-track DB projection (with joined `jamendoArtistId`).
 * @returns The track in {@link CcTrack} domain shape.
 */
export function mapDbRowToCcTrack(row: CcTrackShareRow): CcTrack {
  return {
    jamendoId: row.jamendoId,
    title: row.title,
    artistName: row.artistName,
    jamendoArtistId: row.jamendoArtistId,
    albumName: row.albumName ?? undefined,
    albumPosition: row.albumPosition ?? undefined,
    artworkUrl: row.artworkUrl ?? undefined,
    durationMs: row.durationMs ?? undefined,
    releaseDate: row.releaseDate ?? undefined,
    licenseCcurl: row.licenseCcurl ?? undefined,
    streamUrl: row.streamUrl,
    downloadUrl: row.downloadUrl ?? undefined,
    downloadAllowed: row.downloadAllowed === 1,
    waveform: row.waveform ?? undefined,
    shareUrl: row.shareUrl ?? undefined,
    musicInfo: row.musicInfo ?? undefined,
    stats: row.stats ?? undefined,
    proLicensing: row.proLicensing === 1,
    proUrl: row.proUrl ?? undefined,
  };
}

/**
 * Maps a {@link CcAlbumShareRow} (DB read) to the {@link CcAlbum} domain shape.
 *
 * @param row - The cc-album DB projection (with joined `artistName`/`jamendoArtistId`).
 * @returns The album in {@link CcAlbum} domain shape.
 */
export function mapDbRowToCcAlbum(row: CcAlbumShareRow): CcAlbum {
  return {
    jamendoId: row.jamendoId,
    name: row.name,
    jamendoArtistId: row.jamendoArtistId,
    artistName: row.artistName,
    artworkUrl: row.artworkUrl ?? undefined,
    releaseDate: row.releaseDate ?? undefined,
    zipUrl: row.zipUrl ?? undefined,
    shareUrl: row.shareUrl ?? undefined,
  };
}

/**
 * Maps a {@link CcArtistShareRow} (DB read) to the {@link CcArtist} domain shape.
 *
 * @param row - The cc-artist DB projection.
 * @returns The artist in {@link CcArtist} domain shape.
 */
export function mapDbRowToCcArtist(row: CcArtistShareRow): CcArtist {
  return {
    jamendoId: row.jamendoId,
    name: row.name,
    website: row.website ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
    shareUrl: row.shareUrl ?? undefined,
  };
}

/**
 * Projects a resolved {@link CcTrack} to the DB persist payload. Shared by the
 * resolve route (single track, album tracklist, artist top tracks) and the cache
 * backfill so the share page can read the full entity from the DB. The detail
 * fields (`albumPosition`/`musicInfo`/`stats`/`pro*`) are populated only when the
 * source fetch included them (single-track resolve with
 * `include=musicinfo+stats+licenses`); list contexts leave them undefined and
 * override the position fields per index.
 *
 * @param track - The resolved CC track.
 * @returns The flattened persist payload.
 */
export function ccTrackToPersistData(track: CcTrack): PersistCcTrackData {
  return {
    jamendoId: track.jamendoId,
    title: track.title,
    artistName: track.artistName,
    jamendoArtistId: track.jamendoArtistId,
    albumName: track.albumName,
    jamendoAlbumId: track.jamendoAlbumId,
    artworkUrl: track.artworkUrl,
    durationMs: track.durationMs,
    releaseDate: track.releaseDate,
    licenseCcurl: track.licenseCcurl,
    streamUrl: track.streamUrl,
    downloadUrl: track.downloadUrl,
    downloadAllowed: track.downloadAllowed,
    waveform: track.waveform,
    shareUrl: track.shareUrl,
    albumPosition: track.albumPosition,
    musicInfo: track.musicInfo,
    stats: track.stats,
    proLicensing: track.proLicensing,
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
