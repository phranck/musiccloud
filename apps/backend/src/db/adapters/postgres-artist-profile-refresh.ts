import { nanoid } from "nanoid";
import type { Pool } from "pg";
import type { ArtistProfileRefreshEvent } from "../admin-repository.js";

interface ArtistProfileRefreshEventRow {
  id: string;
  actor_admin_id: string;
  artist_entity_id: string;
  trigger: "manual";
  occurred_at: Date;
  completed_at: Date | null;
  outcome: ArtistProfileRefreshEvent["outcome"];
  error_code: string | null;
  error_id: string | null;
  cause: string | null;
}

const RETURNING_COLUMNS = `
  id, actor_admin_id, artist_entity_id, trigger, occurred_at,
  completed_at, outcome, error_code, error_id, cause`;

export async function beginArtistProfileRefresh(
  pool: Pool,
  data: { actorAdminId: string; artistEntityId: string; occurredAt: Date },
): Promise<ArtistProfileRefreshEvent> {
  const id = nanoid();
  const result = await pool.query<ArtistProfileRefreshEventRow>(
    `INSERT INTO artist_profile_refresh_events (
       id, actor_admin_id, artist_entity_id, trigger, occurred_at, outcome
     ) VALUES ($1, $2, $3, 'manual', $4, 'refreshing')
     RETURNING ${RETURNING_COLUMNS}`,
    [id, data.actorAdminId, data.artistEntityId, data.occurredAt],
  );
  return mapRefreshEvent(requireRefreshEvent(result.rows[0]));
}

export async function completeArtistProfileRefresh(
  pool: Pool,
  id: string,
  completedAt: Date,
): Promise<ArtistProfileRefreshEvent> {
  const result = await pool.query<ArtistProfileRefreshEventRow>(
    `UPDATE artist_profile_refresh_events
     SET completed_at = $2, outcome = 'succeeded'
     WHERE id = $1 AND outcome = 'refreshing'
     RETURNING ${RETURNING_COLUMNS}`,
    [id, completedAt],
  );
  return mapRefreshEvent(requireRefreshEvent(result.rows[0]));
}

export async function failArtistProfileRefresh(
  pool: Pool,
  id: string,
  data: { completedAt: Date; errorCode: string; errorId: string; cause: string },
): Promise<ArtistProfileRefreshEvent> {
  const result = await pool.query<ArtistProfileRefreshEventRow>(
    `UPDATE artist_profile_refresh_events
     SET completed_at = $2,
         outcome = 'failed',
         error_code = $3,
         error_id = $4,
         cause = $5
     WHERE id = $1 AND outcome = 'refreshing'
     RETURNING ${RETURNING_COLUMNS}`,
    [id, data.completedAt, data.errorCode, data.errorId, data.cause.slice(0, 240)],
  );
  return mapRefreshEvent(requireRefreshEvent(result.rows[0]));
}

function requireRefreshEvent(row: ArtistProfileRefreshEventRow | undefined): ArtistProfileRefreshEventRow {
  if (!row) throw new Error("Artist profile refresh event is not refreshing");
  return row;
}

function mapRefreshEvent(row: ArtistProfileRefreshEventRow): ArtistProfileRefreshEvent {
  return {
    id: row.id,
    actorAdminId: row.actor_admin_id,
    artistEntityId: row.artist_entity_id,
    trigger: row.trigger,
    occurredAt: new Date(row.occurred_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    outcome: row.outcome,
    errorCode: row.error_code,
    errorId: row.error_id,
    cause: row.cause,
  };
}
