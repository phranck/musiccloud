/**
 * @file Read-only resolver evidence with environment-neutral selectors and hashes.
 * Findings retain observed values and keys. They are not executable repair plans.
 */
import { isAppleArtworkUrl, isYouTubeArtworkUrl } from "../services/artwork.js";
import { SERVICE_MISS_TTL_MS } from "../services/constants.js";
import { canonicalJson, sha256Hex } from "./resolver-repair/canonical-json.js";

/** A safe operational code that never includes driver messages or stored values. */
export class AuditFailure extends Error {
  /**
   * Creates a failure suitable for CLI status output without its underlying data.
   * @param code - Static identifier chosen by the audit, never upstream text.
   */
  constructor(readonly code: `AUDIT_${string}`) {
    super(code);
    this.name = "AuditFailure";
  }
}

/** Connected PostgreSQL boundary; the caller owns connection setup and teardown. */
export interface AuditDatabase {
  query(statement: string, parameters?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** Source provenance identifies the immutable archive rather than its local database name. */
export interface AuditSource {
  archiveSha256: string;
  snapshotAt: string;
  migrations: Record<string, unknown>[];
}

/** Revision and file hashes pin the program, shared rules and installed dependency lockfile. */
export interface AuditTool {
  revision: string;
  tree: string;
  sourceSha256: string;
  lockfileSha256: string;
}

/** Connection expectations never become business selectors in the evidence payload. */
export interface AuditOptions {
  expectedDatabase: string;
  expectedRole: string;
  source: AuditSource;
  tool: AuditTool;
  referenceTrackIds?: string[];
}

/** Private canonical JSON and its exact byte checksum; summary contains no stored row values. */
export interface AuditBundle {
  content: string;
  sha256: string;
  summary: Record<string, number>;
}

/** A finding states its evidence limit alongside the SQL and bound input values. */
interface FindingDefinition {
  id: string;
  interpretation: string;
  sql: string;
  parameters?: unknown[];
}

/** Track evidence includes references needed to preserve public identity during later reconciliation. */
const TRACK_SELECT = `SELECT tracks.*,
  ARRAY(SELECT id FROM public.short_urls WHERE track_id=tracks.id ORDER BY id COLLATE "C") AS short_ids,
  (SELECT coalesce(jsonb_agg(to_jsonb(credits) ORDER BY credit_position, id COLLATE "C"),'[]'::jsonb)
    FROM public.track_artist_credits credits WHERE track_id=tracks.id) AS artist_credits,
  (SELECT coalesce(jsonb_agg(to_jsonb(links) ORDER BY service COLLATE "C", id COLLATE "C"),'[]'::jsonb)
    FROM public.service_links links WHERE track_id=tracks.id) AS service_links,
  (SELECT coalesce(jsonb_agg(to_jsonb(identifiers) ORDER BY id COLLATE "C"),'[]'::jsonb)
    FROM public.track_external_ids identifiers WHERE track_id=tracks.id) AS external_ids
  FROM public.tracks`;

/** Release evidence keeps related public references without borrowing recording identity rules. */
const ALBUM_SELECT = `SELECT albums.*,
  ARRAY(SELECT id FROM public.album_short_urls WHERE album_id=albums.id ORDER BY id COLLATE "C") AS short_ids,
  (SELECT coalesce(jsonb_agg(to_jsonb(credits) ORDER BY credit_position, id COLLATE "C"),'[]'::jsonb)
    FROM public.album_artist_credits credits WHERE album_id=albums.id) AS artist_credits,
  (SELECT coalesce(jsonb_agg(to_jsonb(links) ORDER BY service COLLATE "C", id COLLATE "C"),'[]'::jsonb)
    FROM public.album_service_links links WHERE album_id=albums.id) AS service_links,
  (SELECT coalesce(jsonb_agg(to_jsonb(identifiers) ORDER BY id COLLATE "C"),'[]'::jsonb)
    FROM public.album_external_ids identifiers WHERE album_id=albums.id) AS external_ids
  FROM public.albums`;

/**
 * Defines the bounded local assessment. It performs no provider or media requests.
 * @param options - Immutable snapshot time and explicitly requested reference ids.
 * @returns SQL and interpretation for every observation, including empty results.
 */
function findingDefinitions(options: AuditOptions): FindingDefinition[] {
  return [
    {
      id: "artwork",
      interpretation: "Stored values rejected by the shared cover policy; YouTube artist portraits remain separate.",
      sql: `SELECT 'tracks' AS table, id AS key, artwork_url AS url FROM public.tracks WHERE artwork_url IS NOT NULL
        UNION ALL SELECT 'albums',id,artwork_url FROM public.albums WHERE artwork_url IS NOT NULL
        UNION ALL SELECT 'artist_profiles',artist_entity_id,image_url FROM public.artist_profiles WHERE image_url IS NOT NULL`,
    },
    {
      id: "duplicate_track_isrc",
      interpretation: "Candidate groups, not proof of an interchangeable recording or permission to merge.",
      sql: `${TRACK_SELECT} WHERE isrc IN (SELECT isrc FROM public.tracks WHERE isrc IS NOT NULL AND btrim(isrc)<>'' GROUP BY isrc HAVING count(*)>1)`,
    },
    {
      id: "duplicate_track_source",
      interpretation:
        "Repeated nonempty exact source URLs require identity reconciliation; groups can overlap ISRC groups.",
      sql: `${TRACK_SELECT} WHERE source_url IN (SELECT source_url FROM public.tracks WHERE source_url IS NOT NULL AND btrim(source_url)<>'' GROUP BY source_url HAVING count(*)>1)`,
    },
    {
      id: "duplicate_album_upc",
      interpretation:
        "Release candidates retain edition evidence and all public references; barcode equality alone is insufficient.",
      sql: `${ALBUM_SELECT} WHERE upc IN (SELECT upc FROM public.albums WHERE upc IS NOT NULL AND btrim(upc)<>'' GROUP BY upc HAVING count(*)>1)`,
    },
    {
      id: "multiple_track_isrc",
      interpretation:
        "Multiple provider observations are intentional context, not a deletion list or confirmed identifier conflict.",
      sql: `SELECT tracks.id,tracks.isrc,
        jsonb_agg(to_jsonb(identifiers) ORDER BY identifiers.id COLLATE "C") AS observations
        FROM public.tracks JOIN public.track_external_ids identifiers ON identifiers.track_id=tracks.id
        WHERE identifiers.id_type='isrc' GROUP BY tracks.id HAVING count(DISTINCT identifiers.id_value)>1`,
    },
    {
      id: "recent_service_misses",
      interpretation:
        "Rows within the shared TTL at snapshot time do not establish whether historical requests completed successfully.",
      sql: "SELECT * FROM public.service_link_misses WHERE checked_at >= $1::timestamptz - ($2::bigint * interval '1 millisecond')",
      parameters: [options.source.snapshotAt, SERVICE_MISS_TTL_MS],
    },
    {
      id: "linked_service_misses",
      interpretation:
        "Coexisting positive and negative evidence requires targeted revalidation, not automatic acceptance or deletion.",
      sql: `SELECT misses.*,to_jsonb(links) AS stored_link,to_jsonb(tracks) AS recording,
        (SELECT coalesce(jsonb_agg(to_jsonb(credits) ORDER BY credit_position,id COLLATE "C"),'[]'::jsonb)
          FROM public.track_artist_credits credits WHERE track_id=tracks.id) AS artist_credits
        FROM public.service_link_misses misses JOIN public.service_links links
          ON links.track_id=misses.track_id AND links.service=misses.service
        JOIN public.tracks ON tracks.id=misses.track_id`,
    },
    {
      id: "metadata_integrity",
      interpretation: "Counts cover these fields only. Missing optional artwork does not by itself establish a defect.",
      sql: `SELECT
        (SELECT count(*)::int FROM public.tracks WHERE btrim(title)='') AS blank_track_titles,
        (SELECT count(*)::int FROM public.albums WHERE btrim(title)='') AS blank_album_titles,
        (SELECT count(*)::int FROM public.artist_entity_names WHERE btrim(name)='') AS blank_artist_names,
        (SELECT count(*)::int FROM public.tracks WHERE duration_ms<=0) AS nonpositive_track_durations,
        (SELECT count(*)::int FROM public.albums WHERE total_tracks<=0) AS nonpositive_album_track_counts,
        (SELECT count(*)::int FROM public.tracks WHERE artwork_url IS NULL OR btrim(artwork_url)='') AS missing_track_artwork,
        (SELECT count(*)::int FROM public.albums WHERE artwork_url IS NULL OR btrim(artwork_url)='') AS missing_album_artwork,
        (SELECT count(*)::int FROM public.artist_profiles WHERE image_url IS NULL OR btrim(image_url)='') AS missing_profile_images,
        (SELECT count(*)::int FROM public.tracks WHERE isrc IS NOT NULL AND btrim(isrc)<>''
          AND regexp_replace(upper(isrc),'[-[:space:]]','','g') !~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$') AS nonstandard_canonical_isrc`,
    },
    {
      id: "audiomack_branding",
      interpretation:
        "Anchored page-branding suffixes are suspect display metadata; source evidence is retained for revalidation.",
      sql: `SELECT 'artist_entity_names' AS table,id,name AS value FROM public.artist_entity_names WHERE name ~* ': *Listen on Audiomack *$'
        UNION ALL SELECT 'track_artist_credits',id,credit_name FROM public.track_artist_credits WHERE credit_name ~* ': *Listen on Audiomack *$'
        UNION ALL SELECT 'album_artist_credits',id,credit_name FROM public.album_artist_credits WHERE credit_name ~* ': *Listen on Audiomack *$'
        UNION ALL SELECT 'tracks',id,title FROM public.tracks WHERE title ~* ': *Listen on Audiomack *$'
        UNION ALL SELECT 'albums',id,title FROM public.albums WHERE title ~* ': *Listen on Audiomack *$'`,
    },
    {
      id: "unknown_artist_credits",
      interpretation:
        "Placeholder-looking credits require provider/source evidence; no artist entity is renamed automatically.",
      sql: `SELECT 'track_artist_credits' AS table,id,track_id AS entity_id,credit_name FROM public.track_artist_credits WHERE lower(btrim(credit_name))='unknown artist'
        UNION ALL SELECT 'album_artist_credits',id,album_id,credit_name FROM public.album_artist_credits WHERE lower(btrim(credit_name))='unknown artist'`,
    },
    {
      id: "encoded_metadata",
      interpretation:
        "Entity-looking text is a candidate for source verification, not permission to decode all stored names.",
      sql: `SELECT 'tracks' AS table,id,title AS value FROM public.tracks WHERE title ~* '&(#[0-9]+|#x[0-9a-f]+|amp|quot|apos|nbsp|lt|gt);'
        UNION ALL SELECT 'albums',id,title FROM public.albums WHERE title ~* '&(#[0-9]+|#x[0-9a-f]+|amp|quot|apos|nbsp|lt|gt);'
        UNION ALL SELECT 'artist_entity_names',id,name FROM public.artist_entity_names WHERE name ~* '&(#[0-9]+|#x[0-9a-f]+|amp|quot|apos|nbsp|lt|gt);'`,
    },
    {
      id: "reference_tracks",
      interpretation:
        "Explicitly selected reference identities remain data inputs rather than hardcoded recording names.",
      sql: `${TRACK_SELECT} WHERE tracks.id=ANY($1::text[])`,
      parameters: [[...new Set(options.referenceTrackIds ?? [])].sort()],
    },
  ];
}

/**
 * Hashes deterministic JSON rather than driver object order.
 * @param value - JSON-compatible content to identify.
 * @returns A lowercase SHA-256 digest with no embedded record values.
 */
function digest(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/**
 * Orders top-level records without changing nested credit or membership order.
 * @param rows - PostgreSQL records from one declared observation.
 * @returns A new array in a locale-independent serialized order.
 */
function orderedRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.slice().sort((left, right) => {
    const leftText = canonicalJson(left);
    const rightText = canonicalJson(right);
    return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
  });
}

/**
 * Filters artwork with the production classifiers while retaining exact before values.
 * @param rows - Recording-cover and artist-profile candidates from declared tables.
 * @returns Only rejected stored values; YouTube portraits are not recording covers.
 */
function artworkFindings(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.flatMap((row) => {
    if (
      typeof row.url !== "string" ||
      typeof row.key !== "string" ||
      !["tracks", "albums", "artist_profiles"].includes(String(row.table))
    )
      throw new Error("AUDIT_ARTWORK_SHAPE");
    if (isAppleArtworkUrl(row.url)) return [{ ...row, policy: "apple_artwork" }];
    if (row.table !== "artist_profiles" && isYouTubeArtworkUrl(row.url))
      return [{ ...row, policy: "youtube_recording_artwork" }];
    return [];
  });
}

/**
 * Captures a consistent, private, environment-neutral catalog evidence bundle.
 * @param database - Connected client; no application pool or provider is imported.
 * @param options - Explicit identity checks and versioned snapshot/tool provenance.
 * @returns Canonical UTF-8 JSON, its checksum and row counts safe for status output.
 * @throws On connection, query or read-only failures; no partial bundle is returned.
 */
export async function captureResolverEvidence(database: AuditDatabase, options: AuditOptions): Promise<AuditBundle> {
  let transactionStarted = false;
  try {
    await database.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionStarted = true;
    const identity = (
      await database.query(
        "SELECT current_database() AS database, current_user AS role, current_setting('transaction_read_only') AS read_only",
      )
    ).rows[0];
    if (identity?.read_only !== "on") throw new AuditFailure("AUDIT_READ_ONLY_REQUIRED");
    if (identity.database !== options.expectedDatabase || identity.role !== options.expectedRole)
      throw new AuditFailure("AUDIT_DATABASE_IDENTITY");
    await database.query("SET LOCAL TIME ZONE 'UTC'");
    const schema = {
      columns: orderedRows(
        (
          await database.query(
            "SELECT table_schema,table_name,column_name,ordinal_position,data_type,udt_schema,udt_name,is_nullable,column_default,character_maximum_length,numeric_precision,numeric_scale,datetime_precision,collation_schema,collation_name,is_identity,identity_generation,is_generated,generation_expression FROM information_schema.columns WHERE table_schema IN ('public','drizzle')",
          )
        ).rows,
      ),
      indexes: orderedRows(
        (
          await database.query(
            "SELECT schemaname,tablename,indexname,indexdef FROM pg_catalog.pg_indexes WHERE schemaname IN ('public','drizzle')",
          )
        ).rows,
      ),
      constraints: orderedRows(
        (
          await database.query(
            "SELECT namespace.nspname AS schema,relation.relname AS table,constraint_info.conname AS name,pg_catalog.pg_get_constraintdef(constraint_info.oid) AS definition FROM pg_catalog.pg_constraint constraint_info JOIN pg_catalog.pg_class relation ON relation.oid=constraint_info.conrelid JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname IN ('public','drizzle')",
          )
        ).rows,
      ),
    };
    const migrations = orderedRows(
      (await database.query("SELECT id,hash,created_at::text AS created_at FROM drizzle.__drizzle_migrations")).rows,
    );
    if (digest(migrations) !== digest(orderedRows(options.source.migrations)))
      throw new AuditFailure("AUDIT_MIGRATION_DRIFT");
    const definitions = findingDefinitions(options);
    const findings: Record<string, { rows: Record<string, unknown>[]; sha256: string }> = {};
    for (const definition of definitions) {
      const result = await database.query(`/* audit:${definition.id} */ ${definition.sql}`, definition.parameters);
      const rows = orderedRows(definition.id === "artwork" ? artworkFindings(result.rows) : result.rows);
      if (definition.id === "reference_tracks") {
        const observedIds = new Set(rows.map((row) => row.id));
        if ((options.referenceTrackIds ?? []).some((id) => !observedIds.has(id)))
          throw new AuditFailure("AUDIT_REFERENCE_MISSING");
      }
      findings[definition.id] = { rows, sha256: digest(rows) };
    }
    const payload = {
      formatVersion: 1,
      source: options.source,
      tool: options.tool,
      schema: { ...schema, sha256: digest(schema) },
      migrations: { rows: migrations, sha256: digest(migrations) },
      definitions,
      definitionsSha256: digest(definitions),
      findings,
    };
    const content = `${canonicalJson(payload)}\n`;
    await database.query("COMMIT");
    return {
      content,
      sha256: sha256Hex(content),
      summary: Object.fromEntries(Object.entries(findings).map(([id, finding]) => [id, finding.rows.length])),
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await database.query("ROLLBACK");
      } catch {
        throw new AuditFailure("AUDIT_ROLLBACK_FAILED");
      }
    }
    throw error instanceof AuditFailure ? error : new AuditFailure("AUDIT_QUERY_FAILED");
  }
}
