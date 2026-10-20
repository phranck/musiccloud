/**
 * @file Allocates the public short id that addresses a shareable entity.
 *
 * Every share URL is a short id resolved against six tables, and the share
 * route answers with the first entity it finds. An id therefore has to be
 * unique across all six, not only in the table it is written to. Two further
 * tables hold alias ids of tracks and albums that absorbed duplicate records;
 * an id must differ from those as well. No database constraint spans the
 * tables, so this module is what makes it true: it checks every table for a
 * candidate before writing it, under a lock that makes a concurrent allocation
 * of the same candidate wait.
 *
 * Within one table two rules apply as well. Each table holds the id as its
 * primary key and carries a unique index on the column referencing the
 * entity, so an id belongs to exactly one entity and an entity has exactly
 * one id. When the entity already owns an id, that id is the answer.
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
 * The tables that hold further short ids for an entity, with the column that references it and the table that holds
 * its canonical id. They exist for entities that absorbed duplicate records: the id of a record that was merged away
 * still has to open the page of the record that stays.
 *
 * Kept as a closed map for the same reason as {@link SHORT_URL_FOREIGN_KEYS}: names are interpolated into statements.
 */
const SHORT_URL_ALIASES = {
  track_short_url_aliases: { entityColumn: "track_id", canonicalTable: "short_urls" },
  album_short_url_aliases: { entityColumn: "album_id", canonicalTable: "album_short_urls" },
} as const;

/** A table that holds alias short ids. */
export type ShortUrlAliasTable = keyof typeof SHORT_URL_ALIASES;

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
 * Holds every other allocation of the same candidate until this transaction
 * ends, whichever table that allocation writes to.
 *
 * Without it, two transactions could each find a candidate free in all six
 * tables and each insert it into a different one. With it, the second waits
 * for the first to commit and then, because the persist transactions run under
 * READ COMMITTED, sees the first one's row and moves on.
 *
 * @param client - Active transaction client.
 * @param candidate - The short id about to be checked and written.
 */
async function lockShortIdCandidate(client: PoolClient, candidate: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`short-id:${candidate}`]);
}

/** One statement that asks every short-url and alias table for an id, built from the closed maps. */
const SHORT_ID_TAKEN_QUERY = `${[...Object.keys(SHORT_URL_FOREIGN_KEYS), ...Object.keys(SHORT_URL_ALIASES)]
  .map((table) => `SELECT 1 FROM ${table} WHERE id = $1`)
  .join(" UNION ALL ")} LIMIT 1`;

/**
 * Whether any short-url or alias table already holds an id.
 *
 * The share route looks an id up in all six short-url tables and falls back to
 * the alias tables, and answers with the first entity it finds, so an id taken
 * in one table must not be issued in another.
 *
 * @param client - Active transaction client.
 * @param candidate - The short id to look for.
 * @returns `true` when some table holds it.
 */
async function isShortIdTaken(client: PoolClient, candidate: string): Promise<boolean> {
  const result = await client.query(SHORT_ID_TAKEN_QUERY, [candidate]);
  return result.rows.length > 0;
}

/**
 * Finds the canonical short id behind an alias.
 *
 * A lookup by short id calls this when the primary table does not hold the id. The caller then loads the page by the
 * returned canonical id, so an alias never has a code path of its own: it opens exactly the page the canonical id opens.
 *
 * @param queryable - A pool or a client.
 * @param aliasTable - The alias table of the entity kind.
 * @param shortId - The id that the primary table did not know.
 * @returns The canonical short id of the entity the alias addresses, or `null` when the id is no alias.
 */
export async function findCanonicalShortId(
  queryable: Pick<PoolClient, "query">,
  aliasTable: ShortUrlAliasTable,
  shortId: string,
): Promise<string | null> {
  const { entityColumn, canonicalTable } = SHORT_URL_ALIASES[aliasTable];
  const result = await queryable.query<{ id: string }>(
    `SELECT canonical.id FROM ${aliasTable} AS alias
       JOIN ${canonicalTable} AS canonical ON canonical.${entityColumn} = alias.${entityColumn}
      WHERE alias.id = $1`,
    [shortId],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Returns the short id for an entity, allocating one when it has none.
 *
 * Idempotent: calling it twice for the same entity returns the same id and
 * writes nothing the second time. Each candidate is locked and checked against
 * all six tables before it is written, and a taken one is skipped. Safe against
 * a concurrent transaction allocating for the same entity, because a write that
 * lands nowhere is followed by a re-read before another candidate is tried.
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
    const candidate = generateShortId();
    await lockShortIdCandidate(client, candidate);
    if (await isShortIdTaken(client, candidate)) continue;

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO ${table} (id, ${fkColumn}, created_at) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [candidate, entityId, now],
    );
    if (inserted.rows.length > 0) return inserted.rows[0].id;

    // Nothing was written although no table held the candidate, so the
    // entity's own unique index blocked it: another transaction allocated an
    // id for this entity first, and that id is the answer.
    const claimedConcurrently = await readShortId(client, table, fkColumn, entityId);
    if (claimedConcurrently) return claimedConcurrently;
  }

  throw new Error(`Could not allocate a short id in ${table} after ${MAX_MINT_ATTEMPTS} attempts.`);
}
