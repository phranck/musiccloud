/**
 * Wire-format types for the public resolve / share / artist-info APIs.
 *
 * Every type in this file is a direct shape of a JSON payload that crosses
 * the backend-frontend boundary. Changing one of these is a wire-format
 * breaking change: cached share pages rendered against the old shape will
 * stop hydrating. When a field needs to evolve, prefer adding an optional
 * sibling over renaming.
 *
 * `ResolveResponse` is a discriminated union because callers must switch on
 * the shape anyway (success vs disambiguation vs error); encoding the cases
 * at the type level forces every consumer to handle all three.
 *
 * `UnifiedResolveSuccessResponse` additionally discriminates by resource
 * kind (`type: "track" | "album" | "artist"`) so the share route can return
 * one endpoint for all three without the frontend probing fields.
 */

export interface ApiTrack {
  title: string;
  artists: string[];
  albumName?: string;
  artworkUrl?: string;
  durationMs?: number;
  isrc?: string;
  releaseDate?: string;
  isExplicit?: boolean;
  previewUrl?: string;
}

export interface ApiLink {
  service: string;
  displayName: string;
  url: string;
  confidence: number;
  matchMethod: "isrc" | "search" | "cache" | "upc" | "isrc-inference";
}

export interface ApiDisambiguationCandidate {
  id: string;
  title: string;
  artists: string[];
  albumName?: string;
  artworkUrl?: string;
}

export interface ResolveSuccessResponse {
  id: string;
  shortUrl: string;
  track: ApiTrack;
  links: ApiLink[];
}

export interface ResolveDisambiguationResponse {
  status: "disambiguation";
  candidates: ApiDisambiguationCandidate[];
}

export interface ResolveErrorResponse {
  /**
   * Canonical error code. During the Phase 2 sweep this is typically an MC
   * code (`MC-URL-0001`, …) but a handful of older call sites still emit
   * legacy codes like `TRACK_NOT_FOUND`. Both forms are resolvable against
   * the registry in `./error-codes` via `getErrorEntry()`.
   */
  error: string;
  /**
   * User-facing message. Ends with the canonical code in parentheses so it
   * can be quoted verbatim in bug reports: e.g. "Track not found.
   * (MC-RES-0001)".
   */
  message: string;
}

export type ResolveResponse =
  | ResolveSuccessResponse
  | ResolveDisambiguationResponse
  | ResolveGenreSearchResponse
  | ResolveErrorResponse;

// ─── Genre Search Response ────────────────────────────────────────────────────

/** Track row returned by a genre-search query. */
export interface ApiGenreTrackCandidate {
  id: string;
  title: string;
  artists: string[];
  albumName?: string;
  artworkUrl?: string;
  durationMs?: number;
  /** Deezer URL — click handler feeds this into a follow-up resolve. */
  webUrl: string;
}

/** Album row returned by a genre-search query. */
export interface ApiGenreAlbumCandidate {
  id: string;
  title: string;
  artists: string[];
  artworkUrl?: string;
  webUrl: string;
}

/** Artist row returned by a genre-search query. */
export interface ApiGenreArtistCandidate {
  id: string;
  name: string;
  imageUrl?: string;
  webUrl: string;
}

/**
 * Third resolve response variant, produced when the query starts with
 * `genre:`. Each list in `results` is either a populated array or `null`
 * when the user did not request that type.
 */
export interface ResolveGenreSearchResponse {
  status: "genre-search";
  query: {
    genres: string[];
    vibe: "hot" | "mixed";
    tracks: number | null;
    albums: number | null;
    artists: number | null;
  };
  results: {
    tracks: ApiGenreTrackCandidate[] | null;
    albums: ApiGenreAlbumCandidate[] | null;
    artists: ApiGenreArtistCandidate[] | null;
  };
  /**
   * Non-fatal observations from the query parser — things that were
   * reconciled rather than rejected (e.g. `count` and per-type fields
   * combined with last-wins). The UI should surface these under the
   * result lists so users see what was adjusted. Always present;
   * empty array means the query was clean.
   */
  warnings: string[];
}

// ─── Unified Resolve Response ─────────────────────────────────────────────────

export type UnifiedResolveSuccessResponse =
  | ({ type: "track" } & ResolveSuccessResponse)
  | ({ type: "album" } & AlbumResolveSuccessResponse)
  | ({ type: "artist" } & ArtistResolveSuccessResponse);

// ─── Album API Types ──────────────────────────────────────────────────────────

export interface ApiAlbum {
  title: string;
  artists: string[];
  releaseDate?: string;
  totalTracks?: number;
  artworkUrl?: string;
  label?: string;
  upc?: string;
  previewUrl?: string;
}

export interface AlbumResolveSuccessResponse {
  id: string;
  shortUrl: string;
  album: ApiAlbum;
  links: ApiLink[];
}

// ─── Artist Resolve API Types ────────────────────────────────────────────────

export interface ApiArtist {
  name: string;
  imageUrl?: string;
  genres?: string[];
}

export interface ArtistResolveSuccessResponse {
  id: string;
  shortUrl: string;
  artist: ApiArtist;
  links: ApiLink[];
}

// ─── Share Page Response ──────────────────────────────────────────────────────

/** OG meta tags returned by the backend share endpoint */
export interface OgMeta {
  title: string;
  description: string;
  image?: string;
  url: string;
}

/** Unified share page data returned by GET /api/v1/share/:shortId */
export interface SharePageResponse {
  type: "track" | "album" | "artist";
  og: OgMeta;
  track?: ApiTrack;
  album?: ApiAlbum;
  artist?: ApiArtist;
  links: ApiLink[];
  shortUrl: string;
}

// ─── Artist Info Response ──────────────────────────────────────────────────────

export interface ArtistTopTrack {
  title: string;
  artists: string[];
  albumName: string | null;
  artworkUrl: string | null;
  durationMs: number | null;
  deezerUrl: string;
  shortId: string | null;
}

export interface ArtistProfile {
  spotifyId: string;
  imageUrl: string | null;
  genres: string[]; // max 3 (Spotify)
  popularity: number; // 0–100 (Spotify)
  followers: number; // Spotify follower count
  // Last.fm enrichment (null if LASTFM_API_KEY not set)
  bioSummary: string | null;
  scrobbles: number | null;
  similarArtists: string[]; // max 3 artist names
}

export interface ArtistEvent {
  date: string; // "YYYY-MM-DD"
  venueName: string;
  city: string;
  country: string; // ISO country code
  ticketUrl: string | null;
  source: "bandsintown" | "ticketmaster";
}

export interface SimilarArtistTrack {
  artistName: string;
  track: ArtistTopTrack | null;
}

export interface ArtistInfoResponse {
  artistName: string;
  topTracks: ArtistTopTrack[]; // empty if Deezer unavailable
  profile: ArtistProfile | null; // null if Spotify not configured
  events: ArtistEvent[]; // empty if no keys or no upcoming events
  similarArtistTracks?: SimilarArtistTrack[]; // top track per similar artist
}
