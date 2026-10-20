import { randomUUID } from "node:crypto";
import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabaseUrl } from "../../../__tests__/integration-database.js";
import { loadAlbumByShortId } from "../postgres-albums.js";
import { loadByShortId, loadSharePageResult } from "../postgres-tracks.js";

/**
 * Runs only against an explicit isolated test database. Every fixture id carries a run-unique prefix, and teardown
 * deletes exactly those rows, short URLs before their records because those references do not cascade.
 */
describe.skipIf(!integrationDatabaseUrl())("alias short ids (integration)", () => {
  let pool: pgModule.Pool;
  const run = randomUUID();
  const ids = {
    track: `it-alias-track-${run}`,
    trackWithoutAlias: `it-alias-track-plain-${run}`,
    album: `it-alias-album-${run}`,
    canonicalTrack: `it-alias-ct-${run}`,
    canonicalPlainTrack: `it-alias-cp-${run}`,
    aliasOfTrack: `it-alias-t-${run}`,
    canonicalAlbum: `it-alias-ca-${run}`,
    aliasOfAlbum: `it-alias-a-${run}`,
  };

  beforeAll(async () => {
    pool = new pgModule.Pool({ connectionString: integrationDatabaseUrl() });
    const now = new Date();
    await pool.query(
      `INSERT INTO tracks (id, title, created_at, updated_at) VALUES ($1, 'Alias fixture', $3, $3), ($2, 'Plain fixture', $3, $3)`,
      [ids.track, ids.trackWithoutAlias, now],
    );
    await pool.query(`INSERT INTO short_urls (id, track_id, created_at) VALUES ($1, $2, $5), ($3, $4, $5)`, [
      ids.canonicalTrack,
      ids.track,
      ids.canonicalPlainTrack,
      ids.trackWithoutAlias,
      now,
    ]);
    await pool.query(`INSERT INTO track_short_url_aliases (id, track_id, created_at) VALUES ($1, $2, $3)`, [
      ids.aliasOfTrack,
      ids.track,
      now,
    ]);
    await pool.query(
      `INSERT INTO albums (id, title, created_at, updated_at) VALUES ($1, 'Alias album fixture', $2, $2)`,
      [ids.album, now],
    );
    await pool.query(`INSERT INTO album_short_urls (id, album_id, created_at) VALUES ($1, $2, $3)`, [
      ids.canonicalAlbum,
      ids.album,
      now,
    ]);
    await pool.query(`INSERT INTO album_short_url_aliases (id, album_id, created_at) VALUES ($1, $2, $3)`, [
      ids.aliasOfAlbum,
      ids.album,
      now,
    ]);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM track_short_url_aliases WHERE id = $1", [ids.aliasOfTrack]);
    await pool.query("DELETE FROM album_short_url_aliases WHERE id = $1", [ids.aliasOfAlbum]);
    await pool.query("DELETE FROM short_urls WHERE id = ANY($1::text[])", [
      [ids.canonicalTrack, ids.canonicalPlainTrack],
    ]);
    await pool.query("DELETE FROM album_short_urls WHERE id = $1", [ids.canonicalAlbum]);
    await pool.query("DELETE FROM tracks WHERE id = ANY($1::text[])", [[ids.track, ids.trackWithoutAlias]]);
    await pool.query("DELETE FROM albums WHERE id = $1", [ids.album]);
    await pool.end();
  });

  it("opens the canonical track for an alias and reports the canonical short id", async () => {
    const byCanonical = await loadByShortId(pool, ids.canonicalTrack);
    const byAlias = await loadByShortId(pool, ids.aliasOfTrack);

    expect(byAlias?.trackId).toBe(ids.track);
    expect(byAlias?.shortId).toBe(ids.canonicalTrack);
    expect(byAlias).toEqual(byCanonical);
  });

  it("opens the canonical track page result for an alias", async () => {
    const byAlias = await loadSharePageResult(pool, ids.aliasOfTrack);

    expect(byAlias?.trackId).toBe(ids.track);
    expect(byAlias?.shortId).toBe(ids.canonicalTrack);
  });

  it("opens the canonical album for an alias and reports the canonical short id", async () => {
    const byCanonical = await loadAlbumByShortId(pool, ids.canonicalAlbum);
    const byAlias = await loadAlbumByShortId(pool, ids.aliasOfAlbum);

    expect(byAlias?.albumId).toBe(ids.album);
    expect(byAlias?.shortId).toBe(ids.canonicalAlbum);
    expect(byAlias).toEqual(byCanonical);
  });

  it("answers not found for an id that is neither canonical nor an alias", async () => {
    expect(await loadByShortId(pool, `it-alias-unknown-${run}`)).toBeNull();
    expect(await loadSharePageResult(pool, `it-alias-unknown-${run}`)).toBeNull();
    expect(await loadAlbumByShortId(pool, `it-alias-unknown-${run}`)).toBeNull();
  });

  it("does not let an alias of one kind open the other kind", async () => {
    expect(await loadAlbumByShortId(pool, ids.aliasOfTrack)).toBeNull();
    expect(await loadByShortId(pool, ids.aliasOfAlbum)).toBeNull();
  });

  it("keeps an unrelated track unaffected", async () => {
    expect((await loadByShortId(pool, ids.canonicalPlainTrack))?.trackId).toBe(ids.trackWithoutAlias);
  });

  it("removes an alias together with its record", async () => {
    const doomed = `it-alias-doomed-${run}`;
    const now = new Date();
    await pool.query(`INSERT INTO tracks (id, title, created_at, updated_at) VALUES ($1, 'Doomed', $2, $2)`, [
      doomed,
      now,
    ]);
    await pool.query(`INSERT INTO short_urls (id, track_id, created_at) VALUES ($1, $2, $3)`, [
      `${doomed}-s`,
      doomed,
      now,
    ]);
    await pool.query(`INSERT INTO track_short_url_aliases (id, track_id, created_at) VALUES ($1, $2, $3)`, [
      `${doomed}-a`,
      doomed,
      now,
    ]);

    await pool.query("DELETE FROM short_urls WHERE id = $1", [`${doomed}-s`]);
    await pool.query("DELETE FROM tracks WHERE id = $1", [doomed]);

    const { rowCount } = await pool.query("SELECT 1 FROM track_short_url_aliases WHERE id = $1", [`${doomed}-a`]);
    expect(rowCount).toBe(0);
  });
});
