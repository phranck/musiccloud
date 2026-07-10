import type { VinylLayout } from "@musiccloud/shared";
import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateTrackId } from "../../../lib/short-id.js";
import { readAlbumVinylLayout, upsertAlbumVinylLayout } from "../postgres-albums.js";

/**
 * Exercises the positive, negative, and absent states of the persisted
 * Discogs vinyl-layout cache against a live Postgres database.
 *
 * The fixture inserts one isolated album and deletes only that album and its
 * layout row after the test.
 */
describe.skipIf(!process.env.DATABASE_URL)("album vinyl layouts (integration)", () => {
  let pool: pgModule.Pool;
  const albumId = generateTrackId();
  const uncheckedAlbumId = generateTrackId();
  const layout: VinylLayout = {
    discogsReleaseId: "15815903",
    sides: [
      {
        label: "A",
        tracks: [{ position: "A1", title: "The Sermon", durationMs: 1210000 }],
      },
    ],
  };

  beforeAll(async () => {
    pool = new pgModule.Pool({ connectionString: process.env.DATABASE_URL });
    const now = new Date();
    await pool.query(
      `INSERT INTO albums (id, title, created_at, updated_at)
       VALUES ($1, $2, $3, $4)`,
      [albumId, "MC-116 vinyl layout integration fixture", now, now],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM album_vinyl_layouts WHERE album_id = $1", [albumId]);
    await pool.query("DELETE FROM albums WHERE id = $1", [albumId]);
    await pool.end();
  });

  it("round-trips layouts, replaces them with a negative cache, and distinguishes an absent row", async () => {
    await upsertAlbumVinylLayout(pool, albumId, layout);
    await expect(readAlbumVinylLayout(pool, albumId)).resolves.toEqual(layout);

    await upsertAlbumVinylLayout(pool, albumId, null);
    await expect(readAlbumVinylLayout(pool, albumId)).resolves.toBeNull();

    await expect(readAlbumVinylLayout(pool, uncheckedAlbumId)).resolves.toBeUndefined();
  });
});
