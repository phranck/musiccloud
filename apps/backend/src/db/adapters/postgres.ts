import type { ContentCardStyle, OverlayWidth, PageDisplayMode, PageTitleAlignment, PageType } from "@musiccloud/shared";
import type { PoolClient } from "pg";
import * as pgModule from "pg";
import { CACHE_TTL_MS } from "../../lib/config.js";
import { adminEventBroadcaster } from "../../lib/event-broadcaster.js";
import { log } from "../../lib/infra/logger.js";
import { generateShortId, generateTrackId } from "../../lib/short-id.js";
import type { NormalizedAlbum, NormalizedArtist, NormalizedTrack, TrackSource } from "../../services/types.js";
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
  ContentStatus,
  EmailTemplateRow,
  EmailTemplateWriteData,
  ListResult,
  NavId,
  NavItemReplaceInput,
  NavItemRow,
  NavItemTranslationRow,
  NavTarget,
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
  CrawlRunFinalize,
  CrawlRunInsert,
  CrawlRunRecord,
  CrawlRunsPage,
  CrawlStatePatch,
  CrawlStateRecord,
  CrawlStateSeed,
  CrawlTickOutcome,
  ExternalIdRecord,
  PersistAlbumData,
  PersistArtistData,
  PersistTrackData,
  PreviewObservation,
  PreviewRow,
  SharePageAlbumResult,
  SharePageArtistResult,
  SharePageDbResult,
  TrackRepository,
  WebsiteAnalyticsBatchInput,
  WebsiteAnalyticsDrilldown,
  WebsiteAnalyticsDrilldownParams,
  WebsiteAnalyticsEventInput,
  WebsiteAnalyticsExport,
  WebsiteAnalyticsOverview,
  WebsiteAnalyticsPathEvent,
  WebsiteAnalyticsRetentionPolicy,
  WebsiteAnalyticsRetentionResult,
  WebsiteAnalyticsSearchDescriptor,
  WebsiteAnalyticsTrend,
} from "../repository.js";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface TrackRow {
  id: string;
  title: string;
  artists: string;
  artist_credits: string;
  album_name: string | null;
  isrc: string | null;
  artwork_url: string | null;
  duration_ms: number | null;
  release_date: string | null;
  is_explicit: number | null;
  preview_url: string | null;
  source_service: string | null;
  source_url: string | null;
  created_at: Date;
  updated_at: Date;
}

interface TrackWithLinkRow extends TrackRow {
  url: string | null;
  service: string | null;
  confidence: number | null;
  match_method: string | null;
  short_id: string | null;
}

interface WebsiteAnalyticsPathEventRow {
  id: string;
  occurred_at: Date | string;
  event_type: string;
  session_id: string;
  device_key: string | null;
  network_cluster_key: string;
  cluster: string;
  confidence: string;
  path: string | null;
  route_template: string | null;
  referrer_domain: string | null;
  device_class: string | null;
  browser_family: string | null;
  browser_version: string | null;
  os_family: string | null;
  os_version: string | null;
  device_brand: string | null;
  device_model: string | null;
  device_model_code: string | null;
  is_bot: boolean | null;
  bot_name: string | null;
  bot_category: string | null;
  surface: string | null;
  platform: string | null;
  media_type: string | null;
  short_id: string | null;
  element_key: string | null;
  label: string | null;
  event_data: Record<string, unknown> | null;
  subject_type: "track" | "album" | "artist" | null;
  subject_title: string | null;
  subject_artist: string | null;
  subject_artwork_url: string | null;
}

interface WebsiteAnalyticsSearchDescriptorRow {
  query_type: string | null;
  platform: string | null;
  label: string | null;
  subject_type: "track" | "album" | "artist" | null;
  subject_title: string | null;
  subject_artist: string | null;
  subject_artwork_url: string | null;
}

interface WebsiteAnalyticsSearchSummaryRow extends WebsiteAnalyticsSearchDescriptorRow {
  searches: number | string | null;
  clusters: number | string | null;
}

interface WebsiteAnalyticsInteractionSummaryRow {
  event_type: string;
  label: string | null;
  surface: string | null;
  element_key: string | null;
  platform: string | null;
  count: number | string | null;
}

interface WebsiteAnalyticsEnvironmentSummaryRow {
  value: string | null;
  visitors: number | string | null;
}

interface WebsiteAnalyticsBotTrafficSummaryRow {
  bot: string | null;
  category: string | null;
  events: number | string | null;
  pageviews: number | string | null;
}

interface WebsiteAnalyticsDeviceSummaryRow {
  device_key: string | null;
  label: string;
  sessions: number;
  events: number;
  last_seen_at: Date | string;
  device_class: string | null;
  browser_family: string | null;
  browser_version: string | null;
  os_family: string | null;
  os_version: string | null;
  device_brand: string | null;
  device_model: string | null;
  device_model_code: string | null;
}

interface WebsiteAnalyticsTotalsRow {
  clusters: number | string | null;
  devices: number | string | null;
  sessions: number | string | null;
  pageviews: number | string | null;
  searches: number | string | null;
  resolves: number | string | null;
  listen_on: number | string | null;
  player_starts: number | string | null;
  interactions: number | string | null;
}

const WEBSITE_ANALYTICS_MUSIC_SOURCE_PLATFORMS = [
  "amazon",
  "amazon_music",
  "apple",
  "apple_music",
  "bandcamp",
  "deezer",
  "musicbrainz",
  "qobuz",
  "soundcloud",
  "spotify",
  "tidal",
  "youtube",
  "youtube_music",
] as const;

const WEBSITE_ANALYTICS_INTERACTION_EVENT_TYPES = [
  "listen_on_clicked",
  "similar_artist_clicked",
  "popular_track_clicked",
  "upcoming_event_clicked",
  "player_started",
  "player_paused",
  "player_resumed",
  "player_completed",
  "player_unavailable",
  "info_page_clicked",
  "help_page_clicked",
  "live_example_clicked",
  "layered_footer_clicked",
  "ui_click",
] as const;

interface WebsiteAnalyticsSessionSummaryRow {
  session_id: string;
  device_key: string | null;
  network_cluster_key: string;
  cluster: string;
  events: number;
  pageviews: number;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
  entry_path: string | null;
  exit_path: string | null;
}

const WEBSITE_ANALYTICS_RETENTION_POLICY = {
  rawEventsDays: 180,
  summariesDays: 730,
} as const satisfies WebsiteAnalyticsRetentionPolicy;

interface AlbumRow {
  id: string;
  title: string;
  artists: string;
  artist_credits: string;
  release_date: string | null;
  total_tracks: number | null;
  artwork_url: string | null;
  label: string | null;
  upc: string | null;
  source_service: string | null;
  source_url: string | null;
  preview_url: string | null;
  created_at: Date;
  updated_at: Date;
}

interface AlbumWithLinkRow extends AlbumRow {
  link_url: string | null;
  service: string | null;
  confidence: number | null;
  match_method: string | null;
  short_id: string | null;
}

interface AdminUserRow {
  id: string;
  username: string;
  password_hash: string;
  email: string | null;
  role: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  locale: string;
  invite_token_hash: string | null;
  invite_expires_at: Date | null;
  session_timeout_minutes: number | null;
  created_at: Date;
  last_login_at: Date | null;
}

interface CountRow {
  count: number;
}

interface ServiceLinkRow {
  service: string;
  url: string;
}

interface TrackListRow {
  id: string;
  title: string;
  artists: string;
  artist_credits: string;
  album_name: string | null;
  isrc: string | null;
  artwork_url: string | null;
  source_service: string | null;
  created_at: Date;
  short_id: string | null;
  link_count: string;
}

interface AlbumListRow {
  id: string;
  title: string;
  artists: string;
  artist_credits: string;
  release_date: string | null;
  total_tracks: number | null;
  artwork_url: string | null;
  upc: string | null;
  source_service: string | null;
  created_at: Date;
  short_id: string | null;
  link_count: string;
}

