/**
 * Artist identity enrichment: which artist entities are due for a MusicBrainz
 * check, and how a MusicBrainz snapshot is written.
 *
 * The lifecycle dates and band memberships written here are the rows
 * `listArtistIdentityEventsByDay`, `listArtistGroupMembers` and
 * `listArtistMemberships` in `postgres-artists.ts` read.
 *
 * Every write replaces what MusicBrainz said before for the same entity, so a
 * refetch never adds a second copy of a date or a membership. A membership is
 * rewritten from whichever side was fetched last, and both sides list the same
 * relations, so fetching a group and then its members leaves one row per stint.
 */

import type { Pool, PoolClient } from "pg";

import { generateTrackId } from "../../lib/short-id.js";
import type {
  ArtistEntityType,
  ArtistIdentityCandidate,
  ArtistIdentityCheckOutcome,
  ArtistIdentitySnapshot,
  ArtistMembershipSnapshot,
  PartialDateRecord,
} from "../repository.js";

/** The one identity provider the enrichment asks. */
const IDENTITY_PROVIDER = "musicbrainz";

/** The services whose artist links MusicBrainz can map to its own id. */
const MAPPABLE_LINK_SERVICES = ["spotify", "deezer"] as const;

interface ArtistIdentityCandidateRow {
  artist_entity_id: string;
  musicbrainz_id: string | null;
  service_links: Array<{ service: string; externalId: string | null; url: string }> | null;
}

/**
 * Lists the entities due for a MusicBrainz check. See
 * `TrackRepository.listArtistIdentityCandidates`.
 *
 * The scope is the catalog's artists with a profile, plus everyone one band
 * membership away from them. A wider scope would follow MusicBrainz's graph
 * from band to member to the member's other bands without end.
 */
export async function listArtistIdentityCandidates(
  pool: Pool,
  params: { limit: number; recheckBefore: Date; retryFailedBefore: Date },
): Promise<ArtistIdentityCandidate[]> {
  const result = await pool.query<ArtistIdentityCandidateRow>(
    `WITH catalog AS (
       SELECT artist_entity_id FROM artist_profiles
     ),
     scope AS (
       SELECT artist_entity_id FROM catalog
       UNION
       SELECT CASE
                WHEN membership.group_artist_entity_id = catalog.artist_entity_id
                  THEN membership.member_artist_entity_id
                ELSE membership.group_artist_entity_id
              END
         FROM artist_group_memberships membership
         JOIN catalog
           ON catalog.artist_entity_id IN (membership.group_artist_entity_id, membership.member_artist_entity_id)
     ),
     identified AS (
       SELECT scope.artist_entity_id,
              COALESCE(
                (SELECT identifier.external_id
                   FROM artist_entity_identifiers identifier
                  WHERE identifier.artist_entity_id = scope.artist_entity_id
                    AND identifier.provider = $1
                  ORDER BY identifier.created_at DESC
                  LIMIT 1),
                (SELECT external.id_value
                   FROM artist_external_ids external
                  WHERE external.artist_entity_id = scope.artist_entity_id
                    AND external.id_type = 'mbid'
                  ORDER BY external.observed_at DESC
                  LIMIT 1)
              ) AS musicbrainz_id,
              (SELECT json_agg(
                        json_build_object('service', link.service, 'externalId', link.external_id, 'url', link.url)
                        ORDER BY array_position($2::text[], link.service)
                      )
                 FROM artist_service_links link
                WHERE link.artist_entity_id = scope.artist_entity_id
                  AND link.service = ANY($2::text[])) AS service_links,
              checks.checked_at
         FROM scope
         LEFT JOIN artist_identity_checks checks
           ON checks.artist_entity_id = scope.artist_entity_id
          AND checks.provider = $1
        WHERE checks.artist_entity_id IS NULL
           OR (checks.outcome = 'failed' AND checks.checked_at < $4)
           OR (checks.outcome <> 'failed' AND checks.checked_at < $3)
     )
     SELECT artist_entity_id, musicbrainz_id, service_links
       FROM identified
      WHERE musicbrainz_id IS NOT NULL OR service_links IS NOT NULL
      ORDER BY checked_at ASC NULLS FIRST, artist_entity_id ASC
      LIMIT $5`,
    [IDENTITY_PROVIDER, MAPPABLE_LINK_SERVICES, params.recheckBefore, params.retryFailedBefore, params.limit],
  );
  return result.rows.map((row) => ({
    artistEntityId: row.artist_entity_id,
    musicBrainzId: row.musicbrainz_id,
    serviceLinks: row.service_links ?? [],
  }));
}

/**
 * Records a MusicBrainz snapshot for one entity. See
 * `TrackRepository.recordArtistIdentity`.
 */
