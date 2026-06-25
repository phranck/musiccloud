import type {
  ArtistCredit,
  ExternalIdRecord,
  NormalizedAlbum,
  NormalizedArtist,
  NormalizedTrack,
} from "../services/types.js";

export type { ArtistCredit, ExternalIdRecord } from "../services/types.js";

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

import type { ArtistEvent, ArtistProfile, ArtistTopTrack, CcMusicInfo, CcTrackStats } from "@musiccloud/shared";

/** Artist cache row shape returned or accepted by the database repository layer. */
export interface ArtistCacheRow {
  artistName: string;
  topTracks: ArtistTopTrack[];
  profile: ArtistProfile | null;
  events: ArtistEvent[];
  tracksUpdatedAt: number;
  profileUpdatedAt: number;
  eventsUpdatedAt: number;
}

/** Artist cache payload shape returned or accepted by the database repository layer. */
export interface ArtistCacheData {
  artistName: string; // normalized (lowercase + trimmed)
  topTracks?: ArtistTopTrack[];
  profile?: ArtistProfile | null;
  events?: ArtistEvent[];
  profileUpdatedAt?: number;
  tracksUpdatedAt?: number;
  eventsUpdatedAt?: number;
}

// ─── Normalized Artist Identity Types ────────────────────────────────────────

/** Artist entity type union used by the database repository layer. */
export type ArtistEntityType = "person" | "group" | "persona" | "unknown";
/** Artist verification status union used by the database repository layer. */
export type ArtistVerificationStatus = "candidate" | "verified" | "rejected";
/** Artist identity event type union used by the database repository layer. */
export type ArtistIdentityEventType = "birth" | "death" | "formed" | "disbanded";
/** Date precision union used by the database repository layer. */
export type DatePrecision = "year" | "month" | "day" | "unknown";

/** Artist identity event record shape returned or accepted by the database repository layer. */
export interface ArtistIdentityEventRecord {
  eventId: string;
  artistEntityId: string;
  entityType: ArtistEntityType;
  verificationStatus: ArtistVerificationStatus;
  displayName: string;
  eventType: ArtistIdentityEventType;
  dateValue: string | null;
  datePrecision: DatePrecision;
  eventYear: number | null;
  eventMonth: number | null;
  eventDay: number | null;
  placeName: string | null;
  countryCode: string | null;
  sourceProvider: string | null;
  sourceUrl: string | null;
  confidence: number | null;
}

/** Artist group membership record shape returned or accepted by the database repository layer. */
export interface ArtistGroupMembershipRecord {
  membershipId: string;
  groupArtistEntityId: string;
  groupName: string;
  memberArtistEntityId: string;
  memberName: string;
  memberNameCredit: string | null;
  roles: string[];
  beginDate: string | null;
  beginDatePrecision: DatePrecision;
  beginYear: number | null;
  endDate: string | null;
  endDatePrecision: DatePrecision;
  endYear: number | null;
  isCurrent: boolean | null;
  sourceProvider: string | null;
  sourceUrl: string | null;
  confidence: number | null;
}

// ─── Crawler Types ───────────────────────────────────────────────────────────

/** Idempotent default-row payload written by the heartbeat for every source
 *  registered in the in-memory registry. ON CONFLICT (source) DO NOTHING — once
 *  the row exists, mutable fields are owned by the admin API and the heartbeat. */
export interface CrawlStateSeed {
  source: string;
  displayName: string;
  defaultEnabled: boolean;
  defaultIntervalMinutes: number;
  defaultConfig: Record<string, unknown>;
}

/** Normalized `crawl_state` row. Timestamps come back as Date; jsonb columns
 *  come back as parsed JS values courtesy of the pg driver. */
export interface CrawlStateRecord {
  source: string;
  displayName: string;
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt: Date;
  lastRunAt: Date | null;
  cursor: unknown;
  config: Record<string, unknown>;
  runningSince: Date | null;
  errorCount: number;
  lastError: string | null;
  consecutiveErrors: number;
}

/** Admin-API mutation payload. `runningSince: null` is the only allowed shape
 *  for that field — used by the release-lock endpoint. Setting `nextRunAt` to
 *  NOW() is how the run-now endpoint nudges the heartbeat. */
export interface CrawlStatePatch {
  enabled?: boolean;
  intervalMinutes?: number;
  config?: Record<string, unknown>;
  cursor?: unknown;
  nextRunAt?: Date;
  runningSince?: null;
}

/** Outcome of one heartbeat tick. Drives release + schedule advance + error
 *  bookkeeping in a single statement, so the row update is atomic. */
