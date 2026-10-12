import { randomUUID } from "node:crypto";
import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabaseUrl } from "../../../__tests__/integration-database.js";
import { addLinksToAlbum } from "../postgres-albums.js";
import { addLinksToArtist } from "../postgres-artists.js";
import { addLinksToTrack } from "../postgres-tracks.js";

/**
 * Runs only against an explicit isolated test database. It creates one track,
 * one album and one artist entity, writes one link to each twice with a
 * different match method, and teardown deletes exactly those rows.
 */
describe.skipIf(!integrationDatabaseUrl())("service link upserts (integration)", () => {
  let pool: pgModule.Pool;
  const fixture = randomUUID();
  const trackId = `it-mc431-track-${fixture}`;
  const albumId = `it-mc431-album-${fixture}`;
  const artistEntityId = `it-mc431-artist-${fixture}`;

  beforeAll(async () => {
    pool = new pgModule.Pool({ connectionString: integrationDatabaseUrl() });
    const now = new Date();
    await pool.query("INSERT INTO tracks (id, title, created_at, updated_at) VALUES ($1, $2, $3, $3)", [
      trackId,
      "MC-431 fixture track",
      now,
    ]);
    await pool.query("INSERT INTO albums (id, title, created_at, updated_at) VALUES ($1, $2, $3, $3)", [
      albumId,
      "MC-431 fixture album",
      now,
    ]);
    await pool.query(
      `INSERT INTO artist_entities (id, entity_type, verification_status, confidence, created_at, updated_at)
       VALUES ($1, 'unknown', 'candidate', NULL, $2, $2)`,
      [artistEntityId, now],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM service_links WHERE track_id = $1", [trackId]);
    await pool.query("DELETE FROM tracks WHERE id = $1", [trackId]);
    await pool.query("DELETE FROM album_service_links WHERE album_id = $1", [albumId]);
    await pool.query("DELETE FROM albums WHERE id = $1", [albumId]);
    await pool.query("DELETE FROM artist_service_links WHERE artist_entity_id = $1", [artistEntityId]);
    await pool.query("DELETE FROM artist_entities WHERE id = $1", [artistEntityId]);
    await pool.end();
  });

  const firstWrite = { service: "deezer", url: "https://www.deezer.com/x/1", confidence: 0.7, matchMethod: "search" };
  const secondWrite = { ...firstWrite, url: "https://www.deezer.com/x/2", confidence: 1, matchMethod: "source" };

  it.each([
    ["track", "service_links", "track_id", trackId, addLinksToTrack],
    ["album", "album_service_links", "album_id", albumId, addLinksToAlbum],
    ["artist", "artist_service_links", "artist_entity_id", artistEntityId, addLinksToArtist],
  ] as const)("stores the second match method of a %s link", async (_kind, table, column, entityId, addLinks) => {
    await addLinks(pool, entityId, [firstWrite]);
    await addLinks(pool, entityId, [secondWrite]);

    const { rows } = await pool.query<{ url: string; confidence: number; match_method: string }>(
      `SELECT url, confidence, match_method FROM ${table} WHERE ${column} = $1 AND service = 'deezer'`,
      [entityId],
    );
    expect(rows).toEqual([{ url: secondWrite.url, confidence: 1, match_method: "source" }]);
  });
});
