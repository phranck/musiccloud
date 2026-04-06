import type { ErrorCode } from "./errors.js";

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
  error: ErrorCode;
  message: string;
}

export type ResolveResponse = ResolveSuccessResponse | ResolveDisambiguationResponse | ResolveErrorResponse;

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

export interface ArtistInfoResponse {
  artistName: string;
  topTracks: ArtistTopTrack[]; // empty if Deezer unavailable
  profile: ArtistProfile | null; // null if Spotify not configured
  events: ArtistEvent[]; // empty if no keys or no upcoming events
}
