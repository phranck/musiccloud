import type { NormalizedAlbum, NormalizedArtist, NormalizedTrack } from "../services/types.js";

/** Cached track with its cross-service links (returned by URL/ISRC lookups) */
export interface CachedTrackResult {
  trackId: string;
  updatedAt: number;
  track: NormalizedTrack;
  links: Array<{
    service: string;
    url: string;
    confidence: number;
    matchMethod: string;
  }>;
}

/** Minimal share-page data returned by the repository (before OG meta generation) */
export interface SharePageDbResult {
  trackId: string;
  track: {
    title: string;
    albumName: string | null;
    artworkUrl: string | null;
    durationMs: number | null;
    isrc: string | null;
    releaseDate: string | null;
    isExplicit: boolean | null;
    previewUrl: string | null;
  };
  artists: string[];
  artistDisplay: string;
  shortId: string;
  links: Array<{ service: string; url: string }>;
}

/** Data needed to persist a resolved track with its cross-service links */
export interface PersistTrackData {
  sourceTrack: {
    title: string;
    artists: string[];
    albumName?: string;
    isrc?: string;
    artworkUrl?: string;
    durationMs?: number;
    releaseDate?: string;
    isExplicit?: boolean;
    previewUrl?: string;
    sourceService?: string;
    sourceUrl?: string;
  };
  links: Array<{
    service: string;
    url: string;
    confidence: number;
    matchMethod: string;
    externalId?: string;
  }>;
}

// ─── Album Types ─────────────────────────────────────────────────────────────

/** Cached album with its cross-service links */
export interface CachedAlbumResult {
  albumId: string;
  updatedAt: number;
  album: NormalizedAlbum;
  links: Array<{
    service: string;
    url: string;
    confidence: number;
    matchMethod: string;
  }>;
}

/** Minimal share-page data for albums */
export interface SharePageAlbumResult {
  album: {
    title: string;
    artworkUrl: string | null;
    releaseDate: string | null;
    totalTracks: number | null;
    label: string | null;
    upc: string | null;
    previewUrl: string | null;
  };
  artists: string[];
  artistDisplay: string;
  shortId: string;
  links: Array<{ service: string; url: string }>;
}

/** Data needed to persist a resolved album with its cross-service links */
export interface PersistAlbumData {
  sourceAlbum: {
    title: string;
    artists: string[];
    upc?: string;
    releaseDate?: string;
    totalTracks?: number;
    artworkUrl?: string;
    label?: string;
    sourceService?: string;
    sourceUrl?: string;
    previewUrl?: string;
  };
  links: Array<{
    service: string;
    url: string;
    confidence: number;
    matchMethod: string;
    externalId?: string;
  }>;
}

// ─── Artist Resolution Types ────────────────────────────────────────────────

/** Cached artist with its cross-service links */
export interface CachedArtistResult {
  artistId: string;
  updatedAt: number;
  artist: NormalizedArtist;
  links: Array<{
    service: string;
    url: string;
    confidence: number;
    matchMethod: string;
  }>;
}

/** Minimal share-page data for artists */
export interface SharePageArtistResult {
  artist: {
    name: string;
    imageUrl: string | null;
    genres: string[];
  };
  shortId: string;
  links: Array<{ service: string; url: string }>;
}

/** Data needed to persist a resolved artist with its cross-service links */
export interface PersistArtistData {
  sourceArtist: {
    name: string;
    imageUrl?: string;
    genres?: string[];
    sourceService?: string;
    sourceUrl?: string;
  };
  links: Array<{
    service: string;
    url: string;
    confidence: number;
    matchMethod: string;
    externalId?: string;
  }>;
}

// ─── Artist Cache Types ───────────────────────────────────────────────────────

import type { ArtistEvent, ArtistProfile, ArtistTopTrack } from "@musiccloud/shared";

export interface ArtistCacheRow {
  artistName: string;
  topTracks: ArtistTopTrack[];
  profile: ArtistProfile | null;
  events: ArtistEvent[];
  tracksUpdatedAt: number;
  profileUpdatedAt: number;
  eventsUpdatedAt: number;
}

