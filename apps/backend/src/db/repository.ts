import type { VinylLayout } from "@musiccloud/shared";
import type { ArtistCredit, ExternalIdRecord, NormalizedAlbum, NormalizedTrack } from "../services/types.js";
import type { ArtistIdentityEnrichmentRepository } from "./repository/artist-identity.js";
import type { ArtistRepository } from "./repository/artists.js";

export type {
  ArtistIdentityCandidate,
  ArtistIdentityCheckOutcome,
  ArtistIdentityEnrichmentRepository,
  ArtistIdentitySnapshot,
  ArtistMembershipSnapshot,
  PartialDateRecord,
} from "./repository/artist-identity.js";

export type {
  ArtistCacheData,
  ArtistCacheIdentity,
  ArtistCacheRow,
  ArtistEntityType,
  ArtistGroupMembershipRecord,
  ArtistIdentityEventRecord,
  ArtistIdentityEventType,
  ArtistInfoEntity,
  ArtistRepository,
  ArtistVerificationStatus,
  CachedArtistResult,
  DatePrecision,
  PersistArtistData,
} from "./repository/artists.js";

export type {
  CcAlbumShareRow,
  CcArtistShareRow,
  CcRepository,
  CcShortIdLookup,
  CcTrackShareRow,
  PersistCcAlbumData,
  PersistCcArtistData,
  PersistCcTrackData,
} from "./repository/cc.js";

import type { CrawlRepository } from "./repository/crawl.js";
import type { AppTelemetryRepository } from "./repository/telemetry.js";

export type { ArtistCredit, ExternalIdRecord } from "../services/types.js";
export type {
  CrawlRepository,
  CrawlRunFinalize,
  CrawlRunInsert,
  CrawlRunRecord,
  CrawlRunsPage,
  CrawlStatePatch,
  CrawlStateRecord,
  CrawlStateSeed,
  CrawlTickOutcome,
} from "./repository/crawl.js";
export type { AppTelemetryEventInput, AppTelemetryRepository } from "./repository/telemetry.js";

/** Cached track with its cross-service links (returned by URL/ISRC lookups) */
export interface CachedTrackResult {
  trackId: string;
  /** The track's share id, when one is stored. */
  shortId?: string;
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
  artistCredits: ArtistCredit[];
  artistDisplay: string;
  shortId: string;
  links: Array<{ service: string; url: string }>;
}

