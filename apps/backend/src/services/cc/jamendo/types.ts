/**
 * Type definitions for the Jamendo API v3.0 integration.
 *
 * Two layers: raw response shapes exactly as Jamendo returns them
 * (`Jamendo*Raw`, snake_case), and clean CC domain objects the rest of the
 * backend consumes (`Cc*`, camelCase). The client maps raw → domain.
 */

import type { CcMusicInfo, CcTrackStats } from "@musiccloud/shared";

/**
 * Jamendo wraps every response in a `headers` + `results` envelope.
 *
 * @typeParam T - The element type of the `results` array.
 */
export interface JamendoEnvelope<T> {
  headers: {
    status: "success" | "failed";
    code: number;
    error_message?: string;
    results_count: number;
  };
  results: T[];
}

/** Raw track object as returned by `GET /v3.0/tracks`. */
export interface JamendoTrackRaw {
  id: string;
  name: string;
  duration: number; // seconds
  artist_id: string;
  artist_name: string;
  album_id: string;
  album_name: string;
  album_image: string;
  /** The track's 1-based position within its album, as a string. Absent for
   *  album-less singles; Jamendo returns it on tracks that belong to an album. */
  position?: string;
  image: string;
  audio: string; // full-track stream URL
  audiodownload: string;
  audiodownload_allowed: boolean;
  license_ccurl: string;
  shareurl: string;
  waveform: string; // escaped JSON string {"peaks":[…]}
  releasedate: string; // YYYY-MM-DD
  /**
   * Present only when the request adds `include=musicinfo`. The nested `tags`
   * drive tag-based similarity (`tags.genres`, read by `getSimilarCcTracks`) and
   * the CC details card (instruments, mood); the scalar classifiers feed the
   * details card's vocal / tempo / language rows. All fields best-effort —
   * Jamendo populates them unevenly.
   */
  musicinfo?: {
    vocalinstrumental?: string;
    gender?: string;
    speed?: string;
    acousticelectric?: string;
    lang?: string;
    tags?: { genres?: string[]; instruments?: string[]; vartags?: string[] };
  };
  /** Present only when the request adds `include=stats`. Engagement counters for the CC details card. */
  stats?: {
    rate_listened_total?: number;
    rate_downloads_total?: number;
    playlisted?: number;
    favorited?: number;
    likes?: number;
    dislikes?: number;
    avgnote?: number;
    notes?: number;
  };
  /**
   * Present only when the request adds `include=licenses`. CC clause flags plus
   * the Jamendo Pro licensing flags — every value is the string `"true"` or
   * `"false"`, not a boolean.
   */
  licenses?: {
    cc?: string;
    ccnc?: string;
    ccnd?: string;
    ccsa?: string;
    prolicensing?: string;
    probackground?: string;
  };
  /** Jamendo Pro licensing page URL for the track (top-level, present with `include=licenses`). */
  prourl?: string;
}

/** Raw album object as returned by `GET /v3.0/albums`. */
export interface JamendoAlbumRaw {
  id: string;
  name: string;
  artist_id: string;
  artist_name: string;
  image: string;
  releasedate: string;
  zip: string;
  shareurl: string;
}

/** Raw artist object as returned by `GET /v3.0/artists`. */
export interface JamendoArtistRaw {
  id: string;
  name: string;
  website: string;
  image: string;
  shareurl: string;
  /**
   * Present only when the request adds `include=musicinfo`. Unlike
   * {@link JamendoTrackRaw.musicinfo}, the artist payload exposes `tags` as a
   * flat `string[]` (genre tags), and adds a locale-keyed `description` map
   * (the artist bio per language, e.g. `{ en: "…", de: "…" }`).
   */
  musicinfo?: { tags?: string[]; description?: Record<string, string> };
}

/**
 * A Jamendo genre in musiccloud's domain shape. Drives the CC browse grid:
 * `name` feeds `tags=<name>` track searches and the genre-artwork cover
 * lookup; `displayName` is the human label. The set is a hand-curated list of
 * Jamendo genre tags (see `CC_GENRES` in `client.ts`) — Jamendo has no
 * dedicated "top genres" endpoint.
 *
 * No tile-cover field: the browse tile cover is the procedurally generated
 * CC genre artwork (genre name baked into a representative Jamendo album
 * cover), served by the `/api/v1/cc/genre-artwork/:genreKey` route.
 */
export interface CcGenre {
  /** Jamendo genre tag used in `tags=` track searches, e.g. `"jazz"`. */
  name: string;
  /** Human label for the UI tile, e.g. `"Jazz"`. */
  displayName: string;
}

/**
 * A Creative-Commons track in musiccloud's domain shape.
 * `durationMs` is milliseconds (Jamendo reports seconds; the mapper multiplies).
 */
export interface CcTrack {
  jamendoId: string;
  title: string;
  artistName: string;
  jamendoArtistId: string;
  albumName?: string;
  jamendoAlbumId?: string;
  /** 1-based track position within its album, when the track belongs to one. */
  albumPosition?: number;
  artworkUrl?: string;
  durationMs?: number;
  releaseDate?: string;
  licenseCcurl?: string;
  streamUrl: string;
  downloadUrl?: string;
  downloadAllowed: boolean;
  waveform?: string;
  shareUrl?: string;
  /** `include=musicinfo` classification, when the single-track resolve fetched it. */
  musicInfo?: CcMusicInfo;
  /** `include=stats` engagement counters, when the single-track resolve fetched them. */
  stats?: CcTrackStats;
  /** True when the track is also licensable via Jamendo Pro (`licenses.prolicensing === "true"`). */
  proLicensing?: boolean;
  /** Jamendo Pro licensing page for the track (`prourl`). */
  proUrl?: string;
}

/** A Creative-Commons album in domain shape. */
export interface CcAlbum {
  jamendoId: string;
  name: string;
  jamendoArtistId: string;
  artistName: string;
  artworkUrl?: string;
  releaseDate?: string;
  zipUrl?: string;
  shareUrl?: string;
}

/** A Creative-Commons artist in domain shape. */
export interface CcArtist {
  jamendoId: string;
  name: string;
  website?: string;
  imageUrl?: string;
  shareUrl?: string;
}

/**
 * The `include=musicinfo` enrichment for a Jamendo artist, in domain shape.
 * Feeds the CC artist-info card's profile section (`imageUrl`, `genres`, `bio`).
 *
 * Distinct from {@link CcArtist}: that is the lightweight resolve entity, this
 * is the heavier profile enrichment fetched separately so the resolve path only
 * pays for it when building the artist column.
 *
 * @property imageUrl - The artist's Jamendo image, or `null` when absent.
 * @property genres - Genre tags from `musicinfo.tags`, capped at 3 to honour the
 *   `ArtistProfile.genres` "max 3" contract.
 * @property bioSummary - The artist bio for the requested locale (falling back
 *   to English, then `null`), from `musicinfo.description`.
 */
export interface CcArtistMusicInfo {
  imageUrl: string | null;
  genres: string[];
  bioSummary: string | null;
}