interface ArtistRow {
  id: string;
  artist_entity_id: string;
  name: string;
  image_url: string | null;
  genres: string | null;
  source_service: string | null;
  source_url: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ArtistWithLinkRow extends ArtistRow {
  link_url: string | null;
  service: string | null;
  confidence: number | null;
  match_method: string | null;
  short_id: string | null;
}

interface ArtistCacheRow_DB {
  artist_name: string;
  top_tracks: string | null;
  profile: string | null;
  events: string | null;
  tracks_updated_at: Date | null;
  profile_updated_at: Date | null;
  events_updated_at: Date | null;
}

interface ArtistIdentityEventSqlRow {
  event_id: string;
  artist_entity_id: string;
  entity_type: ArtistIdentityEventRecord["entityType"];
  verification_status: ArtistIdentityEventRecord["verificationStatus"];
  display_name: string;
  event_type: ArtistIdentityEventRecord["eventType"];
  date_value: string | null;
  date_precision: ArtistIdentityEventRecord["datePrecision"];
  event_year: number | null;
  event_month: number | null;
  event_day: number | null;
  place_name: string | null;
  country_code: string | null;
  source_provider: string | null;
  source_url: string | null;
  confidence: number | null;
}

interface ArtistGroupMembershipSqlRow {
  membership_id: string;
  group_artist_entity_id: string;
  group_name: string;
  member_artist_entity_id: string;
  member_name: string;
  member_name_credit: string | null;
  roles: string[] | null;
  begin_date: string | null;
  begin_date_precision: ArtistGroupMembershipRecord["beginDatePrecision"];
  begin_year: number | null;
  end_date: string | null;
  end_date_precision: ArtistGroupMembershipRecord["endDatePrecision"];
  end_year: number | null;
  is_current: boolean | null;
  source_provider: string | null;
  source_url: string | null;
  confidence: number | null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function safeParseArray(json: string, fallback: string[] = []): string[] {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function safeParseArtistCredits(json: string, fallback: ArtistCredit[] = []): ArtistCredit[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    return parsed.flatMap((credit) => {
      if (!credit || typeof credit !== "object") return [];
      const row = credit as Record<string, unknown>;
      if (
        typeof row.artistEntityId !== "string" ||
        typeof row.name !== "string" ||
        typeof row.role !== "string" ||
        typeof row.position !== "number"
      ) {
        return [];
      }
      return [
        {
          artistEntityId: row.artistEntityId,
          name: row.name,
          role: row.role as ArtistCredit["role"],
          position: row.position,
        },
      ];
    });
  } catch {
    return fallback;
  }
}

function normalizeArtistCreditInputs(
  artistNames: string[],
  structuredCredits: ArtistCredit[] | undefined,
): Array<{ artistEntityId?: string; name: string }> {
  if (structuredCredits && structuredCredits.length > 0) {
    return structuredCredits.flatMap((credit) => {
      const name = credit.name.trim();
      if (!name) return [];
      return [{ artistEntityId: credit.artistEntityId, name }];
    });
  }

  return artistNames
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

function safeParseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

const TRACK_ARTISTS_SELECT = `COALESCE((
  SELECT jsonb_agg(tac.credit_name ORDER BY tac.credit_position, tac.created_at)::text
  FROM track_artist_credits tac
  WHERE tac.track_id = t.id AND tac.credit_role = 'main'
), '[]') AS artists`;

const TRACK_ARTIST_CREDITS_SELECT = `COALESCE((
  SELECT jsonb_agg(
    jsonb_build_object(
      'artistEntityId', tac.artist_entity_id,
      'name', tac.credit_name,
      'role', tac.credit_role,
      'position', tac.credit_position
    )
    ORDER BY tac.credit_position, tac.created_at
  )::text
  FROM track_artist_credits tac
  WHERE tac.track_id = t.id AND tac.credit_role = 'main'
), '[]') AS artist_credits`;

const TRACK_ARTIST_FIELDS_SELECT = `${TRACK_ARTISTS_SELECT}, ${TRACK_ARTIST_CREDITS_SELECT}`;

const ALBUM_ARTISTS_SELECT = `COALESCE((
  SELECT jsonb_agg(aac.credit_name ORDER BY aac.credit_position, aac.created_at)::text
  FROM album_artist_credits aac
  WHERE aac.album_id = a.id AND aac.credit_role = 'main'
), '[]') AS artists`;

const ALBUM_ARTIST_CREDITS_SELECT = `COALESCE((
  SELECT jsonb_agg(
    jsonb_build_object(
      'artistEntityId', aac.artist_entity_id,
      'name', aac.credit_name,
      'role', aac.credit_role,
      'position', aac.credit_position
    )
    ORDER BY aac.credit_position, aac.created_at
  )::text
  FROM album_artist_credits aac
  WHERE aac.album_id = a.id AND aac.credit_role = 'main'
), '[]') AS artist_credits`;

const ALBUM_ARTIST_FIELDS_SELECT = `${ALBUM_ARTISTS_SELECT}, ${ALBUM_ARTIST_CREDITS_SELECT}`;

const ARTIST_NAME_SELECT = `COALESCE(artist_name.name, '[unnamed artist]') AS name`;

const ARTIST_NAME_LATERAL_JOIN = `LEFT JOIN LATERAL (
  SELECT n.name
  FROM artist_entity_names n
  WHERE n.artist_entity_id = ar.artist_entity_id
  ORDER BY
    CASE
      WHEN n.name_type = 'canonical' AND n.locale IS NULL THEN 0
      WHEN n.name_type = 'canonical' THEN 1
      WHEN n.name_type = 'credit' THEN 2
      WHEN n.locale IS NULL THEN 3
      ELSE 4
    END,
    n.created_at ASC
  LIMIT 1
) artist_name ON TRUE`;

const WEBSITE_ANALYTICS_SUBJECT_JOIN = `LEFT JOIN LATERAL (
  SELECT
    'track'::text AS subject_type,
    t.title AS subject_title,
    COALESCE((
      SELECT tac.credit_name
      FROM track_artist_credits tac
      WHERE tac.track_id = t.id AND tac.credit_role = 'main'
      ORDER BY tac.credit_position, tac.created_at
      LIMIT 1
    ), 'Unknown') AS subject_artist,
    t.artwork_url AS subject_artwork_url
  FROM tracks t
  WHERE EXISTS (
      SELECT 1
      FROM short_urls su
      WHERE su.track_id = t.id AND su.id = e.short_id
    )
     OR (
      e.event_data->>'query_type' = 'url'
      AND (
        LOWER(SPLIT_PART(t.source_url, '?', 1)) = LOWER(SPLIT_PART(e.event_data->>'query_normalized', '?', 1))
        OR EXISTS (
          SELECT 1
          FROM service_links slq
          WHERE slq.track_id = t.id
            AND (
              LOWER(SPLIT_PART(slq.url, '?', 1)) = LOWER(SPLIT_PART(e.event_data->>'query_normalized', '?', 1))
              OR (
                slq.external_id IS NOT NULL
                AND e.event_data->>'query_normalized' ILIKE '%' || slq.external_id || '%'
              )
            )
        )
      )
    )

  UNION ALL

  SELECT
    'album'::text AS subject_type,
    a.title AS subject_title,
    COALESCE((
      SELECT aac.credit_name
      FROM album_artist_credits aac
      WHERE aac.album_id = a.id AND aac.credit_role = 'main'
      ORDER BY aac.credit_position, aac.created_at
      LIMIT 1
    ), 'Unknown') AS subject_artist,
    a.artwork_url AS subject_artwork_url
  FROM albums a
  WHERE EXISTS (
      SELECT 1
      FROM album_short_urls asu
      WHERE asu.album_id = a.id AND asu.id = e.short_id
    )
     OR (
      e.event_data->>'query_type' = 'url'
      AND (
        LOWER(SPLIT_PART(a.source_url, '?', 1)) = LOWER(SPLIT_PART(e.event_data->>'query_normalized', '?', 1))
        OR EXISTS (
          SELECT 1
          FROM album_service_links aslq
          WHERE aslq.album_id = a.id
            AND (
              LOWER(SPLIT_PART(aslq.url, '?', 1)) = LOWER(SPLIT_PART(e.event_data->>'query_normalized', '?', 1))
              OR (
                aslq.external_id IS NOT NULL
                AND e.event_data->>'query_normalized' ILIKE '%' || aslq.external_id || '%'
              )
            )
        )
      )
    )

  UNION ALL

  SELECT
    'artist'::text AS subject_type,
    COALESCE((
      SELECT n.name
      FROM artist_entity_names n
      WHERE n.artist_entity_id = ar.artist_entity_id
      ORDER BY
        CASE
          WHEN n.name_type = 'canonical' AND n.locale IS NULL THEN 0
          WHEN n.name_type = 'canonical' THEN 1
          WHEN n.name_type = 'credit' THEN 2
          WHEN n.locale IS NULL THEN 3
          ELSE 4
        END,
        n.created_at ASC
      LIMIT 1
    ), '[unnamed artist]') AS subject_title,
    NULL::text AS subject_artist,
    ar.image_url AS subject_artwork_url
  FROM artist_profiles ar
  WHERE EXISTS (
      SELECT 1
      FROM artist_short_urls asu
      WHERE asu.artist_entity_id = ar.artist_entity_id AND asu.id = e.short_id
    )
     OR (
      e.event_data->>'query_type' = 'url'
      AND (
        LOWER(SPLIT_PART(ar.source_url, '?', 1)) = LOWER(SPLIT_PART(e.event_data->>'query_normalized', '?', 1))
        OR EXISTS (
          SELECT 1
          FROM artist_service_links aslq
          WHERE aslq.artist_entity_id = ar.artist_entity_id
            AND (
              LOWER(SPLIT_PART(aslq.url, '?', 1)) = LOWER(SPLIT_PART(e.event_data->>'query_normalized', '?', 1))
              OR (
                aslq.external_id IS NOT NULL
                AND e.event_data->>'query_normalized' ILIKE '%' || aslq.external_id || '%'
              )
            )
        )
      )
    )

  LIMIT 1
) subject ON TRUE`;

const WEBSITE_ANALYTICS_PATH_EVENT_SELECT = `e.id::text,
        e.occurred_at,
        e.event_type,
        e.session_id::text,
        e.device_key,
        e.network_cluster_key,
        CONCAT('#', RIGHT(e.network_cluster_key, 6)) AS cluster,
        e.confidence,
        e.path,
        e.route_template,
        e.referrer_domain,
        e.device_class,
        e.browser_family,
        e.browser_version,
        e.os_family,
        e.os_version,
        e.device_brand,
        e.device_model,
        e.device_model_code,
        e.is_bot,
        e.bot_name,
        e.bot_category,
        e.surface,
        e.platform,
        e.media_type,
        e.short_id,
        e.element_key,
        e.event_data,
        subject.subject_type,
        subject.subject_title,
        subject.subject_artist,
        subject.subject_artwork_url,
        COALESCE(
          NULLIF(e.event_data->>'label', ''),
          NULLIF(subject.subject_title, ''),
          NULLIF(e.event_data->>'query_normalized', ''),
          NULLIF(e.event_data->>'error_class', ''),
          NULLIF(e.event_data->>'provider', ''),
          NULLIF(e.element_key, ''),
          NULLIF(e.platform, ''),
          NULLIF(e.route_template, ''),
          NULLIF(e.path, '')
        ) AS label`;

const WEBSITE_ANALYTICS_SEARCH_DESCRIPTOR_SELECT = `COALESCE(NULLIF(e.event_data->>'query_type', ''), 'unknown') AS query_type,
        COALESCE(NULLIF(e.platform, ''), NULLIF(e.event_data->>'provider', ''), NULLIF(e.event_data->>'service', '')) AS platform,
        CASE
          WHEN COALESCE(NULLIF(e.event_data->>'query_type', ''), 'unknown') = 'url'
            THEN COALESCE(NULLIF(subject.subject_title, ''), 'streaming_url_submitted')
          ELSE COALESCE(NULLIF(e.event_data->>'query_normalized', ''), 'unknown')
        END AS label,
        subject.subject_type,
        subject.subject_title,
        subject.subject_artist,
        subject.subject_artwork_url`;

// Convert Date to milliseconds for compatibility with sqlite.ts interface
function dateToMs(date: Date | null | undefined): number {
  return date ? date.getTime() : 0;
}

// Convert milliseconds to Date
function msToDate(ms: number): Date {
  return new Date(ms * 1000);
}

// ============================================================================
// POSTGRES ADAPTER
// ============================================================================

export class PostgresAdapter implements TrackRepository, AdminRepository {
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

  async insertWebsiteAnalyticsBatch(batch: WebsiteAnalyticsBatchInput): Promise<number> {
    return insertWebsiteAnalyticsBatch(this.pool, batch);
  }

  async getWebsiteAnalyticsOverview(
    since: Date,
    comparison?: { since: Date; until: Date },
  ): Promise<WebsiteAnalyticsOverview> {
    return getWebsiteAnalyticsOverview(this.pool, since, comparison);
  }

  async getWebsiteAnalyticsDrilldown(params: WebsiteAnalyticsDrilldownParams): Promise<WebsiteAnalyticsDrilldown> {
    return getWebsiteAnalyticsDrilldown(this.pool, params);
  }

  async exportWebsiteAnalytics(since: Date): Promise<WebsiteAnalyticsExport> {
    return exportWebsiteAnalytics(this.pool, since);
  }

  async runWebsiteAnalyticsRetention(now: Date): Promise<WebsiteAnalyticsRetentionResult> {
    return runWebsiteAnalyticsRetention(this.pool, now);
  }

  // ============================================================================
  // TRACK QUERIES (TrackRepository)
  // ============================================================================

  async findTrackByUrl(url: string): Promise<CachedTrackResult | null> {
    const result = await this.pool.query(
      `SELECT
        t.id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}, t.album_name, t.isrc, t.artwork_url,
        t.duration_ms, t.release_date, t.is_explicit,
        (SELECT tp.url FROM track_previews tp WHERE tp.track_id = t.id ORDER BY (tp.service = 'deezer') DESC, tp.observed_at DESC LIMIT 1) AS preview_url,
        t.source_service, t.source_url,
        sl.url, sl.service, sl.confidence, sl.match_method,
        su.id as short_id, t.created_at, t.updated_at
      FROM tracks t
      LEFT JOIN service_links sl ON t.id = sl.track_id
      LEFT JOIN short_urls su ON t.id = su.track_id
      WHERE t.source_url = $1
      ORDER BY sl.created_at ASC`,
      [url],
    );

    if (result.rows.length === 0) return null;
    return this.buildCachedResult(result.rows as TrackWithLinkRow[]);
  }

  async findTrackByIsrc(isrc: string): Promise<CachedTrackResult | null> {
    // Fast path: canonical column. Single-column index `idx_tracks_isrc`
    // takes the hit first because most tracks have their primary ISRC
    // there from persistence-time.
    const result = await this.pool.query(
      `SELECT
        t.id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}, t.album_name, t.isrc, t.artwork_url,
        t.duration_ms, t.release_date, t.is_explicit,
        (SELECT tp.url FROM track_previews tp WHERE tp.track_id = t.id ORDER BY (tp.service = 'deezer') DESC, tp.observed_at DESC LIMIT 1) AS preview_url,
        t.source_service, t.source_url,
        sl.url, sl.service, sl.confidence, sl.match_method,
        su.id as short_id, t.created_at, t.updated_at
      FROM tracks t
      LEFT JOIN service_links sl ON t.id = sl.track_id
      LEFT JOIN short_urls su ON t.id = su.track_id
      WHERE t.isrc = $1
      ORDER BY sl.created_at ASC`,
      [isrc],
    );

    if (result.rows.length > 0) {
      return this.buildCachedResult(result.rows as TrackWithLinkRow[]);
    }

    // Fallback: aggregation table. Catches regional-variant ISRCs that
    // a different service reported during a prior cross-service resolve
    // but are not the canonical value persisted on `tracks.isrc`.
    return this.findTrackByExternalId("isrc", isrc);
  }

  async findTracksByTextSearch(query: string, maxResults: number = 10): Promise<NormalizedTrack[]> {
    const results: NormalizedTrack[] = [];

    try {
      // Split query into words and search for any word match
      const words = query
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0);

      if (words.length === 0) {
        return [];
      }

      // Build WHERE clause: each word must match either title or artists
      const whereClauses = words
        .map(
          (_, i) =>
            `(t.title ILIKE $${i + 1} OR EXISTS (SELECT 1 FROM track_artist_credits tac WHERE tac.track_id = t.id AND tac.credit_name ILIKE $${i + 1}))`,
        )
        .join(" OR ");
      const params: (string | number)[] = words.map((w) => `%${w}%`);
      params.push(maxResults);

      const searchResult = await this.pool.query(
        `SELECT
          t.id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}, t.album_name, t.isrc, t.artwork_url,
          t.duration_ms, t.release_date, t.is_explicit,
        (SELECT tp.url FROM track_previews tp WHERE tp.track_id = t.id ORDER BY (tp.service = 'deezer') DESC, tp.observed_at DESC LIMIT 1) AS preview_url,
          t.source_service, t.source_url,
          t.created_at, t.updated_at
        FROM tracks t
        WHERE ${whereClauses}
        ORDER BY t.updated_at DESC
        LIMIT $${words.length + 1}`,
        params,
      );

      const rows = searchResult.rows as TrackRow[];

      for (const row of rows) {
        results.push(this.rowToTrack(row));
      }
    } catch (error) {
      log.error("PG", "Text search error:", error);
    }

    return results;
  }

  async findShortIdByTrackUrl(url: string): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT su.id FROM short_urls su
       JOIN tracks t ON su.track_id = t.id
       WHERE t.source_url = $1 LIMIT 1`,
      [url],
    );
    return result.rows[0]?.id ?? null;
  }

  async findExistingByIsrc(isrc: string): Promise<{ trackId: string; shortId: string } | null> {
    const result = await this.pool.query(
      `SELECT t.id, su.id as short_id
       FROM tracks t
       LEFT JOIN short_urls su ON t.id = su.track_id
       WHERE t.isrc = $1 LIMIT 1`,
      [isrc],
    );

    if (result.rows.length === 0) return null;
    return {
      trackId: result.rows[0].id,
      shortId: result.rows[0].short_id,
    };
  }

  findExistingByIsrcSync(_isrc: string): { trackId: string; shortId: string } | null {
    // Note: Synchronous method - must be called within a transaction context
    // This is a wrapper that throws since pg is async-only
    throw new Error("findExistingByIsrcSync not available in PostgreSQL adapter. Use findExistingByIsrc instead.");
  }

  async loadByShortId(shortId: string): Promise<SharePageDbResult | null> {
    const result = await this.pool.query(
      `SELECT
        t.id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}, t.album_name, t.isrc, t.artwork_url,
        t.duration_ms, t.release_date, t.is_explicit,
        (SELECT tp.url FROM track_previews tp WHERE tp.track_id = t.id ORDER BY (tp.service = 'deezer') DESC, tp.observed_at DESC LIMIT 1) AS preview_url,
        t.source_service, t.source_url,
        sl.url, sl.service, sl.confidence, sl.match_method,
        su.id as short_id, t.created_at, t.updated_at
      FROM tracks t
      JOIN short_urls su ON t.id = su.track_id
      LEFT JOIN service_links sl ON t.id = sl.track_id
      WHERE su.id = $1
      ORDER BY sl.created_at ASC`,
      [shortId],
    );

    if (result.rows.length === 0) return null;
    return this.buildSharePageResult(result.rows as TrackWithLinkRow[]);
  }

  async loadByTrackId(trackId: string): Promise<SharePageDbResult | null> {
    const result = await this.pool.query(
      `SELECT
        t.id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}, t.album_name, t.isrc, t.artwork_url,
        t.duration_ms, t.release_date, t.is_explicit,
        (SELECT tp.url FROM track_previews tp WHERE tp.track_id = t.id ORDER BY (tp.service = 'deezer') DESC, tp.observed_at DESC LIMIT 1) AS preview_url,
        t.source_service, t.source_url,
        sl.url, sl.service, sl.confidence, sl.match_method,
        su.id as short_id, t.created_at, t.updated_at
      FROM tracks t
      LEFT JOIN service_links sl ON t.id = sl.track_id
      LEFT JOIN short_urls su ON t.id = su.track_id
      WHERE t.id = $1
      ORDER BY sl.created_at ASC`,
      [trackId],
    );

    if (result.rows.length === 0) return null;
    return this.buildSharePageResult(result.rows as TrackWithLinkRow[]);
  }

  async persistTrackWithLinks(data: PersistTrackData): Promise<{
    trackId: string;
    shortId: string;
    artistCredits: ArtistCredit[];
  }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const now = new Date();

      // Look up existing track by ISRC or source_url to prevent duplicates
      let existingTrackId: string | null = null;
      let existingShortId: string | null = null;

      if (data.sourceTrack.isrc) {
        const found = await client.query(
          `SELECT t.id, su.id as short_id FROM tracks t
           LEFT JOIN short_urls su ON t.id = su.track_id
           WHERE t.isrc = $1 LIMIT 1`,
          [data.sourceTrack.isrc],
        );
        if (found.rows.length > 0) {
          existingTrackId = found.rows[0].id;
          existingShortId = found.rows[0].short_id;
        }
      }

      if (!existingTrackId && data.sourceTrack.sourceUrl) {
        const found = await client.query(
          `SELECT t.id, su.id as short_id FROM tracks t
           LEFT JOIN short_urls su ON t.id = su.track_id
           WHERE t.source_url = $1 LIMIT 1`,
          [data.sourceTrack.sourceUrl],
        );
        if (found.rows.length > 0) {
          existingTrackId = found.rows[0].id;
          existingShortId = found.rows[0].short_id;
        }
      }

      const trackId = existingTrackId ?? generateTrackId();
      const shortId = existingShortId ?? generateShortId();

      if (existingTrackId) {
        // Update existing track metadata
        await client.query(
          `UPDATE tracks SET
            title = $2, album_name = $3, artwork_url = $4,
            duration_ms = $5, release_date = $6, is_explicit = $7,
            updated_at = $8
          WHERE id = $1`,
          [
            trackId,
            data.sourceTrack.title,
            data.sourceTrack.albumName ?? null,
            data.sourceTrack.artworkUrl ?? null,
            data.sourceTrack.durationMs ?? null,
            data.sourceTrack.releaseDate ?? null,
            data.sourceTrack.isExplicit ? 1 : 0,
            now,
          ],
        );
      } else {
        // Insert new track
        await client.query(
          `INSERT INTO tracks (
            id, title, album_name, isrc, artwork_url, duration_ms,
            release_date, is_explicit, source_service, source_url,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            trackId,
            data.sourceTrack.title,
            data.sourceTrack.albumName ?? null,
            data.sourceTrack.isrc ?? null,
            data.sourceTrack.artworkUrl ?? null,
            data.sourceTrack.durationMs ?? null,
            data.sourceTrack.releaseDate ?? null,
            data.sourceTrack.isExplicit ? 1 : 0,
            data.sourceTrack.sourceService ?? null,
            data.sourceTrack.sourceUrl ?? null,
            now,
            now,
          ],
        );
      }

      const artistCredits = await this.replaceTrackArtistCredits(
        client,
        trackId,
        data.sourceTrack.artists,
        now,
        data.sourceTrack.artistCredits,
      );

      // Upsert service links
      for (const link of data.links) {
        await client.query(
          `INSERT INTO service_links (
            id, track_id, service, external_id, url, confidence, match_method, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (track_id, service) DO UPDATE SET
            external_id = EXCLUDED.external_id,
            url = EXCLUDED.url,
            confidence = EXCLUDED.confidence,
            match_method = EXCLUDED.match_method`,
          [
            `${trackId}-${link.service}`,
            trackId,
            link.service,
            link.externalId ?? null,
            link.url,
            link.confidence,
            link.matchMethod,
            now,
          ],
        );
      }

      // Insert short URL (only if new)
      if (!existingShortId) {
        await client.query(
          `INSERT INTO short_urls (id, track_id, created_at) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [shortId, trackId, now],
        );
      }

      await client.query("COMMIT");
      return { trackId, shortId, artistCredits };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async addLinksToTrack(
    trackId: string,
    links: Array<{ service: string; url: string; confidence: number; matchMethod: string; externalId?: string }>,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const now = new Date();

      for (const link of links) {
        await client.query(
          `INSERT INTO service_links (
            id, track_id, service, external_id, url, confidence, match_method, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (track_id, service) DO UPDATE SET
            external_id = EXCLUDED.external_id,
            url = EXCLUDED.url,
            confidence = EXCLUDED.confidence`,
          [
            `${trackId}-${link.service}`,
            trackId,
            link.service,
            link.externalId ?? null,
            link.url,
            link.confidence,
            link.matchMethod,
            now,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // EXTERNAL-ID AGGREGATION (TrackRepository) — migration 0019
  // ============================================================================

  async addTrackExternalIds(trackId: string, records: ExternalIdRecord[]): Promise<void> {
    if (records.length === 0) return;
    await this.insertExternalIds("track_external_ids", "track_id", trackId, records);
  }

  async addAlbumExternalIds(albumId: string, records: ExternalIdRecord[]): Promise<void> {
    if (records.length === 0) return;
    await this.insertExternalIds("album_external_ids", "album_id", albumId, records);
  }

  async addArtistExternalIds(artistId: string, records: ExternalIdRecord[]): Promise<void> {
    if (records.length === 0) return;
    const client = await this.pool.connect();
    try {
      await this.ensureArtistEntityExists(client, artistId);
      await this.insertExternalIds("artist_external_ids", "artist_entity_id", artistId, records);
    } finally {
      client.release();
    }
  }

  /**
   * Idempotent multi-row insert helper. The unique index on the four
   * (entity_id, id_type, id_value, source_service) columns makes
   * `ON CONFLICT DO NOTHING` swallow duplicate observations cleanly,
   * which is exactly what we want for re-resolves of the same track.
   */
  private async insertExternalIds(
    table: "track_external_ids" | "album_external_ids" | "artist_external_ids",
    fkColumn: "track_id" | "album_id" | "artist_entity_id",
    entityId: string,
    records: ExternalIdRecord[],
  ): Promise<void> {
    const now = new Date();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const r of records) {
        // ON CONFLICT (cols) targets the unique index from migration 0019.
        // ON CONFLICT ON CONSTRAINT requires a UNIQUE CONSTRAINT, which
        // a UNIQUE INDEX is not — Postgres rejects the latter at runtime.
        await client.query(
          `INSERT INTO ${table} (id, ${fkColumn}, id_type, id_value, source_service, observed_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (${fkColumn}, id_type, id_value, source_service) DO NOTHING`,
          [
            `${entityId}-${r.idType}-${r.sourceService}-${r.idValue.slice(-20)}`,
            entityId,
            r.idType,
            r.idValue,
            r.sourceService,
            now,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findTrackByExternalId(idType: string, idValue: string): Promise<CachedTrackResult | null> {
    const result = await this.pool.query(
      `SELECT
        t.id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}, t.album_name, t.isrc, t.artwork_url,
        t.duration_ms, t.release_date, t.is_explicit,
        (SELECT tp.url FROM track_previews tp WHERE tp.track_id = t.id ORDER BY (tp.service = 'deezer') DESC, tp.observed_at DESC LIMIT 1) AS preview_url,
        t.source_service, t.source_url,
        sl.url, sl.service, sl.confidence, sl.match_method,
        su.id as short_id, t.created_at, t.updated_at
      FROM tracks t
      JOIN track_external_ids x ON x.track_id = t.id
      LEFT JOIN service_links sl ON t.id = sl.track_id
      LEFT JOIN short_urls su ON t.id = su.track_id
      WHERE x.id_type = $1 AND x.id_value = $2
      ORDER BY sl.created_at ASC`,
      [idType, idValue],
    );

    if (result.rows.length === 0) return null;
    return this.buildCachedResult(result.rows as TrackWithLinkRow[]);
  }

  async findAlbumByExternalId(idType: string, idValue: string): Promise<CachedAlbumResult | null> {
    const result = await this.pool.query(
      `SELECT
        a.id, a.title, ${ALBUM_ARTIST_FIELDS_SELECT}, a.release_date, a.total_tracks,
        a.artwork_url, a.label, a.upc, a.source_service, a.source_url,
        (SELECT ap.url FROM album_previews ap WHERE ap.album_id = a.id ORDER BY (ap.service = 'deezer') DESC, ap.observed_at DESC LIMIT 1) AS preview_url,
        asl.url as link_url, asl.service, asl.confidence, asl.match_method,
        asu.id as short_id, a.created_at, a.updated_at
      FROM albums a
      JOIN album_external_ids x ON x.album_id = a.id
      LEFT JOIN album_service_links asl ON a.id = asl.album_id
      LEFT JOIN album_short_urls asu ON a.id = asu.album_id
      WHERE x.id_type = $1 AND x.id_value = $2
      ORDER BY asl.created_at ASC`,
      [idType, idValue],
    );

    if (result.rows.length === 0) return null;
    return this.buildCachedAlbumResult(result.rows as AlbumWithLinkRow[]);
  }

  // ============================================================================
  // PREVIEW URLS (TrackRepository) — migration 0021
  // ============================================================================

  async findTrackPreviews(trackId: string): Promise<PreviewRow[]> {
    const result = await this.pool.query(
      `SELECT service, url, expires_at, observed_at
       FROM track_previews
       WHERE track_id = $1`,
      [trackId],
    );
    return (result.rows as Array<{ service: string; url: string; expires_at: Date | null; observed_at: Date }>).map(
      (r) => ({
        service: r.service,
        url: r.url,
        expiresAt: r.expires_at,
        observedAt: r.observed_at,
      }),
    );
  }

  async upsertTrackPreview(trackId: string, observation: PreviewObservation): Promise<void> {
    const now = new Date();
    await this.pool.query(
      `INSERT INTO track_previews (id, track_id, service, url, expires_at, observed_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (track_id, service) DO UPDATE SET
         url = EXCLUDED.url,
         expires_at = EXCLUDED.expires_at,
         observed_at = EXCLUDED.observed_at`,
      [
        `${trackId}-${observation.service}`,
        trackId,
        observation.service,
        observation.url,
        observation.expiresAt ?? null,
        now,
      ],
    );
  }

  async findAlbumPreviews(albumId: string): Promise<PreviewRow[]> {
    const result = await this.pool.query(
      `SELECT service, url, expires_at, observed_at
       FROM album_previews
       WHERE album_id = $1`,
      [albumId],
    );
    return (result.rows as Array<{ service: string; url: string; expires_at: Date | null; observed_at: Date }>).map(
      (r) => ({
        service: r.service,
        url: r.url,
        expiresAt: r.expires_at,
        observedAt: r.observed_at,
      }),
    );
  }

  async upsertAlbumPreview(albumId: string, observation: PreviewObservation): Promise<void> {
    const now = new Date();
    await this.pool.query(
      `INSERT INTO album_previews (id, album_id, service, url, expires_at, observed_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (album_id, service) DO UPDATE SET
         url = EXCLUDED.url,
         expires_at = EXCLUDED.expires_at,
         observed_at = EXCLUDED.observed_at`,
      [
        `${albumId}-${observation.service}`,
        albumId,
        observation.service,
        observation.url,
        observation.expiresAt ?? null,
        now,
      ],
    );
  }

  // ============================================================================
  // ARTIST CACHE QUERIES (TrackRepository)
  // ============================================================================

  async findArtistCache(artistName: string): Promise<ArtistCacheRow | null> {
    const result = await this.pool.query(
      `SELECT artist_name, profile, top_tracks, events,
              profile_updated_at, tracks_updated_at, events_updated_at
       FROM artist_cache WHERE artist_name = $1`,
      [artistName],
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0] as ArtistCacheRow_DB;

    return {
      artistName: row.artist_name,
      profile: safeParseJson(row.profile, null),
      topTracks: safeParseJson(row.top_tracks, []),
      events: safeParseJson(row.events, []),
      profileUpdatedAt: row.profile_updated_at ? dateToMs(row.profile_updated_at) : 0,
      tracksUpdatedAt: row.tracks_updated_at ? dateToMs(row.tracks_updated_at) : 0,
      eventsUpdatedAt: row.events_updated_at ? dateToMs(row.events_updated_at) : 0,
    };
  }

  async findArtistInfoAliasByShortId(shortId: string, artistName: string): Promise<string | null> {
    const requestedName = artistName.trim().toLowerCase();
    if (!shortId || !requestedName) return null;

    const result = await this.pool.query(
      `WITH target_links AS (
         SELECT sl.url
         FROM short_urls su
         JOIN service_links sl ON sl.track_id = su.track_id
         WHERE su.id = $1 AND sl.url IS NOT NULL
         UNION
         SELECT asl.url
         FROM album_short_urls asu
         JOIN album_service_links asl ON asl.album_id = asu.album_id
         WHERE asu.id = $1 AND asl.url IS NOT NULL
       ),
       matches AS (
         SELECT DISTINCT ac.artist_name
         FROM artist_cache ac
         JOIN target_links tl ON ac.top_tracks ILIKE '%' || tl.url || '%'
         WHERE ac.artist_name <> $2
       )
       SELECT artist_name
       FROM matches
       ORDER BY
         CASE WHEN artist_name LIKE '%' || $2 || '%' THEN 0 ELSE 1 END,
         length(artist_name) DESC
       LIMIT 1`,
      [shortId, requestedName],
    );

    const alias = result.rows[0]?.artist_name;
    return typeof alias === "string" && alias.trim() ? alias : null;
  }

  async saveArtistCache(data: ArtistCacheData): Promise<void> {
    const now = new Date();
    const id = `artist-${data.artistName}`;
    const hasProfile = Object.hasOwn(data, "profile");
    const hasTopTracks = Object.hasOwn(data, "topTracks");
    const hasEvents = Object.hasOwn(data, "events");

    await this.pool.query(
      `INSERT INTO artist_cache (
        id, artist_name, profile, top_tracks, events,
        profile_updated_at, tracks_updated_at, events_updated_at,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        artist_name = EXCLUDED.artist_name,
        profile = CASE WHEN $11 THEN EXCLUDED.profile ELSE artist_cache.profile END,
        top_tracks = CASE WHEN $12 THEN EXCLUDED.top_tracks ELSE artist_cache.top_tracks END,
        events = CASE WHEN $13 THEN EXCLUDED.events ELSE artist_cache.events END,
        profile_updated_at = CASE WHEN $11 THEN EXCLUDED.profile_updated_at ELSE artist_cache.profile_updated_at END,
        tracks_updated_at = CASE WHEN $12 THEN EXCLUDED.tracks_updated_at ELSE artist_cache.tracks_updated_at END,
        events_updated_at = CASE WHEN $13 THEN EXCLUDED.events_updated_at ELSE artist_cache.events_updated_at END,
        updated_at = EXCLUDED.updated_at`,
      [
        id,
        data.artistName,
        hasProfile && data.profile ? JSON.stringify(data.profile) : null,
        hasTopTracks && data.topTracks ? JSON.stringify(data.topTracks) : null,
        hasEvents && data.events ? JSON.stringify(data.events) : null,
        data.profileUpdatedAt ? msToDate(data.profileUpdatedAt) : null,
        data.tracksUpdatedAt ? msToDate(data.tracksUpdatedAt) : null,
        data.eventsUpdatedAt ? msToDate(data.eventsUpdatedAt) : null,
        now,
        now,
        hasProfile,
        hasTopTracks,
        hasEvents,
      ],
    );
  }

  async listArtistIdentityEventsByDay(params: {
    month: number;
    day: number;
    locale?: string;
    eventTypes?: ArtistIdentityEventType[];
    catalogOnly?: boolean;
  }): Promise<ArtistIdentityEventRecord[]> {
    const eventTypes = params.eventTypes && params.eventTypes.length > 0 ? params.eventTypes : ["birth", "death"];
    const locale = params.locale ?? null;
    const catalogOnly = params.catalogOnly ?? false;

    const result = await this.pool.query<ArtistIdentityEventSqlRow>(
      `SELECT
         ev.id AS event_id,
         ae.id AS artist_entity_id,
         ae.entity_type,
         ae.verification_status,
         COALESCE(entity_name.name, '[unnamed artist]') AS display_name,
         ev.event_type,
         ev.date_value::text AS date_value,
         ev.date_precision,
         ev.event_year,
         ev.event_month,
         ev.event_day,
         place_name.name AS place_name,
         p.country_code,
         src.provider AS source_provider,
         src.source_url,
         ev.confidence
       FROM artist_entity_events ev
       JOIN artist_entities ae ON ae.id = ev.artist_entity_id
       LEFT JOIN LATERAL (
         SELECT n.name
         FROM artist_entity_names n
         WHERE n.artist_entity_id = ae.id
         ORDER BY
           CASE
             WHEN n.locale = $5 AND n.name_type = 'canonical' THEN 0
             WHEN n.locale IS NULL AND n.name_type = 'canonical' THEN 1
             WHEN n.name_type = 'canonical' THEN 2
             WHEN n.locale = $5 THEN 3
             WHEN n.locale IS NULL THEN 4
             ELSE 5
           END,
           n.created_at ASC
         LIMIT 1
       ) entity_name ON TRUE
       LEFT JOIN places p ON p.id = ev.place_id
       LEFT JOIN LATERAL (
         SELECT pn.name
         FROM place_names pn
         WHERE pn.place_id = p.id
         ORDER BY
           CASE
             WHEN pn.locale = $5 THEN 0
             WHEN pn.locale IS NULL THEN 1
             ELSE 2
           END,
           pn.created_at ASC
         LIMIT 1
       ) place_name ON TRUE
       LEFT JOIN artist_sources src ON src.id = ev.source_id
       WHERE ev.event_type = ANY($1::text[])
         AND ev.date_precision = 'day'
         AND ev.event_month = $2
         AND ev.event_day = $3
         AND (
           (ev.event_type IN ('birth', 'death') AND ae.entity_type IN ('person', 'persona'))
           OR (ev.event_type IN ('formed', 'disbanded') AND ae.entity_type = 'group')
         )
         AND (
           $4::boolean = false
           OR EXISTS (
             SELECT 1 FROM track_artist_credits tac WHERE tac.artist_entity_id = ae.id
           )
           OR EXISTS (
             SELECT 1 FROM album_artist_credits aac WHERE aac.artist_entity_id = ae.id
           )
           OR EXISTS (
             SELECT 1
             FROM artist_group_memberships agm
             WHERE agm.member_artist_entity_id = ae.id
               AND (
                 EXISTS (
                   SELECT 1 FROM track_artist_credits gtac WHERE gtac.artist_entity_id = agm.group_artist_entity_id
                 )
                 OR EXISTS (
                   SELECT 1 FROM album_artist_credits gaac WHERE gaac.artist_entity_id = agm.group_artist_entity_id
                 )
               )
           )
         )
       ORDER BY ev.event_type ASC, display_name ASC`,
      [eventTypes, params.month, params.day, catalogOnly, locale],
    );

    return result.rows.map(rowToArtistIdentityEvent);
  }

  async listArtistGroupMembers(groupArtistEntityId: string, locale?: string): Promise<ArtistGroupMembershipRecord[]> {
    return this.listArtistGroupMemberships("group", groupArtistEntityId, locale);
  }

  async listArtistMemberships(memberArtistEntityId: string, locale?: string): Promise<ArtistGroupMembershipRecord[]> {
    return this.listArtistGroupMemberships("member", memberArtistEntityId, locale);
  }

  async findArtistEntityIdByIdentifier(provider: string, externalId: string): Promise<string | null> {
    const result = await this.pool.query<{ artist_entity_id: string }>(
      `SELECT artist_entity_id
       FROM artist_entity_identifiers
       WHERE provider = $1 AND external_id = $2
       LIMIT 1`,
      [provider, externalId],
    );
    return result.rows[0]?.artist_entity_id ?? null;
  }

  private async listArtistGroupMemberships(
    direction: "group" | "member",
    artistEntityId: string,
    locale?: string,
  ): Promise<ArtistGroupMembershipRecord[]> {
    const whereColumn = direction === "group" ? "agm.group_artist_entity_id" : "agm.member_artist_entity_id";
    const result = await this.pool.query<ArtistGroupMembershipSqlRow>(
      `SELECT
         agm.id AS membership_id,
         agm.group_artist_entity_id,
         COALESCE(group_name.name, '[unnamed group]') AS group_name,
         agm.member_artist_entity_id,
         COALESCE(member_name.name, agm.member_name_credit, '[unnamed member]') AS member_name,
         agm.member_name_credit,
         array_remove(array_agg(role.role ORDER BY role.role), NULL) AS roles,
         agm.begin_date::text AS begin_date,
         agm.begin_date_precision,
         agm.begin_year,
         agm.end_date::text AS end_date,
         agm.end_date_precision,
         agm.end_year,
         agm.is_current,
         src.provider AS source_provider,
         src.source_url,
         agm.confidence
       FROM artist_group_memberships agm
       JOIN artist_entities group_entity ON group_entity.id = agm.group_artist_entity_id
       JOIN artist_entities member_entity ON member_entity.id = agm.member_artist_entity_id
       LEFT JOIN LATERAL (
         SELECT n.name
         FROM artist_entity_names n
         WHERE n.artist_entity_id = group_entity.id
         ORDER BY
           CASE
             WHEN n.locale = $2 AND n.name_type = 'canonical' THEN 0
             WHEN n.locale IS NULL AND n.name_type = 'canonical' THEN 1
             WHEN n.name_type = 'canonical' THEN 2
             WHEN n.locale = $2 THEN 3
             WHEN n.locale IS NULL THEN 4
             ELSE 5
           END,
           n.created_at ASC
         LIMIT 1
       ) group_name ON TRUE
       LEFT JOIN LATERAL (
         SELECT n.name
         FROM artist_entity_names n
         WHERE n.artist_entity_id = member_entity.id
         ORDER BY
           CASE
             WHEN n.locale = $2 AND n.name_type = 'canonical' THEN 0
             WHEN n.locale IS NULL AND n.name_type = 'canonical' THEN 1
             WHEN n.name_type = 'canonical' THEN 2
             WHEN n.locale = $2 THEN 3
             WHEN n.locale IS NULL THEN 4
             ELSE 5
           END,
           n.created_at ASC
         LIMIT 1
       ) member_name ON TRUE
       LEFT JOIN artist_group_membership_roles role ON role.membership_id = agm.id
       LEFT JOIN artist_sources src ON src.id = agm.source_id
       WHERE ${whereColumn} = $1
       GROUP BY
         agm.id,
         group_name.name,
         member_name.name,
         src.provider,
         src.source_url
       ORDER BY
         COALESCE(agm.is_current, false) DESC,
         agm.begin_year ASC NULLS LAST,
         member_name ASC,
         group_name ASC`,
      [artistEntityId, locale ?? null],
    );
    return result.rows.map(rowToArtistGroupMembership);
  }

  async cleanupStaleCache(): Promise<number> {
    const cutoff = new Date(Date.now() - CACHE_TTL_MS);

    const result = await this.pool.query(
      `DELETE FROM artist_cache
       WHERE updated_at < $1
       RETURNING id`,
      [cutoff],
    );

    return result.rowCount ?? 0;
  }

  async getRandomShortId(): Promise<string | null> {
    // Uniformly pick one short URL across BOTH track and album short URLs.
    // Offset trick avoids `ORDER BY RANDOM()` full sort; UNION ALL is fine
    // because track/album short_url ids share the same namespace by design.
    const result = await this.pool.query(
      `WITH all_urls AS (
         SELECT id FROM short_urls
         UNION ALL
         SELECT id FROM album_short_urls
       )
       SELECT id FROM all_urls
       OFFSET floor(random() * (SELECT COUNT(*) FROM all_urls))::int
       LIMIT 1`,
    );

    if (result.rows.length === 0) return null;
    return result.rows[0].id;
  }

  async updateTrackTimestamp(trackId: string): Promise<void> {
    const now = new Date();
    await this.pool.query(`UPDATE tracks SET updated_at = $1 WHERE id = $2`, [now, trackId]);
  }

  async findMissingTables(expected: string[]): Promise<string[]> {
    if (expected.length === 0) return [];
    const result = await this.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [expected],
    );
    const present = new Set(result.rows.map((r) => r.table_name));
    return expected.filter((t) => !present.has(t));
  }

  // ============================================================================
  // ALBUM QUERIES (TrackRepository)
  // ============================================================================

  async findAlbumByUrl(url: string): Promise<CachedAlbumResult | null> {
    const result = await this.pool.query(
      `SELECT
        a.id, a.title, ${ALBUM_ARTIST_FIELDS_SELECT}, a.release_date, a.total_tracks,
        a.artwork_url, a.label, a.upc, a.source_service, a.source_url,
        (SELECT ap.url FROM album_previews ap WHERE ap.album_id = a.id ORDER BY (ap.service = 'deezer') DESC, ap.observed_at DESC LIMIT 1) AS preview_url,
        asl.url as link_url, asl.service, asl.confidence, asl.match_method,
        asu.id as short_id, a.created_at, a.updated_at
      FROM albums a
      LEFT JOIN album_service_links asl ON a.id = asl.album_id
      LEFT JOIN album_short_urls asu ON a.id = asu.album_id
      WHERE a.source_url = $1
      ORDER BY asl.created_at ASC`,
      [url],
    );

    if (result.rows.length === 0) return null;
    return this.buildCachedAlbumResult(result.rows as AlbumWithLinkRow[]);
  }

  async findAlbumByUpc(upc: string): Promise<CachedAlbumResult | null> {
    // Fast path: canonical column.
    const result = await this.pool.query(
      `SELECT
        a.id, a.title, ${ALBUM_ARTIST_FIELDS_SELECT}, a.release_date, a.total_tracks,
        a.artwork_url, a.label, a.upc, a.source_service, a.source_url,
        (SELECT ap.url FROM album_previews ap WHERE ap.album_id = a.id ORDER BY (ap.service = 'deezer') DESC, ap.observed_at DESC LIMIT 1) AS preview_url,
        asl.url as link_url, asl.service, asl.confidence, asl.match_method,
        asu.id as short_id, a.created_at, a.updated_at
      FROM albums a
      LEFT JOIN album_service_links asl ON a.id = asl.album_id
      LEFT JOIN album_short_urls asu ON a.id = asu.album_id
      WHERE a.upc = $1
      ORDER BY asl.created_at ASC`,
      [upc],
    );

    if (result.rows.length > 0) {
      return this.buildCachedAlbumResult(result.rows as AlbumWithLinkRow[]);
    }

    // Fallback: aggregation table. Catches alternate UPCs (regional
    // re-issues) recorded by other services.
    return this.findAlbumByExternalId("upc", upc);
  }

  async findExistingAlbumByUpc(upc: string): Promise<{ albumId: string; shortId: string } | null> {
    const result = await this.pool.query(
      `SELECT a.id, asu.id as short_id
       FROM albums a
       LEFT JOIN album_short_urls asu ON a.id = asu.album_id
       WHERE a.upc = $1 LIMIT 1`,
      [upc],
    );

    if (result.rows.length === 0) return null;
    return {
      albumId: result.rows[0].id,
      shortId: result.rows[0].short_id,
    };
  }

  findExistingAlbumByUpcSync(_upc: string): { albumId: string; shortId: string } | null {
    throw new Error("findExistingAlbumByUpcSync not available in PostgreSQL adapter");
  }

  async persistAlbumWithLinks(data: PersistAlbumData): Promise<{
    albumId: string;
    shortId: string;
    artistCredits: ArtistCredit[];
  }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const now = new Date();

      // Look up existing album by UPC or source_url to prevent duplicates
      let existingAlbumId: string | null = null;
      let existingShortId: string | null = null;

      if (data.sourceAlbum.upc) {
        const found = await client.query(
          `SELECT a.id, su.id as short_id FROM albums a
           LEFT JOIN album_short_urls su ON a.id = su.album_id
           WHERE a.upc = $1 LIMIT 1`,
          [data.sourceAlbum.upc],
        );
        if (found.rows.length > 0) {
          existingAlbumId = found.rows[0].id;
          existingShortId = found.rows[0].short_id;
        }
      }

      if (!existingAlbumId && data.sourceAlbum.sourceUrl) {
        const found = await client.query(
          `SELECT a.id, su.id as short_id FROM albums a
           LEFT JOIN album_short_urls su ON a.id = su.album_id
           WHERE a.source_url = $1 LIMIT 1`,
          [data.sourceAlbum.sourceUrl],
        );
        if (found.rows.length > 0) {
          existingAlbumId = found.rows[0].id;
          existingShortId = found.rows[0].short_id;
        }
      }

      const albumId = existingAlbumId ?? generateTrackId();
      const shortId = existingShortId ?? generateShortId();

      if (existingAlbumId) {
        // Update existing album metadata
        await client.query(
          `UPDATE albums SET
            title = $2, release_date = $3, total_tracks = $4,
            artwork_url = $5, label = $6, updated_at = $7
          WHERE id = $1`,
          [
            albumId,
            data.sourceAlbum.title,
            data.sourceAlbum.releaseDate ?? null,
            data.sourceAlbum.totalTracks ?? null,
            data.sourceAlbum.artworkUrl ?? null,
            data.sourceAlbum.label ?? null,
            now,
          ],
        );
      } else {
        // Insert new album
        await client.query(
          `INSERT INTO albums (
            id, title, release_date, total_tracks, artwork_url,
            label, upc, source_service, source_url,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            albumId,
            data.sourceAlbum.title,
            data.sourceAlbum.releaseDate ?? null,
            data.sourceAlbum.totalTracks ?? null,
            data.sourceAlbum.artworkUrl ?? null,
            data.sourceAlbum.label ?? null,
            data.sourceAlbum.upc ?? null,
            data.sourceAlbum.sourceService ?? null,
            data.sourceAlbum.sourceUrl ?? null,
            now,
            now,
          ],
        );
      }

      const artistCredits = await this.replaceAlbumArtistCredits(
        client,
        albumId,
        data.sourceAlbum.artists,
        now,
        data.sourceAlbum.artistCredits,
      );

      // Upsert service links
      for (const link of data.links) {
        await client.query(
          `INSERT INTO album_service_links (
            id, album_id, service, external_id, url, confidence, match_method, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (album_id, service) DO UPDATE SET
            external_id = EXCLUDED.external_id,
            url = EXCLUDED.url,
            confidence = EXCLUDED.confidence`,
          [
            `${albumId}-${link.service}`,
            albumId,
            link.service,
            link.externalId ?? null,
            link.url,
            link.confidence,
            link.matchMethod,
            now,
          ],
        );
      }

      // Insert short URL (only if new)
      if (!existingShortId) {
        await client.query(
          `INSERT INTO album_short_urls (id, album_id, created_at) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [shortId, albumId, now],
        );
      }

      await client.query("COMMIT");
      return { albumId, shortId, artistCredits };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async addLinksToAlbum(
    albumId: string,
    links: Array<{ service: string; url: string; confidence: number; matchMethod: string; externalId?: string }>,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const now = new Date();

      for (const link of links) {
        await client.query(
          `INSERT INTO album_service_links (
            id, album_id, service, external_id, url, confidence, match_method, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (album_id, service) DO UPDATE SET
            external_id = EXCLUDED.external_id,
            url = EXCLUDED.url,
            confidence = EXCLUDED.confidence`,
          [
            `${albumId}-${link.service}`,
            albumId,
            link.service,
            link.externalId ?? null,
            link.url,
            link.confidence,
            link.matchMethod,
            now,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async loadAlbumByShortId(shortId: string): Promise<SharePageAlbumResult | null> {
    const result = await this.pool.query(
      `SELECT
        a.id, a.title, ${ALBUM_ARTIST_FIELDS_SELECT}, a.release_date, a.total_tracks,
        a.artwork_url, a.label, a.upc, a.source_service, a.source_url,
        asl.url as link_url, asl.service,
        asu.id as short_id
      FROM albums a
      JOIN album_short_urls asu ON a.id = asu.album_id
      LEFT JOIN album_service_links asl ON a.id = asl.album_id
      WHERE asu.id = $1`,
      [shortId],
    );

    if (result.rows.length === 0) return null;

    const firstRow = result.rows[0] as AlbumWithLinkRow;
    const artists = safeParseArray(firstRow.artists);
    const artistCredits = safeParseArtistCredits(firstRow.artist_credits);
    const artistDisplay = artists.length > 0 ? artists[0] : "Unknown Artist";

    return {
      album: this.rowToAlbum(firstRow),
      artists,
      artistCredits,
      links: (result.rows as AlbumWithLinkRow[])
        .filter((r) => r.link_url && r.service)
        .map((r) => ({
          service: r.service as string,
          url: r.link_url as string,
        })),
      shortId,
      artistDisplay,
    };
  }

  // ============================================================================
  // ARTIST RESOLUTION QUERIES (TrackRepository)
  // ============================================================================

  async findArtistByUrl(url: string): Promise<CachedArtistResult | null> {
    const result = await this.pool.query(
      `SELECT
        ar.artist_entity_id AS id, ar.artist_entity_id, ${ARTIST_NAME_SELECT}, ar.image_url, ar.genres, ar.source_service, ar.source_url,
        asl.url as link_url, asl.service, asl.confidence, asl.match_method,
        asu.id as short_id, ar.created_at, ar.updated_at
      FROM artist_profiles ar
      ${ARTIST_NAME_LATERAL_JOIN}
      LEFT JOIN artist_service_links asl ON ar.artist_entity_id = asl.artist_entity_id
      LEFT JOIN artist_short_urls asu ON ar.artist_entity_id = asu.artist_entity_id
      WHERE ar.source_url = $1
      ORDER BY asl.created_at ASC`,
      [url],
    );

    if (result.rows.length === 0) return null;
    return this.buildCachedArtistResult(result.rows as ArtistWithLinkRow[]);
  }

  async findArtistByName(name: string): Promise<CachedArtistResult | null> {
    const result = await this.pool.query(
      `SELECT
        ar.artist_entity_id AS id, ar.artist_entity_id, ${ARTIST_NAME_SELECT}, ar.image_url, ar.genres, ar.source_service, ar.source_url,
        asl.url as link_url, asl.service, asl.confidence, asl.match_method,
        asu.id as short_id, ar.created_at, ar.updated_at
      FROM artist_profiles ar
      ${ARTIST_NAME_LATERAL_JOIN}
      LEFT JOIN artist_service_links asl ON ar.artist_entity_id = asl.artist_entity_id
      LEFT JOIN artist_short_urls asu ON ar.artist_entity_id = asu.artist_entity_id
      WHERE EXISTS (
        SELECT 1
        FROM artist_entity_names n
        WHERE n.artist_entity_id = ar.artist_entity_id AND LOWER(n.name) = LOWER($1)
      )
      ORDER BY asl.created_at ASC`,
      [name],
    );

    if (result.rows.length === 0) return null;
    return this.buildCachedArtistResult(result.rows as ArtistWithLinkRow[]);
  }

  async loadArtistByShortId(shortId: string): Promise<SharePageArtistResult | null> {
    const result = await this.pool.query(
      `SELECT
        ar.artist_entity_id AS id, ar.artist_entity_id, ${ARTIST_NAME_SELECT}, ar.image_url, ar.genres, ar.source_service, ar.source_url,
        asl.url as link_url, asl.service,
        asu.id as short_id
      FROM artist_profiles ar
      ${ARTIST_NAME_LATERAL_JOIN}
      JOIN artist_short_urls asu ON ar.artist_entity_id = asu.artist_entity_id
      LEFT JOIN artist_service_links asl ON ar.artist_entity_id = asl.artist_entity_id
      WHERE asu.id = $1`,
      [shortId],
    );

    if (result.rows.length === 0) return null;

    const firstRow = result.rows[0] as ArtistWithLinkRow;

    return {
      artist: {
        name: firstRow.name,
        imageUrl: firstRow.image_url,
        genres: safeParseArray(firstRow.genres ?? "[]"),
      },
      links: (result.rows as ArtistWithLinkRow[])
        .filter((r) => r.link_url && r.service)
        .map((r) => ({
          service: r.service as string,
          url: r.link_url as string,
        })),
      shortId,
    };
  }

  async persistArtistWithLinks(data: PersistArtistData): Promise<{
    artistId: string;
    shortId: string;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const now = new Date();

      // Look up existing artist profile by source_url or name to prevent duplicates.
      let existingShortId: string | null = null;
      let existingArtistEntityId: string | null = null;

      if (data.sourceArtist.sourceUrl) {
        const found = await client.query<{ short_id: string | null; artist_entity_id: string }>(
          `SELECT ar.artist_entity_id, asu.id as short_id FROM artist_profiles ar
           LEFT JOIN artist_short_urls asu ON ar.artist_entity_id = asu.artist_entity_id
           WHERE ar.source_url = $1 LIMIT 1`,
          [data.sourceArtist.sourceUrl],
        );
        if (found.rows.length > 0) {
          existingShortId = found.rows[0].short_id;
          existingArtistEntityId = found.rows[0].artist_entity_id;
        }
      }

      if (!existingArtistEntityId) {
        const found = await client.query<{ short_id: string | null; artist_entity_id: string }>(
          `SELECT ar.artist_entity_id, asu.id as short_id FROM artist_profiles ar
           LEFT JOIN artist_short_urls asu ON ar.artist_entity_id = asu.artist_entity_id
           WHERE EXISTS (
             SELECT 1
             FROM artist_entity_names n
             WHERE n.artist_entity_id = ar.artist_entity_id AND LOWER(n.name) = LOWER($1)
           )
           LIMIT 1`,
          [data.sourceArtist.name],
        );
        if (found.rows.length > 0) {
          existingShortId = found.rows[0].short_id;
          existingArtistEntityId = found.rows[0].artist_entity_id;
        }
      }

      const shortId = existingShortId ?? generateShortId();
      const artistEntityId =
        existingArtistEntityId ?? (await this.ensureArtistEntityForName(client, data.sourceArtist.name, now));
      await this.ensureArtistEntityName(client, artistEntityId, data.sourceArtist.name, now);

      await client.query(
        `INSERT INTO artist_profiles (
          artist_entity_id, image_url, genres, source_service, source_url,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $6)
        ON CONFLICT (artist_entity_id) DO UPDATE SET
          image_url = EXCLUDED.image_url,
          genres = EXCLUDED.genres,
          source_service = COALESCE(EXCLUDED.source_service, artist_profiles.source_service),
          source_url = COALESCE(EXCLUDED.source_url, artist_profiles.source_url),
          updated_at = EXCLUDED.updated_at`,
        [
          artistEntityId,
          data.sourceArtist.imageUrl ?? null,
          data.sourceArtist.genres ? JSON.stringify(data.sourceArtist.genres) : null,
          data.sourceArtist.sourceService ?? null,
          data.sourceArtist.sourceUrl ?? null,
          now,
        ],
      );

      // Upsert service links
      for (const link of data.links) {
        await client.query(
          `INSERT INTO artist_service_links (
            id, artist_entity_id, service, external_id, url, confidence, match_method, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (artist_entity_id, service) DO UPDATE SET
            external_id = EXCLUDED.external_id,
            url = EXCLUDED.url,
            confidence = EXCLUDED.confidence`,
          [
            `${artistEntityId}-${link.service}`,
            artistEntityId,
            link.service,
            link.externalId ?? null,
            link.url,
            link.confidence,
            link.matchMethod,
            now,
          ],
        );
      }

      // Insert short URL (only if new)
      if (!existingShortId) {
        await client.query(
          `INSERT INTO artist_short_urls (id, artist_entity_id, created_at) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [shortId, artistEntityId, now],
        );
      }

      await client.query("COMMIT");
      return { artistId: artistEntityId, shortId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async addLinksToArtist(
    artistId: string,
    links: Array<{ service: string; url: string; confidence: number; matchMethod: string; externalId?: string }>,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const now = new Date();
      await this.ensureArtistEntityExists(client, artistId);

      for (const link of links) {
        await client.query(
          `INSERT INTO artist_service_links (
            id, artist_entity_id, service, external_id, url, confidence, match_method, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (artist_entity_id, service) DO UPDATE SET
            external_id = EXCLUDED.external_id,
            url = EXCLUDED.url,
            confidence = EXCLUDED.confidence`,
          [
            `${artistId}-${link.service}`,
            artistId,
            link.service,
            link.externalId ?? null,
            link.url,
            link.confidence,
            link.matchMethod,
            now,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // ADMIN QUERIES (AdminRepository)
  // ============================================================================

  private rowToAdminUser(row: AdminUserRow): AdminUser {
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      email: row.email,
      role: row.role,
      firstName: row.first_name,
      lastName: row.last_name,
      avatarUrl: row.avatar_url,
      locale: row.locale,
      sessionTimeoutMinutes: row.session_timeout_minutes,
      createdAt: dateToMs(row.created_at),
      lastLoginAt: row.last_login_at ? dateToMs(row.last_login_at) : null,
    };
  }

  async findAdminById(id: string): Promise<AdminUser | null> {
    const result = await this.pool.query(
      `SELECT id, username, password_hash, email, role, first_name, last_name,
              avatar_url, locale, invite_token_hash, invite_expires_at,
              session_timeout_minutes, created_at, last_login_at
       FROM admin_users WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) return null;
    return this.rowToAdminUser(result.rows[0] as AdminUserRow);
  }

  async findAdminByUsername(username: string): Promise<AdminUser | null> {
    const result = await this.pool.query(
      `SELECT id, username, password_hash, email, role, first_name, last_name,
              avatar_url, locale, invite_token_hash, invite_expires_at,
              session_timeout_minutes, created_at, last_login_at
       FROM admin_users WHERE username = $1`,
      [username],
    );

    if (result.rows.length === 0) return null;
    return this.rowToAdminUser(result.rows[0] as AdminUserRow);
  }

  async createAdminUser(data: {
    id: string;
    username: string;
    passwordHash: string;
    email?: string;
    role?: string;
    locale?: string;
    inviteTokenHash?: string;
    inviteExpiresAt?: Date;
  }): Promise<void> {
    const now = new Date();

    await this.pool.query(
      `INSERT INTO admin_users (id, username, password_hash, email, role, locale,
                                invite_token_hash, invite_expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        data.id,
        data.username,
        data.passwordHash,
        data.email ?? null,
        data.role ?? "admin",
        data.locale ?? "de",
        data.inviteTokenHash ?? null,
        data.inviteExpiresAt ?? null,
        now,
      ],
    );
  }

  async updateLastLogin(userId: string): Promise<void> {
    const now = new Date();
    await this.pool.query(`UPDATE admin_users SET last_login_at = $1 WHERE id = $2`, [now, userId]);
  }

  async countAdmins(): Promise<number> {
    const result = await this.pool.query(`SELECT COUNT(*) as count FROM admin_users`);
    return result.rows[0]?.count ?? 0;
  }

  async listAdminUsers(): Promise<AdminUser[]> {
    const result = await this.pool.query(
      `SELECT id, username, password_hash, email, role, first_name, last_name,
              avatar_url, locale, invite_token_hash, invite_expires_at,
              session_timeout_minutes, created_at, last_login_at
       FROM admin_users
       ORDER BY created_at ASC`,
    );
    return result.rows.map((row) => this.rowToAdminUser(row as AdminUserRow));
  }

  async updateAdminUser(
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
    const columnMap: Record<string, string> = {
      username: "username",
      email: "email",
      passwordHash: "password_hash",
      firstName: "first_name",
      lastName: "last_name",
      avatarUrl: "avatar_url",
      locale: "locale",
      role: "role",
      sessionTimeoutMinutes: "session_timeout_minutes",
    };

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      const column = columnMap[key];
      if (column) {
        setClauses.push(`${column} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) return null;

    values.push(id);
    const result = await this.pool.query(
      `UPDATE admin_users SET ${setClauses.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, username, password_hash, email, role, first_name, last_name,
                 avatar_url, locale, invite_token_hash, invite_expires_at,
                 session_timeout_minutes, created_at, last_login_at`,
      values,
    );

    if (result.rows.length === 0) return null;
    return this.rowToAdminUser(result.rows[0] as AdminUserRow);
  }

  async deleteAdminUser(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM admin_users WHERE id = $1`, [id]);
  }

  async listPendingInvites(): Promise<
    Array<{
      id: string;
      username: string;
      email: string | null;
      inviteTokenHash: string;
      inviteExpiresAt: Date;
    }>
  > {
    const result = await this.pool.query(
      `SELECT id, username, email, invite_token_hash, invite_expires_at
       FROM admin_users
       WHERE invite_token_hash IS NOT NULL AND invite_expires_at > NOW()`,
    );
    return result.rows.map((r) => ({
      id: r.id,
      username: r.username,
      email: r.email ?? null,
      inviteTokenHash: r.invite_token_hash,
      inviteExpiresAt: r.invite_expires_at,
    }));
  }

  async acceptInvite(id: string, passwordHash: string): Promise<AdminUser | null> {
    const result = await this.pool.query(
      `UPDATE admin_users
       SET password_hash = $1,
           invite_token_hash = NULL,
           invite_expires_at = NULL
       WHERE id = $2 AND invite_token_hash IS NOT NULL AND invite_expires_at > NOW()
       RETURNING id, username, password_hash, email, role, first_name, last_name,
                 avatar_url, locale, invite_token_hash, invite_expires_at,
                 session_timeout_minutes, created_at, last_login_at`,
      [passwordHash, id],
    );
    if (result.rows.length === 0) return null;
    return this.rowToAdminUser(result.rows[0] as AdminUserRow);
  }

  // ============================================================================
  // SINGLE TRACK (AdminRepository)
  // ============================================================================

  async getTrackById(id: string) {
    const trackResult = await this.pool.query(
      `SELECT t.id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}, t.album_name, t.isrc, t.artwork_url,
        t.duration_ms, t.release_date, t.is_explicit,
        (SELECT tp.url FROM track_previews tp WHERE tp.track_id = t.id ORDER BY (tp.service = 'deezer') DESC, tp.observed_at DESC LIMIT 1) AS preview_url,
        t.source_service, t.source_url, t.created_at,
        su.id as short_id
      FROM tracks t
      LEFT JOIN short_urls su ON t.id = su.track_id
      WHERE t.id = $1
      GROUP BY t.id, su.id`,
      [id],
    );
    if (trackResult.rows.length === 0) return null;
    const r = trackResult.rows[0];

    const linksResult = await this.pool.query(
      `SELECT service, url FROM service_links WHERE track_id = $1 ORDER BY service`,
      [id],
    );

    return {
      id: r.id,
      title: r.title,
      artists: safeParseArray(r.artists),
      artistCredits: safeParseArtistCredits(r.artist_credits),
      albumName: r.album_name ?? null,
      isrc: r.isrc ?? null,
      artworkUrl: r.artwork_url ?? null,
      durationMs: r.duration_ms ?? null,
      releaseDate: r.release_date ?? null,
      isExplicit: Boolean(r.is_explicit),
      previewUrl: r.preview_url ?? null,
      sourceService: r.source_service ?? null,
      sourceUrl: r.source_url ?? null,
      shortId: r.short_id ?? null,
      createdAt: dateToMs(r.created_at),
      serviceLinks: (linksResult.rows as ServiceLinkRow[]).map((l) => ({ service: l.service, url: l.url })),
    };
  }

  async updateTrack(
    id: string,
    data: {
      title?: string;
      artists?: string[];
      artistCredits?: ArtistCredit[];
      albumName?: string | null;
      isrc?: string | null;
      artworkUrl?: string | null;
    },
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const sets: string[] = [];
      const values: (string | number | null | Date)[] = [];
      let idx = 1;
      const now = new Date();

      if (data.title !== undefined) {
        sets.push(`title = $${idx++}`);
        values.push(data.title);
      }
      if (data.albumName !== undefined) {
        sets.push(`album_name = $${idx++}`);
        values.push(data.albumName);
      }
      if (data.isrc !== undefined) {
        sets.push(`isrc = $${idx++}`);
        values.push(data.isrc);
      }
      if (data.artworkUrl !== undefined) {
        sets.push(`artwork_url = $${idx++}`);
        values.push(data.artworkUrl);
      }

      if (sets.length > 0) {
        sets.push(`updated_at = $${idx++}`);
        values.push(now);
        values.push(id);
        await client.query(`UPDATE tracks SET ${sets.join(", ")} WHERE id = $${idx}`, values);
      }

      if (data.artists !== undefined || data.artistCredits !== undefined) {
        await this.replaceTrackArtistCredits(client, id, data.artists ?? [], now, data.artistCredits);
        if (sets.length === 0) {
          await client.query(`UPDATE tracks SET updated_at = $1 WHERE id = $2`, [now, id]);
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // LISTING & PAGINATION (AdminRepository)
  // ============================================================================

  async listTracks(params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }): Promise<ListResult<TrackListItem>> {
    const { page = 1, limit = 50, q, sortBy = "created_at", sortDir = "desc" } = params;
    const offset = (page - 1) * limit;
    const ALLOWED = ["created_at", "updated_at", "title"];
    const col = ALLOWED.includes(sortBy) ? sortBy : "created_at";
    const dir = sortDir === "asc" ? "ASC" : "DESC";

    // Build WHERE clause and data-query params once.
    let whereClause = "";
    const dataParams: (string | number)[] = [];
    if (q) {
      whereClause = `WHERE t.title ILIKE $1 OR EXISTS (SELECT 1 FROM track_artist_credits tac WHERE tac.track_id = t.id AND tac.credit_name ILIKE $1)`;
      dataParams.push(`%${q}%`);
    }

    // Total row count is only meaningful for page 1 of an infinite-scroll
    // session. The client caches the value and reuses it for subsequent
    // pages, so re-running COUNT on every loadMore() is wasted work.
    // Sentinel `-1` tells the frontend to keep its cached total.
    let total: number | string = -1;
    if (page === 1) {
      const countResult = await this.pool.query<CountRow>(
        `SELECT COUNT(*) as count FROM tracks t ${whereClause}`,
        q ? dataParams : [],
      );
      total = countResult.rows[0]?.count ?? 0;
    }

    // link_count is computed via correlated subquery instead of
    // LEFT JOIN service_links + GROUP BY. The old pattern scanned the
    // entire service_links table on every page; this one evaluates the
    // count only for the 50 tracks actually returned, hitting the
    // (track_id, service) composite index for each.
    dataParams.push(limit, offset);
    const query = `SELECT
      t.id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}, t.album_name, t.isrc, t.artwork_url,
      t.source_service, t.created_at,
      su.id as short_id,
      (SELECT COUNT(*) FROM service_links sl WHERE sl.track_id = t.id) as link_count
    FROM tracks t
    LEFT JOIN short_urls su ON t.id = su.track_id
    ${whereClause}
    ORDER BY t.${col} ${dir}
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;

    const rows = await this.pool.query(query, dataParams);

    const items = (rows.rows as TrackListRow[]).map((r) => ({
      id: r.id,
      title: r.title,
      artists: safeParseArray(r.artists),
      artistCredits: safeParseArtistCredits(r.artist_credits),
      albumName: r.album_name ?? null,
      isrc: r.isrc ?? null,
      artworkUrl: r.artwork_url ?? null,
      sourceService: r.source_service ?? null,
      linkCount: parseInt(r.link_count, 10),
      createdAt: dateToMs(r.created_at),
      shortId: r.short_id ?? null,
    }));

    return { items, total, page, limit };
  }

  async listAlbums(params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }): Promise<ListResult<AlbumListItem>> {
    const { page = 1, limit = 50, q, sortBy = "created_at", sortDir = "desc" } = params;
    const offset = (page - 1) * limit;
    const ALLOWED = ["created_at", "updated_at", "title"];
    const col = ALLOWED.includes(sortBy) ? sortBy : "created_at";
    const dir = sortDir === "asc" ? "ASC" : "DESC";

    // See listTracks for the rationale behind the query shape, the
    // correlated link_count subquery, and the page-1-only COUNT.
    let whereClause = "";
    const dataParams: (string | number)[] = [];
    if (q) {
      whereClause = `WHERE a.title ILIKE $1 OR EXISTS (SELECT 1 FROM album_artist_credits aac WHERE aac.album_id = a.id AND aac.credit_name ILIKE $1)`;
      dataParams.push(`%${q}%`);
    }

    let total: number | string = -1;
    if (page === 1) {
      const countResult = await this.pool.query<CountRow>(
        `SELECT COUNT(*) as count FROM albums a ${whereClause}`,
        q ? dataParams : [],
      );
      total = countResult.rows[0]?.count ?? 0;
    }

    dataParams.push(limit, offset);
    const query = `SELECT
      a.id, a.title, ${ALBUM_ARTIST_FIELDS_SELECT}, a.release_date, a.total_tracks,
      a.artwork_url, a.upc, a.source_service, a.created_at,
      asu.id as short_id,
      (SELECT COUNT(*) FROM album_service_links asl WHERE asl.album_id = a.id) as link_count
    FROM albums a
    LEFT JOIN album_short_urls asu ON a.id = asu.album_id
    ${whereClause}
    ORDER BY a.${col} ${dir}
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;

    const rows = await this.pool.query(query, dataParams);

    const items = (rows.rows as AlbumListRow[]).map((r) => ({
      id: r.id,
      title: r.title,
      artists: safeParseArray(r.artists),
      artistCredits: safeParseArtistCredits(r.artist_credits),
      releaseDate: r.release_date ?? null,
      totalTracks: r.total_tracks ?? null,
      artworkUrl: r.artwork_url ?? null,
      upc: r.upc ?? null,
      sourceService: r.source_service ?? null,
      linkCount: parseInt(r.link_count, 10),
      createdAt: dateToMs(r.created_at),
      shortId: r.short_id ?? null,
    }));

    return { items, total, page, limit };
  }

  // ============================================================================
  // DELETION & MANAGEMENT (AdminRepository)
  // ============================================================================

  async deleteTracks(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");

      // Delete associated records first (due to foreign keys)
      await client.query(`DELETE FROM service_links WHERE track_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM short_urls WHERE track_id IN (${placeholders})`, ids);

      // Delete tracks
      await client.query(`DELETE FROM tracks WHERE id IN (${placeholders}) RETURNING id`, ids);

      await client.query("COMMIT");

      adminEventBroadcaster.emit({
        type: "tracks-deleted",
        data: { count: ids.length, ids },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteAlbums(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");

      // Delete associated records first
      await client.query(`DELETE FROM album_service_links WHERE album_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM album_short_urls WHERE album_id IN (${placeholders})`, ids);

      // Delete albums
      await client.query(`DELETE FROM albums WHERE id IN (${placeholders}) RETURNING id`, ids);

      await client.query("COMMIT");

      adminEventBroadcaster.emit({
        type: "albums-deleted",
        data: { count: ids.length, ids },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ─── Cache invalidation ────────────────────────────────────────────────────
  //
  // Resolvers treat a row as fresh while (now - updated_at) < CACHE_TTL_MS
  // (see lib/config.ts, tryCache / tryAlbumCache / tryArtistCache). Rewinding
  // `updated_at` to the Unix epoch therefore guarantees the row is considered
  // expired and the next resolve re-fetches from the source services. The
  // share's short URL, user-facing links, and any cross-references stay intact
  // because we don't touch short_urls / service_links.

  async invalidateTrackCache(shortId: string): Promise<{ ok: true }> {
    const result = await this.pool.query(
      `UPDATE tracks SET updated_at = to_timestamp(0)
       WHERE id = (SELECT track_id FROM short_urls WHERE id = $1)`,
      [shortId],
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new Error(`Track short URL not found: ${shortId}`);
    }
    return { ok: true };
  }

  async invalidateAlbumCache(shortId: string): Promise<{ ok: true }> {
    const result = await this.pool.query(
      `UPDATE albums SET updated_at = to_timestamp(0)
       WHERE id = (SELECT album_id FROM album_short_urls WHERE id = $1)`,
      [shortId],
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new Error(`Album short URL not found: ${shortId}`);
    }
    return { ok: true };
  }

  async invalidateArtistCache(shortId: string): Promise<{ ok: true }> {
    const result = await this.pool.query(
      `UPDATE artist_profiles SET updated_at = to_timestamp(0)
       WHERE artist_entity_id = (SELECT artist_entity_id FROM artist_short_urls WHERE id = $1)`,
      [shortId],
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new Error(`Artist short URL not found: ${shortId}`);
    }
    return { ok: true };
  }

  async invalidateAllCaches(): Promise<{ tracks: number; albums: number; artists: number }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const tracksResult = await client.query(`UPDATE tracks SET updated_at = to_timestamp(0)`);
      const albumsResult = await client.query(`UPDATE albums SET updated_at = to_timestamp(0)`);
      const artistsResult = await client.query(`UPDATE artist_profiles SET updated_at = to_timestamp(0)`);
      await client.query("COMMIT");
      return {
        tracks: tracksResult.rowCount ?? 0,
        albums: albumsResult.rowCount ?? 0,
        artists: artistsResult.rowCount ?? 0,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async listArtists(params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }): Promise<ListResult<ArtistListItem>> {
    const { page = 1, limit = 50, q, sortBy = "created_at", sortDir = "desc" } = params;
    const offset = (page - 1) * limit;
    const ALLOWED = ["created_at", "updated_at", "name"];
    const col = ALLOWED.includes(sortBy) ? sortBy : "created_at";
    const orderExpr = col === "name" ? "name" : `a.${col}`;
    const dir = sortDir === "asc" ? "ASC" : "DESC";

    // See listTracks for the rationale behind the query shape, the
    // correlated link_count subquery, and the page-1-only COUNT.
    let whereClause = "";
    const dataParams: (string | number)[] = [];
    if (q) {
      whereClause = `WHERE EXISTS (
        SELECT 1
        FROM artist_entity_names n
        WHERE n.artist_entity_id = a.artist_entity_id AND n.name ILIKE $1
      )`;
      dataParams.push(`%${q}%`);
    }

    let total: number | string = -1;
    if (page === 1) {
      const countResult = await this.pool.query<CountRow>(
        `SELECT COUNT(*) as count FROM artist_profiles a ${whereClause}`,
        q ? dataParams : [],
      );
      total = countResult.rows[0]?.count ?? 0;
    }

    dataParams.push(limit, offset);
    const query = `SELECT
      a.artist_entity_id AS id, a.artist_entity_id, ${ARTIST_NAME_SELECT}, a.image_url, a.genres, a.source_service, a.created_at,
      asu.id as short_id,
      (SELECT COUNT(*) FROM artist_service_links asl WHERE asl.artist_entity_id = a.artist_entity_id) as link_count
    FROM artist_profiles a
    ${ARTIST_NAME_LATERAL_JOIN}
    LEFT JOIN artist_short_urls asu ON a.artist_entity_id = asu.artist_entity_id
    ${whereClause}
    ORDER BY ${orderExpr} ${dir}
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;

    const rows = await this.pool.query(query, dataParams);

    interface ArtistListRow extends ArtistRow {
      short_id: string | null;
      link_count: string;
    }

    const items = (rows.rows as ArtistListRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      imageUrl: r.image_url ?? null,
      genres: safeParseArray(r.genres ?? "[]"),
      sourceService: r.source_service ?? null,
      linkCount: parseInt(r.link_count, 10),
      createdAt: dateToMs(r.created_at),
      shortId: r.short_id ?? null,
    }));

    return { items, total, page, limit };
  }

  async listArtistEntities(params: {
    page: number;
    limit: number;
    q?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }): Promise<ListResult<ArtistEntityListItem>> {
    const { page = 1, limit = 50, q, sortBy = "created_at", sortDir = "desc" } = params;
    const offset = (page - 1) * limit;
    const ALLOWED = ["created_at", "name", "entity_type", "verification_status"];
    const col = ALLOWED.includes(sortBy) ? sortBy : "created_at";
    const orderExpr = col === "name" ? "display_name" : `ae.${col}`;
    const dir = sortDir === "asc" ? "ASC" : "DESC";

    let whereClause = "";
    const dataParams: (string | number)[] = [];
    if (q) {
      whereClause = `WHERE EXISTS (
        SELECT 1
        FROM artist_entity_names n
        WHERE n.artist_entity_id = ae.id AND n.name ILIKE $1
      )`;
      dataParams.push(`%${q}%`);
    }

    let total: number | string = -1;
    if (page === 1) {
      const countResult = await this.pool.query<CountRow>(
        `SELECT COUNT(*) as count FROM artist_entities ae ${whereClause}`,
        q ? dataParams : [],
      );
      total = countResult.rows[0]?.count ?? 0;
    }

    dataParams.push(limit, offset);
    const query = `SELECT
      ae.id,
      ae.entity_type,
      ae.verification_status,
      COALESCE(entity_name.name, '[unnamed artist]') AS display_name,
      ae.created_at,
      ap.artist_entity_id IS NOT NULL AS has_profile,
      asu.id AS short_id,
      (SELECT COUNT(*) FROM track_artist_credits tac WHERE tac.artist_entity_id = ae.id)::int AS track_credit_count,
      (SELECT COUNT(*) FROM album_artist_credits aac WHERE aac.artist_entity_id = ae.id)::int AS album_credit_count
    FROM artist_entities ae
    LEFT JOIN LATERAL (
      SELECT n.name
      FROM artist_entity_names n
      WHERE n.artist_entity_id = ae.id
      ORDER BY
        CASE
          WHEN n.name_type = 'canonical' AND n.locale IS NULL THEN 0
          WHEN n.name_type = 'canonical' THEN 1
          WHEN n.name_type = 'credit' THEN 2
          WHEN n.locale IS NULL THEN 3
          ELSE 4
        END,
        n.created_at ASC
      LIMIT 1
    ) entity_name ON TRUE
    LEFT JOIN artist_profiles ap ON ap.artist_entity_id = ae.id
    LEFT JOIN artist_short_urls asu ON asu.artist_entity_id = ae.id
    ${whereClause}
    ORDER BY ${orderExpr} ${dir}
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;

    const rows = await this.pool.query<{
      id: string;
      entity_type: string;
      verification_status: string;
      display_name: string;
      created_at: Date;
      has_profile: boolean;
      short_id: string | null;
      track_credit_count: number;
      album_credit_count: number;
    }>(query, dataParams);

    return {
      items: rows.rows.map((r) => ({
        id: r.id,
        name: r.display_name,
        entityType: r.entity_type,
        verificationStatus: r.verification_status,
        trackCreditCount: r.track_credit_count,
        albumCreditCount: r.album_credit_count,
        hasProfile: r.has_profile,
        shortId: r.short_id,
        createdAt: dateToMs(r.created_at),
      })),
      total,
      page,
      limit,
    };
  }

  async deleteArtists(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const entityPlaceholders = ids.map((_, i) => `$${i + 1}`).join(",");

      // Delete associated records first
      await client.query(`DELETE FROM artist_external_ids WHERE artist_entity_id IN (${entityPlaceholders})`, ids);
      await client.query(`DELETE FROM artist_service_links WHERE artist_entity_id IN (${entityPlaceholders})`, ids);
      await client.query(`DELETE FROM artist_short_urls WHERE artist_entity_id IN (${entityPlaceholders})`, ids);

      // Delete artist profiles. Keep artist_entities because tracks/albums
      // and identity data can still reference the canonical entity.
      await client.query(
        `DELETE FROM artist_profiles WHERE artist_entity_id IN (${entityPlaceholders}) RETURNING artist_entity_id`,
        ids,
      );

      await client.query("COMMIT");

      adminEventBroadcaster.emit({
        type: "artists-deleted",
        data: { count: ids.length, ids },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async clearArtistCache(): Promise<{ deleted: number }> {
    const result = await this.pool.query(`DELETE FROM artist_cache RETURNING id`);
    return { deleted: result.rowCount ?? 0 };
  }

  async countAllData(): Promise<{
    tracks: number;
    albums: number;
    artists: number;
    artistProfiles: number;
    artistEntities: number;
  }> {
    const tracksResult = await this.pool.query(`SELECT COUNT(*) as count FROM tracks`);
    const albumsResult = await this.pool.query(`SELECT COUNT(*) as count FROM albums`);
    const artistsResult = await this.pool.query(`SELECT COUNT(*) as count FROM artist_profiles`);
    const artistEntitiesResult = await this.pool.query(`SELECT COUNT(*) as count FROM artist_entities`);

    return {
      tracks: tracksResult.rows[0]?.count ?? 0,
      albums: albumsResult.rows[0]?.count ?? 0,
      artists: artistsResult.rows[0]?.count ?? 0,
      artistProfiles: artistsResult.rows[0]?.count ?? 0,
      artistEntities: artistEntitiesResult.rows[0]?.count ?? 0,
    };
  }

  async resetAllData(): Promise<{ tracks: number; albums: number; artists: number }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Get counts before deletion
      const tracksResult = await client.query(`SELECT COUNT(*) as count FROM tracks`);
      const albumsResult = await client.query(`SELECT COUNT(*) as count FROM albums`);
      const artistsResult = await client.query(`SELECT COUNT(*) as count FROM artist_profiles`);

      const trackCount = tracksResult.rows[0]?.count ?? 0;
      const albumCount = albumsResult.rows[0]?.count ?? 0;
      const artistCount = artistsResult.rows[0]?.count ?? 0;

      // Delete in reverse order of foreign key dependencies
      await client.query("DELETE FROM artist_short_urls");
      await client.query("DELETE FROM artist_external_ids");
      await client.query("DELETE FROM artist_service_links");
      await client.query("DELETE FROM artist_profiles");
      await client.query("DELETE FROM album_short_urls");
      await client.query("DELETE FROM album_service_links");
      await client.query("DELETE FROM short_urls");
      await client.query("DELETE FROM service_links");
      await client.query("DELETE FROM albums");
      await client.query("DELETE FROM tracks");
      await client.query("DELETE FROM artist_cache");

      await client.query("COMMIT");
      log.debug("DB", "All data reset successfully");

      return { tracks: trackCount, albums: albumCount, artists: artistCount };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async resolveShortIds(shortIds: string[]): Promise<Map<string, { title: string; artist: string }>> {
    const result = new Map<string, { title: string; artist: string }>();
    if (shortIds.length === 0) return result;

    const placeholders = shortIds.map((_, i) => `$${i + 1}`).join(", ");

    const trackRows = await this.pool.query(
      `SELECT su.id AS short_id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}
       FROM short_urls su JOIN tracks t ON su.track_id = t.id
       WHERE su.id IN (${placeholders})`,
      shortIds,
    );
    for (const row of trackRows.rows) {
      const artists = safeParseArray(row.artists);
      result.set(row.short_id, { title: row.title, artist: artists[0] ?? "Unknown" });
    }

    const remaining = shortIds.filter((id) => !result.has(id));
    if (remaining.length > 0) {
      const albumPlaceholders = remaining.map((_, i) => `$${i + 1}`).join(", ");
      const albumRows = await this.pool.query(
        `SELECT asu.id AS short_id, a.title, ${ALBUM_ARTIST_FIELDS_SELECT}
         FROM album_short_urls asu JOIN albums a ON asu.album_id = a.id
         WHERE asu.id IN (${albumPlaceholders})`,
        remaining,
      );
      for (const row of albumRows.rows) {
        const artists = safeParseArray(row.artists);
        result.set(row.short_id, { title: row.title, artist: artists[0] ?? "Unknown" });
      }
    }

    return result;
  }

  // ============================================================================
  // SHARE PAGE LOADING (TrackRepository)
  // ============================================================================

  async loadSharePageResult(shortId: string): Promise<SharePageDbResult | null> {
    const result = await this.pool.query(
      `SELECT
        t.id, t.title, ${TRACK_ARTIST_FIELDS_SELECT}, t.album_name, t.isrc, t.artwork_url,
        t.duration_ms, t.release_date, t.is_explicit,
        (SELECT tp.url FROM track_previews tp WHERE tp.track_id = t.id ORDER BY (tp.service = 'deezer') DESC, tp.observed_at DESC LIMIT 1) AS preview_url,
        t.source_service, t.source_url,
        sl.url, sl.service,
        su.id as short_id
      FROM tracks t
      JOIN short_urls su ON t.id = su.track_id
      LEFT JOIN service_links sl ON t.id = sl.track_id
      WHERE su.id = $1`,
      [shortId],
    );

    if (result.rows.length === 0) return null;

    const firstRow = result.rows[0] as TrackWithLinkRow;
    const artists = safeParseArray(firstRow.artists);
    const artistCredits = safeParseArtistCredits(firstRow.artist_credits);
    const artistDisplay = artists.length > 0 ? artists[0] : "Unknown Artist";

    return {
      trackId: firstRow.id,
      track: this.rowToSharePageTrack(firstRow),
      artists,
      artistCredits,
      links: (result.rows as TrackWithLinkRow[])
        .filter((r) => r.url && r.service)
        .map((r) => ({
          service: r.service as string,
          url: r.url as string,
        })),
      shortId,
      artistDisplay,
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async ensureArtistEntityExists(client: PoolClient, artistEntityId: string): Promise<void> {
    const result = await client.query<{ id: string }>(`SELECT id FROM artist_entities WHERE id = $1`, [artistEntityId]);
    if (!result.rows[0]?.id) {
      throw new Error(`Artist entity not found: ${artistEntityId}`);
    }
  }

  private async ensureExistingArtistEntityForCredit(
    client: PoolClient,
    artistEntityId: string,
    creditName: string,
    now: Date,
  ): Promise<string> {
    await this.ensureArtistEntityExists(client, artistEntityId);
    await this.ensureArtistEntityName(client, artistEntityId, creditName, now, "credit");
    return artistEntityId;
  }

  private async ensureArtistEntityForName(client: PoolClient, name: string, now: Date): Promise<string> {
    const creditName = name.trim();
    if (!creditName) {
      return this.ensureArtistEntityForName(client, "Unknown Artist", now);
    }

    const existing = await client.query<{ artist_entity_id: string }>(
      `SELECT artist_entity_id
       FROM artist_entity_names
       WHERE LOWER(name) = LOWER($1)
       ORDER BY
         CASE
           WHEN name_type = 'canonical' AND locale IS NULL THEN 0
           WHEN name_type = 'canonical' THEN 1
           WHEN name_type = 'credit' THEN 2
           WHEN locale IS NULL THEN 3
           ELSE 4
         END,
         created_at ASC
       LIMIT 1`,
      [creditName],
    );
    if (existing.rows[0]?.artist_entity_id) {
      return existing.rows[0].artist_entity_id;
    }

    const artistEntityId = generateTrackId();
    await client.query(
      `INSERT INTO artist_entities (id, entity_type, verification_status, confidence, created_at, updated_at)
       VALUES ($1, 'unknown', 'candidate', NULL, $2, $2)`,
      [artistEntityId, now],
    );
    await client.query(
      `INSERT INTO artist_entity_names (id, artist_entity_id, locale, name, name_type, source_id, created_at)
       VALUES ($1, $2, NULL, $3, 'canonical', NULL, $4)`,
      [generateTrackId(), artistEntityId, creditName, now],
    );
    return artistEntityId;
  }

  private async ensureArtistEntityName(
    client: PoolClient,
    artistEntityId: string,
    name: string,
    now: Date,
    nameType: "canonical" | "credit" = "canonical",
  ): Promise<void> {
    const creditName = name.trim();
    if (!creditName) return;

    const existing = await client.query<{ id: string }>(
      `SELECT id
       FROM artist_entity_names
       WHERE artist_entity_id = $1 AND LOWER(name) = LOWER($2) AND name_type = $3
       LIMIT 1`,
      [artistEntityId, creditName, nameType],
    );
    if (existing.rows.length > 0) return;

    await client.query(
      `INSERT INTO artist_entity_names (id, artist_entity_id, locale, name, name_type, source_id, created_at)
       VALUES ($1, $2, NULL, $3, $4, NULL, $5)`,
      [generateTrackId(), artistEntityId, creditName, nameType, now],
    );
  }

  private async replaceTrackArtistCredits(
    client: PoolClient,
    trackId: string,
    artistNames: string[],
    now: Date,
    structuredCredits?: ArtistCredit[],
  ): Promise<ArtistCredit[]> {
    await client.query(`DELETE FROM track_artist_credits WHERE track_id = $1 AND credit_role = 'main'`, [trackId]);

    const creditInputs = normalizeArtistCreditInputs(artistNames, structuredCredits);
    const artistCredits: ArtistCredit[] = [];
    for (const [index, creditInput] of creditInputs.entries()) {
      const artistEntityId = creditInput.artistEntityId
        ? await this.ensureExistingArtistEntityForCredit(client, creditInput.artistEntityId, creditInput.name, now)
        : await this.ensureArtistEntityForName(client, creditInput.name, now);
      await client.query(
        `INSERT INTO track_artist_credits (
          id, track_id, artist_entity_id, credit_name, credit_position, credit_role,
          confidence, match_method, source_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'main', NULL, $6, NULL, $7)`,
        [
          generateTrackId(),
          trackId,
          artistEntityId,
          creditInput.name,
          index,
          creditInput.artistEntityId ? "entity_ref" : "legacy_name",
          now,
        ],
      );
      artistCredits.push({ artistEntityId, name: creditInput.name, role: "main", position: index });
    }
    return artistCredits;
  }

  private async replaceAlbumArtistCredits(
    client: PoolClient,
    albumId: string,
    artistNames: string[],
    now: Date,
    structuredCredits?: ArtistCredit[],
  ): Promise<ArtistCredit[]> {
    await client.query(`DELETE FROM album_artist_credits WHERE album_id = $1 AND credit_role = 'main'`, [albumId]);

    const creditInputs = normalizeArtistCreditInputs(artistNames, structuredCredits);
    const artistCredits: ArtistCredit[] = [];
    for (const [index, creditInput] of creditInputs.entries()) {
      const artistEntityId = creditInput.artistEntityId
        ? await this.ensureExistingArtistEntityForCredit(client, creditInput.artistEntityId, creditInput.name, now)
        : await this.ensureArtistEntityForName(client, creditInput.name, now);
      await client.query(
        `INSERT INTO album_artist_credits (
          id, album_id, artist_entity_id, credit_name, credit_position, credit_role,
          confidence, match_method, source_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'main', NULL, $6, NULL, $7)`,
        [
          generateTrackId(),
          albumId,
          artistEntityId,
          creditInput.name,
          index,
          creditInput.artistEntityId ? "entity_ref" : "legacy_name",
          now,
        ],
      );
      artistCredits.push({ artistEntityId, name: creditInput.name, role: "main", position: index });
    }
    return artistCredits;
  }

  private buildCachedResult(rows: TrackWithLinkRow[]): CachedTrackResult | null {
    if (rows.length === 0) return null;

    const firstRow = rows[0];
    const track = this.rowToTrack(firstRow);
    const trackId = firstRow.id;

    const links = [
      ...new Map(
        rows
          .filter((r) => r.url && r.service)
          .map((r) => [
            r.service,
            {
              service: r.service!,
              url: r.url!,
              confidence: r.confidence ?? 0,
              matchMethod: r.match_method ?? "cache",
            },
          ]),
      ).values(),
    ];

    return {
      trackId,
      track,
      links,
      updatedAt: dateToMs(firstRow.updated_at),
    };
  }

  private buildCachedAlbumResult(rows: AlbumWithLinkRow[]): CachedAlbumResult | null {
    if (rows.length === 0) return null;

    const firstRow = rows[0];
    const album = this.rowToNormalizedAlbum(firstRow);
    const albumId = firstRow.id;

    const links = [
      ...new Map(
        rows
          .filter((r) => r.link_url && r.service)
          .map((r) => [
            r.service,
            {
              service: r.service!,
              url: r.link_url!,
              confidence: r.confidence ?? 0,
              matchMethod: r.match_method ?? "cache",
            },
          ]),
      ).values(),
    ];

    return {
      albumId,
      album,
      links,
      updatedAt: dateToMs(firstRow.updated_at),
    };
  }

  private buildSharePageResult(rows: TrackWithLinkRow[]): SharePageDbResult | null {
    if (rows.length === 0) return null;

    const firstRow = rows[0];
    const artists = safeParseArray(firstRow.artists);
    const artistCredits = safeParseArtistCredits(firstRow.artist_credits);
    const artistDisplay = artists.length > 0 ? artists[0] : "Unknown Artist";

    return {
      trackId: firstRow.id,
      track: this.rowToSharePageTrack(firstRow),
      artists,
      artistCredits,
      links: rows
        .filter((r) => r.url && r.service)
        .map((r) => ({
          service: r.service!,
          url: r.url!,
        })),
      shortId: firstRow.short_id ?? "",
      artistDisplay,
    };
  }

  private rowToTrack(row: TrackRow): NormalizedTrack {
    return {
      sourceService: (row.source_service as TrackSource) ?? "cached",
      sourceId: row.id,
      title: row.title,
      artists: safeParseArray(row.artists),
      artistCredits: safeParseArtistCredits(row.artist_credits),
      albumName: row.album_name ?? undefined,
      isrc: row.isrc ?? undefined,
      artworkUrl: row.artwork_url ?? undefined,
      durationMs: row.duration_ms ?? undefined,
      releaseDate: row.release_date ?? undefined,
      isExplicit: !!row.is_explicit,
      previewUrl: row.preview_url ?? undefined,
      webUrl: row.source_url ?? "",
    };
  }

  /** Convert a track row to the SharePageDbResult.track shape */
  private rowToSharePageTrack(row: TrackRow): SharePageDbResult["track"] {
    return {
      title: row.title,
      albumName: row.album_name,
      artworkUrl: row.artwork_url,
      durationMs: row.duration_ms,
      isrc: row.isrc,
      releaseDate: row.release_date,
      isExplicit: !!row.is_explicit,
      previewUrl: row.preview_url,
    };
  }

  private rowToAlbum(row: AlbumRow): SharePageAlbumResult["album"] {
    return {
      title: row.title,
      artworkUrl: row.artwork_url,
      releaseDate: row.release_date,
      totalTracks: row.total_tracks,
      label: row.label,
      upc: row.upc,
      previewUrl: row.preview_url ?? null,
    };
  }

  private rowToNormalizedAlbum(row: AlbumRow): NormalizedAlbum {
    return {
      sourceService: (row.source_service as TrackSource) ?? "cached",
      sourceId: row.id,
      title: row.title,
      artists: safeParseArray(row.artists),
      artistCredits: safeParseArtistCredits(row.artist_credits),
      releaseDate: row.release_date ?? undefined,
      totalTracks: row.total_tracks ?? undefined,
      artworkUrl: row.artwork_url ?? undefined,
      label: row.label ?? undefined,
      upc: row.upc ?? undefined,
      webUrl: row.source_url ?? "",
    };
  }

  private buildCachedArtistResult(rows: ArtistWithLinkRow[]): CachedArtistResult | null {
    if (rows.length === 0) return null;

    const firstRow = rows[0];
    const artist: NormalizedArtist = {
      sourceService: (firstRow.source_service as TrackSource) ?? "cached",
      sourceId: firstRow.id,
      name: firstRow.name,
      imageUrl: firstRow.image_url ?? undefined,
      genres: safeParseArray(firstRow.genres ?? "[]"),
      webUrl: firstRow.source_url ?? "",
    };

    const links = [
      ...new Map(
        rows
          .filter((r) => r.link_url && r.service)
          .map((r) => [
            r.service,
            {
              service: r.service!,
              url: r.link_url!,
              confidence: r.confidence ?? 0,
              matchMethod: r.match_method ?? "cache",
            },
          ]),
      ).values(),
    ];

    return {
      artistId: firstRow.id,
      artist,
      links,
      updatedAt: dateToMs(firstRow.updated_at),
    };
  }

  // ============================================================================
  // EMAIL TEMPLATES (AdminRepository)
  // ============================================================================

  async listEmailTemplates(): Promise<EmailTemplateRow[]> {
    const result = await this.pool.query(
      `SELECT id, name, subject, header_banner_url, header_text, body_text,
              footer_banner_url, footer_text, is_system_template, created_at, updated_at
       FROM email_templates
       ORDER BY name ASC`,
    );
    return result.rows.map(rowToEmailTemplate);
  }

  async getEmailTemplateById(id: number): Promise<EmailTemplateRow | null> {
    const result = await this.pool.query(
      `SELECT id, name, subject, header_banner_url, header_text, body_text,
              footer_banner_url, footer_text, is_system_template, created_at, updated_at
       FROM email_templates
       WHERE id = $1`,
      [id],
    );
    return result.rows.length > 0 ? rowToEmailTemplate(result.rows[0]) : null;
  }

  async getEmailTemplateByName(name: string): Promise<EmailTemplateRow | null> {
    const result = await this.pool.query(
      `SELECT id, name, subject, header_banner_url, header_text, body_text,
              footer_banner_url, footer_text, is_system_template, created_at, updated_at
       FROM email_templates
       WHERE name = $1`,
      [name],
    );
    return result.rows.length > 0 ? rowToEmailTemplate(result.rows[0]) : null;
  }

  async insertEmailTemplate(data: EmailTemplateWriteData): Promise<EmailTemplateRow> {
    const result = await this.pool.query(
      `INSERT INTO email_templates
         (name, subject, header_banner_url, header_text, body_text,
          footer_banner_url, footer_text, is_system_template)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, subject, header_banner_url, header_text, body_text,
                 footer_banner_url, footer_text, is_system_template, created_at, updated_at`,
      [
        data.name,
        data.subject,
        data.headerBannerUrl ?? null,
        data.headerText ?? null,
        data.bodyText,
        data.footerBannerUrl ?? null,
        data.footerText ?? null,
        data.isSystemTemplate ?? false,
      ],
    );
    return rowToEmailTemplate(result.rows[0]);
  }

  async updateEmailTemplate(id: number, data: Partial<EmailTemplateWriteData>): Promise<EmailTemplateRow | null> {
    const columnMap: Record<keyof EmailTemplateWriteData, string> = {
      name: "name",
      subject: "subject",
      headerBannerUrl: "header_banner_url",
      headerText: "header_text",
      bodyText: "body_text",
      footerBannerUrl: "footer_banner_url",
      footerText: "footer_text",
      isSystemTemplate: "is_system_template",
    };

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      const column = columnMap[key as keyof EmailTemplateWriteData];
      if (column) {
        setClauses.push(`${column} = $${paramIndex}`);
        values.push(value ?? null);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return this.getEmailTemplateById(id);
    }

    setClauses.push(`updated_at = $${paramIndex}`);
    values.push(new Date());
    paramIndex++;

    values.push(id);
    const result = await this.pool.query(
      `UPDATE email_templates SET ${setClauses.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, name, subject, header_banner_url, header_text, body_text,
                 footer_banner_url, footer_text, is_system_template, created_at, updated_at`,
      values,
    );

    return result.rows.length > 0 ? rowToEmailTemplate(result.rows[0]) : null;
  }

  async deleteEmailTemplate(id: number): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM email_templates WHERE id = $1 RETURNING id`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // ============================================================================
  // CONTENT PAGES (AdminRepository)
  // ============================================================================

  async listContentPageSummaries(): Promise<ContentPageSummaryRow[]> {
    const result = await this.pool.query(
      `SELECT ${CONTENT_SUMMARY_COLUMNS},
              COALESCE(
                json_agg(
                  json_build_object('position', ps.position, 'label', ps.label, 'targetSlug', ps.target_slug)
                  ORDER BY ps.position
                ) FILTER (WHERE ps.id IS NOT NULL),
                '[]'::json
              ) AS segments
       FROM content_pages
       LEFT JOIN page_segments ps ON ps.owner_slug = content_pages.slug
       GROUP BY content_pages.slug
       ORDER BY content_pages.position ASC, content_pages.created_at DESC`,
    );
    return result.rows.map(rowToContentPageSummary);
  }

  async getContentPageBySlug(slug: string): Promise<ContentPageRow | null> {
    const result = await this.pool.query(
      `SELECT ${CONTENT_COLUMNS}
       FROM content_pages
       WHERE slug = $1`,
      [slug],
    );
    return result.rows.length > 0 ? rowToContentPage(result.rows[0]) : null;
  }

  async contentPageSlugExists(slug: string): Promise<boolean> {
    const result = await this.pool.query(`SELECT 1 FROM content_pages WHERE slug = $1 LIMIT 1`, [slug]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  async createContentPage(data: ContentPageCreateData): Promise<ContentPageRow> {
    const result = await this.pool.query(
      `INSERT INTO content_pages (slug, title, status, page_type, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${CONTENT_COLUMNS}`,
      [data.slug, data.title, data.status ?? "draft", data.pageType ?? "default", data.createdBy],
    );
    return rowToContentPage(result.rows[0]);
  }

  async updateContentPageMeta(slug: string, data: ContentPageMetaUpdate): Promise<ContentPageRow | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      values.push(data.title);
    }
    if (data.slug !== undefined) {
      setClauses.push(`slug = $${paramIndex++}`);
      values.push(data.slug);
    }
    if (data.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }
    if (data.showTitle !== undefined) {
      setClauses.push(`show_title = $${paramIndex++}`);
      values.push(data.showTitle);
    }
    if (data.titleAlignment !== undefined) {
      setClauses.push(`title_alignment = $${paramIndex++}`);
      values.push(data.titleAlignment);
    }
    if (data.pageType !== undefined) {
      setClauses.push(`page_type = $${paramIndex++}`);
      values.push(data.pageType);
    }
    if (data.displayMode !== undefined) {
      setClauses.push(`display_mode = $${paramIndex++}`);
      values.push(data.displayMode);
    }
    if (data.overlayWidth !== undefined) {
      setClauses.push(`overlay_width = $${paramIndex++}`);
      values.push(data.overlayWidth);
    }
    if (data.contentCardStyle !== undefined) {
      setClauses.push(`content_card_style = $${paramIndex++}`);
      values.push(data.contentCardStyle);
    }

    if (setClauses.length === 0) {
      return this.getContentPageBySlug(slug);
    }

    setClauses.push(`updated_at = $${paramIndex++}`);
    values.push(new Date());
    setClauses.push(`updated_by = $${paramIndex++}`);
    values.push(data.updatedBy);

    values.push(slug);
    const result = await this.pool.query(
      `UPDATE content_pages SET ${setClauses.join(", ")}
       WHERE slug = $${paramIndex}
       RETURNING ${CONTENT_COLUMNS}`,
      values,
    );
    return result.rows.length > 0 ? rowToContentPage(result.rows[0]) : null;
  }

  async updateContentPageBody(slug: string, content: string, updatedBy: string | null): Promise<ContentPageRow | null> {
    const result = await this.pool.query(
      `UPDATE content_pages
       SET content = $1, updated_at = $2, updated_by = $3
       WHERE slug = $4
       RETURNING ${CONTENT_COLUMNS}`,
      [content, new Date(), updatedBy, slug],
    );
    return result.rows.length > 0 ? rowToContentPage(result.rows[0]) : null;
  }

  async deleteContentPage(slug: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM content_pages WHERE slug = $1 RETURNING slug`, [slug]);
    return (result.rowCount ?? 0) > 0;
  }

  async getAdminUsernamesByIds(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    const unique = Array.from(new Set(ids));
    const result = await this.pool.query<{ id: string; username: string }>(
      `SELECT id, username FROM admin_users WHERE id = ANY($1)`,
      [unique],
    );
    for (const row of result.rows) map.set(row.id, row.username);
    return map;
  }

  // -- Public reads -----------------------------------------------------------

  async listPublishedContentPages(): Promise<Array<{ slug: string; title: string }>> {
    const result = await this.pool.query<{ slug: string; title: string }>(
      `SELECT slug, title FROM content_pages WHERE status = 'published' ORDER BY title ASC`,
    );
    return result.rows;
  }

  async getPublishedContentPageBySlug(slug: string): Promise<ContentPageRow | null> {
    const result = await this.pool.query(
      `SELECT ${CONTENT_COLUMNS}
       FROM content_pages
       WHERE slug = $1 AND status = 'published'`,
      [slug],
    );
    return result.rows.length > 0 ? rowToContentPage(result.rows[0]) : null;
  }

  async getContentPagesBySlugs(slugs: string[]): Promise<ContentPageRow[]> {
    if (slugs.length === 0) return [];
    const result = await this.pool.query(
      `SELECT ${CONTENT_COLUMNS}
       FROM content_pages
       WHERE slug = ANY($1)`,
      [slugs],
    );
    return result.rows.map(rowToContentPage);
  }

  async getPublishedContentPagesBySlugs(slugs: string[]): Promise<ContentPageRow[]> {
    if (slugs.length === 0) return [];
    const result = await this.pool.query(
      `SELECT ${CONTENT_COLUMNS}
       FROM content_pages
       WHERE slug = ANY($1) AND status = 'published'`,
      [slugs],
    );
    return result.rows.map(rowToContentPage);
  }

  async bulkUpdatePages(payload: BulkUpdatePagesPayload): Promise<ContentPageSummaryRow[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // 1) pages.meta + pages.content
      for (const p of payload.pages) {
        if (p.meta) {
          await this.applyMetaInTx(client, p.slug, p.meta);
        }
        if (p.content !== undefined) {
          await client.query(
            `UPDATE content_pages
                SET content = $2,
                    content_updated_at = NOW(),
                    updated_at = NOW()
              WHERE slug = $1`,
            [resolveSlugAfterRename(p), p.content],
          );
        }
      }

      // 2) topLevelOrder → position
      for (let i = 0; i < payload.topLevelOrder.length; i++) {
        await client.query(`UPDATE content_pages SET position = $2 WHERE slug = $1`, [payload.topLevelOrder[i], i]);
      }

      // 3) segments per owner — DELETE + INSERT (+ translations UPSERT)
      for (const entry of payload.segments) {
        const preservedTranslationRows = await client.query<{
          target_slug: string;
          locale: string;
          label: string;
          source_updated_at: Date | null;
        }>(
          `SELECT ps.target_slug, pst.locale, pst.label, pst.source_updated_at
             FROM page_segments ps
             JOIN page_segment_translations pst ON pst.segment_id = ps.id
            WHERE ps.owner_slug = $1`,
          [entry.ownerSlug],
        );
        const preservedTranslations = new Map<
          string,
          { locale: string; label: string; sourceUpdatedAt: Date | null }[]
        >();
        for (const row of preservedTranslationRows.rows) {
          const entries = preservedTranslations.get(row.target_slug) ?? [];
          entries.push({ locale: row.locale, label: row.label, sourceUpdatedAt: row.source_updated_at });
          preservedTranslations.set(row.target_slug, entries);
        }

        await client.query(`DELETE FROM page_segments WHERE owner_slug = $1`, [entry.ownerSlug]);
        const idRows: { rows: { id: number; label_updated_at: Date }[] } = { rows: [] };
        for (const s of entry.segments) {
          const inserted = await client.query<{ id: number; label_updated_at: Date }>(
            `INSERT INTO page_segments (owner_slug, target_slug, position, label, label_updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             RETURNING id, label_updated_at`,
            [entry.ownerSlug, s.targetSlug, s.position, s.label],
          );
          idRows.rows.push(inserted.rows[0]);
        }
        for (let i = 0; i < entry.segments.length; i++) {
          const persisted = idRows.rows[i];
          const input = entry.segments[i];
          const translations =
            input.translations === undefined
              ? (preservedTranslations.get(input.targetSlug) ?? [])
              : Object.entries(input.translations)
                  .filter(([, label]) => typeof label === "string" && label.length > 0)
                  .map(([locale, label]) => ({
                    locale,
                    label,
                    sourceUpdatedAt: persisted.label_updated_at,
                  }));
          for (const { locale, label, sourceUpdatedAt } of translations) {
            if (typeof label !== "string" || label.length === 0) continue;
            await client.query(
              `INSERT INTO page_segment_translations (segment_id, locale, label, source_updated_at)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (segment_id, locale)
               DO UPDATE SET label = EXCLUDED.label, source_updated_at = EXCLUDED.source_updated_at`,
              [persisted.id, locale, label, sourceUpdatedAt],
            );
          }
        }
      }

      // 4) page translations (UPSERT) — stamp updated_by + source_updated_at to
      // match the per-resource upsertPageTranslation audit semantics.
      for (const t of payload.pageTranslations) {
        await client.query(
          `INSERT INTO content_page_translations
             (slug, locale, title, content, updated_at, updated_by, source_updated_at)
           VALUES ($1, $2, $3, $4, NOW(), $5, NOW())
           ON CONFLICT (slug, locale)
           DO UPDATE SET title = EXCLUDED.title,
                         content = EXCLUDED.content,
                         updated_at = EXCLUDED.updated_at,
                         updated_by = EXCLUDED.updated_by,
                         source_updated_at = EXCLUDED.source_updated_at`,
          [t.slug, t.locale, t.title ?? null, t.content ?? null, t.updatedBy ?? null],
        );
      }

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    // Service layer maps DB rows to ContentPageSummary DTOs via
    // getManagedContentPages(); adapter return is unused. Return [] to honor
    // the interface signature without a redundant SELECT.
    return [];
  }

  private async applyMetaInTx(client: PoolClient, slug: string, meta: ContentPageMetaUpdate): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let p = 1;
    if (meta.title !== undefined) {
      setClauses.push(`title = $${p++}`);
      values.push(meta.title);
    }
    if (meta.slug !== undefined && meta.slug !== slug) {
      setClauses.push(`slug = $${p++}`);
      values.push(meta.slug);
    }
    if (meta.status !== undefined) {
      setClauses.push(`status = $${p++}`);
      values.push(meta.status);
    }
    if (meta.showTitle !== undefined) {
      setClauses.push(`show_title = $${p++}`);
      values.push(meta.showTitle);
    }
    if (meta.titleAlignment !== undefined) {
      setClauses.push(`title_alignment = $${p++}`);
      values.push(meta.titleAlignment);
    }
    if (meta.pageType !== undefined) {
      setClauses.push(`page_type = $${p++}`);
      values.push(meta.pageType);
    }
    if (meta.displayMode !== undefined) {
      setClauses.push(`display_mode = $${p++}`);
      values.push(meta.displayMode);
    }
    if (meta.overlayWidth !== undefined) {
      setClauses.push(`overlay_width = $${p++}`);
      values.push(meta.overlayWidth);
    }
    if (meta.contentCardStyle !== undefined) {
      setClauses.push(`content_card_style = $${p++}`);
      values.push(meta.contentCardStyle);
    }
    if (meta.updatedBy !== undefined) {
      setClauses.push(`updated_by = $${p++}`);
      values.push(meta.updatedBy);
    }
    if (setClauses.length === 0) return;
    setClauses.push(`updated_at = NOW()`);
    values.push(slug);
    await client.query(`UPDATE content_pages SET ${setClauses.join(", ")} WHERE slug = $${p}`, values);
    // segmented → default transition: clear orphan segments (existing behaviour)
    if (meta.pageType === "default") {
      await client.query(`DELETE FROM page_segments WHERE owner_slug = $1`, [meta.slug ?? slug]);
    }
  }

  // ============================================================================
  // PAGE TRANSLATIONS (AdminRepository)
  // ============================================================================

  async listPageTranslations(slug: string): Promise<ContentPageTranslationRow[]> {
    const result = await this.pool.query<ContentPageTranslationSqlRow>(
      `SELECT slug, locale, title, content, source_updated_at, updated_at, updated_by
       FROM content_page_translations
       WHERE slug = $1
       ORDER BY locale ASC`,
      [slug],
    );
    return result.rows.map(rowToContentPageTranslation);
  }

  async getPageTranslation(slug: string, locale: string): Promise<ContentPageTranslationRow | null> {
    const result = await this.pool.query<ContentPageTranslationSqlRow>(
      `SELECT slug, locale, title, content, source_updated_at, updated_at, updated_by
       FROM content_page_translations
       WHERE slug = $1 AND locale = $2
       LIMIT 1`,
      [slug, locale],
    );
    return result.rows.length > 0 ? rowToContentPageTranslation(result.rows[0]) : null;
  }

  async upsertPageTranslation(input: ContentPageTranslationUpsert): Promise<ContentPageTranslationRow> {
    const now = new Date();
    const result = await this.pool.query<ContentPageTranslationSqlRow>(
      `INSERT INTO content_page_translations
         (slug, locale, title, content, source_updated_at, updated_at, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT ON CONSTRAINT pk_content_page_translations
       DO UPDATE SET
         title = EXCLUDED.title,
         content = EXCLUDED.content,
         source_updated_at = EXCLUDED.source_updated_at,
         updated_at = EXCLUDED.updated_at,
         updated_by = EXCLUDED.updated_by
       RETURNING slug, locale, title, content, source_updated_at, updated_at, updated_by`,
      [input.slug, input.locale, input.title, input.content, input.sourceUpdatedAt, now, input.updatedBy],
    );
    return rowToContentPageTranslation(result.rows[0]);
  }

  async deletePageTranslation(slug: string, locale: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM content_page_translations WHERE slug = $1 AND locale = $2 RETURNING slug`,
      [slug, locale],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async setContentPageContentUpdatedAt(slug: string, when: Date): Promise<void> {
    await this.pool.query(`UPDATE content_pages SET content_updated_at = $1, updated_at = $1 WHERE slug = $2`, [
      when,
      slug,
    ]);
  }

  // ============================================================================
  // PAGE SEGMENTS (AdminRepository)
  // ============================================================================

  async listSegmentsForOwner(ownerSlug: string): Promise<PageSegmentRow[]> {
    const result = await this.pool.query<{
      id: number;
      owner_slug: string;
      target_slug: string;
      position: number;
      label: string;
      label_updated_at: Date;
    }>(
      `SELECT id, owner_slug, target_slug, position, label, label_updated_at
       FROM page_segments
       WHERE owner_slug = $1
       ORDER BY position ASC`,
      [ownerSlug],
    );
    return result.rows.map((r) => ({
      id: r.id,
      ownerSlug: r.owner_slug,
      targetSlug: r.target_slug,
      position: r.position,
      label: r.label,
      labelUpdatedAt: r.label_updated_at,
    }));
  }

  async deleteSegmentsForOwner(ownerSlug: string): Promise<void> {
    await this.pool.query(`DELETE FROM page_segments WHERE owner_slug = $1`, [ownerSlug]);
  }

  async replaceSegmentsForOwner(ownerSlug: string, segments: PageSegmentInputRow[]): Promise<PageSegmentRow[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM page_segments WHERE owner_slug = $1`, [ownerSlug]);
      const rows: PageSegmentRow[] = [];
      for (const s of segments) {
        const r = await client.query<{ id: number; label_updated_at: Date }>(
          `INSERT INTO page_segments (owner_slug, target_slug, position, label)
           VALUES ($1, $2, $3, $4)
           RETURNING id, label_updated_at`,
          [ownerSlug, s.targetSlug, s.position, s.label],
        );
        rows.push({
          id: r.rows[0].id,
          ownerSlug,
          targetSlug: s.targetSlug,
          position: s.position,
          label: s.label,
          labelUpdatedAt: r.rows[0].label_updated_at,
        });
      }
      await client.query("COMMIT");
      return rows.sort((a, b) => a.position - b.position);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // NAVIGATION ITEMS (AdminRepository)
  // ============================================================================

  async listAdminNavItems(navId: NavId): Promise<NavItemRow[]> {
    const result = await this.pool.query(
      `SELECT n.id, n.nav_id, n.page_slug, n.url, n.target, n.position, n.label, n.label_updated_at,
              p.title AS page_title,
              p.page_type, p.display_mode, p.overlay_width
       FROM nav_items n
       LEFT JOIN content_pages p ON p.slug = n.page_slug
       WHERE n.nav_id = $1
       ORDER BY n.position ASC, n.id ASC`,
      [navId],
    );
    return result.rows.map(rowToNavItem);
  }

  async replaceAdminNavItems(navId: NavId, items: NavItemReplaceInput[]): Promise<NavItemRow[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM nav_items WHERE nav_id = $1`, [navId]);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await client.query(
          `INSERT INTO nav_items (nav_id, page_slug, url, target, position, label)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [navId, item.pageSlug ?? null, item.url ?? null, item.target ?? "_self", i, item.label ?? null],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return this.listAdminNavItems(navId);
  }

  // ============================================================================
  // SEGMENT TRANSLATIONS (AdminRepository)
  // ============================================================================

  async listSegmentTranslationsForOwner(ownerSlug: string): Promise<PageSegmentTranslationRow[]> {
    const result = await this.pool.query<{
      segment_id: number;
      locale: string;
      label: string;
      source_updated_at: Date | null;
      updated_at: Date;
    }>(
      `SELECT pst.segment_id, pst.locale, pst.label, pst.source_updated_at, pst.updated_at
       FROM page_segment_translations pst
       JOIN page_segments ps ON ps.id = pst.segment_id
       WHERE ps.owner_slug = $1
       ORDER BY pst.segment_id, pst.locale`,
      [ownerSlug],
    );
    return result.rows.map((r) => ({
      segmentId: r.segment_id,
      locale: r.locale,
      label: r.label,
      sourceUpdatedAt: r.source_updated_at,
      updatedAt: r.updated_at,
    }));
  }

  async replaceSegmentTranslations(
    segmentId: number,
    translations: { locale: string; label: string; sourceUpdatedAt: Date | null }[],
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM page_segment_translations WHERE segment_id = $1`, [segmentId]);
      for (const t of translations) {
        await client.query(
          `INSERT INTO page_segment_translations (segment_id, locale, label, source_updated_at)
           VALUES ($1, $2, $3, $4)`,
          [segmentId, t.locale, t.label, t.sourceUpdatedAt],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // NAV ITEM TRANSLATIONS (AdminRepository)
  // ============================================================================

  async listNavTranslations(navId: NavId): Promise<NavItemTranslationRow[]> {
    const result = await this.pool.query<{
      nav_item_id: number;
      locale: string;
      label: string;
      source_updated_at: Date | null;
      updated_at: Date;
    }>(
      `SELECT nit.nav_item_id, nit.locale, nit.label, nit.source_updated_at, nit.updated_at
       FROM nav_item_translations nit
       JOIN nav_items ni ON ni.id = nit.nav_item_id
       WHERE ni.nav_id = $1
       ORDER BY nit.nav_item_id, nit.locale`,
      [navId],
    );
    return result.rows.map((r) => ({
      navItemId: r.nav_item_id,
      locale: r.locale,
      label: r.label,
      sourceUpdatedAt: r.source_updated_at,
      updatedAt: r.updated_at,
    }));
  }

  async replaceNavItemTranslations(
    navItemId: number,
    translations: { locale: string; label: string; sourceUpdatedAt: Date | null }[],
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM nav_item_translations WHERE nav_item_id = $1`, [navItemId]);
      for (const t of translations) {
        await client.query(
          `INSERT INTO nav_item_translations (nav_item_id, locale, label, source_updated_at)
           VALUES ($1, $2, $3, $4)`,
          [navItemId, t.locale, t.label, t.sourceUpdatedAt],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // CRAWLER STATE + RUNS (TrackRepository) — migration 0023
  // ============================================================================

  async seedCrawlState(seed: CrawlStateSeed): Promise<void> {
    await this.pool.query(
      `INSERT INTO crawl_state (source, display_name, enabled, interval_minutes, config)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (source) DO NOTHING`,
      [
        seed.source,
        seed.displayName,
        seed.defaultEnabled,
        seed.defaultIntervalMinutes,
        JSON.stringify(seed.defaultConfig),
      ],
    );
  }

  async findCrawlState(source: string): Promise<CrawlStateRecord | null> {
    const result = await this.pool.query(
      `SELECT source, display_name, enabled, interval_minutes, next_run_at, last_run_at,
              cursor, config, running_since, error_count, last_error, consecutive_errors
       FROM crawl_state WHERE source = $1`,
      [source],
    );
    if (result.rows.length === 0) return null;
    return rowToCrawlStateRecord(result.rows[0] as CrawlStateSqlRow);
  }

  async listCrawlState(): Promise<CrawlStateRecord[]> {
    const result = await this.pool.query(
      `SELECT source, display_name, enabled, interval_minutes, next_run_at, last_run_at,
              cursor, config, running_since, error_count, last_error, consecutive_errors
       FROM crawl_state
       ORDER BY display_name ASC`,
    );
    return (result.rows as CrawlStateSqlRow[]).map(rowToCrawlStateRecord);
  }

  async listDueCrawlState(): Promise<CrawlStateRecord[]> {
    const result = await this.pool.query(
      `SELECT source, display_name, enabled, interval_minutes, next_run_at, last_run_at,
              cursor, config, running_since, error_count, last_error, consecutive_errors
       FROM crawl_state
       WHERE enabled = true AND next_run_at <= NOW() AND running_since IS NULL
       ORDER BY next_run_at ASC`,
    );
    return (result.rows as CrawlStateSqlRow[]).map(rowToCrawlStateRecord);
  }

  async updateCrawlState(source: string, patch: CrawlStatePatch): Promise<CrawlStateRecord | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (patch.enabled !== undefined) {
      sets.push(`enabled = $${idx++}`);
      values.push(patch.enabled);
    }
    if (patch.intervalMinutes !== undefined) {
      sets.push(`interval_minutes = $${idx++}`);
      values.push(patch.intervalMinutes);
    }
    if (patch.config !== undefined) {
      sets.push(`config = $${idx++}::jsonb`);
      values.push(JSON.stringify(patch.config));
    }
    if (patch.cursor !== undefined) {
      sets.push(`cursor = $${idx++}::jsonb`);
      values.push(patch.cursor === null ? null : JSON.stringify(patch.cursor));
    }
    if (patch.nextRunAt !== undefined) {
      sets.push(`next_run_at = $${idx++}`);
      values.push(patch.nextRunAt);
    }
    if (patch.runningSince === null) {
      sets.push(`running_since = NULL`);
    }

    if (sets.length === 0) {
      return this.findCrawlState(source);
    }

    values.push(source);
    const result = await this.pool.query(
      `UPDATE crawl_state SET ${sets.join(", ")}
       WHERE source = $${idx}
       RETURNING source, display_name, enabled, interval_minutes, next_run_at, last_run_at,
                 cursor, config, running_since, error_count, last_error, consecutive_errors`,
      values,
    );
    if (result.rows.length === 0) return null;
    return rowToCrawlStateRecord(result.rows[0] as CrawlStateSqlRow);
  }

  async acquireCrawlLock(source: string, maxRunMs: number): Promise<boolean> {
    // Stale-detection (`running_since < NOW() - $maxRunMs`) covers prior
    // heartbeat crashes / mid-run kills that left a stuck `running_since`.
    const result = await this.pool.query(
      `UPDATE crawl_state
         SET running_since = NOW()
         WHERE source = $1
           AND (running_since IS NULL OR running_since < NOW() - $2::bigint * INTERVAL '1 millisecond')
         RETURNING source`,
      [source, maxRunMs],
    );
    return result.rowCount === 1;
  }

  async completeCrawlTick(source: string, outcome: CrawlTickOutcome): Promise<void> {
    const threshold = outcome.autoDisableThreshold ?? 5;
    if (outcome.success) {
      await this.pool.query(
        `UPDATE crawl_state
           SET running_since = NULL,
               last_run_at = NOW(),
               next_run_at = $1,
               cursor = $2::jsonb,
               consecutive_errors = 0,
               last_error = NULL
           WHERE source = $3`,
        [outcome.nextRunAt, outcome.cursor === null ? null : JSON.stringify(outcome.cursor), source],
      );
    } else {
      // Auto-disable on threshold breach. The CASE-WHEN reads the
      // already-incremented value via the same row update, so the threshold
      // check sees `consecutive_errors + 1` consistently.
      await this.pool.query(
        `UPDATE crawl_state
           SET running_since = NULL,
               last_run_at = NOW(),
               next_run_at = $1,
               error_count = error_count + 1,
               consecutive_errors = consecutive_errors + 1,
               last_error = $2,
               enabled = CASE WHEN consecutive_errors + 1 >= $3 THEN false ELSE enabled END
           WHERE source = $4`,
        [outcome.nextRunAt, outcome.errorMessage ?? null, threshold, source],
      );
    }
  }

  async insertCrawlRun(run: CrawlRunInsert): Promise<void> {
    await this.pool.query(
      `INSERT INTO crawl_runs (id, source, started_at, status)
       VALUES ($1, $2, $3, $4)`,
      [run.id, run.source, run.startedAt, run.status],
    );
  }

  async finalizeCrawlRun(id: string, finalize: CrawlRunFinalize): Promise<void> {
    await this.pool.query(
      `UPDATE crawl_runs
         SET status = $1,
             finished_at = $2,
             discovered = $3,
             ingested = $4,
             skipped = $5,
             errors = $6,
             notes = $7
         WHERE id = $8`,
      [
        finalize.status,
        finalize.finishedAt,
        finalize.discovered,
        finalize.ingested,
        finalize.skipped,
        finalize.errors,
        finalize.notes ?? null,
        id,
      ],
    );
  }

  async listCrawlRuns(params: { source?: string; page: number; limit: number }): Promise<CrawlRunsPage> {
    const { source, page, limit } = params;
    const offset = (page - 1) * limit;

    const whereParams: unknown[] = [];
    let where = "";
    if (source) {
      where = `WHERE source = $1`;
      whereParams.push(source);
    }

    const countResult = await this.pool.query<CountRow>(
      `SELECT COUNT(*) as count FROM crawl_runs ${where}`,
      whereParams,
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const dataParams: unknown[] = [...whereParams, limit, offset];
    const limitIdx = whereParams.length + 1;
    const offsetIdx = whereParams.length + 2;
    const result = await this.pool.query(
      `SELECT id, source, started_at, finished_at, status,
              discovered, ingested, skipped, errors, notes
       FROM crawl_runs
       ${where}
       ORDER BY started_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      dataParams,
    );

    const items: CrawlRunRecord[] = (result.rows as CrawlRunSqlRow[]).map((r) => ({
      id: r.id,
      source: r.source,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      status: r.status,
      discovered: r.discovered,
      ingested: r.ingested,
      skipped: r.skipped,
      errors: r.errors,
      notes: r.notes,
    }));

    return { items, total, page, limit };
  }
}

interface EmailTemplateSqlRow {
  id: number;
  name: string;
  subject: string;
  header_banner_url: string | null;
  header_text: string | null;
  body_text: string;
  footer_banner_url: string | null;
  footer_text: string | null;
  is_system_template: boolean;
  created_at: Date;
  updated_at: Date;
}

function rowToEmailTemplate(row: EmailTemplateSqlRow): EmailTemplateRow {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    headerBannerUrl: row.header_banner_url,
    headerText: row.header_text,
    bodyText: row.body_text,
    footerBannerUrl: row.footer_banner_url,
    footerText: row.footer_text,
    isSystemTemplate: row.is_system_template,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Resolve the slug that subsequent UPDATEs in the same TX should target after
// a slug rename: the meta UPDATE runs first, so `meta.slug` (when present)
// is already the new key for the content/translation/segment rows.
function resolveSlugAfterRename(p: { slug: string; meta?: ContentPageMetaUpdate }): string {
  return p.meta?.slug ?? p.slug;
}

// Shared column lists so every SELECT / RETURNING stays in lockstep.
const CONTENT_SUMMARY_COLUMNS =
  "slug, title, status, show_title, title_alignment, page_type, display_mode, overlay_width, content_card_style, created_by, updated_by, created_at, updated_at";
const CONTENT_COLUMNS = `slug, title, content, status, show_title, title_alignment, page_type, display_mode, overlay_width, content_card_style, created_by, updated_by, created_at, updated_at, content_updated_at`;

interface ContentPageSummarySqlRow {
  slug: string;
  title: string;
  status: string;
  show_title: boolean;
  title_alignment: string;
  page_type: string;
  display_mode: string;
  overlay_width: string;
  content_card_style: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date | null;
  segments?: { position: number; label: string; targetSlug: string }[];
}

interface ContentPageSqlRow extends ContentPageSummarySqlRow {
  content: string;
  content_updated_at: Date;
}

function rowToContentPageSummary(row: ContentPageSummarySqlRow): ContentPageSummaryRow {
  return {
    slug: row.slug,
    title: row.title,
    status: row.status as ContentStatus,
    showTitle: row.show_title,
    titleAlignment: row.title_alignment as PageTitleAlignment,
    pageType: row.page_type as PageType,
    displayMode: row.display_mode as PageDisplayMode,
    overlayWidth: row.overlay_width as OverlayWidth,
    contentCardStyle: row.content_card_style as ContentCardStyle,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.segments !== undefined && { segments: row.segments }),
  };
}

interface ContentPageTranslationSqlRow {
  slug: string;
  locale: string;
  title: string;
  content: string;
  source_updated_at: Date | null;
  updated_at: Date;
  updated_by: string | null;
}

function rowToContentPageTranslation(row: ContentPageTranslationSqlRow): ContentPageTranslationRow {
  return {
    slug: row.slug,
    locale: row.locale,
    title: row.title,
    content: row.content,
    sourceUpdatedAt: row.source_updated_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function rowToContentPage(row: ContentPageSqlRow): ContentPageRow {
  return { ...rowToContentPageSummary(row), content: row.content, contentUpdatedAt: row.content_updated_at };
}

interface NavItemSqlRow {
  id: number;
  nav_id: string;
  page_slug: string | null;
  url: string | null;
  target: string;
  position: number;
  label: string | null;
  label_updated_at: Date;
  page_title: string | null;
  page_type: string | null;
  display_mode: string | null;
  overlay_width: string | null;
}

async function insertAppTelemetryEvent(
  pool: InstanceType<typeof pgModule.default.Pool>,
  row: AppTelemetryEventInput,
): Promise<void> {
  await pool.query(
    `INSERT INTO app_telemetry_events
       (event_type, event_time, install_id, app_version, build_number,
        platform, os_version, device_model, locale,
        source_url, service, error_kind, http_status, message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      row.eventType,
      row.eventTime,
      row.installId,
      row.appVersion,
      row.buildNumber,
      row.platform,
      row.osVersion,
      row.deviceModel,
      row.locale,
      row.sourceUrl,
      row.service,
      row.errorKind,
      row.httpStatus,
      row.message,
    ],
  );
}

async function insertWebsiteAnalyticsBatch(
  pool: InstanceType<typeof pgModule.default.Pool>,
  batch: WebsiteAnalyticsBatchInput,
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO analytics_sessions
         (id, first_seen_at, last_seen_at, device_key, network_cluster_key,
          confidence, entry_path, exit_path, pageview_count, event_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0)
       ON CONFLICT (id) DO UPDATE SET
         first_seen_at = LEAST(analytics_sessions.first_seen_at, EXCLUDED.first_seen_at),
         last_seen_at = GREATEST(analytics_sessions.last_seen_at, EXCLUDED.last_seen_at),
         device_key = COALESCE(analytics_sessions.device_key, EXCLUDED.device_key),
         network_cluster_key = EXCLUDED.network_cluster_key,
         confidence = EXCLUDED.confidence,
         entry_path = COALESCE(analytics_sessions.entry_path, EXCLUDED.entry_path),
         exit_path = COALESCE(EXCLUDED.exit_path, analytics_sessions.exit_path)`,
      [
        batch.session.id,
        batch.session.firstSeenAt,
        batch.session.lastSeenAt,
        batch.session.deviceKey,
        batch.session.networkClusterKey,
        batch.session.confidence,
        batch.session.entryPath,
        batch.session.exitPath,
      ],
    );

    let inserted = 0;
    let insertedPageviews = 0;
    const insertedEvents: WebsiteAnalyticsEventInput[] = [];
    for (const event of batch.events) {
      const result = await client.query(
        `INSERT INTO analytics_events
           (id, occurred_at, event_type, session_id, device_key, network_cluster_key,
            confidence, path, route_template, referrer_domain, device_class, browser_family,
            browser_version, os_family, os_version, device_brand, device_model, device_model_code,
            is_bot, bot_name, bot_category, geo_country_code, geo_region_code, geo_region_name,
            geo_city, geo_latitude, geo_longitude, geo_accuracy_radius_km, geo_time_zone, geo_provider,
            geo_database_build_at, platform, media_type, short_id, surface, element_key, x_pct, y_pct,
            viewport_bucket, event_data)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
            $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36,
            $37, $38, $39, $40)
         ON CONFLICT (id) DO NOTHING`,
        [
          event.id,
          event.occurredAt,
          event.eventType,
          event.sessionId,
          event.deviceKey,
          event.networkClusterKey,
          event.confidence,
          event.path,
          event.routeTemplate,
          event.referrerDomain,
          event.deviceClass,
          event.browserFamily,
          event.browserVersion,
          event.osFamily,
          event.osVersion,
          event.deviceBrand,
          event.deviceModel,
          event.deviceModelCode,
          event.isBot,
          event.botName,
          event.botCategory,
          event.geoCountryCode,
          event.geoRegionCode,
          event.geoRegionName,
          event.geoCity,
          event.geoLatitude,
          event.geoLongitude,
          event.geoAccuracyRadiusKm,
          event.geoTimeZone,
          event.geoProvider,
          event.geoDatabaseBuildAt,
          event.platform,
          event.mediaType,
          event.shortId,
          event.surface,
          event.elementKey,
          event.xPct,
          event.yPct,
          event.viewportBucket,
          event.eventData,
        ],
      );
      if (result.rowCount === 1) {
        inserted += 1;
        insertedEvents.push(event);
        if (event.eventType === "page_view") insertedPageviews += 1;
      }
    }

    if (inserted > 0) {
      await client.query(
        `UPDATE analytics_sessions
         SET pageview_count = pageview_count + $2,
             event_count = event_count + $3
         WHERE id = $1`,
        [batch.session.id, insertedPageviews, inserted],
      );
      await refreshWebsiteAnalyticsDailySummaries(client, insertedEvents);
    }

    await client.query("COMMIT");
    return inserted;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function refreshWebsiteAnalyticsDailySummaries(
  client: PoolClient,
  insertedEvents: WebsiteAnalyticsEventInput[],
): Promise<void> {
  const affected = new Map<string, { day: string; networkClusterKey: string }>();
  for (const event of insertedEvents) {
    const day = event.occurredAt.toISOString().slice(0, 10);
    const key = `${day}:${event.networkClusterKey}`;
    affected.set(key, { day, networkClusterKey: event.networkClusterKey });
  }

  for (const { day, networkClusterKey } of affected.values()) {
    await client.query(
      `INSERT INTO analytics_cluster_daily_summaries
         (day, network_cluster_key, confidence, device_count, session_count,
          event_count, pageview_count, search_count, resolve_count, listen_on_click_count,
          similar_artist_click_count, popular_track_click_count, upcoming_event_click_count,
          player_start_count, info_page_click_count, help_page_click_count, ui_click_count,
          updated_at)
       SELECT
          (occurred_at AT TIME ZONE 'UTC')::date AS day,
          network_cluster_key,
          MAX(confidence) AS confidence,
          COUNT(DISTINCT device_key)::int AS device_count,
          COUNT(DISTINCT session_id)::int AS session_count,
          COUNT(*)::int AS event_count,
          COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS pageview_count,
          COUNT(*) FILTER (WHERE event_type = 'search_submitted')::int AS search_count,
          COUNT(*) FILTER (
            WHERE event_type = 'resolve_succeeded'
              AND (platform IS NULL OR platform = ANY($3::text[]))
          )::int AS resolve_count,
          COUNT(*) FILTER (WHERE event_type = 'listen_on_clicked')::int AS listen_on_click_count,
          COUNT(*) FILTER (WHERE event_type = 'similar_artist_clicked')::int AS similar_artist_click_count,
          COUNT(*) FILTER (WHERE event_type = 'popular_track_clicked')::int AS popular_track_click_count,
          COUNT(*) FILTER (WHERE event_type = 'upcoming_event_clicked')::int AS upcoming_event_click_count,
          COUNT(*) FILTER (WHERE event_type = 'player_started')::int AS player_start_count,
          COUNT(*) FILTER (WHERE event_type = 'info_page_clicked')::int AS info_page_click_count,
          COUNT(*) FILTER (WHERE event_type = 'help_page_clicked')::int AS help_page_click_count,
          COUNT(*) FILTER (WHERE event_type = 'ui_click')::int AS ui_click_count,
          NOW() AS updated_at
       FROM analytics_events
       WHERE (occurred_at AT TIME ZONE 'UTC')::date = $1::date
         AND network_cluster_key = $2
         AND COALESCE(is_bot, false) = false
       GROUP BY (occurred_at AT TIME ZONE 'UTC')::date, network_cluster_key
       ON CONFLICT (day, network_cluster_key) DO UPDATE SET
          confidence = EXCLUDED.confidence,
          device_count = EXCLUDED.device_count,
          session_count = EXCLUDED.session_count,
          event_count = EXCLUDED.event_count,
          pageview_count = EXCLUDED.pageview_count,
          search_count = EXCLUDED.search_count,
          resolve_count = EXCLUDED.resolve_count,
          listen_on_click_count = EXCLUDED.listen_on_click_count,
          similar_artist_click_count = EXCLUDED.similar_artist_click_count,
          popular_track_click_count = EXCLUDED.popular_track_click_count,
          upcoming_event_click_count = EXCLUDED.upcoming_event_click_count,
          player_start_count = EXCLUDED.player_start_count,
          info_page_click_count = EXCLUDED.info_page_click_count,
          help_page_click_count = EXCLUDED.help_page_click_count,
          ui_click_count = EXCLUDED.ui_click_count,
          updated_at = NOW()`,
      [day, networkClusterKey, WEBSITE_ANALYTICS_MUSIC_SOURCE_PLATFORMS],
    );
  }
}

async function queryWebsiteAnalyticsTotals(
  pool: InstanceType<typeof pgModule.default.Pool>,
  since: Date,
  until: Date | null = null,
): Promise<WebsiteAnalyticsOverview["totals"]> {
  const result = await pool.query<WebsiteAnalyticsTotalsRow>(
    `SELECT
      COUNT(DISTINCT network_cluster_key)::int AS clusters,
      COUNT(DISTINCT device_key) FILTER (WHERE device_key IS NOT NULL)::int AS devices,
      COUNT(DISTINCT session_id)::int AS sessions,
      COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS pageviews,
      COUNT(*) FILTER (WHERE event_type = 'search_submitted')::int AS searches,
      COUNT(*) FILTER (
        WHERE event_type = 'resolve_succeeded'
          AND (platform IS NULL OR platform = ANY($3::text[]))
      )::int AS resolves,
      COUNT(*) FILTER (WHERE event_type = 'listen_on_clicked')::int AS listen_on,
      COUNT(*) FILTER (WHERE event_type = 'player_started')::int AS player_starts,
      COUNT(*) FILTER (WHERE event_type = ANY($4::text[]))::int AS interactions
    FROM analytics_events
    WHERE occurred_at >= $1
      AND ($2::timestamptz IS NULL OR occurred_at < $2)
      AND COALESCE(is_bot, false) = false`,
    [since, until, WEBSITE_ANALYTICS_MUSIC_SOURCE_PLATFORMS, WEBSITE_ANALYTICS_INTERACTION_EVENT_TYPES],
  );
  const row = result.rows[0];
  return {
    clusters: Number(row?.clusters ?? 0),
    devices: Number(row?.devices ?? 0),
    sessions: Number(row?.sessions ?? 0),
    pageviews: Number(row?.pageviews ?? 0),
    searches: Number(row?.searches ?? 0),
    resolves: Number(row?.resolves ?? 0),
    listenOn: Number(row?.listen_on ?? 0),
    playerStarts: Number(row?.player_starts ?? 0),
    interactions: Number(row?.interactions ?? 0),
  };
}

function websiteAnalyticsTrend(current: number, previous: number): WebsiteAnalyticsTrend {
  if (previous === 0) {
    return current > 0 ? { change: null, status: "new" } : { change: null, status: "none" };
  }
  return { change: ((current - previous) / previous) * 100, status: "changed" };
}

function buildWebsiteAnalyticsTrends(
  current: WebsiteAnalyticsOverview["totals"],
  previous: WebsiteAnalyticsOverview["totals"] | null,
): WebsiteAnalyticsOverview["trends"] {
  if (!previous) {
    return {
      clusters: { change: null, status: "none" },
      devices: { change: null, status: "none" },
      sessions: { change: null, status: "none" },
      pageviews: { change: null, status: "none" },
      searches: { change: null, status: "none" },
      resolves: { change: null, status: "none" },
      listenOn: { change: null, status: "none" },
      playerStarts: { change: null, status: "none" },
      interactions: { change: null, status: "none" },
    };
  }

  return {
    clusters: websiteAnalyticsTrend(current.clusters, previous.clusters),
    devices: websiteAnalyticsTrend(current.devices, previous.devices),
    sessions: websiteAnalyticsTrend(current.sessions, previous.sessions),
    pageviews: websiteAnalyticsTrend(current.pageviews, previous.pageviews),
    searches: websiteAnalyticsTrend(current.searches, previous.searches),
    resolves: websiteAnalyticsTrend(current.resolves, previous.resolves),
    listenOn: websiteAnalyticsTrend(current.listenOn, previous.listenOn),
    playerStarts: websiteAnalyticsTrend(current.playerStarts, previous.playerStarts),
    interactions: websiteAnalyticsTrend(current.interactions, previous.interactions),
  };
}

async function getWebsiteAnalyticsOverview(
  pool: InstanceType<typeof pgModule.default.Pool>,
  since: Date,
  comparison?: { since: Date; until: Date },
): Promise<WebsiteAnalyticsOverview> {
  const comparisonTotalsPromise = comparison
    ? queryWebsiteAnalyticsTotals(pool, comparison.since, comparison.until)
    : Promise.resolve<WebsiteAnalyticsOverview["totals"] | null>(null);
  const [
    totals,
    comparisonTotals,
    platforms,
    environmentBrowsers,
    environmentOs,
    environmentDevices,
    botTraffic,
    clusters,
    referrers,
    searchIntents,
    interactions,
    searches,
    recentEvents,
  ] = await Promise.all([
    queryWebsiteAnalyticsTotals(pool, since),
    comparisonTotalsPromise,
    pool.query(
      `SELECT COALESCE(platform, 'unknown') AS platform, COUNT(*)::int AS resolves
       FROM analytics_events
       WHERE occurred_at >= $1
         AND COALESCE(is_bot, false) = false
         AND event_type = 'resolve_succeeded'
         AND (platform IS NULL OR platform = ANY($2::text[]))
       GROUP BY COALESCE(platform, 'unknown')
       ORDER BY resolves DESC, platform ASC
       LIMIT 8`,
      [since, WEBSITE_ANALYTICS_MUSIC_SOURCE_PLATFORMS],
    ),
    pool.query<WebsiteAnalyticsEnvironmentSummaryRow>(
      `SELECT COALESCE(NULLIF(browser_family, ''), 'unknown') AS value,
        COUNT(DISTINCT COALESCE(device_key, session_id::text))::int AS visitors
       FROM analytics_events
       WHERE occurred_at >= $1
         AND COALESCE(is_bot, false) = false
       GROUP BY COALESCE(NULLIF(browser_family, ''), 'unknown')
       ORDER BY visitors DESC, value ASC
       LIMIT 12`,
      [since],
    ),
    pool.query<WebsiteAnalyticsEnvironmentSummaryRow>(
      `SELECT COALESCE(NULLIF(os_family, ''), 'unknown') AS value,
        COUNT(DISTINCT COALESCE(device_key, session_id::text))::int AS visitors
       FROM analytics_events
       WHERE occurred_at >= $1
         AND COALESCE(is_bot, false) = false
       GROUP BY COALESCE(NULLIF(os_family, ''), 'unknown')
       ORDER BY visitors DESC, value ASC
       LIMIT 12`,
      [since],
    ),
    pool.query<WebsiteAnalyticsEnvironmentSummaryRow>(
      `WITH device_values AS (
        SELECT
          CASE
            WHEN LENGTH(TRIM(COALESCE(device_model, ''))) >= 3 THEN TRIM(device_model)
            ELSE COALESCE(NULLIF(device_class, ''), 'unknown')
          END AS value,
          COALESCE(device_key, session_id::text) AS visitor_key
        FROM analytics_events
        WHERE occurred_at >= $1
          AND COALESCE(is_bot, false) = false
       )
       SELECT value, COUNT(DISTINCT visitor_key)::int AS visitors
       FROM device_values
       GROUP BY value
       ORDER BY visitors DESC, value ASC
       LIMIT 12`,
      [since],
    ),
    pool.query<WebsiteAnalyticsBotTrafficSummaryRow>(
      `SELECT
        COALESCE(NULLIF(bot_name, ''), 'Unknown bot') AS bot,
        NULLIF(bot_category, '') AS category,
        COUNT(*)::int AS events,
        COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS pageviews
       FROM analytics_events
       WHERE occurred_at >= $1
         AND COALESCE(is_bot, false) = true
       GROUP BY COALESCE(NULLIF(bot_name, ''), 'Unknown bot'), NULLIF(bot_category, '')
       ORDER BY events DESC, pageviews DESC, bot ASC
       LIMIT 12`,
      [since],
    ),
    pool.query(
      `WITH cluster_summaries AS (
          SELECT
            network_cluster_key,
            MAX(confidence) AS confidence,
            SUM(search_count)::int AS searches
          FROM analytics_cluster_daily_summaries
          WHERE day >= ($1::timestamptz AT TIME ZONE 'UTC')::date
          GROUP BY network_cluster_key
        ),
        cluster_events AS (
          SELECT DISTINCT ON (network_cluster_key)
            network_cluster_key,
            occurred_at AS last_seen_at
          FROM analytics_events
          WHERE occurred_at >= $1
            AND COALESCE(is_bot, false) = false
          ORDER BY network_cluster_key, occurred_at DESC
        ),
        cluster_devices AS (
          SELECT
            network_cluster_key,
            COUNT(DISTINCT device_key) FILTER (WHERE device_key IS NOT NULL)::int AS devices
          FROM analytics_events
          WHERE occurred_at >= $1
            AND COALESCE(is_bot, false) = false
          GROUP BY network_cluster_key
        ),
        cluster_queries AS (
          SELECT DISTINCT ON (network_cluster_key)
            e.network_cluster_key,
            ${WEBSITE_ANALYTICS_SEARCH_DESCRIPTOR_SELECT}
          FROM analytics_events e
          ${WEBSITE_ANALYTICS_SUBJECT_JOIN}
          WHERE e.occurred_at >= $1
            AND COALESCE(e.is_bot, false) = false
            AND e.event_type = 'search_submitted'
            AND NULLIF(e.event_data->>'query_normalized', '') IS NOT NULL
          ORDER BY e.network_cluster_key, e.occurred_at DESC
        )
        SELECT
          cs.network_cluster_key,
          CONCAT('#', RIGHT(cs.network_cluster_key, 6)) AS cluster,
          cs.confidence,
          COALESCE(cd.devices, 0)::int AS devices,
          cs.searches,
          ce.last_seen_at,
          cq.query_type AS top_query_type,
          cq.platform AS top_query_platform,
          cq.label AS top_query_label,
          cq.subject_type AS top_query_subject_type,
          cq.subject_title AS top_query_subject_title,
          cq.subject_artist AS top_query_subject_artist,
          cq.subject_artwork_url AS top_query_subject_artwork_url
        FROM cluster_summaries cs
        LEFT JOIN cluster_events ce ON ce.network_cluster_key = cs.network_cluster_key
        LEFT JOIN cluster_devices cd ON cd.network_cluster_key = cs.network_cluster_key
        LEFT JOIN cluster_queries cq ON cq.network_cluster_key = cs.network_cluster_key
        ORDER BY cs.searches DESC, COALESCE(cd.devices, 0) DESC, ce.last_seen_at DESC NULLS LAST
        LIMIT 8`,
      [since],
    ),
    pool.query(
      `SELECT
        COALESCE(NULLIF(referrer_domain, ''), 'direct') AS referrer_domain,
        COALESCE(route_template, path, 'unknown') AS route_template,
        COUNT(*)::int AS pageviews,
        COUNT(DISTINCT network_cluster_key)::int AS clusters
       FROM analytics_events
       WHERE occurred_at >= $1
         AND COALESCE(is_bot, false) = false
         AND event_type = 'page_view'
         AND COALESCE(route_template, path) IN ('/', '/:shortId')
       GROUP BY COALESCE(NULLIF(referrer_domain, ''), 'direct'), COALESCE(route_template, path, 'unknown')
       ORDER BY pageviews DESC, referrer_domain ASC
       LIMIT 12`,
      [since],
    ),
    pool.query(
      `SELECT
        COALESCE(NULLIF(event_data->>'query_type', ''), 'unknown') AS intent,
        COUNT(*)::int AS searches,
        COUNT(DISTINCT network_cluster_key)::int AS clusters
       FROM analytics_events
       WHERE occurred_at >= $1
         AND COALESCE(is_bot, false) = false
         AND event_type = 'search_submitted'
       GROUP BY COALESCE(NULLIF(event_data->>'query_type', ''), 'unknown')
       ORDER BY searches DESC, clusters DESC, intent ASC
       LIMIT 8`,
      [since],
    ),
    pool.query<WebsiteAnalyticsInteractionSummaryRow>(
      `WITH interaction_events AS (
        SELECT
          event_type,
          CASE
            WHEN event_type = 'ui_click'
              THEN COALESCE(
                NULLIF(event_data->>'label', ''),
                NULLIF(element_key, ''),
                NULLIF(surface, ''),
                'ui_click'
              )
            WHEN event_type = 'listen_on_clicked'
              THEN COALESCE(
                NULLIF(platform, ''),
                NULLIF(event_data->>'service', ''),
                NULLIF(event_data->>'label', ''),
                'listen_on_clicked'
              )
            WHEN event_type IN ('info_page_clicked', 'help_page_clicked')
              THEN COALESCE(
                NULLIF(event_data->>'label', ''),
                NULLIF(event_data->>'slug', ''),
                NULLIF(element_key, ''),
                event_type
              )
            WHEN event_type IN ('popular_track_clicked', 'similar_artist_clicked')
              THEN COALESCE(
                NULLIF(event_data->>'label', ''),
                NULLIF(event_data->>'track_title', ''),
                NULLIF(event_data->>'artist_name', ''),
                event_type
              )
            WHEN event_type = 'upcoming_event_clicked'
              THEN COALESCE(
                NULLIF(event_data->>'label', ''),
                NULLIF(event_data->>'provider', ''),
                event_type
              )
            ELSE event_type
          END AS label,
          NULLIF(surface, '') AS surface,
          NULLIF(element_key, '') AS element_key,
          COALESCE(NULLIF(platform, ''), NULLIF(event_data->>'service', ''), NULLIF(event_data->>'provider', '')) AS platform
        FROM analytics_events
        WHERE occurred_at >= $1
          AND COALESCE(is_bot, false) = false
          AND event_type = ANY($2::text[])
       )
       SELECT event_type, label, surface, element_key, platform, COUNT(*)::int AS count
       FROM interaction_events
       GROUP BY event_type, label, surface, element_key, platform
       ORDER BY count DESC, event_type ASC, label ASC
       LIMIT 12`,
      [since, WEBSITE_ANALYTICS_INTERACTION_EVENT_TYPES],
    ),
    pool.query<WebsiteAnalyticsSearchSummaryRow>(
      `WITH search_events AS (
        SELECT
          e.network_cluster_key,
          ${WEBSITE_ANALYTICS_SEARCH_DESCRIPTOR_SELECT}
        FROM analytics_events e
        ${WEBSITE_ANALYTICS_SUBJECT_JOIN}
        WHERE e.occurred_at >= $1
          AND COALESCE(e.is_bot, false) = false
          AND e.event_type = 'search_submitted'
          AND NULLIF(e.event_data->>'query_normalized', '') IS NOT NULL
       )
       SELECT
        query_type,
        platform,
        label,
        subject_type,
        subject_title,
        subject_artist,
        subject_artwork_url,
        COUNT(*)::int AS searches,
        COUNT(DISTINCT network_cluster_key)::int AS clusters
       FROM search_events
       GROUP BY query_type, platform, label, subject_type, subject_title, subject_artist, subject_artwork_url
       ORDER BY searches DESC, clusters DESC, label ASC
       LIMIT 10`,
      [since],
    ),
    pool.query<WebsiteAnalyticsPathEventRow>(
      `SELECT
        ${WEBSITE_ANALYTICS_PATH_EVENT_SELECT}
       FROM analytics_events e
       ${WEBSITE_ANALYTICS_SUBJECT_JOIN}
       WHERE e.occurred_at >= $1
         AND COALESCE(e.is_bot, false) = false
       ORDER BY e.occurred_at DESC
       LIMIT 18`,
      [since],
    ),
  ]);

  return {
    totals,
    trends: buildWebsiteAnalyticsTrends(totals, comparisonTotals),
    environment: {
      browsers: environmentBrowsers.rows.map((row) => ({
        value: String(row.value ?? "unknown"),
        visitors: Number(row.visitors),
      })),
      os: environmentOs.rows.map((row) => ({
        value: String(row.value ?? "unknown"),
        visitors: Number(row.visitors),
      })),
      devices: environmentDevices.rows.map((row) => ({
        value: String(row.value ?? "unknown"),
        visitors: Number(row.visitors),
      })),
    },
    botTraffic: botTraffic.rows.map((row) => ({
      bot: String(row.bot ?? "Unknown bot"),
      category: row.category,
      events: Number(row.events),
      pageviews: Number(row.pageviews),
    })),
    platforms: platforms.rows.map((row) => ({ platform: String(row.platform), resolves: Number(row.resolves) })),
    clusters: clusters.rows.map((row) => ({
      clusterKey: String(row.network_cluster_key),
      cluster: String(row.cluster),
      confidence: String(row.confidence ?? "low"),
      devices: Number(row.devices),
      searches: Number(row.searches),
      lastSeenAt:
        row.last_seen_at instanceof Date
          ? row.last_seen_at.toISOString()
          : row.last_seen_at
            ? String(row.last_seen_at)
            : "",
      topQuery: rowToWebsiteAnalyticsSearchDescriptor({
        query_type: row.top_query_type,
        platform: row.top_query_platform,
        label: row.top_query_label,
        subject_type: row.top_query_subject_type,
        subject_title: row.top_query_subject_title,
        subject_artist: row.top_query_subject_artist,
        subject_artwork_url: row.top_query_subject_artwork_url,
      }),
    })),
    referrers: referrers.rows.map((row) => ({
      referrerDomain: String(row.referrer_domain),
      routeTemplate: row.route_template,
      pageviews: Number(row.pageviews),
      clusters: Number(row.clusters),
    })),
    searchIntents: searchIntents.rows.map((row) => ({
      intent: String(row.intent),
      searches: Number(row.searches),
      clusters: Number(row.clusters),
    })),
    interactions: interactions.rows.map((row) => ({
      eventType: String(row.event_type),
      label: row.label,
      surface: row.surface,
      elementKey: row.element_key,
      platform: row.platform,
      count: Number(row.count),
    })),
    searches: searches.rows.map((row) => {
      const descriptor = rowToWebsiteAnalyticsSearchDescriptor(row) ?? {
        label: "unknown",
        platform: null,
        queryType: null,
        subject: null,
      };
      return {
        ...descriptor,
        searches: Number(row.searches),
        clusters: Number(row.clusters),
      };
    }),
    recentEvents: recentEvents.rows.map(rowToWebsiteAnalyticsPathEvent),
  };
}

function rowToWebsiteAnalyticsPathEvent(row: WebsiteAnalyticsPathEventRow): WebsiteAnalyticsPathEvent {
  return {
    id: row.id,
    occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at),
    eventType: row.event_type,
    sessionId: row.session_id,
    deviceKey: row.device_key,
    clusterKey: row.network_cluster_key,
    cluster: row.cluster,
    confidence: row.confidence,
    path: row.path,
    routeTemplate: row.route_template,
    referrerDomain: row.referrer_domain,
    deviceClass: row.device_class,
    browserFamily: row.browser_family,
    browserVersion: row.browser_version,
    osFamily: row.os_family,
    osVersion: row.os_version,
    deviceBrand: row.device_brand,
    deviceModel: row.device_model,
    deviceModelCode: row.device_model_code,
    isBot: Boolean(row.is_bot),
    botName: row.bot_name,
    botCategory: row.bot_category,
    surface: row.surface,
    platform: row.platform,
    mediaType: row.media_type,
    shortId: row.short_id,
    elementKey: row.element_key,
    label: row.label,
    eventData: row.event_data,
    subject:
      row.subject_type && row.subject_title
        ? {
            type: row.subject_type,
            title: row.subject_title,
            artist: row.subject_artist,
            artworkUrl: row.subject_artwork_url,
          }
        : null,
  };
}

function rowToWebsiteAnalyticsSearchDescriptor(
  row: WebsiteAnalyticsSearchDescriptorRow,
): WebsiteAnalyticsSearchDescriptor | null {
  const label = row.label?.trim();
  if (!label) return null;
  return {
    label,
    queryType: row.query_type,
    platform: row.platform,
    subject:
      row.subject_type && row.subject_title
        ? {
            type: row.subject_type,
            title: row.subject_title,
            artist: row.subject_artist,
            artworkUrl: row.subject_artwork_url,
          }
        : null,
  };
}

function dateToIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function websiteAnalyticsFilterSql(
  params: WebsiteAnalyticsDrilldownParams,
  tableAlias?: string,
): {
  where: string;
  values: unknown[];
} {
  const column = (name: string) => (tableAlias ? `${tableAlias}.${name}` : name);
  const clauses = [`${column("occurred_at")} >= $1`, `COALESCE(${column("is_bot")}, false) = false`];
  const values: unknown[] = [params.since];

  if (params.clusterKey) {
    values.push(params.clusterKey);
    clauses.push(`${column("network_cluster_key")} = $${values.length}`);
  }
  if (params.deviceKey) {
    values.push(params.deviceKey);
    clauses.push(`${column("device_key")} = $${values.length}`);
  }
  if (params.sessionId) {
    values.push(params.sessionId);
    clauses.push(`${column("session_id")} = $${values.length}`);
  }

  return { where: clauses.join(" AND "), values };
}

async function getWebsiteAnalyticsDrilldown(
  pool: InstanceType<typeof pgModule.default.Pool>,
  params: WebsiteAnalyticsDrilldownParams,
): Promise<WebsiteAnalyticsDrilldown> {
  const filter = websiteAnalyticsFilterSql(params);
  const eventFilter = websiteAnalyticsFilterSql(params, "e");
  const [devices, sessions, events] = await Promise.all([
    pool.query<WebsiteAnalyticsDeviceSummaryRow>(
      `SELECT
        device_key,
        CASE WHEN device_key IS NULL THEN 'unknown' ELSE CONCAT('#', RIGHT(device_key, 6)) END AS label,
        COUNT(DISTINCT session_id)::int AS sessions,
        COUNT(*)::int AS events,
        MAX(occurred_at) AS last_seen_at,
        MAX(device_class) AS device_class,
        MAX(browser_family) AS browser_family,
        MAX(browser_version) AS browser_version,
        MAX(os_family) AS os_family,
        MAX(os_version) AS os_version,
        MAX(device_brand) AS device_brand,
        MAX(device_model) AS device_model,
        MAX(device_model_code) AS device_model_code
       FROM analytics_events
       WHERE ${filter.where}
       GROUP BY device_key
       ORDER BY events DESC, last_seen_at DESC
       LIMIT 24`,
      filter.values,
    ),
    pool.query<WebsiteAnalyticsSessionSummaryRow>(
      `SELECT
        e.session_id::text,
        MAX(e.device_key) AS device_key,
        MAX(e.network_cluster_key) AS network_cluster_key,
        CONCAT('#', RIGHT(MAX(e.network_cluster_key), 6)) AS cluster,
        COUNT(*)::int AS events,
        COUNT(*) FILTER (WHERE e.event_type = 'page_view')::int AS pageviews,
        MIN(e.occurred_at) AS first_seen_at,
        MAX(e.occurred_at) AS last_seen_at,
        MAX(s.entry_path) AS entry_path,
        MAX(s.exit_path) AS exit_path
       FROM analytics_events e
       LEFT JOIN analytics_sessions s ON s.id = e.session_id
       WHERE ${eventFilter.where}
       GROUP BY e.session_id
       ORDER BY last_seen_at DESC
       LIMIT 24`,
      eventFilter.values,
    ),
    pool.query<WebsiteAnalyticsPathEventRow>(
      `SELECT
        ${WEBSITE_ANALYTICS_PATH_EVENT_SELECT}
       FROM analytics_events e
       ${WEBSITE_ANALYTICS_SUBJECT_JOIN}
       WHERE ${eventFilter.where}
       ORDER BY e.occurred_at ASC
       LIMIT 200`,
      eventFilter.values,
    ),
  ]);

  return {
    filters: {
      clusterKey: params.clusterKey ?? null,
      deviceKey: params.deviceKey ?? null,
      sessionId: params.sessionId ?? null,
    },
    devices: devices.rows.map((row) => ({
      deviceKey: row.device_key,
      label: row.label,
      sessions: Number(row.sessions),
      events: Number(row.events),
      lastSeenAt: dateToIso(row.last_seen_at),
      deviceClass: row.device_class,
      browserFamily: row.browser_family,
      browserVersion: row.browser_version,
      osFamily: row.os_family,
      osVersion: row.os_version,
      deviceBrand: row.device_brand,
      deviceModel: row.device_model,
      deviceModelCode: row.device_model_code,
    })),
    sessions: sessions.rows.map((row) => ({
      sessionId: row.session_id,
      deviceKey: row.device_key,
      clusterKey: row.network_cluster_key,
      cluster: row.cluster,
      events: Number(row.events),
      pageviews: Number(row.pageviews),
      firstSeenAt: dateToIso(row.first_seen_at),
      lastSeenAt: dateToIso(row.last_seen_at),
      entryPath: row.entry_path,
      exitPath: row.exit_path,
    })),
    events: events.rows.map(rowToWebsiteAnalyticsPathEvent),
  };
}

async function exportWebsiteAnalytics(
  pool: InstanceType<typeof pgModule.default.Pool>,
  since: Date,
): Promise<WebsiteAnalyticsExport> {
  const [overview, drilldown] = await Promise.all([
    getWebsiteAnalyticsOverview(pool, since),
    getWebsiteAnalyticsDrilldown(pool, { since }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    since: since.toISOString(),
    retentionPolicy: WEBSITE_ANALYTICS_RETENTION_POLICY,
    overview,
    drilldown,
  };
}

async function runWebsiteAnalyticsRetention(
  pool: InstanceType<typeof pgModule.default.Pool>,
  now: Date,
): Promise<WebsiteAnalyticsRetentionResult> {
  const rawCutoff = new Date(now.getTime() - WEBSITE_ANALYTICS_RETENTION_POLICY.rawEventsDays * 24 * 60 * 60 * 1000);
  const summaryCutoff = new Date(
    now.getTime() - WEBSITE_ANALYTICS_RETENTION_POLICY.summariesDays * 24 * 60 * 60 * 1000,
  );
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const deletedEvents = await client.query("DELETE FROM analytics_events WHERE occurred_at < $1", [rawCutoff]);
    const deletedSessions = await client.query(
      `DELETE FROM analytics_sessions s
       WHERE s.last_seen_at < $1
         AND NOT EXISTS (SELECT 1 FROM analytics_events e WHERE e.session_id = s.id)`,
      [rawCutoff],
    );
    const deletedSummaries = await client.query("DELETE FROM analytics_cluster_daily_summaries WHERE day < $1::date", [
      summaryCutoff,
    ]);
    await client.query("COMMIT");

    return {
      policy: WEBSITE_ANALYTICS_RETENTION_POLICY,
      deletedEvents: deletedEvents.rowCount ?? 0,
      deletedSessions: deletedSessions.rowCount ?? 0,
      deletedSummaries: deletedSummaries.rowCount ?? 0,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function rowToNavItem(row: NavItemSqlRow): NavItemRow {
  return {
    id: row.id,
    navId: row.nav_id as NavId,
    pageSlug: row.page_slug,
    pageTitle: row.page_title,
    url: row.url,
    target: row.target as NavTarget,
    label: row.label,
    position: row.position,
    labelUpdatedAt: row.label_updated_at,
    pageType: row.page_type === null ? null : (row.page_type as PageType),
    pageDisplayMode: row.display_mode === null ? null : (row.display_mode as PageDisplayMode),
    pageOverlayWidth: row.overlay_width === null ? null : (row.overlay_width as OverlayWidth),
  };
}

function rowToArtistIdentityEvent(row: ArtistIdentityEventSqlRow): ArtistIdentityEventRecord {
  return {
    eventId: row.event_id,
    artistEntityId: row.artist_entity_id,
    entityType: row.entity_type,
    verificationStatus: row.verification_status,
    displayName: row.display_name,
    eventType: row.event_type,
    dateValue: row.date_value,
    datePrecision: row.date_precision,
    eventYear: row.event_year,
    eventMonth: row.event_month,
    eventDay: row.event_day,
    placeName: row.place_name,
    countryCode: row.country_code,
    sourceProvider: row.source_provider,
    sourceUrl: row.source_url,
    confidence: row.confidence,
  };
}

function rowToArtistGroupMembership(row: ArtistGroupMembershipSqlRow): ArtistGroupMembershipRecord {
  return {
    membershipId: row.membership_id,
    groupArtistEntityId: row.group_artist_entity_id,
    groupName: row.group_name,
    memberArtistEntityId: row.member_artist_entity_id,
    memberName: row.member_name,
    memberNameCredit: row.member_name_credit,
    roles: row.roles ?? [],
    beginDate: row.begin_date,
    beginDatePrecision: row.begin_date_precision,
    beginYear: row.begin_year,
    endDate: row.end_date,
    endDatePrecision: row.end_date_precision,
    endYear: row.end_year,
    isCurrent: row.is_current,
    sourceProvider: row.source_provider,
    sourceUrl: row.source_url,
    confidence: row.confidence,
  };
}

interface CrawlStateSqlRow {
  source: string;
  display_name: string;
  enabled: boolean;
  interval_minutes: number;
  next_run_at: Date;
  last_run_at: Date | null;
  cursor: unknown;
  config: Record<string, unknown> | null;
  running_since: Date | null;
  error_count: number;
  last_error: string | null;
  consecutive_errors: number;
}

interface CrawlRunSqlRow {
  id: string;
  source: string;
  started_at: Date;
  finished_at: Date | null;
  status: string;
  discovered: number;
  ingested: number;
  skipped: number;
  errors: number;
  notes: string | null;
}

function rowToCrawlStateRecord(row: CrawlStateSqlRow): CrawlStateRecord {
  return {
    source: row.source,
    displayName: row.display_name,
    enabled: row.enabled,
    intervalMinutes: row.interval_minutes,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    cursor: row.cursor,
    config: row.config ?? {},
    runningSince: row.running_since,
    errorCount: row.error_count,
    lastError: row.last_error,
    consecutiveErrors: row.consecutive_errors,
  };
}
