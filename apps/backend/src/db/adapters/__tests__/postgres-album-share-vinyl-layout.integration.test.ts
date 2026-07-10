import type { VinylLayout } from "@musiccloud/shared";
import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateShortId, generateTrackId } from "../../../lib/short-id.js";
import { loadAlbumByShortId, upsertAlbumVinylLayout } from "../postgres-albums.js";

/**
 * Exercises the positive, negative, and absent vinyl-layout states returned
 * by the album short-id share projection against a live Postgres database.
 *
 * Every fixture owns a unique album and short id. Cleanup removes only those
 * rows and their vinyl-layout cache entries.
 */
describe.skipIf(!process.env.DATABASE_URL)("album share vinyl layouts (integration)", () => {
  let pool: pgModule.Pool;
  const positiveAlbumId = generateTrackId();
  const negativeAlbumId = generateTrackId();
  const absentAlbumId = generateTrackId();
  const positiveShortId = generateShortId();
  const negativeShortId = generateShortId();
  const absentShortId = generateShortId();
  const albumIds = [positiveAlbumId, negativeAlbumId, absentAlbumId];
  const layout: VinylLayout = {
    discogsReleaseId: "15815903",
    sides: [{ label: "A", tracks: [{ position: "A1", title: "The Sermon", durationMs: 1_210_000 }] }],
  };

  beforeAll(async () => {
    pool = new pgModule.Pool({ connectionString: process.env.DATABASE_URL });
    const now = new Date();
    const fixtures = [
      { albumId: positiveAlbumId, shortId: positiveShortId, title: "MC-116 positive share fixture" },
      { albumId: negativeAlbumId, shortId: negativeShortId, title: "MC-116 negative share fixture" },
      { albumId: absentAlbumId, shortId: absentShortId, title: "MC-116 absent share fixture" },
    ];

    for (const fixture of fixtures) {
      await pool.query(
        `INSERT INTO albums (id, title, created_at, updated_at)
         VALUES ($1, $2, $3, $4)`,
        [fixture.albumId, fixture.title, now, now],
      );
      await pool.query(
        `INSERT INTO album_short_urls (id, album_id, created_at)
         VALUES ($1, $2, $3)`,
        [fixture.shortId, fixture.albumId, now],
      );
    }
  });

  afterAll(async () => {
    for (const albumId of albumIds) {
      await pool.query("DELETE FROM album_vinyl_layouts WHERE album_id = $1", [albumId]);
      await pool.query("DELETE FROM album_short_urls WHERE album_id = $1", [albumId]);
      await pool.query("DELETE FROM albums WHERE id = $1", [albumId]);
    }
    await pool.end();
  });

  it("reads a complete positive layout through the album short id", async () => {
    await upsertAlbumVinylLayout(pool, positiveAlbumId, layout);

    const result = await loadAlbumByShortId(pool, positiveShortId);

    expect(result?.album.vinylLayout).toEqual(layout);
  });

  it("returns an explicit negative cache through the album short id as null", async () => {
    await upsertAlbumVinylLayout(pool, negativeAlbumId, null);

    const result = await loadAlbumByShortId(pool, negativeShortId);

    expect(result?.album.vinylLayout).toBeNull();
  });

  it("returns an album without a vinyl-layout row as null", async () => {
    const result = await loadAlbumByShortId(pool, absentShortId);

    expect(result?.album.vinylLayout).toBeNull();
  });
});
