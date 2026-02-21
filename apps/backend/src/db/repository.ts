import type { NormalizedAlbum, NormalizedTrack } from "../services/types.js";

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

// ─── Artist Cache Types ───────────────────────────────────────────────────────

import type { ArtistTopTrack, ArtistProfile, ArtistEvent } from "@musiccloud/shared";

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

  // URL aliases (short links that redirect to a canonical service URL)
  addTrackUrlAlias(url: string, trackId: string): Promise<void>;

  // Maintenance
  updateTrackTimestamp(trackId: string): Promise<void>;
  cleanupStaleCache(ttlMs?: number): Promise<number>;

  // Artist cache (popular tracks, profile, tour dates)
  findArtistCache(artistName: string): Promise<ArtistCacheRow | null>;
  saveArtistCache(data: ArtistCacheData): Promise<void>;

  // Example: random short ID for landing page teaser
  getRandomShortId(): Promise<string | null>;

  // Lifecycle
  close(): Promise<void>;
}
