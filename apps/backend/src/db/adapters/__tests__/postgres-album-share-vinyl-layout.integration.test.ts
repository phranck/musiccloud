import type { VinylLayout } from "@musiccloud/shared";
import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateShortId, generateTrackId } from "../../../lib/short-id.js";
import { createAlbumIdentityKey } from "../../../services/album-identity.js";
import { loadAlbumByShortId, upsertVinylLayout } from "../postgres-albums.js";

/**
 * Exercises the positive, negative, and absent vinyl-layout states returned by
 * the album short-id share projection against a live Postgres database.
 *
 * The layout is keyed by album identity rather than by album id, so each
 * fixture carries an artist credit: without a primary artist there is no
 * identity and therefore no cache entry to find. Cleanup removes only the rows
 * these fixtures created.
 */
describe.skipIf(!process.env.DATABASE_URL)("album share vinyl layouts (integration)", () => {
  let pool: pgModule.Pool;
  const artist = "MC-116 Fixture Artist";
  const fixtures = [
    { albumId: generateTrackId(), shortId: generateShortId(), title: "MC-116 positive share fixture" },
    { albumId: generateTrackId(), shortId: generateShortId(), title: "MC-116 negative share fixture" },
    { albumId: generateTrackId(), shortId: generateShortId(), title: "MC-116 absent share fixture" },
  ] as const;
  const [positive, negative, absent] = fixtures;
  const identityKeyFor = (title: string) => {
    const key = createAlbumIdentityKey({ artists: [artist], title });
    if (!key) throw new Error(`fixture title yields no identity: ${title}`);
    return key;
  };
  const layout: VinylLayout = {
    discogsReleaseId: "15815903",
    sides: [{ label: "A", tracks: [{ position: "A1", title: "The Sermon", durationMs: 1_210_000 }] }],
  };

  beforeAll(async () => {
    pool = new pgModule.Pool({ connectionString: process.env.DATABASE_URL });
    const now = new Date();

    for (const fixture of fixtures) {
      await pool.query(`INSERT INTO albums (id, title, created_at, updated_at) VALUES ($1, $2, $3, $4)`, [
        fixture.albumId,
        fixture.title,
        now,
        now,
      ]);
      await pool.query(`INSERT INTO album_short_urls (id, album_id, created_at) VALUES ($1, $2, $3)`, [
        fixture.shortId,
        fixture.albumId,
        now,
      ]);
      await pool.query(
        `INSERT INTO album_artist_credits (id, album_id, credit_name, credit_role, credit_position, created_at)
         VALUES ($1, $2, $3, 'main', 0, $4)`,
        [generateTrackId(), fixture.albumId, artist, now],
      );
    }
  });

  afterAll(async () => {
    for (const fixture of fixtures) {
      await pool.query("DELETE FROM vinyl_layouts WHERE identity_key = $1", [identityKeyFor(fixture.title)]);
      await pool.query("DELETE FROM album_artist_credits WHERE album_id = $1", [fixture.albumId]);
      await pool.query("DELETE FROM album_short_urls WHERE album_id = $1", [fixture.albumId]);
      await pool.query("DELETE FROM albums WHERE id = $1", [fixture.albumId]);
    }
    await pool.end();
  });

  it("reads a complete positive layout through the album short id", async () => {
    await upsertVinylLayout(pool, identityKeyFor(positive.title), layout);

    const result = await loadAlbumByShortId(pool, positive.shortId);

    expect(result?.album.vinylLayout).toEqual(layout);
  });

  it("returns an explicit negative cache through the album short id as null", async () => {
    await upsertVinylLayout(pool, identityKeyFor(negative.title), null);

    const result = await loadAlbumByShortId(pool, negative.shortId);

    expect(result?.album.vinylLayout).toBeNull();
  });

  it("returns an album whose identity has never been checked as null", async () => {
    const result = await loadAlbumByShortId(pool, absent.shortId);

    expect(result?.album.vinylLayout).toBeNull();
  });
});
