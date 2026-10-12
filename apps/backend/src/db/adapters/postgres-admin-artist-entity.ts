/**
 * Admin read of one artist entity's identity: its names, its lifecycle
 * events and its band memberships, each with the source that stated it.
 *
 * The admin entity list lives in `postgres-admin-catalog.ts`. The memberships
 * come from the reads in `postgres-artists.ts` that the public API uses, so
 * the dashboard shows the rows a developer reads, with their sources added.
 */

import type { AdminArtistEntityName } from "@musiccloud/shared";
import type { Pool } from "pg";
import type { ArtistEntityEventRecord, ArtistEntityIdentityRecord } from "../admin-repository.js";
import { listArtistGroupMembers, listArtistMemberships } from "./postgres-artists.js";
import { artistNamePreferenceOrder, dateToMs, UNNAMED_ARTIST_NAME } from "./postgres-shared.js";

interface ArtistEntityRow {
  id: string;
  entity_type: ArtistEntityIdentityRecord["entityType"];
  verification_status: ArtistEntityIdentityRecord["verificationStatus"];
  created_at: Date;
  has_profile: boolean;
  short_id: string | null;
}

interface ArtistEntityNameRow {
  id: string;
  name: string;
  name_type: AdminArtistEntityName["nameType"];
  locale: string | null;
}

interface ArtistEntityEventRow {
  id: string;
  event_type: ArtistEntityEventRecord["eventType"];
  date_precision: ArtistEntityEventRecord["datePrecision"];
  event_year: number | null;
  event_month: number | null;
  event_day: number | null;
  source_provider: string | null;
  source_url: string | null;
  source_fetched_at: Date | null;
}

/**
 * Loads one artist entity with everything recorded about its identity.
 *
 * The names come in the order that picks an entity's display name everywhere
 * else, so the first is the name the list shows. Events are ordered by their
 * date, an event without a year last.
 *
 * @param pool - Postgres connection pool.
 * @param id - The artist entity id.
 * @returns The entity, or `null` when no entity has this id.
 */
export async function getArtistEntityIdentity(pool: Pool, id: string): Promise<ArtistEntityIdentityRecord | null> {
  const entityResult = await pool.query<ArtistEntityRow>(
    `SELECT
       ae.id,
       ae.entity_type,
       ae.verification_status,
       ae.created_at,
       ap.artist_entity_id IS NOT NULL AS has_profile,
       asu.id AS short_id
     FROM artist_entities ae
     LEFT JOIN artist_profiles ap ON ap.artist_entity_id = ae.id
     LEFT JOIN artist_short_urls asu ON asu.artist_entity_id = ae.id
     WHERE ae.id = $1`,
    [id],
  );
  const entity = entityResult.rows[0];
  if (!entity) return null;

  const [nameResult, eventResult, members, memberOf] = await Promise.all([
    pool.query<ArtistEntityNameRow>(
      `SELECT n.id, n.name, n.name_type, n.locale
       FROM artist_entity_names n
       WHERE n.artist_entity_id = $1
       ORDER BY ${artistNamePreferenceOrder("n")}`,
      [id],
    ),
    pool.query<ArtistEntityEventRow>(
      `SELECT
         ev.id,
         ev.event_type,
         ev.date_precision,
         ev.event_year,
         ev.event_month,
         ev.event_day,
         src.provider AS source_provider,
         src.source_url,
         src.fetched_at AS source_fetched_at
       FROM artist_entity_events ev
       LEFT JOIN artist_sources src ON src.id = ev.source_id
       WHERE ev.artist_entity_id = $1
       ORDER BY ev.event_year ASC NULLS LAST, ev.event_month ASC NULLS LAST, ev.event_day ASC NULLS LAST, ev.event_type ASC`,
      [id],
    ),
    listArtistGroupMembers(pool, id),
    listArtistMemberships(pool, id),
  ]);

  const names = nameResult.rows.map((row) => ({
    id: row.id,
    name: row.name,
    nameType: row.name_type,
    locale: row.locale,
  }));
  return {
    id: entity.id,
    name: names[0]?.name ?? UNNAMED_ARTIST_NAME,
    entityType: entity.entity_type,
    verificationStatus: entity.verification_status,
    hasProfile: entity.has_profile,
    shortId: entity.short_id,
    createdAt: dateToMs(entity.created_at),
    names,
    events: eventResult.rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      datePrecision: row.date_precision,
      eventYear: row.event_year,
      eventMonth: row.event_month,
      eventDay: row.event_day,
      sourceProvider: row.source_provider,
      sourceUrl: row.source_url,
      sourceFetchedAt: row.source_fetched_at ? dateToMs(row.source_fetched_at) : null,
    })),
    members,
    memberOf,
  };
}