export async function recordArtistIdentity(
  pool: Pool,
  artistEntityId: string,
  snapshot: ArtistIdentitySnapshot,
  checkedAt: Date,
): Promise<"matched" | "conflict"> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const holder = await findEntityByProviderId(client, snapshot.providerArtistId);
    if (holder && holder !== artistEntityId) {
      if (!(await isEnrichmentPlaceholder(client, holder))) {
        await writeCheck(client, artistEntityId, "conflict", checkedAt);
        await client.query("COMMIT");
        return "conflict";
      }
      await mergePlaceholder(client, holder, artistEntityId);
    }

    const sourceId = await upsertSource(client, snapshot, checkedAt);
    await client.query(`UPDATE artist_entities SET entity_type = $2, updated_at = $3 WHERE id = $1`, [
      artistEntityId,
      snapshot.entityType,
      checkedAt,
    ]);
    await ensureIdentifier(client, artistEntityId, snapshot.providerArtistId, snapshot.sourceUrl, sourceId);
    await replaceEvents(client, artistEntityId, snapshot, sourceId);
    await replaceMemberships(client, artistEntityId, snapshot.memberships, sourceId, checkedAt);
    await writeCheck(client, artistEntityId, "matched", checkedAt);
    await client.query("COMMIT");
    return "matched";
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Records a MusicBrainz check that wrote no snapshot. See
 * `TrackRepository.recordArtistIdentityCheck`.
 */
export async function recordArtistIdentityCheck(
  pool: Pool,
  artistEntityId: string,
  outcome: Exclude<ArtistIdentityCheckOutcome, "matched">,
  checkedAt: Date,
): Promise<void> {
  await writeCheck(pool, artistEntityId, outcome, checkedAt);
}

async function writeCheck(
  target: Pool | PoolClient,
  artistEntityId: string,
  outcome: ArtistIdentityCheckOutcome,
  checkedAt: Date,
): Promise<void> {
  await target.query(
    `INSERT INTO artist_identity_checks (artist_entity_id, provider, outcome, checked_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (artist_entity_id, provider) DO UPDATE SET outcome = EXCLUDED.outcome, checked_at = EXCLUDED.checked_at`,
    [artistEntityId, IDENTITY_PROVIDER, outcome, checkedAt],
  );
}

/** The entity that carries a MusicBrainz id, if any does. */
async function findEntityByProviderId(client: PoolClient, providerArtistId: string): Promise<string | null> {
  const result = await client.query<{ artist_entity_id: string }>(
    `SELECT artist_entity_id FROM artist_entity_identifiers WHERE provider = $1 AND external_id = $2`,
    [IDENTITY_PROVIDER, providerArtistId],
  );
  return result.rows[0]?.artist_entity_id ?? null;
}

/**
 * Whether an entity exists only because the enrichment met it on the far side
 * of a membership: it has no profile and no track or album credit. Such an
 * entity is folded into the catalog entity that turns out to be the same
 * artist. One that the catalog uses is never touched.
 */
async function isEnrichmentPlaceholder(client: PoolClient, artistEntityId: string): Promise<boolean> {
  const result = await client.query<{ used: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM artist_profiles WHERE artist_entity_id = $1)
         OR EXISTS (SELECT 1 FROM track_artist_credits WHERE artist_entity_id = $1)
         OR EXISTS (SELECT 1 FROM album_artist_credits WHERE artist_entity_id = $1) AS used`,
    [artistEntityId],
  );
  return result.rows[0]?.used === false;
}

/**
 * Moves a placeholder's memberships to the catalog entity it turned out to be,
 * then removes the placeholder with its names, identifier and dates.
 */
async function mergePlaceholder(client: PoolClient, placeholderId: string, artistEntityId: string): Promise<void> {
  await client.query(
    `UPDATE artist_group_memberships SET group_artist_entity_id = $2 WHERE group_artist_entity_id = $1`,
    [placeholderId, artistEntityId],
  );
  await client.query(
    `UPDATE artist_group_memberships SET member_artist_entity_id = $2 WHERE member_artist_entity_id = $1`,
    [placeholderId, artistEntityId],
  );
  await client.query(`DELETE FROM artist_entities WHERE id = $1`, [placeholderId]);
}

/** The one source row per MusicBrainz artist, created on the first fetch and dated on every later one. */
async function upsertSource(client: PoolClient, snapshot: ArtistIdentitySnapshot, fetchedAt: Date): Promise<string> {
  const updated = await client.query<{ id: string }>(
    `UPDATE artist_sources SET fetched_at = $3, source_url = $4
      WHERE provider = $1 AND provider_entity_id = $2
      RETURNING id`,
    [IDENTITY_PROVIDER, snapshot.providerArtistId, fetchedAt, snapshot.sourceUrl],
  );
  if (updated.rows[0]) return updated.rows[0].id;

  const sourceId = generateTrackId();
  await client.query(
    `INSERT INTO artist_sources (id, provider, provider_entity_id, source_url, fetched_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [sourceId, IDENTITY_PROVIDER, snapshot.providerArtistId, snapshot.sourceUrl, fetchedAt],
  );
  return sourceId;
}

