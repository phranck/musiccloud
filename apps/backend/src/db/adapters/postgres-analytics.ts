/**
 * Website analytics and app telemetry persistence for the PostgreSQL adapter.
 *
 * Domain: raw analytics ingestion, session counters, daily summaries,
 * dashboard overview / geolocation / drilldown queries, JSON export and
 * retention cleanup.
 *
 * Excludes:
 *   - Core track / album / artist resolve persistence (see postgres-tracks.ts,
 *     postgres-albums.ts and postgres-artists.ts).
 *   - Admin catalog CRUD (see postgres-admin-catalog.ts).
 *   - Content pages, navigation and email templates (see postgres-content-*.ts).
 */

import type { Pool, PoolClient } from "pg";
import type {
  AppTelemetryEventInput,
  WebsiteAnalyticsBatchInput,
  WebsiteAnalyticsDrilldown,
  WebsiteAnalyticsDrilldownParams,
  WebsiteAnalyticsEventInput,
  WebsiteAnalyticsExport,
  WebsiteAnalyticsGeoActivity,
  WebsiteAnalyticsGeoOverview,
  WebsiteAnalyticsGeoParams,
  WebsiteAnalyticsOverview,
  WebsiteAnalyticsPathEvent,
  WebsiteAnalyticsRetentionPolicy,
  WebsiteAnalyticsRetentionResult,
  WebsiteAnalyticsSearchDescriptor,
  WebsiteAnalyticsTrend,
} from "../repository.js";

// ============================================================================
// ROW TYPES
// ============================================================================

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

interface WebsiteAnalyticsGeoPointRow {
  id: string;
  occurred_at: Date | string;
  event_type: string;
  activity: WebsiteAnalyticsGeoActivity;
  geo_latitude: number | string | null;
  geo_longitude: number | string | null;
  geo_accuracy_radius_km: number | string | null;
  geo_country_code: string | null;
  geo_region_code: string | null;
  geo_region_name: string | null;
  geo_city: string | null;
  path: string | null;
  route_template: string | null;
  surface: string | null;
  element_key: string | null;
  device_class: string | null;
  is_bot: boolean | null;
}

interface WebsiteAnalyticsGeoCountryRow {
  country_code: string | null;
  events: number | string | null;
  clusters: number | string | null;
  cities: number | string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  last_seen_at: Date | string;
}

interface WebsiteAnalyticsGeoLocationRow {
  country_code: string | null;
  region_code: string | null;
  region_name: string | null;
  city: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  events: number | string | null;
  clusters: number | string | null;
  last_seen_at: Date | string;
}