export interface ArtistCacheData {
  artistName: string; // normalized (lowercase + trimmed)
  topTracks?: ArtistTopTrack[];
  profile?: ArtistProfile | null;
  events?: ArtistEvent[];
  profileUpdatedAt?: number;
  tracksUpdatedAt?: number;
  eventsUpdatedAt?: number;
}

// ─── Repository Interface ─────────────────────────────────────────────────────

/** Database adapter interface. All methods are async for a consistent API surface. */
export interface TrackRepository {
  // Track: Read operations
  findTrackByUrl(url: string): Promise<CachedTrackResult | null>;
  findShortIdByTrackUrl(url: string): Promise<string | null>;
  findTrackByIsrc(isrc: string): Promise<CachedTrackResult | null>;
  findTracksByTextSearch(query: string, maxResults?: number): Promise<NormalizedTrack[]>;
  findExistingByIsrc(isrc: string): Promise<{ trackId: string; shortId: string } | null>;

  // Track: Share page queries
  loadByShortId(shortId: string): Promise<SharePageDbResult | null>;
  loadByTrackId(trackId: string): Promise<SharePageDbResult | null>;

  // Track: Write operations (transaction-safe)
  persistTrackWithLinks(data: PersistTrackData): Promise<{ trackId: string; shortId: string }>;
  addLinksToTrack(
    trackId: string,
    links: Array<{
      service: string;
      url: string;
      confidence: number;
      matchMethod: string;
      externalId?: string;
    }>,
  ): Promise<void>;

  // Album: Read operations
  findAlbumByUrl(url: string): Promise<CachedAlbumResult | null>;
  findAlbumByUpc(upc: string): Promise<CachedAlbumResult | null>;
  findExistingAlbumByUpc(upc: string): Promise<{ albumId: string; shortId: string } | null>;

  // Album: Share page queries
  loadAlbumByShortId(shortId: string): Promise<SharePageAlbumResult | null>;

  // Album: Write operations (transaction-safe)
  persistAlbumWithLinks(data: PersistAlbumData): Promise<{ albumId: string; shortId: string }>;
  addLinksToAlbum(
    albumId: string,
    links: Array<{
      service: string;
      url: string;
      confidence: number;
      matchMethod: string;
      externalId?: string;
    }>,
  ): Promise<void>;

  // Artist: Read operations
  findArtistByUrl(url: string): Promise<CachedArtistResult | null>;
  findArtistByName(name: string): Promise<CachedArtistResult | null>;

  // Artist: Share page queries
  loadArtistByShortId(shortId: string): Promise<SharePageArtistResult | null>;

  // Artist: Write operations (transaction-safe)
  persistArtistWithLinks(data: PersistArtistData): Promise<{ artistId: string; shortId: string }>;
  addLinksToArtist(
    artistId: string,
    links: Array<{
      service: string;
      url: string;
      confidence: number;
      matchMethod: string;
      externalId?: string;
    }>,
  ): Promise<void>;

  // URL aliases (short links that redirect to a canonical service URL)
  addTrackUrlAlias(url: string, trackId: string): Promise<void>;

  // Maintenance
  updateTrackTimestamp(trackId: string): Promise<void>;
  updatePreviewUrl(trackId: string, previewUrl: string): Promise<void>;
  cleanupStaleCache(ttlMs?: number): Promise<number>;

  // Artist cache (popular tracks, profile, tour dates)
  findArtistCache(artistName: string): Promise<ArtistCacheRow | null>;
  saveArtistCache(data: ArtistCacheData): Promise<void>;

  // Example: random short ID for landing page teaser
  getRandomShortId(): Promise<string | null>;

  // Apple client telemetry (Testflight diagnostics)
  insertAppTelemetryEvent(row: AppTelemetryEventInput): Promise<void>;

  // Lifecycle
  close(): Promise<void>;
}

/** Payload accepted by `insertAppTelemetryEvent`. Shape matches the
 * /api/v1/telemetry/app-error request body one-to-one. */
export interface AppTelemetryEventInput {
  eventType: string;
  eventTime: Date;
  installId: string;
  appVersion: string;
  buildNumber: string;
  platform: string;
  osVersion: string;
  deviceModel: string;
  locale: string;
  sourceUrl: string | null;
  service: string | null;
  errorKind: string;
  httpStatus: number | null;
  message: string;
}