async function ensureIdentifier(
  client: PoolClient,
  artistEntityId: string,
  providerArtistId: string,
  url: string,
  sourceId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO artist_entity_identifiers (id, artist_entity_id, provider, external_id, external_url, source_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (provider, external_id) DO NOTHING`,
    [generateTrackId(), artistEntityId, IDENTITY_PROVIDER, providerArtistId, url, sourceId],
  );
}

async function replaceEvents(
  client: PoolClient,
  artistEntityId: string,
  snapshot: ArtistIdentitySnapshot,
  sourceId: string,
): Promise<void> {
  await client.query(
    `DELETE FROM artist_entity_events event
      USING artist_sources source
      WHERE event.artist_entity_id = $1 AND event.source_id = source.id AND source.provider = $2`,
    [artistEntityId, IDENTITY_PROVIDER],
  );
  for (const event of snapshot.events) {
    await client.query(
      `INSERT INTO artist_entity_events (
         id, artist_entity_id, event_type, date_value, date_precision,
         event_year, event_month, event_day, source_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        generateTrackId(),
        artistEntityId,
        event.eventType,
        event.date.value,
        event.date.precision,
        event.date.year,
        event.date.month,
        event.date.day,
        sourceId,
      ],
    );
  }
}

async function replaceMemberships(
  client: PoolClient,
  artistEntityId: string,
  memberships: ArtistMembershipSnapshot[],
  sourceId: string,
  now: Date,
): Promise<void> {
  await client.query(
    `DELETE FROM artist_group_memberships membership
      USING artist_sources source
      WHERE membership.source_id = source.id
        AND source.provider = $2
        AND $1 IN (membership.group_artist_entity_id, membership.member_artist_entity_id)`,
    [artistEntityId, IDENTITY_PROVIDER],
  );
  for (const membership of memberships) {
    const counterpartId = await resolveCounterpart(client, membership.counterpart, now);
    if (counterpartId === artistEntityId) continue;
    const [groupId, memberId] =
      membership.side === "member" ? [counterpartId, artistEntityId] : [artistEntityId, counterpartId];
    const membershipId = generateTrackId();
    await client.query(
      `INSERT INTO artist_group_memberships (
         id, group_artist_entity_id, member_artist_entity_id,
         begin_date, begin_date_precision, begin_year, begin_month, begin_day,
         end_date, end_date_precision, end_year, end_month, end_day,
         is_current, source_id, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)`,
      [
        membershipId,
        groupId,
        memberId,
        ...partialDateColumns(membership.begin),
        ...partialDateColumns(membership.end),
        membership.isCurrent,
        sourceId,
        now,
      ],
    );
    for (const role of new Set(membership.roles)) {
      await client.query(`INSERT INTO artist_group_membership_roles (membership_id, role) VALUES ($1, $2)`, [
        membershipId,
        role,
      ]);
    }
  }
}

/** The five columns a membership stores per date: the date, its precision, and its year, month and day. */
function partialDateColumns(
  date: PartialDateRecord | null,
): [string | null, string, number | null, number | null, number | null] {
  if (!date) return [null, "unknown", null, null, null];
  return [date.value, date.precision, date.year, date.month, date.day];
}

/**
 * The entity for an artist on the far side of a membership: the one carrying
 * its MusicBrainz id, or a new one created with its name, type and id. A name
 * alone never matches an existing entity, because two artists share names.
 */
async function resolveCounterpart(
  client: PoolClient,
  counterpart: { providerArtistId: string; name: string; entityType: ArtistEntityType },
  now: Date,
): Promise<string> {
  const existing = await findEntityByProviderId(client, counterpart.providerArtistId);
  if (existing) return existing;

  const artistEntityId = generateTrackId();
  const url = `https://musicbrainz.org/artist/${counterpart.providerArtistId}`;
  await client.query(
    `INSERT INTO artist_entities (id, entity_type, verification_status, confidence, created_at, updated_at)
     VALUES ($1, $2, 'candidate', NULL, $3, $3)`,
    [artistEntityId, counterpart.entityType, now],
  );
  await client.query(
    `INSERT INTO artist_entity_names (id, artist_entity_id, locale, name, name_type, created_at)
     VALUES ($1, $2, NULL, $3, 'canonical', $4)`,
    [generateTrackId(), artistEntityId, counterpart.name, now],
  );
  await client.query(
    `INSERT INTO artist_entity_identifiers (id, artist_entity_id, provider, external_id, external_url)
     VALUES ($1, $2, $3, $4, $5)`,
    [generateTrackId(), artistEntityId, IDENTITY_PROVIDER, counterpart.providerArtistId, url],
  );
  return artistEntityId;
}
