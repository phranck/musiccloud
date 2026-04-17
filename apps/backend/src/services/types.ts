/**
 * @file Adapter contract and shared shapes for the resolve subsystem.
 *
 * This file defines what a streaming-service adapter has to look like so
 * the generic resolver (`services/resolver.ts`) can run across any of
 * them without knowing which one it is dealing with. Every plugin under
 * `services/plugins/<name>/adapter.ts` implements `ServiceAdapter`.
 *
 * ## Three layers of support, each optional
 *
 * `ServiceAdapter` has a mandatory **track** surface (every adapter must
 * resolve tracks) and two optional surfaces for **albums** and
 * **artists**. Optional means: if the fields (`albumCapabilities`,
 * `detectAlbumUrl`, etc.) are present the adapter participates in album
 * resolves; if they are absent the resolver simply skips it for album
 * work. That is how we can ship, say, Deezer with full album+artist
 * support and a smaller service with only tracks without forking the
 * interface.
 *
 * ## Why re-export `ServiceId` / `isValidServiceId`
 *
 * The canonical definitions live in `@musiccloud/shared` so that the
 * frontend and dashboard share the same ID set. The re-exports exist
 * purely so backend call sites can use short relative imports
 * (`../services/types.js`) instead of reaching into the workspace
 * package on every file.
 *
 * ## `TrackSource` includes "cached"
 *
 * When the resolver returns a track loaded from the DB cache rather than
 * from a live adapter call, the source is reported as `"cached"` in
 * place of a real `ServiceId`. Callers that need to know whether the
 * data is fresh should branch on this.
 *
 * ## Optional `searchTrackWithCandidates`
 *
 * The core track search returns a single `MatchResult`. Adapters that
 * can return more than one candidate (used by the POST resolve endpoint
 * to build a disambiguation list) implement this richer variant on top.
 * The resolver falls back to `searchTrack` when the richer variant is
 * not provided, so adapters without it still work for URL resolves and
 * for text searches that do not need disambiguation.
 */
import type { ServiceId } from "@musiccloud/shared";

export type { ServiceId } from "@musiccloud/shared";
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

  // Optional genre-based discovery search (adapters implement as needed).
  // The generic orchestrator picks whichever adapter declares this.
  searchByGenre?(input: GenreSearchInput): Promise<GenreSearchResult>;
}

// ─── Genre-search Types ─────────────────────────────────────────────────────

/** Input to an adapter's genre-based discovery search. */
export interface GenreSearchInput {
  /** User-supplied genre names, already parsed. OR-combined. */
  genres: string[];
  /** Sampling mode: `"hot"` = top-N, `"mixed"` = stratified random sample. */
  vibe: "hot" | "mixed";
  /** Desired count per type. `0` means "don't fetch this type". */
  tracks: number;
  albums: number;
  artists: number;
}

/** Result of a genre-based discovery search. */
export interface GenreSearchResult {
  tracks: NormalizedTrack[];
  albums: NormalizedAlbum[];
  artists: NormalizedArtist[];
}

/**
 * Track-level row in a genre-search response. Shape is intentionally
 * similar to `SearchCandidate` so the existing disambiguation row
 * component can render it with minimal work. `webUrl` is what the click
 * handler feeds back into the resolve endpoint to trigger the full
 * cross-service resolve flow.
 */
export interface GenreTrackCandidate {
  id: string;
  title: string;
  artists: string[];
  albumName?: string;
  artworkUrl?: string;
  durationMs?: number;
  webUrl: string;
}

/** Album-level row in a genre-search response. */
export interface GenreAlbumCandidate {
  id: string;
  title: string;
  artists: string[];
  artworkUrl?: string;
  webUrl: string;
}

/** Artist-level row in a genre-search response. */
export interface GenreArtistCandidate {
  id: string;
  name: string;
  imageUrl?: string;
  webUrl: string;
}

/**
 * The third variant of the `POST /api/v1/resolve` response, produced when
 * the incoming query carries a `genre:` prefix. Carries up to three
 * parallel candidate lists (any of which may be `null` if the user did
 * not request that type).
 */
export interface GenreSearchResponse {
  status: "genre-search";
  query: {
    genres: string[];
    vibe: "hot" | "mixed";
    /** `null` = type not requested; positive integer = requested count */
    tracks: number | null;
    albums: number | null;
    artists: number | null;
  };
  results: {
    tracks: GenreTrackCandidate[] | null;
    albums: GenreAlbumCandidate[] | null;
    artists: GenreArtistCandidate[] | null;
  };
  /**
   * Non-fatal notes about how the query was interpreted — e.g. when
   * `count` and per-type fields were combined and last-wins kicked in.
   * Always present; empty array means the query was clean.
   */
  warnings: string[];
}

/** Produced when the query is exactly `genre:?`. */
export interface GenreBrowseResponse {
  status: "genre-browse";
  genres: { name: string; displayName: string; artworkUrl: string; accentColor?: string }[];
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