export interface CrawlTickOutcome {
  cursor: unknown;
  nextRunAt: Date;
  success: boolean;
  errorMessage?: string;
  /** Auto-disable threshold for `consecutive_errors`. Default 5. */
  autoDisableThreshold?: number;
}

/** Crawl run insert data shape returned or accepted by the database repository layer. */
export interface CrawlRunInsert {
  id: string;
  source: string;
  startedAt: Date;
  status: "running" | "skipped";
}

/** Crawl run finalize data shape returned or accepted by the database repository layer. */
export interface CrawlRunFinalize {
  status: "success" | "error" | "aborted" | "skipped";
  finishedAt: Date;
  discovered: number;
  ingested: number;
  skipped: number;
  errors: number;
  notes?: string | null;
}

/** Crawl run record shape returned or accepted by the database repository layer. */
export interface CrawlRunRecord {
  id: string;
  source: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  discovered: number;
  ingested: number;
  skipped: number;
  errors: number;
  notes: string | null;
}

/** Crawl runs page data shape returned or accepted by the database repository layer. */
export interface CrawlRunsPage {
  items: CrawlRunRecord[];
  total: number;
  page: number;
  limit: number;
}

// ─── Repository Interface ─────────────────────────────────────────────────────

/**
 * Public repository contract for resolver, share-page, crawler and telemetry reads/writes.
 *
 * Implementations hide the concrete database adapter behind async methods so
 * route and service layers can stay persistence-agnostic.
 */
export interface TrackRepository {
  // Track: Read operations
  /**
   * Finds track by URL.
   *
   * @param url - The `url` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findTrackByUrl(url: string): Promise<CachedTrackResult | null>;
  /**
   * Finds short ID by track URL.
   *
   * @param url - The `url` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findShortIdByTrackUrl(url: string): Promise<string | null>;
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

  // Artist: Read operations
  /**
   * Finds artist by URL.
   *
   * @param url - The `url` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findArtistByUrl(url: string): Promise<CachedArtistResult | null>;
  /**
   * Finds artist by name.
   *
   * @param name - The `name` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findArtistByName(name: string): Promise<CachedArtistResult | null>;

  // Artist: Share page queries
  /**
   * Loads artist by short ID.
   *
   * @param shortId - The `shortId` value.
   * @returns The matching record, or `null` when no row matches.
   */
  loadArtistByShortId(shortId: string): Promise<SharePageArtistResult | null>;

  // Artist: Write operations (transaction-safe)
  /**
   * Persists artist with links.
   *
   * @param data - The `data` value.
   * @returns The requested repository result.
   */
  persistArtistWithLinks(data: PersistArtistData): Promise<{ artistId: string; shortId: string }>;
  /**
   * Adds links to artist.
   *
   * @param artistId - The `artistId` value.
   * @param links - The `links` value.
   * @returns A promise that resolves when the operation completes.
   */
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
  /**
   * Adds artist external IDs.
   *
   * @param artistId - The `artistId` value.
   * @param records - The `records` value.
   * @returns A promise that resolves when the operation completes.
   */
  addArtistExternalIds(artistId: string, records: ExternalIdRecord[]): Promise<void>;

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

  // Artist cache (popular tracks, profile, tour dates)
  /**
   * Finds artist cache.
   *
   * @param artistName - The `artistName` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findArtistCache(artistName: string): Promise<ArtistCacheRow | null>;
  /**
   * Finds artist info alias by short ID.
   *
   * @param shortId - The `shortId` value.
   * @param artistName - The `artistName` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findArtistInfoAliasByShortId(shortId: string, artistName: string): Promise<string | null>;
  /**
   * Saves artist cache.
   *
   * @param data - The `data` value.
   * @returns A promise that resolves when the operation completes.
   */
  saveArtistCache(data: ArtistCacheData): Promise<void>;

  // Normalized artist identity reads (migration 0029)
  /**
   * Lists artist identity events by day.
   *
   * @param params - The `params` value.
   * @returns The matching rows.
   */
  listArtistIdentityEventsByDay(params: {
    month: number;
    day: number;
    locale?: string;
    eventTypes?: ArtistIdentityEventType[];
    catalogOnly?: boolean;
  }): Promise<ArtistIdentityEventRecord[]>;
  /**
   * Lists artist group members.
   *
   * @param groupArtistEntityId - The `groupArtistEntityId` value.
   * @param locale - The `locale` value.
   * @returns The matching rows.
   */
  listArtistGroupMembers(groupArtistEntityId: string, locale?: string): Promise<ArtistGroupMembershipRecord[]>;
  /**
   * Lists artist memberships.
   *
   * @param memberArtistEntityId - The `memberArtistEntityId` value.
   * @param locale - The `locale` value.
   * @returns The matching rows.
   */
  listArtistMemberships(memberArtistEntityId: string, locale?: string): Promise<ArtistGroupMembershipRecord[]>;
  /**
   * Finds artist entity ID by identifier.
   *
   * @param provider - The `provider` value.
   * @param externalId - The `externalId` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findArtistEntityIdByIdentifier(provider: string, externalId: string): Promise<string | null>;

  // Example: random short ID for landing page teaser
  /**
   * Gets random short ID.
   *
   * @returns The matching record, or `null` when no row matches.
   */
  getRandomShortId(): Promise<string | null>;

