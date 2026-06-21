/**
 * Type definitions for the Jamendo API v3.0 integration.
 *
 * Two layers: raw response shapes exactly as Jamendo returns them
 * (`Jamendo*Raw`, snake_case), and clean CC domain objects the rest of the
 * backend consumes (`Cc*`, camelCase). The client maps raw → domain.
 */

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
  image: string;
  audio: string; // full-track stream URL
  audiodownload: string;
  audiodownload_allowed: boolean;
  license_ccurl: string;
  shareurl: string;
  waveform: string; // escaped JSON string {"peaks":[…]}
  releasedate: string; // YYYY-MM-DD
  /** Present only when the request adds `include=musicinfo`. Drives tag-based track similarity. */
  musicinfo?: { tags?: { genres?: string[] } };
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
  artworkUrl?: string;
  durationMs?: number;
  releaseDate?: string;
  licenseCcurl?: string;
  streamUrl: string;
  downloadUrl?: string;
  downloadAllowed: boolean;
  waveform?: string;
  shareUrl?: string;
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
