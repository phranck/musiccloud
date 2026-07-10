import type { VinylLayout } from "@musiccloud/shared";
import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAlbumIdentityKey } from "../../../services/album-identity.js";
import {
  ensureAlbumVinylLayoutIdentity,
  findAlbumByVinylLayoutIdentity,
  persistAlbumWithLinks,
  readAlbumVinylLayout,
  upsertAlbumVinylLayout,
} from "../postgres-albums.js";

/**
 * Exercises the artist-qualified identity used by track resolves against the
 * local database. Fixtures are isolated and only their own album rows are
 * removed in teardown.
 */
describe.skipIf(!process.env.DATABASE_URL)("album identity vinyl cache (integration)", () => {
  let pool: pgModule.Pool;
  let firstAlbumId: string;
  let secondAlbumId: string;
  const title = "MC-119 shared-title fixture";
  const firstArtist = "MC-119 First Artist";
  const secondArtist = "MC-119 Second Artist";
  const firstIdentity = createAlbumIdentityKey({ artists: [firstArtist], title })!;
  const secondIdentity = createAlbumIdentityKey({ artists: [secondArtist], title })!;
  const layout: VinylLayout = {
    discogsReleaseId: "10013707",
    sides: [{ label: "A", tracks: [{ position: "A1", title: "Fixture", durationMs: 1_000 }] }],
  };

  beforeAll(async () => {
    pool = new pgModule.Pool({ connectionString: process.env.DATABASE_URL });
    firstAlbumId = (await persistAlbumWithLinks(pool, { sourceAlbum: { title, artists: [firstArtist] }, links: [] }))
      .albumId;
    secondAlbumId = (await persistAlbumWithLinks(pool, { sourceAlbum: { title, artists: [secondArtist] }, links: [] }))
      .albumId;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM album_short_urls WHERE album_id = ANY($1::text[])", [[firstAlbumId, secondAlbumId]]);
    await pool.query("DELETE FROM album_vinyl_layouts WHERE album_id = ANY($1::text[])", [
      [firstAlbumId, secondAlbumId],
    ]);
    await pool.query("DELETE FROM albums WHERE id = ANY($1::text[])", [[firstAlbumId, secondAlbumId]]);
    await pool.end();
  });

  it("shares a layout only with the matching primary artist, never by title alone", async () => {
    await upsertAlbumVinylLayout(pool, firstAlbumId, layout);
    await expect(ensureAlbumVinylLayoutIdentity(pool, firstIdentity, firstAlbumId)).resolves.toBe(firstAlbumId);

    await expect(findAlbumByVinylLayoutIdentity(pool, firstIdentity)).resolves.toEqual({ albumId: firstAlbumId });
    await expect(readAlbumVinylLayout(pool, firstAlbumId)).resolves.toEqual(layout);
    await expect(findAlbumByVinylLayoutIdentity(pool, secondIdentity)).resolves.toBeNull();
    await expect(readAlbumVinylLayout(pool, secondAlbumId)).resolves.toBeUndefined();
  });
});