  // Apple client telemetry (Testflight diagnostics)
  /**
   * Inserts app telemetry event.
   *
   * @param row - The `row` value.
   * @returns A promise that resolves when the operation completes.
   */
  insertAppTelemetryEvent(row: AppTelemetryEventInput): Promise<void>;

  // Crawler: state + runs (migration 0023). The heartbeat lives in
  // services/crawler/heartbeat.ts and orchestrates these calls; the admin
  // API uses the same surface for list/patch/run-now/release-lock.
  /**
   * Seeds crawl state.
   *
   * @param seed - The `seed` value.
   * @returns A promise that resolves when the operation completes.
   */
  seedCrawlState(seed: CrawlStateSeed): Promise<void>;
  /**
   * Finds crawl state.
   *
   * @param source - The `source` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findCrawlState(source: string): Promise<CrawlStateRecord | null>;
  /**
   * Lists crawl state.
   *
   * @returns The matching rows.
   */
  listCrawlState(): Promise<CrawlStateRecord[]>;
  /**
   * Lists due crawl state.
   *
   * @returns The matching rows.
   */
  listDueCrawlState(): Promise<CrawlStateRecord[]>;
  /**
   * Updates crawl state.
   *
   * @param source - The `source` value.
   * @param patch - The `patch` value.
   * @returns The matching record, or `null` when no row matches.
   */
  updateCrawlState(source: string, patch: CrawlStatePatch): Promise<CrawlStateRecord | null>;
  /**
   * Acquires crawl lock.
   *
   * @param source - The `source` value.
   * @param maxRunMs - The `maxRunMs` value.
   * @returns Whether the requested row exists or mutation succeeded.
   */
  acquireCrawlLock(source: string, maxRunMs: number): Promise<boolean>;
  /**
   * Completes crawl tick.
   *
   * @param source - The `source` value.
   * @param outcome - The `outcome` value.
   * @returns A promise that resolves when the operation completes.
   */
  completeCrawlTick(source: string, outcome: CrawlTickOutcome): Promise<void>;
  /**
   * Inserts crawl run.
   *
   * @param run - The `run` value.
   * @returns A promise that resolves when the operation completes.
   */
  insertCrawlRun(run: CrawlRunInsert): Promise<void>;
  /**
   * Finalizes crawl run.
   *
   * @param id - The `id` value.
   * @param finalize - The `finalize` value.
   * @returns A promise that resolves when the operation completes.
   */
  finalizeCrawlRun(id: string, finalize: CrawlRunFinalize): Promise<void>;
  /**
   * Lists crawl runs.
   *
   * @param params - The `params` value.
   * @returns The requested repository result.
   */
  listCrawlRuns(params: { source?: string; page: number; limit: number }): Promise<CrawlRunsPage>;

  // Lifecycle
  /**
   * Closes .
   *
   * @returns A promise that resolves when the operation completes.
   */
  close(): Promise<void>;
}

// ─── Creative-Commons Repository Types ────────────────────────────────────────

/** Data needed to persist a resolved CC track (artist + optional album inline). */
export interface PersistCcTrackData {
  jamendoId: string;
  title: string;
  artistName: string;
  jamendoArtistId: string;
  artistImageUrl?: string;
  artistWebsite?: string;
  artistShareUrl?: string;
  albumName?: string;
  jamendoAlbumId?: string;
  albumArtworkUrl?: string;
  albumReleaseDate?: string;
  albumZipUrl?: string;
  albumShareUrl?: string;
  artworkUrl?: string;
  durationMs?: number;
  releaseDate?: string;
  licenseCcurl?: string;
  streamUrl: string;
  downloadUrl?: string;
  downloadAllowed: boolean;
  waveform?: string;
  shareUrl?: string;
  /** 1-based position within an album tracklist (set when persisted via an album resolve). */
  albumPosition?: number;
  /** 0-based rank within the artist's popularity-ordered top tracks (set via an artist resolve). */
  artistTopPosition?: number;
  /** `include=musicinfo` classification (single-track resolve only). */
  musicInfo?: CcMusicInfo;
  /** `include=stats` engagement counters (single-track resolve only). */
  stats?: CcTrackStats;
  /** Jamendo Pro licensing flag (single-track resolve only). */
  proLicensing?: boolean;
  /** Jamendo Pro licensing page URL (single-track resolve only). */
  proUrl?: string;
}

