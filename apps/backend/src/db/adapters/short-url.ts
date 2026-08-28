/**
 * @file Allocates the public short id that addresses a shareable entity.
 *
 * Every share URL is a short id resolved against one of six tables. Each table
 * holds the id as its primary key and carries a unique index on the column
 * referencing the entity, so two rules apply at once: an id belongs to exactly
 * one entity, and an entity has exactly one id.
 *
 * Allocation therefore has to answer two different conflicts. The entity may
 * already own an id, in which case that id is the answer. Or the generated
 * candidate may already belong to a different entity, in which case a new
 * candidate is needed. Both surface as "no row was written", which is why the
 * caller cannot distinguish them and this module does.
 *
 * The returned id is always the one the database holds, never the candidate
 * that was offered. A caller that returns its own candidate hands out a URL
 * that resolves to somebody else's entity.
 */
import type { PoolClient } from "pg";
import { generateShortId } from "../../lib/short-id.js";

/**
 * The short-url tables and the column each uses to reference its entity.
 *
 * A table name and a column name cannot be bound as query parameters, so they
 * are interpolated into the statement. Keeping them in a closed map means the
 * interpolated text can only ever be one of these twelve literals, and a caller
 * cannot reach the query with a string of its own.
 */
const SHORT_URL_FOREIGN_KEYS = {
  short_urls: "track_id",
  album_short_urls: "album_id",
  artist_short_urls: "artist_entity_id",
  cc_short_urls: "cc_track_id",
  cc_album_short_urls: "cc_album_id",
  cc_artist_short_urls: "cc_artist_id",
} as const;

/** A table that maps short ids to entities. */
export type ShortUrlTable = keyof typeof SHORT_URL_FOREIGN_KEYS;

/**
 * How many candidates are offered before allocation gives up.
 *
 * Each attempt fails only on a collision. At the current id length a single
 * collision is already unlikely, so five consecutive ones indicate that the id
 * space is exhausted or that something else is wrong, and both warrant a loud
 * failure rather than another round.
 */
const MAX_MINT_ATTEMPTS = 5;

/**
 * Reads the short id an entity already owns.
 *
 * @param client - Active transaction client.
 * @param table - The short-url table to read from.
 * @param fkColumn - The entity-referencing column of that table.
 * @param entityId - The entity whose id is wanted.
 * @returns The stored short id, or `null` when the entity has none yet.
 */
async function readShortId(
  client: PoolClient,
  table: ShortUrlTable,
  fkColumn: string,
  entityId: string,
): Promise<string | null> {
  const result = await client.query<{ id: string }>(`SELECT id FROM ${table} WHERE ${fkColumn} = $1`, [entityId]);
  return result.rows[0]?.id ?? null;
}

/**
 * Returns the short id for an entity, allocating one when it has none.
 *
 * Idempotent: calling it twice for the same entity returns the same id and
 * writes nothing the second time. Safe against a concurrent transaction
 * allocating for the same entity, because a write that lands nowhere is
 * followed by a re-read before another candidate is tried.
 *
 * Must run inside the transaction that created the entity row, since the
 * short-url tables carry a foreign key to it.
 *
 * @param client - Active transaction client.
 * @param table - The short-url table that addresses this kind of entity.
 * @param entityId - The entity to address.
 * @param now - Timestamp written to `created_at`.
 * @returns The short id held by the database for this entity.
 * @throws When {@link MAX_MINT_ATTEMPTS} candidates in a row are already taken.
 */
export async function mintShortUrl(
  client: PoolClient,
  table: ShortUrlTable,
  entityId: string,
  now: Date,
): Promise<string> {
  const fkColumn = SHORT_URL_FOREIGN_KEYS[table];

  const owned = await readShortId(client, table, fkColumn, entityId);
  if (owned) return owned;

  for (let attempt = 0; attempt < MAX_MINT_ATTEMPTS; attempt++) {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO ${table} (id, ${fkColumn}, created_at) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [generateShortId(), entityId, now],
    );
    if (inserted.rows.length > 0) return inserted.rows[0].id;

    // Nothing was written, and the omitted conflict target means either unique
    // rule could have blocked it. A row for this entity means another
    // transaction got there first and its id is the answer; no row means the
    // candidate is taken by a different entity, so the next one is tried.
    const claimedConcurrently = await readShortId(client, table, fkColumn, entityId);
    if (claimedConcurrently) return claimedConcurrently;
  }

  throw new Error(`Could not allocate a short id in ${table} after ${MAX_MINT_ATTEMPTS} attempts.`);
}
