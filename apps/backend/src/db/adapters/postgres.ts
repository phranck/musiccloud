import type { ContentPublication, SingleContentContext, VinylLayout } from "@musiccloud/shared";
import * as pgModule from "pg";
import { log } from "../../lib/infra/logger.js";
import { enrichAlbumVinylLayout as discogsEnrichAlbumVinylLayout } from "../../services/plugins/discogs/discogs-enrich.js";
import type { NormalizedTrack } from "../../services/types.js";
import type {
  AdminRepository,
  AdminUser,
  AlbumListItem,
  ArtistEntityListItem,
  ArtistListItem,
  BulkUpdatePagesPayload,
  ContentPageCreateData,
  ContentPageMetaUpdate,
  ContentPageRow,
  ContentPageSummaryRow,
  ContentPublicationCutoverInput,
  ContentPublicationCutoverResult,
  ContentPublicationRow,
  EmailActionBindingDto,
  EmailAssetDto,
  EmailBrandingDto,
  EmailTemplateRow,
  EmailTemplateWriteData,
  ListResult,
  NavId,
  NavItemReplaceInput,
  NavItemRow,
  NavigationConfigurationEntryRow,
  NavigationConfigurationReplaceInput,
  PageSegmentInputRow,
  PageSegmentRow,
  TrackListItem,
} from "../admin-repository.js";
import type {
  ApiAccessAuditEvent,
  ApiAccessRepository,
  ApiAccessRequest,
  ApiClient,
  ApiClientToken,
  ApiUsageEvent,
  DeveloperProject,
  DeveloperProjectSubscription,
} from "../api-access-repository.js";
import type {
  DeveloperAccount,
  DeveloperEmailToken,
  DeveloperIdentity,
  DeveloperRepository,
} from "../developer-repository.js";
import type {
  AppTelemetryEventInput,
  ArtistCacheData,
  ArtistCacheRow,
  ArtistCredit,
  ArtistGroupMembershipRecord,
  ArtistIdentityEventRecord,
  ArtistIdentityEventType,
  CachedAlbumResult,
  CachedArtistResult,
  CachedTrackResult,
  CcAlbumShareRow,
  CcArtistShareRow,
  CcRepository,
  CcShortIdLookup,
  CcTrackShareRow,
  CrawlRunFinalize,
  CrawlRunInsert,
  CrawlRunsPage,
  CrawlStatePatch,
  CrawlStateRecord,
  CrawlStateSeed,
  CrawlTickOutcome,
  ExternalIdRecord,
  PersistAlbumData,
  PersistArtistData,
  PersistCcAlbumData,
  PersistCcArtistData,
  PersistCcTrackData,
  PersistTrackData,
  PreviewObservation,
  PreviewRow,
  SharePageAlbumResult,
  SharePageArtistResult,
  SharePageDbResult,
  TrackRepository,
} from "../repository.js";
import {
  clearArtistCache as adminCatalogClearArtistCache,
  countAllData as adminCatalogCountAllData,
  deleteAlbums as adminCatalogDeleteAlbums,
  deleteArtists as adminCatalogDeleteArtists,
  deleteTracks as adminCatalogDeleteTracks,
  findMissingTables as adminCatalogFindMissingTables,
  getRandomShortId as adminCatalogGetRandomShortId,
  getTrackById as adminCatalogGetTrackById,
  invalidateAllCaches as adminCatalogInvalidateAllCaches,
  invalidateArtistCache as adminCatalogInvalidateArtistCache,
  listAlbums as adminCatalogListAlbums,
  listArtistEntities as adminCatalogListArtistEntities,
  listArtists as adminCatalogListArtists,
  listTracks as adminCatalogListTracks,
  resetAllData as adminCatalogResetAllData,
  resolveShortIds as adminCatalogResolveShortIds,
  updateTrack as adminCatalogUpdateTrack,
  updateTrackTimestamp as adminCatalogUpdateTrackTimestamp,
} from "./postgres-admin-catalog.js";
import {
  acceptInvite as adminUsersAcceptInvite,
  countAdmins as adminUsersCountAdmins,
  createAdminUser as adminUsersCreateAdminUser,
  deleteAdminUser as adminUsersDeleteAdminUser,
  findAdminById as adminUsersFindAdminById,
  findAdminByUsername as adminUsersFindAdminByUsername,
  listAdminUsers as adminUsersListAdminUsers,
  listPendingInvites as adminUsersListPendingInvites,
  updateAdminUser as adminUsersUpdateAdminUser,
  updateLastLogin as adminUsersUpdateLastLogin,
} from "./postgres-admin-users.js";
import {
  addAlbumExternalIds as albumsAddAlbumExternalIds,
  addLinksToAlbum as albumsAddLinksToAlbum,
  createAlbumVinylLayoutPlaceholder as albumsCreateAlbumVinylLayoutPlaceholder,
  deleteAlbumVinylLayoutPlaceholder as albumsDeleteAlbumVinylLayoutPlaceholder,
  ensureAlbumVinylLayoutIdentity as albumsEnsureAlbumVinylLayoutIdentity,
  findAlbumByExternalId as albumsFindAlbumByExternalId,
  findAlbumByUpc as albumsFindAlbumByUpc,
  findAlbumByUrl as albumsFindAlbumByUrl,
  findAlbumByVinylLayoutIdentity as albumsFindAlbumByVinylLayoutIdentity,
  findAlbumPreviews as albumsFindAlbumPreviews,
  findExistingAlbumByUpc as albumsFindExistingAlbumByUpc,
  findExistingAlbumByUpcSync as albumsFindExistingAlbumByUpcSync,
  loadAlbumByShortId as albumsLoadAlbumByShortId,
  persistAlbumWithLinks as albumsPersistAlbumWithLinks,
  readAlbumVinylLayout as albumsReadAlbumVinylLayout,
  upsertAlbumPreview as albumsUpsertAlbumPreview,
} from "./postgres-albums.js";
import {
  activateApiClientToken as apiAccessActivateClientToken,
  countPendingApiAccessRequests as apiAccessCountPending,
  createApiAccessAuditEvent as apiAccessCreateAuditEvent,
  createApiClient as apiAccessCreateClient,
  createApiClientToken as apiAccessCreateClientToken,
  createDeveloperProject as apiAccessCreateDeveloperProject,
  createApiAccessRequest as apiAccessCreateRequest,
  createApiUsageEvent as apiAccessCreateUsageEvent,
  findActiveApiClientByTokenHash as apiAccessFindActiveClientByTokenHash,
  findApiClientById as apiAccessFindClientById,
  findApiClientTokenById as apiAccessFindClientTokenById,
  findDeveloperProjectById as apiAccessFindDeveloperProjectById,
  findDeveloperProjectSubscription as apiAccessFindDeveloperProjectSubscription,
  findApiAccessRequestById as apiAccessFindRequestById,
  listApiClients as apiAccessListClients,
  listApiClientsByDeveloperAccount as apiAccessListClientsByDeveloperAccount,
  listApiClientsByProject as apiAccessListClientsByProject,
  listApiClientTokensByClient as apiAccessListClientTokensByClient,
  listDeveloperProjectsByAccount as apiAccessListDeveloperProjectsByAccount,
  listApiAccessRequests as apiAccessListRequests,
  listApiAccessRequestsByDeveloperAccount as apiAccessListRequestsByDeveloperAccount,
  reviewApiAccessRequest as apiAccessReviewRequest,
  revokeApiClientToken as apiAccessRevokeClientToken,
  rotateApiClientToken as apiAccessRotateClientToken,
  setDeveloperProjectSubscription as apiAccessSetDeveloperProjectSubscription,
  touchApiClientTokenLastUsed as apiAccessTouchClientTokenLastUsed,
  updateApiClient as apiAccessUpdateClient,
  updateDeveloperProject as apiAccessUpdateDeveloperProject,
} from "./postgres-api-access.js";
import {
  addArtistExternalIds as artistsAddArtistExternalIds,
  addLinksToArtist as artistsAddLinksToArtist,
  cleanupStaleCache as artistsCleanupStaleCache,
  findArtistByName as artistsFindArtistByName,
  findArtistByUrl as artistsFindArtistByUrl,
  findArtistCache as artistsFindArtistCache,
  findArtistEntityIdByIdentifier as artistsFindArtistEntityIdByIdentifier,
  findArtistInfoAliasByShortId as artistsFindArtistInfoAliasByShortId,
  listArtistGroupMembers as artistsListArtistGroupMembers,
  listArtistIdentityEventsByDay as artistsListArtistIdentityEventsByDay,
  listArtistMemberships as artistsListArtistMemberships,
  loadArtistByShortId as artistsLoadArtistByShortId,
  persistArtistWithLinks as artistsPersistArtistWithLinks,
  saveArtistCache as artistsSaveArtistCache,
} from "./postgres-artists.js";
import {
  findCcShortId as ccFindShortId,
  getRandomCcShortId as ccGetRandomShortId,
  loadCcAlbumByShortId as ccLoadAlbumByShortId,
  loadCcArtistByShortId as ccLoadArtistByShortId,
  loadCcTrackByShortId as ccLoadTrackByShortId,
  persistCcAlbum as ccPersistAlbum,
  persistCcArtist as ccPersistArtist,
  persistCcTrack as ccPersistTrack,
} from "./postgres-cc.js";
import {
  createEmailActionBinding as contentEmailCreateEmailActionBinding,
  deleteEmailActionBinding as contentEmailDeleteEmailActionBinding,
  deleteEmailTemplate as contentEmailDeleteEmailTemplate,
  getEmailAssetBytes as contentEmailGetEmailAssetBytes,
  getEmailBranding as contentEmailGetEmailBranding,
  getEmailTemplateById as contentEmailGetEmailTemplateById,
  getEmailTemplateByName as contentEmailGetEmailTemplateByName,
  insertEmailAsset as contentEmailInsertEmailAsset,
  insertEmailTemplate as contentEmailInsertEmailTemplate,
  listEmailActionBindings as contentEmailListEmailActionBindings,
  listEmailAssets as contentEmailListEmailAssets,
  listEmailTemplates as contentEmailListEmailTemplates,
  setEmailActionBindingEnabled as contentEmailSetEmailActionBindingEnabled,
  updateEmailBranding as contentEmailUpdateEmailBranding,
  updateEmailTemplate as contentEmailUpdateEmailTemplate,
} from "./postgres-content-email.js";
import {
  listAdminNavItems as contentNavListAdminNavItems,
  listNavigationConfiguration as contentNavListNavigationConfiguration,
  replaceAdminNavItems as contentNavReplaceAdminNavItems,
  replaceNavigationConfiguration as contentNavReplaceNavigationConfiguration,
} from "./postgres-content-nav.js";
import {
  applyContentPublicationCutover as contentPagesApplyContentPublicationCutover,
  bulkUpdatePages as contentPagesBulkUpdatePages,
  contentPageSlugExists as contentPagesContentPageSlugExists,
  createContentPage as contentPagesCreateContentPage,
  deleteContentPage as contentPagesDeleteContentPage,
  deleteSegmentsForOwner as contentPagesDeleteSegmentsForOwner,
  getAdminUsernamesByIds as contentPagesGetAdminUsernamesByIds,
  getContentPageById as contentPagesGetContentPageById,
  getContentPageBySlug as contentPagesGetContentPageBySlug,
  getContentPagesBySlugs as contentPagesGetContentPagesBySlugs,
  getPublishedContentPageByPath as contentPagesGetPublishedContentPageByPath,
  getPublishedContentPageBySlug as contentPagesGetPublishedContentPageBySlug,
  getPublishedContentPagesBySlugs as contentPagesGetPublishedContentPagesBySlugs,
  listContentPageSummaries as contentPagesListContentPageSummaries,
  listContentPublications as contentPagesListContentPublications,
  listPublishedContentPages as contentPagesListPublishedContentPages,
  listSegmentsForOwner as contentPagesListSegmentsForOwner,
  replaceContentPublications as contentPagesReplaceContentPublications,
  replaceSegmentsForOwner as contentPagesReplaceSegmentsForOwner,
  setContentPageContentUpdatedAt as contentPagesSetContentPageContentUpdatedAt,
  updateContentPageBody as contentPagesUpdateContentPageBody,
  updateContentPageMeta as contentPagesUpdateContentPageMeta,
} from "./postgres-content-pages.js";
import {
  acquireCrawlLock as crawlAcquireCrawlLock,
  completeCrawlTick as crawlCompleteCrawlTick,
  finalizeCrawlRun as crawlFinalizeCrawlRun,
  findCrawlState as crawlFindCrawlState,
  insertCrawlRun as crawlInsertCrawlRun,
  listCrawlRuns as crawlListCrawlRuns,
  listCrawlState as crawlListCrawlState,
  listDueCrawlState as crawlListDueCrawlState,
  seedCrawlState as crawlSeedCrawlState,
  updateCrawlState as crawlUpdateCrawlState,
} from "./postgres-crawl.js";
import {
  clearDeveloperPassword as developerClearPassword,
  consumeDeveloperEmailToken as developerConsumeEmailToken,
  createDeveloperAccount as developerCreateAccount,
  createDeveloperEmailToken as developerCreateEmailToken,
  createDeveloperIdentity as developerCreateIdentity,
  deleteDeveloperAccount as developerDeleteAccount,
  findDeveloperAccountByEmail as developerFindAccountByEmail,
  findDeveloperAccountById as developerFindAccountById,
  findActiveDeveloperEmailToken as developerFindActiveEmailToken,
  findDeveloperIdentity as developerFindIdentity,
  listDeveloperAccounts as developerListAccounts,
  listDeveloperIdentitiesByAccount as developerListIdentitiesByAccount,
  markDeveloperEmailVerified as developerMarkEmailVerified,
  setDeveloperPassword as developerSetPassword,
  updateDeveloperAccount as developerUpdateAccount,
  updateDeveloperLastLogin as developerUpdateLastLogin,
} from "./postgres-developer.js";
import { insertAppTelemetryEvent } from "./postgres-telemetry.js";
import { PostgresTierRepository } from "./postgres-tiers.js";
import {
  addLinksToTrack as tracksAddLinksToTrack,
  addTrackExternalIds as tracksAddTrackExternalIds,
  findExistingByIsrc as tracksFindExistingByIsrc,
  findExistingByIsrcSync as tracksFindExistingByIsrcSync,
  findShortIdByTrackUrl as tracksFindShortIdByTrackUrl,
  findTrackByExternalId as tracksFindTrackByExternalId,
  findTrackByIsrc as tracksFindTrackByIsrc,
  findTrackByUrl as tracksFindTrackByUrl,
  findTrackPreviews as tracksFindTrackPreviews,
  findTracksByTextSearch as tracksFindTracksByTextSearch,
  loadByShortId as tracksLoadByShortId,
  loadByTrackId as tracksLoadByTrackId,
  loadSharePageResult as tracksLoadSharePageResult,
  persistTrackWithLinks as tracksPersistTrackWithLinks,
  upsertTrackPreview as tracksUpsertTrackPreview,
} from "./postgres-tracks.js";

