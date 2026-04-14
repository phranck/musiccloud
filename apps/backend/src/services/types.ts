import type { ServiceId } from "@musiccloud/shared";

export type { ServiceId } from "@musiccloud/shared";
// Canonical ServiceId / isValidServiceId live in `@musiccloud/shared`
// (services.ts). Re-exported here so backend call sites can keep their
// short relative imports.
export { isValidServiceId } from "@musiccloud/shared";

/** ServiceId plus "cached" for tracks loaded from the database cache */
export type TrackSource = ServiceId | "cached";

export interface NormalizedTrack {
  isrc?: string;
  sourceService: TrackSource;
  sourceId: string;
  title: string;
  artists: string[];
  albumName?: string;
  durationMs?: number;
  releaseDate?: string;
  isExplicit?: boolean;
  artworkUrl?: string;
  previewUrl?: string;
  webUrl: string;
}

export interface MatchResult {
  found: boolean;
  track?: NormalizedTrack;
  confidence: number;
  matchMethod: MatchMethod;
}

export interface SearchResultWithCandidates {
  bestMatch: MatchResult;
  candidates: Array<{
    track: NormalizedTrack;
    confidence: number;
  }>;
}

export type MatchMethod = "isrc" | "search" | "cache";

export interface AdapterCapabilities {
  supportsIsrc: boolean;
  supportsPreview: boolean;
  supportsArtwork: boolean;
}

export interface ServiceAdapter {
  readonly id: ServiceId;
  readonly displayName: string;
  readonly capabilities: AdapterCapabilities;

  isAvailable(): boolean;
  detectUrl(url: string): string | null;
  getTrack(trackId: string): Promise<NormalizedTrack>;
  findByIsrc(isrc: string): Promise<NormalizedTrack | null>;
  searchTrack(query: SearchQuery): Promise<MatchResult>;
  searchTrackWithCandidates?(query: SearchQuery): Promise<SearchResultWithCandidates>;

  // Optional album support (adapters implement as needed)
  readonly albumCapabilities?: AlbumCapabilities;
  detectAlbumUrl?(url: string): string | null;
  getAlbum?(albumId: string): Promise<NormalizedAlbum>;
  findAlbumByUpc?(upc: string): Promise<NormalizedAlbum | null>;
  searchAlbum?(query: AlbumSearchQuery): Promise<AlbumMatchResult>;

  // Optional artist support (adapters implement as needed)
  readonly artistCapabilities?: ArtistCapabilities;
  detectArtistUrl?(url: string): string | null;
  getArtist?(artistId: string): Promise<NormalizedArtist>;
  searchArtist?(query: ArtistSearchQuery): Promise<ArtistMatchResult>;
}

export interface SearchQuery {
  title: string;
  artist: string;
  album?: string;
}

export interface ResolveResponse {
  id: string;
  shortUrl: string;
  track: {
    title: string;
    artists: string[];
    albumName?: string;
    artworkUrl?: string;
  };
  links: ServiceLink[];
}

export interface ServiceLink {
  service: ServiceId;
  displayName: string;
  url: string;
  confidence: number;
  matchMethod: MatchMethod;
}

export interface SearchCandidate {
  id: string;
  title: string;
  artists: string[];
  albumName?: string;
  artworkUrl?: string;
  durationMs?: number;
  confidence: number;
}

export interface DisambiguationResponse {
  status: "disambiguation";
  candidates: SearchCandidate[];
}

// ─── Album Types ────────────────────────────────────────────────────────────

/** Album-level normalized data (parallel to NormalizedTrack) */
export interface NormalizedAlbum {
  upc?: string;
  sourceService: TrackSource;
  sourceId: string;
  title: string;
  artists: string[];
  releaseDate?: string;
  totalTracks?: number;
  artworkUrl?: string;
  label?: string;
  webUrl: string;
  /** Optional track listing for ISRC-based cross-matching */
  tracks?: AlbumTrackEntry[];
  /** Preview URL of the most popular track (from Deezer, by rank) */
  topTrackPreviewUrl?: string;
}

/** Minimal track info within an album (for ISRC-based cross-matching) */
export interface AlbumTrackEntry {
  title: string;
  isrc?: string;
  trackNumber: number;
  durationMs?: number;
}

/** Album text/metadata search query */
export interface AlbumSearchQuery {
  title: string;
  artist: string;
  year?: string;
  totalTracks?: number;
}

/** Album match result (parallel to MatchResult) */
export interface AlbumMatchResult {
  found: boolean;
  album?: NormalizedAlbum;
  confidence: number;
  matchMethod: MatchMethod;
}

/** Album-level adapter capabilities */
export interface AlbumCapabilities {
  supportsUpc: boolean;
  supportsAlbumSearch: boolean;
  supportsTrackListing: boolean;
}

// ─── Artist Types ───────────────────────────────────────────────────────────

/** Artist-level normalized data (parallel to NormalizedTrack / NormalizedAlbum) */
export interface NormalizedArtist {
  sourceService: TrackSource;
  sourceId: string;
  name: string;
  imageUrl?: string;
  genres?: string[];
  webUrl: string;
}

/** Artist text/name search query */
export interface ArtistSearchQuery {
  name: string;
}

/** Artist match result (parallel to MatchResult / AlbumMatchResult) */
export interface ArtistMatchResult {
  found: boolean;
  artist?: NormalizedArtist;
  confidence: number;
  matchMethod: MatchMethod;
}

/** Artist-level adapter capabilities */
export interface ArtistCapabilities {
  supportsArtistSearch: boolean;
}