interface WebsiteAnalyticsGeoCoverageRow {
  total_events: number | string | null;
  geolocated_events: number | string | null;
  countries: number | string | null;
  latest_database_build_at: Date | string | null;
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

const WEBSITE_ANALYTICS_ACTIVITY_SQL = `CASE
  WHEN COALESCE(e.is_bot, false) THEN 'bot'
  WHEN e.event_type = 'page_view' THEN 'page_view'
  WHEN e.event_type = 'search_submitted' THEN 'search'
  WHEN e.event_type LIKE 'resolve_%' THEN 'resolve'
  WHEN e.event_type = 'listen_on_clicked' THEN 'listen'
  WHEN e.event_type LIKE 'player_%' THEN 'player'
  ELSE 'interaction'
END`;

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

// ============================================================================
// ANALYTICS-LOCAL SQL FRAGMENTS
// ============================================================================

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

/**
 * Persists one native-app telemetry event.
 *
 * Used by mobile / desktop clients to report non-website diagnostics
 * such as resolve failures, HTTP status codes and client build metadata.
 *
 * @param pool - Postgres connection pool.
 * @param row - Telemetry payload mapped to `app_telemetry_events`.
 */
export async function insertAppTelemetryEvent(pool: Pool, row: AppTelemetryEventInput): Promise<void> {
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

/**
 * Inserts a website analytics session snapshot and its event batch.
 *
 * The operation is transactional: session metadata, new raw events,
 * per-session counters and affected daily summaries are updated together.
 * Duplicate event ids are ignored so client retries stay idempotent.
 *
 * @param pool - Postgres connection pool.
 * @param batch - Session metadata plus raw website analytics events.
 * @returns Number of newly inserted events.
 * @throws Query errors propagate after transaction rollback.
 */
export async function insertWebsiteAnalyticsBatch(pool: Pool, batch: WebsiteAnalyticsBatchInput): Promise<number> {
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
  pool: Pool,
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

/**
 * Builds the website analytics dashboard overview for a time window.
 *
 * Aggregates top-level totals, optional comparison trends, platforms,
 * environment dimensions, bot traffic, referrers, search intents,
 * interaction summaries, search descriptors and recent events.
 *
 * @param pool - Postgres connection pool.
 * @param since - Inclusive lower bound for events.
 * @param comparison - Optional previous window used to calculate trends.
 * @returns Overview data for the admin analytics dashboard.
 */
export async function getWebsiteAnalyticsOverview(
  pool: Pool,
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

function nullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowToWebsiteAnalyticsGeoPoint(row: WebsiteAnalyticsGeoPointRow) {
  return {
    id: row.id,
    occurredAt: dateToIso(row.occurred_at),
    eventType: row.event_type,
    activity: row.activity,
    latitude: Number(row.geo_latitude),
    longitude: Number(row.geo_longitude),
    accuracyRadiusKm: nullableNumber(row.geo_accuracy_radius_km),
    countryCode: row.geo_country_code,
    regionCode: row.geo_region_code,
    regionName: row.geo_region_name,
    city: row.geo_city,
    path: row.path,
    routeTemplate: row.route_template,
    surface: row.surface,
    elementKey: row.element_key,
    deviceClass: row.device_class,
    isBot: Boolean(row.is_bot),
  };
}

/**
 * Builds geolocation coverage, country / city aggregates and recent map points.
 *
 * Only non-bot events with latitude and longitude feed the map layers;
 * the coverage block still reports how much of the selected raw traffic
 * could be geolocated.
 *
 * @param pool - Postgres connection pool.
 * @param params - Date bounds and realtime point limit.
 * @returns Geo analytics overview for the realtime map UI.
 */
export async function getWebsiteAnalyticsGeo(
  pool: Pool,
  params: WebsiteAnalyticsGeoParams,
): Promise<WebsiteAnalyticsGeoOverview> {
  const [coverage, countries, cities, recent] = await Promise.all([
    pool.query<WebsiteAnalyticsGeoCoverageRow>(
      `SELECT
        COUNT(*)::int AS total_events,
        COUNT(*) FILTER (WHERE geo_latitude IS NOT NULL AND geo_longitude IS NOT NULL)::int AS geolocated_events,
        COUNT(DISTINCT geo_country_code) FILTER (WHERE geo_country_code IS NOT NULL)::int AS countries,
        MAX(geo_database_build_at) AS latest_database_build_at
       FROM analytics_events
       WHERE occurred_at >= $1
         AND COALESCE(is_bot, false) = false`,
      [params.since],
    ),
    pool.query<WebsiteAnalyticsGeoCountryRow>(
      `SELECT
        geo_country_code AS country_code,
        COUNT(*)::int AS events,
        COUNT(DISTINCT network_cluster_key)::int AS clusters,
        COUNT(DISTINCT COALESCE(NULLIF(geo_city, ''), NULLIF(geo_region_name, ''), geo_country_code))::int AS cities,
        AVG(geo_latitude)::float8 AS latitude,
        AVG(geo_longitude)::float8 AS longitude,
        MAX(occurred_at) AS last_seen_at
       FROM analytics_events
       WHERE occurred_at >= $1
         AND COALESCE(is_bot, false) = false
         AND geo_latitude IS NOT NULL
         AND geo_longitude IS NOT NULL
       GROUP BY geo_country_code
       ORDER BY events DESC, clusters DESC, country_code ASC NULLS LAST
       LIMIT 20`,
      [params.since],
    ),
    pool.query<WebsiteAnalyticsGeoLocationRow>(
      `SELECT
        geo_country_code AS country_code,
        geo_region_code AS region_code,
        geo_region_name AS region_name,
        geo_city AS city,
        AVG(geo_latitude)::float8 AS latitude,
        AVG(geo_longitude)::float8 AS longitude,
        COUNT(*)::int AS events,
        COUNT(DISTINCT network_cluster_key)::int AS clusters,
        MAX(occurred_at) AS last_seen_at
       FROM analytics_events
       WHERE occurred_at >= $1
         AND COALESCE(is_bot, false) = false
         AND geo_latitude IS NOT NULL
         AND geo_longitude IS NOT NULL
       GROUP BY geo_country_code, geo_region_code, geo_region_name, geo_city
       ORDER BY events DESC, clusters DESC, last_seen_at DESC
       LIMIT 80`,
      [params.since],
    ),
    pool.query<WebsiteAnalyticsGeoPointRow>(
      `SELECT
        e.id::text,
        e.occurred_at,
        e.event_type,
        ${WEBSITE_ANALYTICS_ACTIVITY_SQL} AS activity,
        e.geo_latitude,
        e.geo_longitude,
        e.geo_accuracy_radius_km,
        e.geo_country_code,
        e.geo_region_code,
        e.geo_region_name,
        e.geo_city,
        e.path,
        e.route_template,
        e.surface,
        e.element_key,
        e.device_class,
        e.is_bot
       FROM analytics_events e
       WHERE e.occurred_at >= $1
         AND e.occurred_at >= $2
         AND COALESCE(e.is_bot, false) = false
         AND e.geo_latitude IS NOT NULL
         AND e.geo_longitude IS NOT NULL
       ORDER BY e.occurred_at DESC
       LIMIT $3::int`,
      [params.since, params.realtimeSince, params.limit],
    ),
  ]);

  const coverageRow = coverage.rows[0];
  return {
    generatedAt: new Date().toISOString(),
    since: params.since.toISOString(),
    realtimeSince: params.realtimeSince.toISOString(),
    coverage: {
      totalEvents: Number(coverageRow?.total_events ?? 0),
      geolocatedEvents: Number(coverageRow?.geolocated_events ?? 0),
      countries: Number(coverageRow?.countries ?? 0),
      latestDatabaseBuildAt: coverageRow?.latest_database_build_at
        ? dateToIso(coverageRow.latest_database_build_at)
        : null,
    },
    countries: countries.rows.map((row) => ({
      countryCode: row.country_code,
      events: Number(row.events ?? 0),
      clusters: Number(row.clusters ?? 0),
      cities: Number(row.cities ?? 0),
      latitude: nullableNumber(row.latitude),
      longitude: nullableNumber(row.longitude),
      lastSeenAt: dateToIso(row.last_seen_at),
    })),
    cities: cities.rows.map((row) => ({
      countryCode: row.country_code,
      regionCode: row.region_code,
      regionName: row.region_name,
      city: row.city,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      events: Number(row.events ?? 0),
      clusters: Number(row.clusters ?? 0),
      lastSeenAt: dateToIso(row.last_seen_at),
    })),
    recent: recent.rows.map(rowToWebsiteAnalyticsGeoPoint),
  };
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

/**
 * Loads device, session and chronological event details for a filtered slice.
 *
 * Supports cluster, device and session filters. Returned events are ordered
 * oldest-first so the UI can render a readable activity timeline.
 *
 * @param pool - Postgres connection pool.
 * @param params - Date lower bound plus optional cluster / device / session filters.
 * @returns Drilldown details for the selected traffic slice.
 */
export async function getWebsiteAnalyticsDrilldown(
  pool: Pool,
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

/**
 * Exports overview and drilldown analytics data for a date window.
 *
 * The export intentionally reuses the dashboard query builders so JSON
 * exports and the admin UI stay shape-equivalent.
 *
 * @param pool - Postgres connection pool.
 * @param since - Inclusive lower bound for exported analytics.
 * @returns Export payload with generation timestamp and retention policy.
 */
export async function exportWebsiteAnalytics(pool: Pool, since: Date): Promise<WebsiteAnalyticsExport> {
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

/**
 * Deletes expired website analytics raw events, orphaned sessions and summaries.
 *
 * Raw events and daily summaries use separate retention windows. Session rows
 * are only deleted after their last-seen timestamp is old and no raw events
 * still reference them.
 *
 * @param pool - Postgres connection pool.
 * @param now - Clock value used to derive retention cutoffs.
 * @returns Counts of deleted raw events, sessions and summaries.
 * @throws Query errors propagate after transaction rollback.
 */
export async function runWebsiteAnalyticsRetention(pool: Pool, now: Date): Promise<WebsiteAnalyticsRetentionResult> {
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
