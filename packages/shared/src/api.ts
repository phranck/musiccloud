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
}

export interface ApiLink {
  service: string;
  displayName: string;
  url: string;
  confidence: number;
  matchMethod: "isrc" | "search" | "odesli" | "cache" | "upc" | "isrc-inference";
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

// ─── Album API Types ──────────────────────────────────────────────────────────

export interface ApiAlbum {
  title: string;
  artists: string[];
  releaseDate?: string;
  totalTracks?: number;
  artworkUrl?: string;
  label?: string;
  upc?: string;
}

export interface AlbumResolveSuccessResponse {
  id: string;
  shortUrl: string;
  album: ApiAlbum;
  links: ApiLink[];
}

export type AlbumResolveResponse = AlbumResolveSuccessResponse | ResolveErrorResponse;

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
  type: "track" | "album";
  og: OgMeta;
  track?: ApiTrack;
  album?: ApiAlbum;
  links: ApiLink[];
  shortUrl: string;
}
