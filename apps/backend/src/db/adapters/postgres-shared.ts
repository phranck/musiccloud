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
 * their consumer module — see `postgres-analytics.ts` for the
 * `WEBSITE_ANALYTICS_*` family.
 */

import type { ArtistCredit } from "../repository.js";

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
