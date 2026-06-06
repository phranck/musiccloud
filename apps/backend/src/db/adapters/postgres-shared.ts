/**
 * Shared low-level helpers, SQL fragments and cross-domain row types used
 * across the PostgreSQL adapter implementation.
 *
 * This module is consumed by every `postgres-*.ts` sibling module. It
 * deliberately contains no domain logic of its own — only:
 *
 *   - JSON / array / date parsing helpers used in every result builder.
 *   - SQL `SELECT` and `JOIN` fragments used by more than one domain
 *     (e.g. track-artist credit aggregation is needed by both track
 *     resolve queries and admin-catalog listings).
 *   - Row interfaces representing query shapes shared by multiple
 *     domains (e.g. count and service-link rows).
 *
 * Single-domain SQL fragments, constants and row types live next to
 * their consumer module.
 */

import type { PoolClient } from "pg";
import { generateTrackId } from "../../lib/short-id.js";
import type { ArtistCredit, ExternalIdRecord } from "../repository.js";

// ============================================================================
// PARSE HELPERS
// ============================================================================

/**
 * Parses a JSON-encoded string array, returning a fallback on any parse error.
 *
 * Used to decode the `artists` column that comes back from track / album
 * queries as a `jsonb_agg(...)::text` (see `TRACK_ARTISTS_SELECT` /
 * `ALBUM_ARTISTS_SELECT`).
 *
 * @param json - The JSON text to parse.
 * @param fallback - Returned when `json` is not valid JSON. Defaults to `[]`.
 * @returns The parsed array, or `fallback` if parsing failed.
 */
