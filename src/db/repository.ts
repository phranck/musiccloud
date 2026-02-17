import type { NormalizedTrack } from "../services/types.js";

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

/** Database adapter interface. All methods are async for a consistent API surface. */
export interface TrackRepository {
  // Read operations
  findTrackByUrl(url: string): Promise<CachedTrackResult | null>;
  findTrackByIsrc(isrc: string): Promise<CachedTrackResult | null>;
  findTracksByTextSearch(query: string, maxResults?: number): Promise<NormalizedTrack[]>;
  findExistingByIsrc(isrc: string): Promise<{ trackId: string; shortId: string } | null>;

  // Share page queries
  loadByShortId(shortId: string): Promise<SharePageDbResult | null>;
  loadByTrackId(trackId: string): Promise<SharePageDbResult | null>;

  // Write operations (transaction-safe)
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

  // Maintenance
  updateTrackTimestamp(trackId: string): Promise<void>;
  cleanupStaleCache(ttlMs?: number): Promise<number>;

  // Lifecycle
  close(): Promise<void>;
}
