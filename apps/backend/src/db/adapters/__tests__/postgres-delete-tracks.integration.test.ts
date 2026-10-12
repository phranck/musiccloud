import { randomUUID } from "node:crypto";
import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabaseUrl } from "../../../__tests__/integration-database.js";
import { deleteTracks } from "../postgres-admin-catalog.js";

/**
 * Runs only against an explicit isolated test database. The fixture is one
 * track with one recorded service miss, both keyed by a value unique to the
 * run, and teardown removes exactly those rows if the test left them.
 */
describe.skipIf(!integrationDatabaseUrl())("deleting tracks (integration)", () => {
  let pool: pgModule.Pool;
  const fixture = randomUUID();
  const trackId = `it-329-track-${fixture}`;
  const missId = `it-329-miss-${fixture}`;

  beforeAll(async () => {
    pool = new pgModule.Pool({ connectionString: integrationDatabaseUrl() });
    const now = new Date();
    await pool.query(`INSERT INTO tracks (id, title, source_url, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)`, [
      trackId,
      "#329 fixture",
      `https://example.test/329/${fixture}`,
      now,
    ]);
    await pool.query(
      `INSERT INTO service_link_misses (id, track_id, service, checked_at) VALUES ($1, $2, 'deezer', $3)`,
      [missId, trackId, now],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM service_link_misses WHERE id = $1", [missId]);
    await pool.query("DELETE FROM tracks WHERE id = $1", [trackId]);
    await pool.end();
  });

  it("removes a track that has a recorded service miss, and the miss with it", async () => {
    await deleteTracks(pool, [trackId]);

    const tracks = await pool.query("SELECT 1 FROM tracks WHERE id = $1", [trackId]);
    const misses = await pool.query("SELECT 1 FROM service_link_misses WHERE id = $1", [missId]);
    expect(tracks.rowCount).toBe(0);
    expect(misses.rowCount).toBe(0);
  });
});