/** Data needed to persist a resolved track with its cross-service links */
export interface PersistTrackData {
  sourceTrack: {
    title: string;
    artists: string[];
    artistCredits?: ArtistCredit[];
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

/** Single preview-URL row from `track_previews` / `album_previews`. */
export interface PreviewRow {
  service: string;
  url: string;
  /** `null` when the URL has no parseable expiry (most CDN-served
   *  previews). Set to a real Date for Deezer's signed URLs. */
  expiresAt: Date | null;
  observedAt: Date;
}

/** Payload for upsertTrack/AlbumPreview. */
export interface PreviewObservation {
  service: string;
  url: string;
  expiresAt?: Date | null;
}

// ─── Album Types ─────────────────────────────────────────────────────────────

/** Cached album with its cross-service links */
export interface CachedAlbumResult {
  albumId: string;
  /** Stored share identity lets cached responses skip a canonical-row rewrite. */
  shortId?: string;
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
  /** The stored album's id, which its preview rows are keyed by. */
  albumId: string;
  album: {
    title: string;
    artworkUrl: string | null;
    releaseDate: string | null;
    totalTracks: number | null;
    label: string | null;
    upc: string | null;
    previewUrl: string | null;
    vinylLayout: VinylLayout | null;
  };
  artists: string[];
  artistCredits: ArtistCredit[];
  artistDisplay: string;
  shortId: string;
  links: Array<{ service: string; url: string }>;
}

/** Data needed to persist a resolved album with its cross-service links */
export interface PersistAlbumData {
  sourceAlbum: {
    title: string;
    artists: string[];
    artistCredits?: ArtistCredit[];
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

/** Track and album entities share cover policy; artist portraits do not. */
export type RecordingKind = "track" | "album";

// ─── Repository Interface ─────────────────────────────────────────────────────

/**
 * Public repository contract for resolver, share-page, crawler and telemetry reads/writes.
 *
 * Implementations hide the concrete database adapter behind async methods so
 * route and service layers can stay persistence-agnostic. Each domain's part
 * of the contract lives in its own interface under `repository/`, and this
 * interface extends all of them.
 */
export interface TrackRepository
  extends ArtistRepository,
    ArtistIdentityEnrichmentRepository,
    AppTelemetryRepository,
    CrawlRepository {
  // Track: Read operations
  /**
   * Finds track by URL.
   *
   * @param url - The `url` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findTrackByUrl(url: string): Promise<CachedTrackResult | null>;
  /**
   * Finds a track through a link it has on one service, counting only links
   * that identify the recording (source or ISRC match).
   *
   * @param service - Service id the link belongs to.
   * @param externalId - The service's own id for the track.
   * @returns The matching record, or `null` when no row matches.
   */
  findTrackByServiceLink(service: string, externalId: string): Promise<CachedTrackResult | null>;
  /**
   * Finds short ID by track URL.
   *
   * @param url - The `url` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findShortIdByTrackUrl(url: string): Promise<string | null>;
  /**
   * Finds short IDs for a set of source track URLs in one query.
   *
   * @param urls - Source URLs recorded against tracks.
   * @returns A map containing only URLs with an assigned short ID.
   */
  findShortIdsByTrackUrls(urls: string[]): Promise<Map<string, string>>;
  /**
   * Finds track by ISRC.
   *
   * @param isrc - The `isrc` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findTrackByIsrc(isrc: string): Promise<CachedTrackResult | null>;
  /**
   * Finds tracks by text search.
   *
   * @param query - The `query` value.
   * @param maxResults - The `maxResults` value.
   * @returns The matching rows.
   */
  findTracksByTextSearch(query: string, maxResults?: number): Promise<NormalizedTrack[]>;
  /**
   * Finds existing by ISRC.
   *
   * @param isrc - The `isrc` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findExistingByIsrc(isrc: string): Promise<{ trackId: string; shortId: string } | null>;

  // Track: Share page queries
  /**
   * Loads by short ID.
   *
   * @param shortId - The `shortId` value.
   * @returns The matching record, or `null` when no row matches.
   */
  loadByShortId(shortId: string): Promise<SharePageDbResult | null>;
  /**
   * Loads by track ID.
   *
   * @param trackId - The `trackId` value.
   * @returns The matching record, or `null` when no row matches.
   */
  loadByTrackId(trackId: string): Promise<SharePageDbResult | null>;

  /**
   * Replaces only the cover value the caller actually observed.
   *
   * Late enrichment must not overwrite a cover changed by another resolve or
   * operator. A deleted recording stays deleted; this operation never inserts.
   *
   * @param kind - Track or album; artist portraits use a separate policy.
   * @param id - Persisted entity id, never a source-service identifier.
   * @param expected - Observed cover, or null when no cover was stored.
   * @param replacement - Validated catalogue cover, or null to remove a prohibited cover.
   * @returns Whether the observed row was updated. False means stale or missing.
   */
  replaceRecordingArtwork(
    kind: RecordingKind,
    id: string,
    expected: string | null,
    replacement: string | null,
  ): Promise<boolean>;

  // Track: Write operations (transaction-safe)
  /**
   * Persists track with links.
   *
   * @param data - The `data` value.
   * @returns The persisted track id, short id and normalized artist credits.
   */
  persistTrackWithLinks(
    data: PersistTrackData,
  ): Promise<{ trackId: string; shortId: string; artistCredits: ArtistCredit[] }>;
  /**
   * Adds links to track.
   *
   * @param trackId - The `trackId` value.
   * @param links - The `links` value.
   * @returns A promise that resolves when the operation completes.
   */
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

  /**
   * Reads which services were asked about this track and had nothing.
   *
   * @param trackId - The track whose fruitless lookups are wanted.
   * @returns One entry per service that came back empty, with the time it was
   *   asked.
   */
  readServiceLinkMisses(trackId: string): Promise<Array<{ service: string; checkedAt: Date }>>;

  /**
   * Records that these services were asked about this track and had nothing.
   *
   * @param trackId - The track that was looked up.
   * @param services - Service ids that returned nothing.
   * @returns A promise that resolves when the operation completes.
   */
  recordServiceLinkMisses(trackId: string, services: readonly string[]): Promise<void>;

  /**
   * Drops the miss rows for services that now carry the track.
   *
   * @param trackId - The track that gained links.
   * @param services - Service ids that produced a link.
   * @returns A promise that resolves when the operation completes.
   */
  clearServiceLinkMisses(trackId: string, services: readonly string[]): Promise<void>;

  // Album: Read operations
  /**
   * Finds album by URL.
   *
   * @param url - The `url` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findAlbumByUrl(url: string): Promise<CachedAlbumResult | null>;
  /**
   * Finds album by UPC.
   *
   * @param upc - The `upc` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findAlbumByUpc(upc: string): Promise<CachedAlbumResult | null>;
  /**
   * Finds an album through a link it has on one service, counting only links
   * that identify the release (source or UPC match).
   *
   * @param service - Service id the link belongs to.
   * @param externalId - The service's own id for the album.
   * @returns The matching record, or `null` when no row matches.
   */
  findAlbumByServiceLink(service: string, externalId: string): Promise<CachedAlbumResult | null>;
  /**
   * Finds existing album by UPC.
   *
   * @param upc - The `upc` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findExistingAlbumByUpc(upc: string): Promise<{ albumId: string; shortId: string } | null>;

  // Album: Share page queries
  /**
   * Loads album by short ID.
   *
   * @param shortId - The `shortId` value.
   * @returns The matching record, or `null` when no row matches.
   */
  loadAlbumByShortId(shortId: string): Promise<SharePageAlbumResult | null>;

  // Album: Write operations (transaction-safe)
  /**
   * Persists album with links.
   *
   * @param data - The `data` value.
   * @returns The persisted album id, short id and normalized artist credits.
   */
  persistAlbumWithLinks(
    data: PersistAlbumData,
  ): Promise<{ albumId: string; shortId: string; artistCredits: ArtistCredit[] }>;
  /**
   * Adds links to album.
   *
   * @param albumId - The `albumId` value.
   * @param links - The `links` value.
   * @returns A promise that resolves when the operation completes.
   */
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
  /**
   * Reads the persisted Discogs vinyl layout state for an album.
   *
   * @param albumId - Persisted album identifier.
   * @returns The positive layout, `null` for a negative cache, or `undefined`
   * when the album has not been checked.
   */
  readVinylLayout(identityKey: string): Promise<VinylLayout | null | undefined>;
  /**
   * Best-effort Discogs vinyl-layout enrichment for a persisted album.
   *
   * @param album - Persisted album metadata used for the Discogs lookup.
   * @returns A promise that resolves after enrichment or a no-op.
   */
  enrichVinylLayout(album: { identityKey: string; title: string; artists: string[]; albumId?: string }): Promise<void>;

  // Artist: Share page queries
  /**
   * Loads artist by short ID.
   *
   * @param shortId - The `shortId` value.
   * @returns The matching record, or `null` when no row matches.
   */
  loadArtistByShortId(shortId: string): Promise<SharePageArtistResult | null>;

  // External-ID aggregation (track/album/artist) — see migration 0019.
  // The unique index on (entity_id, id_type, id_value, source_service)
  // makes the inserts idempotent: re-running a resolve doesn't create
  // duplicate rows. Implementations are expected to use ON CONFLICT
  // DO NOTHING and never throw on duplicate (entity_id, id_type, id_value,
  // source_service) tuples.
  /**
   * Adds track external IDs.
   *
   * @param trackId - The `trackId` value.
   * @param records - The `records` value.
   * @returns A promise that resolves when the operation completes.
   */
  addTrackExternalIds(trackId: string, records: ExternalIdRecord[]): Promise<void>;
  /**
   * Adds album external IDs.
   *
   * @param albumId - The `albumId` value.
   * @param records - The `records` value.
   * @returns A promise that resolves when the operation completes.
   */
  addAlbumExternalIds(albumId: string, records: ExternalIdRecord[]): Promise<void>;

  // Aggregation-table lookups. Used as fallback when the canonical
  // column on the parent entity (`tracks.isrc` / `albums.upc`) doesn't
  // hold the value being searched, but it lives in the aggregation
  // table because another service reported it.
  /**
   * Finds track by external ID.
   *
   * @param idType - The `idType` value.
   * @param idValue - The `idValue` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findTrackByExternalId(idType: string, idValue: string): Promise<CachedTrackResult | null>;
  /**
   * Finds album by external ID.
   *
   * @param idType - The `idType` value.
   * @param idValue - The `idValue` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findAlbumByExternalId(idType: string, idValue: string): Promise<CachedAlbumResult | null>;

  // Per-(entity, service) preview URLs with explicit expiry. Lives in
  // `track_previews` / `album_previews` (migration 0021). Lets the
  // canonical entity row stay forever-fresh while preview URLs
  // (especially Deezer's signed ones) are refreshed lazily on read.
  /**
   * Finds track previews.
   *
   * @param trackId - The `trackId` value.
   * @returns The matching rows.
   */
  findTrackPreviews(trackId: string): Promise<PreviewRow[]>;
  /**
   * Upserts track preview.
   *
   * @param trackId - The `trackId` value.
   * @param observation - The `observation` value.
   * @returns A promise that resolves when the operation completes.
   */
  upsertTrackPreview(trackId: string, observation: PreviewObservation): Promise<void>;
  /**
   * Finds album previews.
   *
   * @param albumId - The `albumId` value.
   * @returns The matching rows.
   */
  findAlbumPreviews(albumId: string): Promise<PreviewRow[]>;
  /**
   * Upserts album preview.
   *
   * @param albumId - The `albumId` value.
   * @param observation - The `observation` value.
   * @returns A promise that resolves when the operation completes.
   */
  upsertAlbumPreview(albumId: string, observation: PreviewObservation): Promise<void>;

  // Maintenance
  /**
   * Updates track timestamp.
   *
   * @param trackId - The `trackId` value.
   * @returns A promise that resolves when the operation completes.
   */
  updateTrackTimestamp(trackId: string): Promise<void>;
  /**
   * Handles cleanup stale cache.
   *
   * @param ttlMs - The `ttlMs` value.
   * @returns The numeric result of the query or mutation.
   */
  cleanupStaleCache(ttlMs?: number): Promise<number>;

  // Readiness probe: returns the subset of `expected` table names that are
  // missing from the public schema (empty list = all present).
  /**
   * Finds missing tables.
   *
   * @param expected - The `expected` value.
   * @returns The matching rows.
   */
  findMissingTables(expected: string[]): Promise<string[]>;

  // Example: random short ID for landing page teaser
  /**
   * Gets random short ID.
   *
   * @returns The matching record, or `null` when no row matches.
   */
  getRandomShortId(): Promise<string | null>;
}