// ============================================================================
// POSTGRES ADAPTER
// ============================================================================

export class PostgresAdapter
  implements TrackRepository, AdminRepository, CcRepository, DeveloperRepository, ApiAccessRepository
{
  private pool: pgModule.Pool;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(connectionUrl: string) {
    this.pool = new pgModule.Pool({
      connectionString: connectionUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on("error", (err) => {
      log.error("PG", "Unexpected error on idle client:", err);
    });
  }

  /**
   * Initialize database schema (run migrations on startup)
   * For Drizzle, migrations are applied separately via CLI.
   * This just verifies the schema exists.
   *
   * Side effect: warms the pool with a pair of pre-connected clients so the
   * first request after startup doesn't pay a TCP + TLS + auth handshake on
   * the hot path. Observed locally: first cold request drops from ~3s to
   * ~10ms after warmup.
   */
  async ensureSchema(): Promise<void> {
    try {
      const result = await this.pool.query(`SELECT to_regclass('public.tracks') IS NOT NULL as exists`);
      if (!result.rows[0]?.exists) {
        throw new Error(
          "Database schema not initialized. Run: npx drizzle-kit migrate --config drizzle.config.postgres.ts",
        );
      }

      // Pre-connect a second client in parallel so the pool has 2 warm
      // sockets ready. We don't await beyond the connect round-trip — the
      // clients are released immediately back into the idle set.
      try {
        const warmup = await this.pool.connect();
        warmup.release();
      } catch (err) {
        log.debug("PG", "Pool warmup skipped:", err instanceof Error ? err.message : String(err));
      }
      log.debug("PG", "Schema verification passed");
    } catch (error) {
      log.error("PG", "Schema check failed:", error);
      throw error;
    }
  }

  /**
   * Schedule cache cleanup every 6 hours
   */
  scheduleCleanup(): void {
    this.cleanupInterval = setInterval(
      async () => {
        try {
          const deleted = await this.cleanupStaleCache();
          if (deleted > 0) {
            log.debug("PG", `Cache cleanup removed ${deleted} stale entries`);
          }
        } catch (error) {
          log.error("PG", "Cache cleanup error:", error);
        }
      },
      6 * 60 * 60 * 1000,
    );
  }

  /**
   * Close database connection pool
   */
  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    await this.pool.end();
  }

  async insertAppTelemetryEvent(row: AppTelemetryEventInput): Promise<void> {
    await insertAppTelemetryEvent(this.pool, row);
  }

  // ============================================================================
  // TRACK QUERIES (TrackRepository)
  // ============================================================================

  findTrackByUrl(url: string): Promise<CachedTrackResult | null> {
    return tracksFindTrackByUrl(this.pool, url);
  }

  findTrackByIsrc(isrc: string): Promise<CachedTrackResult | null> {
    return tracksFindTrackByIsrc(this.pool, isrc);
  }

  findTracksByTextSearch(query: string, maxResults: number = 10): Promise<NormalizedTrack[]> {
    return tracksFindTracksByTextSearch(this.pool, query, maxResults);
  }

  findShortIdByTrackUrl(url: string): Promise<string | null> {
    return tracksFindShortIdByTrackUrl(this.pool, url);
  }

  findExistingByIsrc(isrc: string): Promise<{ trackId: string; shortId: string } | null> {
    return tracksFindExistingByIsrc(this.pool, isrc);
  }

  findExistingByIsrcSync(isrc: string): { trackId: string; shortId: string } | null {
    return tracksFindExistingByIsrcSync(isrc);
  }

  loadByShortId(shortId: string): Promise<SharePageDbResult | null> {
    return tracksLoadByShortId(this.pool, shortId);
  }

  loadByTrackId(trackId: string): Promise<SharePageDbResult | null> {
    return tracksLoadByTrackId(this.pool, trackId);
  }

  persistTrackWithLinks(data: PersistTrackData): Promise<{
    trackId: string;
    shortId: string;
    artistCredits: ArtistCredit[];
  }> {
    return tracksPersistTrackWithLinks(this.pool, data);
  }

  addLinksToTrack(
    trackId: string,
    links: Array<{ service: string; url: string; confidence: number; matchMethod: string; externalId?: string }>,
  ): Promise<void> {
    return tracksAddLinksToTrack(this.pool, trackId, links);
  }

  // ============================================================================
  // EXTERNAL-ID AGGREGATION (TrackRepository) — migration 0019
  // ============================================================================

  addTrackExternalIds(trackId: string, records: ExternalIdRecord[]): Promise<void> {
    return tracksAddTrackExternalIds(this.pool, trackId, records);
  }

  addAlbumExternalIds(albumId: string, records: ExternalIdRecord[]): Promise<void> {
    return albumsAddAlbumExternalIds(this.pool, albumId, records);
  }

  addArtistExternalIds(artistId: string, records: ExternalIdRecord[]): Promise<void> {
    return artistsAddArtistExternalIds(this.pool, artistId, records);
  }

  findTrackByExternalId(idType: string, idValue: string): Promise<CachedTrackResult | null> {
    return tracksFindTrackByExternalId(this.pool, idType, idValue);
  }

  findAlbumByExternalId(idType: string, idValue: string): Promise<CachedAlbumResult | null> {
    return albumsFindAlbumByExternalId(this.pool, idType, idValue);
  }

  // ============================================================================
  // PREVIEW URLS (TrackRepository) — migration 0021
  // ============================================================================

  findTrackPreviews(trackId: string): Promise<PreviewRow[]> {
    return tracksFindTrackPreviews(this.pool, trackId);
  }

  upsertTrackPreview(trackId: string, observation: PreviewObservation): Promise<void> {
    return tracksUpsertTrackPreview(this.pool, trackId, observation);
  }

  findAlbumPreviews(albumId: string): Promise<PreviewRow[]> {
    return albumsFindAlbumPreviews(this.pool, albumId);
  }

  upsertAlbumPreview(albumId: string, observation: PreviewObservation): Promise<void> {
    return albumsUpsertAlbumPreview(this.pool, albumId, observation);
  }

  // ============================================================================
  // ARTIST CACHE QUERIES (TrackRepository)
  // ============================================================================

  findArtistCache(artistName: string): Promise<ArtistCacheRow | null> {
    return artistsFindArtistCache(this.pool, artistName);
  }

  findArtistInfoAliasByShortId(shortId: string, artistName: string): Promise<string | null> {
    return artistsFindArtistInfoAliasByShortId(this.pool, shortId, artistName);
  }

  saveArtistCache(data: ArtistCacheData): Promise<void> {
    return artistsSaveArtistCache(this.pool, data);
  }

  listArtistIdentityEventsByDay(params: {
    month: number;
    day: number;
    locale?: string;
    eventTypes?: ArtistIdentityEventType[];
    catalogOnly?: boolean;
  }): Promise<ArtistIdentityEventRecord[]> {
    return artistsListArtistIdentityEventsByDay(this.pool, params);
  }

  listArtistGroupMembers(groupArtistEntityId: string, locale?: string): Promise<ArtistGroupMembershipRecord[]> {
    return artistsListArtistGroupMembers(this.pool, groupArtistEntityId, locale);
  }

  listArtistMemberships(memberArtistEntityId: string, locale?: string): Promise<ArtistGroupMembershipRecord[]> {
    return artistsListArtistMemberships(this.pool, memberArtistEntityId, locale);
  }

  findArtistEntityIdByIdentifier(provider: string, externalId: string): Promise<string | null> {
    return artistsFindArtistEntityIdByIdentifier(this.pool, provider, externalId);
  }

  cleanupStaleCache(): Promise<number> {
    return artistsCleanupStaleCache(this.pool);
  }

  getRandomShortId(): Promise<string | null> {
    return adminCatalogGetRandomShortId(this.pool);
  }

  updateTrackTimestamp(trackId: string): Promise<void> {
    return adminCatalogUpdateTrackTimestamp(this.pool, trackId);
  }

  findMissingTables(expected: string[]): Promise<string[]> {
    return adminCatalogFindMissingTables(this.pool, expected);
  }

  // ============================================================================
  // ALBUM QUERIES (TrackRepository)
  // ============================================================================

  findAlbumByUrl(url: string): Promise<CachedAlbumResult | null> {
    return albumsFindAlbumByUrl(this.pool, url);
  }

  findAlbumByUpc(upc: string): Promise<CachedAlbumResult | null> {
    return albumsFindAlbumByUpc(this.pool, upc);
  }

  findAlbumByVinylLayoutIdentity(identityKey: string): Promise<{ albumId: string } | null> {
    return albumsFindAlbumByVinylLayoutIdentity(this.pool, identityKey);
  }

  ensureAlbumVinylLayoutIdentity(identityKey: string, albumId: string): Promise<string> {
    return albumsEnsureAlbumVinylLayoutIdentity(this.pool, identityKey, albumId);
  }

  createAlbumVinylLayoutPlaceholder(title: string): Promise<string> {
    return albumsCreateAlbumVinylLayoutPlaceholder(this.pool, title);
  }

  deleteAlbumVinylLayoutPlaceholder(albumId: string): Promise<void> {
    return albumsDeleteAlbumVinylLayoutPlaceholder(this.pool, albumId);
  }

  findExistingAlbumByUpc(upc: string): Promise<{ albumId: string; shortId: string } | null> {
    return albumsFindExistingAlbumByUpc(this.pool, upc);
  }

  findExistingAlbumByUpcSync(upc: string): { albumId: string; shortId: string } | null {
    return albumsFindExistingAlbumByUpcSync(upc);
  }

  persistAlbumWithLinks(data: PersistAlbumData): Promise<{
    albumId: string;
    shortId: string;
    artistCredits: ArtistCredit[];
  }> {
    return albumsPersistAlbumWithLinks(this.pool, data);
  }

  addLinksToAlbum(
    albumId: string,
    links: Array<{ service: string; url: string; confidence: number; matchMethod: string; externalId?: string }>,
  ): Promise<void> {
    return albumsAddLinksToAlbum(this.pool, albumId, links);
  }

  /** Reads the persisted Discogs vinyl layout state for an album. */
  readAlbumVinylLayout(albumId: string): Promise<VinylLayout | null | undefined> {
    return albumsReadAlbumVinylLayout(this.pool, albumId);
  }

  /** Runs best-effort Discogs vinyl-layout enrichment for a persisted album. */
  enrichAlbumVinylLayout(album: { id: string; title: string; artists: string[]; upc?: string | null }): Promise<void> {
    return discogsEnrichAlbumVinylLayout(this.pool, album);
  }

  loadAlbumByShortId(shortId: string): Promise<SharePageAlbumResult | null> {
    return albumsLoadAlbumByShortId(this.pool, shortId);
  }

  // ============================================================================
  // ARTIST RESOLUTION QUERIES (TrackRepository)
  // ============================================================================

  findArtistByUrl(url: string): Promise<CachedArtistResult | null> {
    return artistsFindArtistByUrl(this.pool, url);
  }

  findArtistByName(name: string): Promise<CachedArtistResult | null> {
    return artistsFindArtistByName(this.pool, name);
  }

  loadArtistByShortId(shortId: string): Promise<SharePageArtistResult | null> {
    return artistsLoadArtistByShortId(this.pool, shortId);
  }

  persistArtistWithLinks(data: PersistArtistData): Promise<{
    artistId: string;
    shortId: string;
  }> {
    return artistsPersistArtistWithLinks(this.pool, data);
  }

  addLinksToArtist(
    artistId: string,
    links: Array<{ service: string; url: string; confidence: number; matchMethod: string; externalId?: string }>,
  ): Promise<void> {
    return artistsAddLinksToArtist(this.pool, artistId, links);
  }

  // ============================================================================
  // ADMIN USERS (AdminRepository)
  // ============================================================================

  findAdminById(id: string): Promise<AdminUser | null> {
    return adminUsersFindAdminById(this.pool, id);
  }

  findAdminByUsername(username: string): Promise<AdminUser | null> {
    return adminUsersFindAdminByUsername(this.pool, username);
  }

  createAdminUser(data: {
    id: string;
    username: string;
    passwordHash: string;
    email?: string;
    role?: string;
    locale?: string;
    inviteTokenHash?: string;
    inviteExpiresAt?: Date;
  }): Promise<void> {
    return adminUsersCreateAdminUser(this.pool, data);
  }

  updateLastLogin(userId: string): Promise<void> {
    return adminUsersUpdateLastLogin(this.pool, userId);
  }

  countAdmins(): Promise<number> {
    return adminUsersCountAdmins(this.pool);
  }

  listAdminUsers(): Promise<AdminUser[]> {
    return adminUsersListAdminUsers(this.pool);
  }

  updateAdminUser(
    id: string,
    data: Partial<{
      username: string;
      email: string;
      passwordHash: string;
      firstName: string | null;
      lastName: string | null;
      avatarUrl: string | null;
      locale: string;
      role: string;
      sessionTimeoutMinutes: number | null;
    }>,
  ): Promise<AdminUser | null> {
    return adminUsersUpdateAdminUser(this.pool, id, data);
  }

  deleteAdminUser(id: string): Promise<void> {
    return adminUsersDeleteAdminUser(this.pool, id);
  }

  listPendingInvites(): Promise<
    Array<{
      id: string;
      username: string;
      email: string | null;
      inviteTokenHash: string;
      inviteExpiresAt: Date;
    }>
  > {
    return adminUsersListPendingInvites(this.pool);
  }

  acceptInvite(id: string, passwordHash: string): Promise<AdminUser | null> {
    return adminUsersAcceptInvite(this.pool, id, passwordHash);
  }

  // ============================================================================
  // ADMIN CATALOG (AdminRepository) — single track / listings / deletion /
  // cache invalidation / aggregate counts / reset / short-id resolve
  // ============================================================================

  getTrackById(id: string) {
    return adminCatalogGetTrackById(this.pool, id);
  }

  updateTrack(
    id: string,
    data: {
      title?: string;
      artists?: string[];
      artistCredits?: ArtistCredit[];
      albumName?: string | null;
      isrc?: string | null;
      artworkUrl?: string | null;
    },
  ): Promise<void> {
    return adminCatalogUpdateTrack(this.pool, id, data);
  }

  listTracks(params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }): Promise<ListResult<TrackListItem>> {
    return adminCatalogListTracks(this.pool, params);
  }

  listAlbums(params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }): Promise<ListResult<AlbumListItem>> {
    return adminCatalogListAlbums(this.pool, params);
  }

  listArtists(params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }): Promise<ListResult<ArtistListItem>> {
    return adminCatalogListArtists(this.pool, params);
  }

  listArtistEntities(params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }): Promise<ListResult<ArtistEntityListItem>> {
    return adminCatalogListArtistEntities(this.pool, params);
  }

  deleteTracks(ids: string[]): Promise<void> {
    return adminCatalogDeleteTracks(this.pool, ids);
  }

  deleteAlbums(ids: string[]): Promise<void> {
    return adminCatalogDeleteAlbums(this.pool, ids);
  }

  deleteArtists(ids: string[]): Promise<void> {
    return adminCatalogDeleteArtists(this.pool, ids);
  }

  invalidateArtistCache(shortId: string): Promise<{ ok: true }> {
    return adminCatalogInvalidateArtistCache(this.pool, shortId);
  }

  invalidateAllCaches(): Promise<{ tracks: number; albums: number; artists: number }> {
    return adminCatalogInvalidateAllCaches(this.pool);
  }

  clearArtistCache(): Promise<{ deleted: number }> {
    return adminCatalogClearArtistCache(this.pool);
  }

  countAllData(): Promise<{
    tracks: number;
    albums: number;
    artists: number;
    artistProfiles: number;
    artistEntities: number;
  }> {
    return adminCatalogCountAllData(this.pool);
  }

  resetAllData(): Promise<{ tracks: number; albums: number; artists: number }> {
    return adminCatalogResetAllData(this.pool);
  }

  resolveShortIds(shortIds: string[]): Promise<Map<string, { title: string; artist: string }>> {
    return adminCatalogResolveShortIds(this.pool, shortIds);
  }

  // ============================================================================
  // SHARE PAGE LOADING (TrackRepository)
  // ============================================================================

  loadSharePageResult(shortId: string): Promise<SharePageDbResult | null> {
    return tracksLoadSharePageResult(this.pool, shortId);
  }

  // ============================================================================
  // CREATIVE-COMMONS PERSISTENCE (CcRepository) — migration 0043
  // ============================================================================

  persistCcTrack(data: PersistCcTrackData): Promise<{ ccTrackId: string; shortId: string }> {
    return ccPersistTrack(this.pool, data);
  }

  persistCcAlbum(data: PersistCcAlbumData): Promise<{ ccAlbumId: string; shortId: string }> {
    return ccPersistAlbum(this.pool, data);
  }

  persistCcArtist(data: PersistCcArtistData): Promise<{ ccArtistId: string; shortId: string }> {
    return ccPersistArtist(this.pool, data);
  }

  findCcShortId(shortId: string): Promise<CcShortIdLookup | null> {
    return ccFindShortId(this.pool, shortId);
  }

  loadCcTrackByShortId(shortId: string): Promise<CcTrackShareRow | null> {
    return ccLoadTrackByShortId(this.pool, shortId);
  }

  loadCcAlbumByShortId(shortId: string): Promise<{ album: CcAlbumShareRow; tracks: CcTrackShareRow[] } | null> {
    return ccLoadAlbumByShortId(this.pool, shortId);
  }

  loadCcArtistByShortId(shortId: string): Promise<{ artist: CcArtistShareRow; topTracks: CcTrackShareRow[] } | null> {
    return ccLoadArtistByShortId(this.pool, shortId);
  }

  getRandomCcShortId(): Promise<string | null> {
    return ccGetRandomShortId(this.pool);
  }

  // ============================================================================
  // EMAIL TEMPLATES (AdminRepository)
  // ============================================================================

  listEmailTemplates(): Promise<EmailTemplateRow[]> {
    return contentEmailListEmailTemplates(this.pool);
  }

  getEmailTemplateById(id: number): Promise<EmailTemplateRow | null> {
    return contentEmailGetEmailTemplateById(this.pool, id);
  }

  getEmailTemplateByName(name: string): Promise<EmailTemplateRow | null> {
    return contentEmailGetEmailTemplateByName(this.pool, name);
  }

  insertEmailTemplate(data: EmailTemplateWriteData): Promise<EmailTemplateRow> {
    return contentEmailInsertEmailTemplate(this.pool, data);
  }

  updateEmailTemplate(id: number, data: Partial<EmailTemplateWriteData>): Promise<EmailTemplateRow | null> {
    return contentEmailUpdateEmailTemplate(this.pool, id, data);
  }

  deleteEmailTemplate(id: number): Promise<boolean> {
    return contentEmailDeleteEmailTemplate(this.pool, id);
  }

  getEmailBranding(): Promise<EmailBrandingDto> {
    return contentEmailGetEmailBranding(this.pool);
  }

  updateEmailBranding(data: Partial<EmailBrandingDto>): Promise<EmailBrandingDto> {
    return contentEmailUpdateEmailBranding(this.pool, data);
  }

  listEmailAssets(): Promise<EmailAssetDto[]> {
    return contentEmailListEmailAssets(this.pool);
  }

  insertEmailAsset(data: { mimeType: string; bytes: Buffer }): Promise<EmailAssetDto> {
    return contentEmailInsertEmailAsset(this.pool, data);
  }

  getEmailAssetBytes(id: string): Promise<{ mimeType: string; bytes: Buffer } | null> {
    return contentEmailGetEmailAssetBytes(this.pool, id);
  }

  listEmailActionBindings(actionKey?: string): Promise<EmailActionBindingDto[]> {
    return contentEmailListEmailActionBindings(this.pool, actionKey);
  }

  createEmailActionBinding(data: { actionKey: string; templateId: number }): Promise<EmailActionBindingDto> {
    return contentEmailCreateEmailActionBinding(this.pool, data);
  }

  setEmailActionBindingEnabled(id: string, enabled: boolean): Promise<EmailActionBindingDto | null> {
    return contentEmailSetEmailActionBindingEnabled(this.pool, id, enabled);
  }

  deleteEmailActionBinding(id: string): Promise<boolean> {
    return contentEmailDeleteEmailActionBinding(this.pool, id);
  }

  // ============================================================================
  // CONTENT PAGES + SEGMENTS (AdminRepository)
  // ============================================================================

  listContentPageSummaries(): Promise<ContentPageSummaryRow[]> {
    return contentPagesListContentPageSummaries(this.pool);
  }

  getContentPageBySlug(slug: string): Promise<ContentPageRow | null> {
    return contentPagesGetContentPageBySlug(this.pool, slug);
  }

  getContentPageById(id: string): Promise<ContentPageRow | null> {
    return contentPagesGetContentPageById(this.pool, id);
  }

  contentPageSlugExists(slug: string): Promise<boolean> {
    return contentPagesContentPageSlugExists(this.pool, slug);
  }

  createContentPage(data: ContentPageCreateData): Promise<ContentPageRow> {
    return contentPagesCreateContentPage(this.pool, data);
  }

  updateContentPageMeta(slug: string, data: ContentPageMetaUpdate): Promise<ContentPageRow | null> {
    return contentPagesUpdateContentPageMeta(this.pool, slug, data);
  }

  updateContentPageBody(slug: string, content: string, updatedBy: string | null): Promise<ContentPageRow | null> {
    return contentPagesUpdateContentPageBody(this.pool, slug, content, updatedBy);
  }

  deleteContentPage(slug: string): Promise<boolean> {
    return contentPagesDeleteContentPage(this.pool, slug);
  }

  getAdminUsernamesByIds(ids: string[]): Promise<Map<string, string>> {
    return contentPagesGetAdminUsernamesByIds(this.pool, ids);
  }

  listPublishedContentPages(): Promise<Array<{ slug: string; title: string }>> {
    return contentPagesListPublishedContentPages(this.pool);
  }

  getPublishedContentPageBySlug(slug: string): Promise<ContentPageRow | null> {
    return contentPagesGetPublishedContentPageBySlug(this.pool, slug);
  }

  listContentPublications(pageId: string): Promise<ContentPublicationRow[]> {
    return contentPagesListContentPublications(this.pool, pageId);
  }

  getPublishedContentPageByPath(context: SingleContentContext, path: string): Promise<ContentPageRow | null> {
    return contentPagesGetPublishedContentPageByPath(this.pool, context, path);
  }

  replaceContentPublications(pageId: string, publications: ContentPublication[]): Promise<ContentPublicationRow[]> {
    return contentPagesReplaceContentPublications(this.pool, pageId, publications);
  }

  applyContentPublicationCutover(entries: ContentPublicationCutoverInput[]): Promise<ContentPublicationCutoverResult> {
    return contentPagesApplyContentPublicationCutover(this.pool, entries);
  }

  getContentPagesBySlugs(slugs: string[]): Promise<ContentPageRow[]> {
    return contentPagesGetContentPagesBySlugs(this.pool, slugs);
  }

  getPublishedContentPagesBySlugs(slugs: string[]): Promise<ContentPageRow[]> {
    return contentPagesGetPublishedContentPagesBySlugs(this.pool, slugs);
  }

  bulkUpdatePages(payload: BulkUpdatePagesPayload): Promise<ContentPageSummaryRow[]> {
    return contentPagesBulkUpdatePages(this.pool, payload);
  }

  setContentPageContentUpdatedAt(slug: string, when: Date): Promise<void> {
    return contentPagesSetContentPageContentUpdatedAt(this.pool, slug, when);
  }

  listSegmentsForOwner(ownerSlug: string): Promise<PageSegmentRow[]> {
    return contentPagesListSegmentsForOwner(this.pool, ownerSlug);
  }

  deleteSegmentsForOwner(ownerSlug: string): Promise<void> {
    return contentPagesDeleteSegmentsForOwner(this.pool, ownerSlug);
  }

  replaceSegmentsForOwner(ownerSlug: string, segments: PageSegmentInputRow[]): Promise<PageSegmentRow[]> {
    return contentPagesReplaceSegmentsForOwner(this.pool, ownerSlug, segments);
  }

  // ============================================================================
  // NAVIGATION ITEMS (AdminRepository)
  // ============================================================================

  listAdminNavItems(navId: NavId): Promise<NavItemRow[]> {
    return contentNavListAdminNavItems(this.pool, navId);
  }

  replaceAdminNavItems(navId: NavId, items: NavItemReplaceInput[]): Promise<NavItemRow[]> {
    return contentNavReplaceAdminNavItems(this.pool, navId, items);
  }

  listNavigationConfiguration(): Promise<NavigationConfigurationEntryRow[]> {
    return contentNavListNavigationConfiguration(this.pool);
  }

  replaceNavigationConfiguration(
    entries: NavigationConfigurationReplaceInput[],
  ): Promise<NavigationConfigurationEntryRow[]> {
    return contentNavReplaceNavigationConfiguration(this.pool, entries);
  }

  // ============================================================================
  // CRAWLER STATE + RUNS (TrackRepository) — migration 0023
  // ============================================================================

  seedCrawlState(seed: CrawlStateSeed): Promise<void> {
    return crawlSeedCrawlState(this.pool, seed);
  }

  findCrawlState(source: string): Promise<CrawlStateRecord | null> {
    return crawlFindCrawlState(this.pool, source);
  }

  listCrawlState(): Promise<CrawlStateRecord[]> {
    return crawlListCrawlState(this.pool);
  }

  listDueCrawlState(): Promise<CrawlStateRecord[]> {
    return crawlListDueCrawlState(this.pool);
  }

  updateCrawlState(source: string, patch: CrawlStatePatch): Promise<CrawlStateRecord | null> {
    return crawlUpdateCrawlState(this.pool, source, patch);
  }

  acquireCrawlLock(source: string, maxRunMs: number): Promise<boolean> {
    return crawlAcquireCrawlLock(this.pool, source, maxRunMs);
  }

  completeCrawlTick(source: string, outcome: CrawlTickOutcome): Promise<void> {
    return crawlCompleteCrawlTick(this.pool, source, outcome);
  }

  insertCrawlRun(run: CrawlRunInsert): Promise<void> {
    return crawlInsertCrawlRun(this.pool, run);
  }

  finalizeCrawlRun(id: string, finalize: CrawlRunFinalize): Promise<void> {
    return crawlFinalizeCrawlRun(this.pool, id, finalize);
  }

  listCrawlRuns(params: { source?: string; page: number; limit: number }): Promise<CrawlRunsPage> {
    return crawlListCrawlRuns(this.pool, params);
  }

  // ============================================================================
  // DEVELOPER ACCOUNTS (DeveloperRepository) — migration 0047
  // ============================================================================

  createDeveloperAccount(data: {
    email: string;
    passwordHash?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    tierId?: string | null;
  }): Promise<DeveloperAccount> {
    return developerCreateAccount(this.pool, data);
  }

  findDeveloperAccountById(id: string): Promise<DeveloperAccount | null> {
    return developerFindAccountById(this.pool, id);
  }

  findDeveloperAccountByEmail(email: string): Promise<DeveloperAccount | null> {
    return developerFindAccountByEmail(this.pool, email);
  }

  listDeveloperAccounts(): Promise<
    (DeveloperAccount & {
      clientCount: number;
      appName: string | null;
      tierName: string | null;
      tierEnabled: boolean | null;
    })[]
  > {
    return developerListAccounts(this.pool);
  }

  markDeveloperEmailVerified(id: string): Promise<DeveloperAccount | null> {
    return developerMarkEmailVerified(this.pool, id);
  }

  updateDeveloperLastLogin(id: string): Promise<void> {
    return developerUpdateLastLogin(this.pool, id);
  }

  setDeveloperPassword(id: string, passwordHash: string): Promise<DeveloperAccount | null> {
    return developerSetPassword(this.pool, id, passwordHash);
  }

  clearDeveloperPassword(id: string): Promise<void> {
    return developerClearPassword(this.pool, id);
  }

  deleteDeveloperAccount(id: string): Promise<boolean> {
    return developerDeleteAccount(this.pool, id);
  }

  updateDeveloperAccount(
    id: string,
    data: {
      email?: string;
      displayName?: string | null;
      tierId?: string | null;
      status?: string;
    },
  ): Promise<DeveloperAccount | null> {
    return developerUpdateAccount(this.pool, id, data);
  }

  createDeveloperIdentity(data: {
    accountId: string;
    provider: string;
    providerUserId?: string | null;
  }): Promise<DeveloperIdentity> {
    return developerCreateIdentity(this.pool, data);
  }

  listDeveloperIdentitiesByAccount(accountId: string): Promise<DeveloperIdentity[]> {
    return developerListIdentitiesByAccount(this.pool, accountId);
  }

  findDeveloperIdentity(provider: string, providerUserId: string): Promise<DeveloperIdentity | null> {
    return developerFindIdentity(this.pool, provider, providerUserId);
  }

  createDeveloperEmailToken(data: {
    accountId: string;
    purpose: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<DeveloperEmailToken> {
    return developerCreateEmailToken(this.pool, data);
  }

  findActiveDeveloperEmailToken(tokenHash: string, purpose: string): Promise<DeveloperEmailToken | null> {
    return developerFindActiveEmailToken(this.pool, tokenHash, purpose);
  }

  consumeDeveloperEmailToken(id: string): Promise<boolean> {
    return developerConsumeEmailToken(this.pool, id);
  }

  // ============================================================================
  // API ACCESS (ApiAccessRepository) — migration 0048
  // ============================================================================

  createDeveloperProject(data: {
    developerAccountId: string;
    displayName: string;
    requestsPerMinute?: number | null;
    requestsPerDay?: number | null;
    tierId?: string | null;
    createdByAdminId?: string | null;
  }): Promise<DeveloperProject> {
    return apiAccessCreateDeveloperProject(this.pool, data);
  }

  findDeveloperProjectById(id: string): Promise<DeveloperProject | null> {
    return apiAccessFindDeveloperProjectById(this.pool, id);
  }

  listDeveloperProjectsByAccount(developerAccountId: string): Promise<DeveloperProject[]> {
    return apiAccessListDeveloperProjectsByAccount(this.pool, developerAccountId);
  }

  updateDeveloperProject(
    id: string,
    data: {
      displayName?: string;
      status?: "active" | "suspended" | "deleted";
      requestsPerMinute?: number | null;
      requestsPerDay?: number | null;
    },
  ): Promise<DeveloperProject | null> {
    return apiAccessUpdateDeveloperProject(this.pool, id, data);
  }

  setDeveloperProjectSubscription(data: {
    projectId: string;
    tierId: string | null;
    creemSubscriptionId?: string | null;
    creemCustomerId?: string | null;
    status?: string;
    interval?: string | null;
    currentPeriodEnd?: number | null;
    cancelAtPeriodEnd?: boolean;
  }): Promise<DeveloperProjectSubscription> {
    return apiAccessSetDeveloperProjectSubscription(this.pool, data);
  }

  findDeveloperProjectSubscription(projectId: string): Promise<DeveloperProjectSubscription | null> {
    return apiAccessFindDeveloperProjectSubscription(this.pool, projectId);
  }

  countPendingApiAccessRequests(): Promise<number> {
    return apiAccessCountPending(this.pool);
  }

  createApiAccessRequest(data: {
    developerAccountId: string;
    projectId?: string | null;
    contactEmail: string;
    appName: string;
    appDescription: string;
    estimatedRequestsPerDay: number;
  }): Promise<ApiAccessRequest> {
    return apiAccessCreateRequest(this.pool, data);
  }

  findApiAccessRequestById(id: string): Promise<ApiAccessRequest | null> {
    return apiAccessFindRequestById(this.pool, id);
  }

  listApiAccessRequestsByDeveloperAccount(developerAccountId: string): Promise<ApiAccessRequest[]> {
    return apiAccessListRequestsByDeveloperAccount(this.pool, developerAccountId);
  }

  listApiAccessRequests(status?: string): Promise<ApiAccessRequest[]> {
    return apiAccessListRequests(this.pool, status);
  }

  reviewApiAccessRequest(
    id: string,
    data: {
      status: "approved" | "rejected";
      reviewedByAdminId: string;
      reviewNote?: string | null;
      projectId?: string | null;
    },
  ): Promise<ApiAccessRequest | null> {
    return apiAccessReviewRequest(this.pool, id, data);
  }

  createApiClient(data: {
    requestId?: string | null;
    developerAccountId: string;
    projectId?: string | null;
    registrationType?: "development" | "confidential" | "public";
    capabilities?: string[];
    appName: string;
    contactEmail: string;
    description: string;
    requestsPerMinute?: number;
    requestsPerDay?: number;
    createdByAdminId?: string | null;
  }): Promise<ApiClient> {
    return apiAccessCreateClient(this.pool, data);
  }

  findApiClientById(id: string): Promise<ApiClient | null> {
    return apiAccessFindClientById(this.pool, id);
  }

  listApiClientsByDeveloperAccount(developerAccountId: string): Promise<ApiClient[]> {
    return apiAccessListClientsByDeveloperAccount(this.pool, developerAccountId);
  }

  listApiClientsByProject(projectId: string): Promise<ApiClient[]> {
    return apiAccessListClientsByProject(this.pool, projectId);
  }

  listApiClients(status?: string): Promise<ApiClient[]> {
    return apiAccessListClients(this.pool, status);
  }

  updateApiClient(
    id: string,
    data: { status?: string; requestsPerMinute?: number; requestsPerDay?: number },
  ): Promise<ApiClient | null> {
    return apiAccessUpdateClient(this.pool, id, data);
  }

  createApiClientToken(data: {
    clientId: string;
    tokenPrefix: string;
    tokenHash: string;
    rawToken: string;
    rotatedFromTokenId?: string | null;
  }): Promise<ApiClientToken> {
    return apiAccessCreateClientToken(this.pool, data);
  }

  listApiClientTokensByClient(clientId: string): Promise<ApiClientToken[]> {
    return apiAccessListClientTokensByClient(this.pool, clientId);
  }

  findApiClientTokenById(id: string): Promise<ApiClientToken | null> {
    return apiAccessFindClientTokenById(this.pool, id);
  }

  findActiveApiClientByTokenHash(
    tokenHash: string,
  ): Promise<{ project: DeveloperProject; client: ApiClient; token: ApiClientToken } | null> {
    return apiAccessFindActiveClientByTokenHash(this.pool, tokenHash);
  }

  touchApiClientTokenLastUsed(tokenId: string): Promise<void> {
    return apiAccessTouchClientTokenLastUsed(this.pool, tokenId);
  }

  revokeApiClientToken(id: string): Promise<ApiClientToken | null> {
    return apiAccessRevokeClientToken(this.pool, id);
  }

  activateApiClientToken(id: string): Promise<ApiClientToken | null> {
    return apiAccessActivateClientToken(this.pool, id);
  }

  rotateApiClientToken(
    id: string,
    data: { newTokenPrefix: string; newTokenHash: string },
  ): Promise<{ oldToken: ApiClientToken; newToken: ApiClientToken } | null> {
    return apiAccessRotateClientToken(this.pool, id, data);
  }

  createApiAccessAuditEvent(data: {
    projectId?: string | null;
    clientId?: string | null;
    requestId?: string | null;
    tokenId?: string | null;
    eventType: string;
    actorAdminId?: string | null;
    actorDeveloperAccountId?: string | null;
    eventData?: Record<string, unknown>;
  }): Promise<ApiAccessAuditEvent> {
    return apiAccessCreateAuditEvent(this.pool, data);
  }

  createApiUsageEvent(data: {
    requestId: string;
    projectId: string;
    registrationId: string;
    tokenId?: string | null;
    method: string;
    endpointTemplate: string;
    statusCode: number;
    durationMs: number;
  }): Promise<ApiUsageEvent> {
    return apiAccessCreateUsageEvent(this.pool, data);
  }

  // ============================================================================
  // TIER QUERIES
  // ============================================================================

  /** Lazy-initialised tier repository, sharing the same pool. */
  private _tiers: PostgresTierRepository | null = null;
  get tiers(): PostgresTierRepository {
    if (!this._tiers) this._tiers = new PostgresTierRepository(this.pool);
    return this._tiers;
  }
}
