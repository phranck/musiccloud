import type { ArtistIdentityEnrichmentRepository } from "./repository/artist-identity.js";
import type { ArtistRepository } from "./repository/artists.js";
import type { CatalogRepository } from "./repository/catalog.js";
import type { CrawlRepository } from "./repository/crawl.js";
import type { CatalogMaintenanceRepository } from "./repository/maintenance.js";
import type { SharePageRepository } from "./repository/share.js";
import type { AppTelemetryRepository } from "./repository/telemetry.js";

export type { ArtistCredit, ExternalIdRecord } from "../services/types.js";
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
  CachedAlbumResult,
  CachedTrackResult,
  CatalogRepository,
  PersistAlbumData,
  PersistTrackData,
  PreviewObservation,
  PreviewRow,
  RecordingKind,
} from "./repository/catalog.js";
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
export type { CatalogMaintenanceRepository } from "./repository/maintenance.js";
export type {
  SharePageAlbumResult,
  SharePageArtistResult,
  SharePageDbResult,
  SharePageRepository,
} from "./repository/share.js";
export type { AppTelemetryEventInput, AppTelemetryRepository } from "./repository/telemetry.js";

// ─── Repository Interface ─────────────────────────────────────────────────────

/**
 * Public repository contract for resolver, share-page, crawler and telemetry reads/writes.
 *
 * Implementations hide the concrete database adapter behind async methods so
 * route and service layers can stay persistence-agnostic. Each domain's part
 * of the contract lives in its own interface under `repository/`, and this
 * interface extends all of them. The Creative Commons contract
 * (`CcRepository`) stays separate and is not part of it.
 */
export interface TrackRepository
  extends CatalogRepository,
    SharePageRepository,
    ArtistRepository,
    ArtistIdentityEnrichmentRepository,
    CatalogMaintenanceRepository,
    AppTelemetryRepository,
    CrawlRepository {}
