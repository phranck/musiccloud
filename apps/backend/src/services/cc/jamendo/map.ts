/**
 * @file Maps raw Jamendo API rows to the Creative-Commons domain shapes.
 *
 * Pure functions with no I/O: the endpoint wrappers in `client.ts` fetch the
 * raw rows and pass them through here.
 */

import type { CcMusicInfo, CcTrackStats } from "@musiccloud/shared";
import { decodeHtmlEntities } from "../../../lib/html.js";
import type { CcAlbum, CcArtist, CcTrack, JamendoAlbumRaw, JamendoArtistRaw, JamendoTrackRaw } from "./types.js";

/**
 * Maps the raw Jamendo `musicinfo` block to the flattened {@link CcMusicInfo}
 * domain shape, or `undefined` when the track carries no classification at all.
 *
 * Jamendo nests the three tag families under `tags` and reports the scalar
 * classifiers (vocal/instrumental, gender, …) as siblings; this flattens the tag
 * lists to the top level and camelCases the scalars. When every tag list is empty
 * and no scalar classifier is present, the block carries nothing worth showing,
 * so we return `undefined` and the details card self-hides.
 *
 * @param raw - The raw `musicinfo` object, or undefined when not included.
 * @returns The mapped {@link CcMusicInfo}, or `undefined` when empty.
 */
function mapMusicInfo(raw: JamendoTrackRaw["musicinfo"]): CcMusicInfo | undefined {
  if (!raw) return undefined;
  const genres = raw.tags?.genres ?? [];
  const instruments = raw.tags?.instruments ?? [];
  const vartags = raw.tags?.vartags ?? [];
  const info: CcMusicInfo = {
    genres,
    instruments,
    vartags,
    vocalInstrumental: raw.vocalinstrumental || undefined,
    gender: raw.gender || undefined,
    speed: raw.speed || undefined,
    acousticElectric: raw.acousticelectric || undefined,
    lang: raw.lang || undefined,
  };
  const hasClassifier = Boolean(
    info.vocalInstrumental || info.gender || info.speed || info.acousticElectric || info.lang,
  );
  const hasAnything = genres.length > 0 || instruments.length > 0 || vartags.length > 0 || hasClassifier;
  return hasAnything ? info : undefined;
}

/**
 * Maps the raw Jamendo `stats` block to the {@link CcTrackStats} domain shape, or
 * `undefined` when the track carries no stats.
 *
 * Every counter is camelCased and coerced to a number, defaulting absent counters
 * to 0 so the details card formats them without null checks.
 *
 * @param raw - The raw `stats` object, or undefined when not included.
 * @returns The mapped {@link CcTrackStats}, or `undefined` when not present.
 */
function mapStats(raw: JamendoTrackRaw["stats"]): CcTrackStats | undefined {
  if (!raw) return undefined;
  return {
    listens: raw.rate_listened_total ?? 0,
    downloads: raw.rate_downloads_total ?? 0,
    playlisted: raw.playlisted ?? 0,
    favorited: raw.favorited ?? 0,
    likes: raw.likes ?? 0,
    dislikes: raw.dislikes ?? 0,
    avgNote: raw.avgnote ?? 0,
    notes: raw.notes ?? 0,
  };
}

/**
 * Maps a raw Jamendo track to the CC domain shape.
 * Converts duration seconds → ms and prefers the track image over the album
 * image for artwork.
 *
 * The `musicInfo` / `stats` / `proLicensing` / `proUrl` fields populate only when
 * the request added `include=musicinfo+stats+licenses` (the single-track resolve
 * path, `getCcTrack` in `client.ts`); list-oriented calls omit the include, so
 * the mapper leaves `musicInfo` / `stats` undefined and `proLicensing` false for
 * those.
 *
 * @param raw - Raw Jamendo track object.
 * @returns The mapped {@link CcTrack}.
 */
export function mapJamendoTrack(raw: JamendoTrackRaw): CcTrack {
  return {
    jamendoId: raw.id,
    title: decodeHtmlEntities(raw.name),
    artistName: decodeHtmlEntities(raw.artist_name),
    jamendoArtistId: raw.artist_id,
    albumName: raw.album_name ? decodeHtmlEntities(raw.album_name) : undefined,
    jamendoAlbumId: raw.album_id || undefined,
    albumPosition: raw.position ? Number(raw.position) || undefined : undefined,
    artworkUrl: raw.image || raw.album_image || undefined,
    durationMs: raw.duration ? raw.duration * 1000 : undefined,
    releaseDate: raw.releasedate || undefined,
    licenseCcurl: raw.license_ccurl || undefined,
    streamUrl: raw.audio,
    downloadUrl: raw.audiodownload || undefined,
    downloadAllowed: Boolean(raw.audiodownload_allowed),
    waveform: raw.waveform || undefined,
    shareUrl: raw.shareurl || undefined,
    musicInfo: mapMusicInfo(raw.musicinfo),
    stats: mapStats(raw.stats),
    proLicensing: raw.licenses?.prolicensing === "true",
    proUrl: raw.prourl || undefined,
  };
}

/**
 * Maps a raw Jamendo album to the CC domain shape.
 *
 * @param raw - Raw Jamendo album object.
 * @returns The mapped {@link CcAlbum}.
 */
export function mapJamendoAlbum(raw: JamendoAlbumRaw): CcAlbum {
  return {
    jamendoId: raw.id,
    name: decodeHtmlEntities(raw.name),
    jamendoArtistId: raw.artist_id,
    artistName: decodeHtmlEntities(raw.artist_name),
    artworkUrl: raw.image || undefined,
    releaseDate: raw.releasedate || undefined,
    zipUrl: raw.zip || undefined,
    shareUrl: raw.shareurl || undefined,
  };
}

/**
 * Maps a raw Jamendo artist to the CC domain shape.
 *
 * @param raw - Raw Jamendo artist object.
 * @returns The mapped {@link CcArtist}.
 */
export function mapJamendoArtist(raw: JamendoArtistRaw): CcArtist {
  return {
    jamendoId: raw.id,
    name: decodeHtmlEntities(raw.name),
    website: raw.website || undefined,
    imageUrl: raw.image || undefined,
    shareUrl: raw.shareurl || undefined,
  };
}