/**
 * Data needed to persist a resolved CC album. The artist is upserted minimally
 * (id + name) to satisfy the `cc_albums.cc_artist_id` FK; a later artist resolve
 * enriches it (image/website/share) via the same `jamendo_id` upsert key.
 *
 * `tracks` is the album's tracklist in release order — persisted alongside the
 * album so the share page renders the tracklist from the DB without a live
 * Jamendo call.
 */
export interface PersistCcAlbumData {
  jamendoId: string;
  name: string;
  jamendoArtistId: string;
  artistName: string;
  artworkUrl?: string;
  releaseDate?: string;
  zipUrl?: string;
  shareUrl?: string;
  tracks: PersistCcTrackData[];
}

/**
 * Data needed to persist a resolved CC artist.
 *
 * `topTracks` is the artist's popularity-ordered top tracks — persisted with the
 * artist so the share page renders the column from the DB without a live call.
 */
export interface PersistCcArtistData {
  jamendoId: string;
  name: string;
  imageUrl?: string;
  website?: string;
  shareUrl?: string;
  topTracks: PersistCcTrackData[];
}

/**
 * Result of resolving a public CC short id to its entity kind. The share-page
 * loader switches on `kind` to pick the matching DB read.
 */
export interface CcShortIdLookup {
  kind: "cc-track" | "cc-album" | "cc-artist";
  jamendoId: string;
}

/**
 * Full cc-track projection for the share page, read from the DB (no Jamendo).
 * `jamendoArtistId` is joined in from `cc_artists` so the wire `ApiCcTrack` and
 * the right-column artist fetch have it. `downloadAllowed`/`proLicensing` are the
 * raw `integer` 0/1 columns; the mapper coerces them to booleans.
 */
export interface CcTrackShareRow {
  jamendoId: string;
  title: string;
  artistName: string;
  jamendoArtistId: string;
  albumName: string | null;
  albumPosition: number | null;
  artworkUrl: string | null;
  durationMs: number | null;
  releaseDate: string | null;
  licenseCcurl: string | null;
  streamUrl: string;
  downloadUrl: string | null;
  downloadAllowed: number | null;
  waveform: string | null;
  shareUrl: string | null;
  musicInfo: CcMusicInfo | null;
  stats: CcTrackStats | null;
  proLicensing: number | null;
  proUrl: string | null;
}

/** Album entity projection for the share page (with `jamendoArtistId` joined in). */
export interface CcAlbumShareRow {
  jamendoId: string;
  name: string;
  artistName: string;
  jamendoArtistId: string;
  artworkUrl: string | null;
  releaseDate: string | null;
  zipUrl: string | null;
  shareUrl: string | null;
}

/** Artist entity projection for the share page. */
export interface CcArtistShareRow {
  jamendoId: string;
  name: string;
  website: string | null;
  imageUrl: string | null;
  shareUrl: string | null;
}

/** CC persistence + lookups, kept separate from the commercial TrackRepository. */
export interface CcRepository {
  persistCcTrack(data: PersistCcTrackData): Promise<{ ccTrackId: string; shortId: string }>;
  persistCcAlbum(data: PersistCcAlbumData): Promise<{ ccAlbumId: string; shortId: string }>;
  persistCcArtist(data: PersistCcArtistData): Promise<{ ccArtistId: string; shortId: string }>;
  /** Resolves a public CC short id (track, album or artist) to its kind + Jamendo id. */
  findCcShortId(shortId: string): Promise<CcShortIdLookup | null>;
  /** Reads the full cc-track share projection from the DB (no Jamendo). */
  loadCcTrackByShortId(shortId: string): Promise<CcTrackShareRow | null>;
  /** Reads a cc-album entity plus its persisted tracklist (release order) from the DB. */
  loadCcAlbumByShortId(shortId: string): Promise<{ album: CcAlbumShareRow; tracks: CcTrackShareRow[] } | null>;
  /** Reads a cc-artist entity plus its persisted top tracks (popularity order) from the DB. */
  loadCcArtistByShortId(shortId: string): Promise<{ artist: CcArtistShareRow; topTracks: CcTrackShareRow[] } | null>;
  /** Returns a random existing CC track short id, or `null` when none exist. */
  getRandomCcShortId(): Promise<string | null>;
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
