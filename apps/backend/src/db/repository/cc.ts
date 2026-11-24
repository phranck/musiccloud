/**
 * Repository contract for the Creative Commons catalog: persisting resolved
 * Jamendo tracks, albums and artists, and reading their share pages back by
 * short id. `postgres-cc.ts` implements it behind the `PostgresAdapter` facade.
 */

import type { CcMusicInfo, CcTrackStats } from "@musiccloud/shared";

/** Data needed to persist a resolved CC track (artist + optional album inline). */
export interface PersistCcTrackData {
  jamendoId: string;
  title: string;
  artistName: string;
  jamendoArtistId: string;
  artistImageUrl?: string;
  artistWebsite?: string;
  artistShareUrl?: string;
  albumName?: string;
  jamendoAlbumId?: string;
  albumArtworkUrl?: string;
  albumReleaseDate?: string;
  albumZipUrl?: string;
  albumShareUrl?: string;
  artworkUrl?: string;
  durationMs?: number;
  releaseDate?: string;
  licenseCcurl?: string;
  streamUrl: string;
  downloadUrl?: string;
  downloadAllowed: boolean;
  waveform?: string;
  shareUrl?: string;
  /** 1-based position within an album tracklist (set when persisted via an album resolve). */
  albumPosition?: number;
  /** 0-based rank within the artist's popularity-ordered top tracks (set via an artist resolve). */
  artistTopPosition?: number;
  /** `include=musicinfo` classification (single-track resolve only). */
  musicInfo?: CcMusicInfo;
  /** `include=stats` engagement counters (single-track resolve only). */
  stats?: CcTrackStats;
  /** Jamendo Pro licensing flag (single-track resolve only). */
  proLicensing?: boolean;
  /** Jamendo Pro licensing page URL (single-track resolve only). */
  proUrl?: string;
}

/**
 * Data needed to persist a resolved CC album. The artist is upserted minimally
 * (id + name) to satisfy the `cc_albums.cc_artist_id` FK; a later artist resolve
 * enriches it (image/website/share) via the same `jamendo_id` upsert key.
 *
 * `tracks` is the album's tracklist in release order. It is persisted alongside
 * the album so the share page renders the tracklist from the DB without a live
 * Jamendo call.
 */
export interface PersistCcAlbumData {
  jamendoId: string;
  name: string;
  jamendoArtistId: string;
  artistName: string;
  artworkUrl?: string;
  releaseDate?: string;
  zipUrl?: string;
  shareUrl?: string;
  tracks: PersistCcTrackData[];
}

/**
 * Data needed to persist a resolved CC artist.
 *
 * `topTracks` is the artist's popularity-ordered top tracks. They are persisted
 * with the artist so the share page renders the column from the DB without a
 * live call.
 */
export interface PersistCcArtistData {
  jamendoId: string;
  name: string;
  imageUrl?: string;
  website?: string;
  shareUrl?: string;
  topTracks: PersistCcTrackData[];
}

/**
 * Result of resolving a public CC short id to its entity kind. The share-page
 * loader switches on `kind` to pick the matching DB read.
 */
export interface CcShortIdLookup {
  kind: "cc-track" | "cc-album" | "cc-artist";
  jamendoId: string;
}

/**
 * Full cc-track projection for the share page, read from the DB (no Jamendo).
 * `jamendoArtistId` is joined in from `cc_artists` so the wire `ApiCcTrack` and
 * the right-column artist fetch have it. `downloadAllowed`/`proLicensing` are the
 * raw `integer` 0/1 columns; the mapper coerces them to booleans.
 */
export interface CcTrackShareRow {
  jamendoId: string;
  title: string;
  artistName: string;
  jamendoArtistId: string;
  albumName: string | null;
  albumPosition: number | null;
  artworkUrl: string | null;
  durationMs: number | null;
  releaseDate: string | null;
  licenseCcurl: string | null;
  streamUrl: string;
  downloadUrl: string | null;
  downloadAllowed: number | null;
  waveform: string | null;
  shareUrl: string | null;
  musicInfo: CcMusicInfo | null;
  stats: CcTrackStats | null;
  proLicensing: number | null;
  proUrl: string | null;
}

/** Album entity projection for the share page (with `jamendoArtistId` joined in). */
export interface CcAlbumShareRow {
  jamendoId: string;
  name: string;
  artistName: string;
  jamendoArtistId: string;
  artworkUrl: string | null;
  releaseDate: string | null;
  zipUrl: string | null;
  shareUrl: string | null;
}

/** Artist entity projection for the share page. */
export interface CcArtistShareRow {
  jamendoId: string;
  name: string;
  website: string | null;
  imageUrl: string | null;
  shareUrl: string | null;
}

/** CC persistence + lookups, kept separate from the commercial TrackRepository. */
export interface CcRepository {
  persistCcTrack(data: PersistCcTrackData): Promise<{ ccTrackId: string; shortId: string }>;
  persistCcAlbum(data: PersistCcAlbumData): Promise<{ ccAlbumId: string; shortId: string }>;
  persistCcArtist(data: PersistCcArtistData): Promise<{ ccArtistId: string; shortId: string }>;
  /** Resolves a public CC short id (track, album or artist) to its kind + Jamendo id. */
  findCcShortId(shortId: string): Promise<CcShortIdLookup | null>;
  /** Reads the full cc-track share projection from the DB (no Jamendo). */
  loadCcTrackByShortId(shortId: string): Promise<CcTrackShareRow | null>;
  /** Reads a cc-album entity plus its persisted tracklist (release order) from the DB. */
  loadCcAlbumByShortId(shortId: string): Promise<{ album: CcAlbumShareRow; tracks: CcTrackShareRow[] } | null>;
  /** Reads a cc-artist entity plus its persisted top tracks (popularity order) from the DB. */
  loadCcArtistByShortId(shortId: string): Promise<{ artist: CcArtistShareRow; topTracks: CcTrackShareRow[] } | null>;
  /** Returns a random existing CC track short id, or `null` when none exist. */
  getRandomCcShortId(): Promise<string | null>;
}
