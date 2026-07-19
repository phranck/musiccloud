import { randomUUID } from "node:crypto";
import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findShortIdsByTrackUrls } from "../postgres-tracks.js";

/**
 * Runs only against an explicit isolated test database. Fixtures are inserted
 * without artist or service-link relations and teardown deletes the exact
 * short-url rows before their owning tracks.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL)("track short-id batch repository (integration)", () => {
  let pool: pgModule.Pool;
  const fixture = randomUUID();
  const trackIds = [`it-mc35-track-${fixture}-one`, `it-mc35-track-${fixture}-two`];
  const shortIds = [`it-mc35-short-${fixture}-one`, `it-mc35-short-${fixture}-two`];
  const urls = [`https://example.test/mc35/${fixture}/one`, `https://example.test/mc35/${fixture}/two`];

  beforeAll(async () => {
    pool = new pgModule.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const now = new Date();
    await pool.query(
      `INSERT INTO tracks (id, title, source_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4), ($5, $6, $7, $4, $4)`,
      [trackIds[0], "MC-35 fixture one", urls[0], now, trackIds[1], "MC-35 fixture two", urls[1]],
    );
    await pool.query(
      `INSERT INTO short_urls (id, track_id, created_at)
       VALUES ($1, $2, $3), ($4, $5, $3)`,
      [shortIds[0], trackIds[0], now, shortIds[1], trackIds[1]],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM short_urls WHERE id = ANY($1::text[])", [shortIds]);
    await pool.query("DELETE FROM tracks WHERE id = ANY($1::text[])", [trackIds]);
    await pool.end();
  });

  it("returns only persisted URL mappings from the isolated fixture set", async () => {
    const mappings = await findShortIdsByTrackUrls(pool, [urls[0], urls[1], urls[0], "https://example.test/missing"]);

    expect(mappings).toEqual(
      new Map([
        [urls[0], shortIds[0]],
        [urls[1], shortIds[1]],
      ]),
    );
  });
});