export function safeParseArray(json: string, fallback: string[] = []): string[] {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * Parses a JSON-encoded array of artist credits, dropping any entries that
 * do not satisfy the {@link ArtistCredit} shape.
 *
 * Each credit must have a string `artistEntityId`, string `name`, string
 * `role` and numeric `position`; non-conforming entries are silently
 * discarded so a single bad row cannot break a whole result page.
 *
 * @param json - The JSON text to parse.
 * @param fallback - Returned when `json` is not valid JSON or not an array.
 *   Defaults to `[]`.
 * @returns The parsed and validated credits, or `fallback` on failure.
 */
export function safeParseArtistCredits(json: string, fallback: ArtistCredit[] = []): ArtistCredit[] {
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

/**
 * Normalises track / album persistence inputs into a uniform list of
 * `{ artistEntityId?, name }` records that downstream credit-upsert
 * code can consume.
 *
 * Prefers `structuredCredits` when present (richer; carries entity ids)
 * and falls back to the legacy `artistNames` string list. Empty / blank
 * names are dropped in either path.
 *
 * @param artistNames - Plain artist-name strings from the source adapter.
 * @param structuredCredits - Optional richer credit list with entity ids.
 * @returns Trimmed credit inputs ready for persistence.
 */
export function normalizeArtistCreditInputs(
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

/**
 * Parses any JSON payload, returning a typed fallback on null / undefined
 * or parse failure.
 *
 * @typeParam T - Expected shape of the parsed value.
 * @param json - The JSON text to parse, or null / undefined.
 * @param fallback - Returned when `json` is empty or not valid JSON.
 * @returns The parsed value (assumed to match `T`), or `fallback`.
 */
export function safeParseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// ============================================================================
// DATE HELPERS
// ============================================================================

/**
 * Converts a Date (or null / undefined) to a millisecond timestamp.
 *
 * Returns `0` when the input is missing, matching the legacy SQLite-era
 * contract that downstream consumers still expect.
 *
 * @param date - The Date to convert, or null / undefined.
 * @returns The epoch millisecond value, or `0` when input is missing.
 */
export function dateToMs(date: Date | null | undefined): number {
  return date ? date.getTime() : 0;
}

/**
 * Converts an epoch second value to a Date.
 *
 * Note: input is interpreted as **seconds**, not milliseconds — this
 * mirrors the original SQLite contract where timestamps were stored as
 * `INTEGER` seconds. Do not feed `Date.now()` style millisecond values
 * to this function.
 *
 * @param ms - Epoch seconds.
 * @returns A Date for the given epoch second.
 */
export function msToDate(ms: number): Date {
  return new Date(ms * 1000);
}

// ============================================================================
// CROSS-DOMAIN SQL FRAGMENTS
// ============================================================================

/**
 * `SELECT` fragment producing a JSON-encoded string list of main artist
 * names for the surrounding track context. Expects the outer query to
 * expose the track row as `t`.
 */
export const TRACK_ARTISTS_SELECT = `COALESCE((
  SELECT jsonb_agg(tac.credit_name ORDER BY tac.credit_position, tac.created_at)::text
  FROM track_artist_credits tac
  WHERE tac.track_id = t.id AND tac.credit_role = 'main'
), '[]') AS artists`;

/**
 * `SELECT` fragment producing a JSON-encoded list of structured artist
 * credits (with `artistEntityId`, `name`, `role`, `position`) for the
 * surrounding track context. Expects the outer query to expose the
 * track row as `t`.
 */
export const TRACK_ARTIST_CREDITS_SELECT = `COALESCE((
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

/**
 * Convenience composite: emits both `artists` and `artist_credits`
 * columns in one fragment. Used in every track-row SELECT.
 */
export const TRACK_ARTIST_FIELDS_SELECT = `${TRACK_ARTISTS_SELECT}, ${TRACK_ARTIST_CREDITS_SELECT}`;

/**
 * `SELECT` fragment producing a JSON-encoded string list of main artist
 * names for the surrounding album context. Expects the outer query to
 * expose the album row as `a`.
 */
export const ALBUM_ARTISTS_SELECT = `COALESCE((
  SELECT jsonb_agg(aac.credit_name ORDER BY aac.credit_position, aac.created_at)::text
  FROM album_artist_credits aac
  WHERE aac.album_id = a.id AND aac.credit_role = 'main'
), '[]') AS artists`;

/**
 * `SELECT` fragment producing a JSON-encoded list of structured artist
 * credits for the surrounding album context. Expects the outer query
 * to expose the album row as `a`.
 */
export const ALBUM_ARTIST_CREDITS_SELECT = `COALESCE((
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

/**
 * Convenience composite: emits both `artists` and `artist_credits`
 * columns in one fragment. Used in every album-row SELECT.
 */
export const ALBUM_ARTIST_FIELDS_SELECT = `${ALBUM_ARTISTS_SELECT}, ${ALBUM_ARTIST_CREDITS_SELECT}`;

/**
 * `SELECT` fragment that exposes the resolved artist name from the
 * `artist_name` alias produced by {@link ARTIST_NAME_LATERAL_JOIN}.
 * Falls back to `'[unnamed artist]'` when no name row exists.
 */
export const ARTIST_NAME_SELECT = `COALESCE(artist_name.name, '[unnamed artist]') AS name`;

/**
 * Lateral join that picks the canonical display name for an artist
 * entity, preferring locale-less canonical names over locale-tagged
 * ones, then over credit-style names. Exposes the resolved name as
 * `artist_name.name` for consumers (use with {@link ARTIST_NAME_SELECT}).
 *
 * Expects the outer query to expose the artist row as `ar` with a
 * `artist_entity_id` column.
 */
export const ARTIST_NAME_LATERAL_JOIN = `LEFT JOIN LATERAL (
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

// ============================================================================
// CROSS-DOMAIN ROW TYPES
// ============================================================================

/**
 * Row shape for `SELECT COUNT(*)` queries used in every paginated
 * admin listing.
 */
export interface CountRow {
  count: number;
}

/**
 * Row shape for the basic `(service, url)` projection used when
 * aggregating service-link fan-out into a result.
 */
export interface ServiceLinkRow {
  service: string;
  url: string;
}

// ============================================================================
// EXTERNAL-ID PERSISTENCE
// ============================================================================

/**
 * Idempotent multi-row insert helper for the `*_external_ids` tables
 * introduced in migration `0019`.
 *
 * The unique index on the four `(entity_id, id_type, id_value,
 * source_service)` columns makes `ON CONFLICT DO NOTHING` swallow
 * duplicate observations cleanly, which is the desired behaviour when
 * the same track / album / artist gets re-resolved against the same
 * external catalogue.
 *
 * Runs the inserts inside its own `BEGIN` / `COMMIT` block on a
 * dedicated client checked out from the pool.
 *
 * @param pool - Used only to check out a transaction client.
 * @param table - Target external-ids table.
 * @param fkColumn - Foreign-key column referencing the owning entity.
 * @param entityId - Owning entity id.
 * @param records - External-id observations to upsert. Empty list is a no-op.
 * @throws Pool / query errors propagate after rollback.
 */
export async function insertExternalIds(
  pool: { connect: () => Promise<PoolClient> },
  table: "track_external_ids" | "album_external_ids" | "artist_external_ids",
  fkColumn: "track_id" | "album_id" | "artist_entity_id",
  entityId: string,
  records: ExternalIdRecord[],
): Promise<void> {
  const now = new Date();
  const client = await pool.connect();
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

// ============================================================================
// ARTIST-ENTITY UPSERT HELPERS
// ============================================================================
//
// Track and album persistence both need to materialise an `artist_entities`
// row for each credited name, optionally bound to a known entity id when
// the source provides one. The four helpers below cover that flow:
//
//   - `ensureArtistEntityExists`   pure read; throws when entity is missing
//   - `ensureArtistEntityName`     idempotent name upsert on an existing entity
//   - `ensureExistingArtistEntityForCredit`
//                                  read-then-name-upsert when the caller
//                                  already has an entity id
//   - `ensureArtistEntityForName`  fuzzy-by-name lookup, creating the
//                                  entity (and a canonical name row) when
//                                  no match exists
//
// All of them take a `client: PoolClient` and must be invoked within the
// caller's transaction so a single failure rolls back the whole credit
// replacement instead of leaving half-bound rows behind.

/**
 * Verifies that an `artist_entities` row with the given id exists.
 *
 * @param client - Pool client running inside the caller's transaction.
 * @param artistEntityId - Id to verify.
 * @throws Error when no matching entity is found.
 */
export async function ensureArtistEntityExists(client: PoolClient, artistEntityId: string): Promise<void> {
  const result = await client.query<{ id: string }>(`SELECT id FROM artist_entities WHERE id = $1`, [artistEntityId]);
  if (!result.rows[0]?.id) {
    throw new Error(`Artist entity not found: ${artistEntityId}`);
  }
}

/**
 * Ensures the given entity id exists and that a credit-style name row
 * is recorded for it, returning the same entity id back.
 *
 * @param client - Pool client running inside the caller's transaction.
 * @param artistEntityId - Existing entity id supplied by the caller.
 * @param creditName - Credit name to associate with the entity.
 * @param now - Timestamp used for any new name row.
 * @returns The same `artistEntityId` for chaining.
 */
export async function ensureExistingArtistEntityForCredit(
  client: PoolClient,
  artistEntityId: string,
  creditName: string,
  now: Date,
): Promise<string> {
  await ensureArtistEntityExists(client, artistEntityId);
  await ensureArtistEntityName(client, artistEntityId, creditName, now, "credit");
  return artistEntityId;
}

/**
 * Resolves an artist entity by name, creating both the entity and a
 * canonical name row when no case-insensitive match exists.
 *
 * Empty / whitespace-only input recurses with `"Unknown Artist"` so the
 * caller always receives a valid entity id.
 *
 * @param client - Pool client running inside the caller's transaction.
 * @param name - Display name to resolve.
 * @param now - Timestamp used when a new entity / name row is created.
 * @returns The resolved (or newly created) entity id.
 */
export async function ensureArtistEntityForName(client: PoolClient, name: string, now: Date): Promise<string> {
  const creditName = name.trim();
  if (!creditName) {
    return ensureArtistEntityForName(client, "Unknown Artist", now);
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

/**
 * Idempotent upsert of an `artist_entity_names` row.
 *
 * If a name row with the same `(artistEntityId, lower(name), nameType)`
 * combination already exists, this is a no-op.
 *
 * @param client - Pool client running inside the caller's transaction.
 * @param artistEntityId - Owning entity id.
 * @param name - Display name. Whitespace-only input is a no-op.
 * @param now - Timestamp used when a new row is inserted.
 * @param nameType - `"canonical"` for the entity's primary name,
 *   `"credit"` for alternates seen on tracks / albums. Defaults to
 *   `"canonical"`.
 */
export async function ensureArtistEntityName(
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

// ============================================================================
// TRACK / ALBUM CREDIT REPLACEMENT
// ============================================================================

/**
 * Replaces every `main`-role credit row for a track and returns the
 * normalised list of credits that were written.
 *
 * Drops all existing main credits first (per migration `0017`'s
 * delete-then-insert contract), then walks the credit inputs in order,
 * binding each to an entity via {@link ensureExistingArtistEntityForCredit}
 * when an entity id is supplied or {@link ensureArtistEntityForName}
 * otherwise.
 *
 * @param client - Pool client running inside the caller's transaction.
 * @param trackId - Track whose credits are being rewritten.
 * @param artistNames - Legacy plain-string artist names from the source.
 * @param now - Timestamp used for inserted credit rows.
 * @param structuredCredits - Optional richer credit list with entity ids;
 *   wins over `artistNames` when present.
 * @returns The freshly inserted credits, in insertion order.
 */
export async function replaceTrackArtistCredits(
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
      ? await ensureExistingArtistEntityForCredit(client, creditInput.artistEntityId, creditInput.name, now)
      : await ensureArtistEntityForName(client, creditInput.name, now);
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

/**
 * Album-side mirror of {@link replaceTrackArtistCredits}: drops all
 * existing `main`-role rows for the album and rewrites them in order.
 *
 * @param client - Pool client running inside the caller's transaction.
 * @param albumId - Album whose credits are being rewritten.
 * @param artistNames - Legacy plain-string artist names from the source.
 * @param now - Timestamp used for inserted credit rows.
 * @param structuredCredits - Optional richer credit list with entity ids.
 * @returns The freshly inserted credits, in insertion order.
 */
export async function replaceAlbumArtistCredits(
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
      ? await ensureExistingArtistEntityForCredit(client, creditInput.artistEntityId, creditInput.name, now)
      : await ensureArtistEntityForName(client, creditInput.name, now);
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
