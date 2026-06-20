import * as pgModule from "pg";
import { log } from "../../lib/infra/logger.js";
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
  ContentPageTranslationRow,
  ContentPageTranslationUpsert,
  EmailTemplateRow,
  EmailTemplateWriteData,
  ListResult,
  NavId,
  NavItemReplaceInput,
  NavItemRow,
  NavItemTranslationRow,
  PageSegmentInputRow,
  PageSegmentRow,
  PageSegmentTranslationRow,
  TrackListItem,
} from "../admin-repository.js";
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
  CcRepository,
  CcTrackRecord,
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
  findAlbumByExternalId as albumsFindAlbumByExternalId,
  findAlbumByUpc as albumsFindAlbumByUpc,
  findAlbumByUrl as albumsFindAlbumByUrl,
  findAlbumPreviews as albumsFindAlbumPreviews,
  findExistingAlbumByUpc as albumsFindExistingAlbumByUpc,
  findExistingAlbumByUpcSync as albumsFindExistingAlbumByUpcSync,
  loadAlbumByShortId as albumsLoadAlbumByShortId,
  persistAlbumWithLinks as albumsPersistAlbumWithLinks,
  upsertAlbumPreview as albumsUpsertAlbumPreview,
} from "./postgres-albums.js";
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
import { findCcTrackByShortId as ccFindByShortId, persistCcTrack as ccPersistTrack } from "./postgres-cc.js";
import {
  deleteEmailTemplate as contentEmailDeleteEmailTemplate,
  getEmailTemplateById as contentEmailGetEmailTemplateById,
  getEmailTemplateByName as contentEmailGetEmailTemplateByName,
  insertEmailTemplate as contentEmailInsertEmailTemplate,
  listEmailTemplates as contentEmailListEmailTemplates,
  updateEmailTemplate as contentEmailUpdateEmailTemplate,
} from "./postgres-content-email.js";
import {
  listAdminNavItems as contentNavListAdminNavItems,
  listNavTranslations as contentNavListNavTranslations,
  replaceAdminNavItems as contentNavReplaceAdminNavItems,
  replaceNavItemTranslations as contentNavReplaceNavItemTranslations,
} from "./postgres-content-nav.js";
import {
  bulkUpdatePages as contentPagesBulkUpdatePages,
  contentPageSlugExists as contentPagesContentPageSlugExists,
  createContentPage as contentPagesCreateContentPage,
  deleteContentPage as contentPagesDeleteContentPage,
  deletePageTranslation as contentPagesDeletePageTranslation,
  deleteSegmentsForOwner as contentPagesDeleteSegmentsForOwner,
  getAdminUsernamesByIds as contentPagesGetAdminUsernamesByIds,
  getContentPageBySlug as contentPagesGetContentPageBySlug,
  getContentPagesBySlugs as contentPagesGetContentPagesBySlugs,
  getPageTranslation as contentPagesGetPageTranslation,
  getPublishedContentPageBySlug as contentPagesGetPublishedContentPageBySlug,
  getPublishedContentPagesBySlugs as contentPagesGetPublishedContentPagesBySlugs,
  listContentPageSummaries as contentPagesListContentPageSummaries,
  listPageTranslations as contentPagesListPageTranslations,
  listPublishedContentPages as contentPagesListPublishedContentPages,
  listSegmentsForOwner as contentPagesListSegmentsForOwner,
  listSegmentTranslationsForOwner as contentPagesListSegmentTranslationsForOwner,
  replaceSegmentsForOwner as contentPagesReplaceSegmentsForOwner,
  replaceSegmentTranslations as contentPagesReplaceSegmentTranslations,
  setContentPageContentUpdatedAt as contentPagesSetContentPageContentUpdatedAt,
  updateContentPageBody as contentPagesUpdateContentPageBody,
  updateContentPageMeta as contentPagesUpdateContentPageMeta,
  upsertPageTranslation as contentPagesUpsertPageTranslation,
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
import { insertAppTelemetryEvent } from "./postgres-telemetry.js";
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

export class PostgresAdapter implements TrackRepository, AdminRepository, CcRepository {
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

  findCcTrackByShortId(shortId: string): Promise<CcTrackRecord | null> {
    return ccFindByShortId(this.pool, shortId);
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

  // ============================================================================
  // CONTENT PAGES + PAGE TRANSLATIONS + SEGMENTS (AdminRepository)
  // ============================================================================

  listContentPageSummaries(): Promise<ContentPageSummaryRow[]> {
    return contentPagesListContentPageSummaries(this.pool);
  }

  getContentPageBySlug(slug: string): Promise<ContentPageRow | null> {
    return contentPagesGetContentPageBySlug(this.pool, slug);
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

  getContentPagesBySlugs(slugs: string[]): Promise<ContentPageRow[]> {
    return contentPagesGetContentPagesBySlugs(this.pool, slugs);
  }

  getPublishedContentPagesBySlugs(slugs: string[]): Promise<ContentPageRow[]> {
    return contentPagesGetPublishedContentPagesBySlugs(this.pool, slugs);
  }

  bulkUpdatePages(payload: BulkUpdatePagesPayload): Promise<ContentPageSummaryRow[]> {
    return contentPagesBulkUpdatePages(this.pool, payload);
  }

  listPageTranslations(slug: string): Promise<ContentPageTranslationRow[]> {
    return contentPagesListPageTranslations(this.pool, slug);
  }

  getPageTranslation(slug: string, locale: string): Promise<ContentPageTranslationRow | null> {
    return contentPagesGetPageTranslation(this.pool, slug, locale);
  }

  upsertPageTranslation(input: ContentPageTranslationUpsert): Promise<ContentPageTranslationRow> {
    return contentPagesUpsertPageTranslation(this.pool, input);
  }

  deletePageTranslation(slug: string, locale: string): Promise<boolean> {
    return contentPagesDeletePageTranslation(this.pool, slug, locale);
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

  listSegmentTranslationsForOwner(ownerSlug: string): Promise<PageSegmentTranslationRow[]> {
    return contentPagesListSegmentTranslationsForOwner(this.pool, ownerSlug);
  }

  replaceSegmentTranslations(
    segmentId: number,
    translations: { locale: string; label: string; sourceUpdatedAt: Date | null }[],
  ): Promise<void> {
    return contentPagesReplaceSegmentTranslations(this.pool, segmentId, translations);
  }

  // ============================================================================
  // NAVIGATION ITEMS + NAV TRANSLATIONS (AdminRepository)
  // ============================================================================

  listAdminNavItems(navId: NavId): Promise<NavItemRow[]> {
    return contentNavListAdminNavItems(this.pool, navId);
  }

  replaceAdminNavItems(navId: NavId, items: NavItemReplaceInput[]): Promise<NavItemRow[]> {
    return contentNavReplaceAdminNavItems(this.pool, navId, items);
  }

  listNavTranslations(navId: NavId): Promise<NavItemTranslationRow[]> {
    return contentNavListNavTranslations(this.pool, navId);
  }

  replaceNavItemTranslations(
    navItemId: number,
    translations: { locale: string; label: string; sourceUpdatedAt: Date | null }[],
  ): Promise<void> {
    return contentNavReplaceNavItemTranslations(this.pool, navItemId, translations);
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
}
