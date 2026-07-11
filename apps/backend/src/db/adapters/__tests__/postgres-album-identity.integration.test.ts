import type { VinylLayout } from "@musiccloud/shared";
import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAlbumIdentityKey } from "../../../services/album-identity.js";
import {
  createAlbumVinylLayoutPlaceholder,
  deleteAlbumVinylLayoutPlaceholder,
  ensureAlbumVinylLayoutIdentity,
  findAlbumByVinylLayoutIdentity,
  readAlbumVinylLayout,
  upsertAlbumVinylLayout,
} from "../postgres-albums.js";

/**
 * Exercises the artist-qualified identity used by track resolves against the
 * local database. Fixtures are minimal placeholders, so they create no artist
 * entities or names; teardown removes only their own rows.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL)("album identity vinyl cache (integration)", () => {
  let pool: pgModule.Pool;
  let firstAlbumId: string;
  let secondAlbumId: string;
  const albumIds: string[] = [];
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
    pool = new pgModule.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    firstAlbumId = await createAlbumVinylLayoutPlaceholder(pool, title);
    secondAlbumId = await createAlbumVinylLayoutPlaceholder(pool, title);
    albumIds.push(firstAlbumId, secondAlbumId);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM album_vinyl_layout_identities WHERE album_id = ANY($1::text[])", [albumIds]);
    await pool.query("DELETE FROM album_vinyl_layouts WHERE album_id = ANY($1::text[])", [albumIds]);
    await pool.query("DELETE FROM albums WHERE id = ANY($1::text[])", [albumIds]);
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

  it("leaves only one owner after concurrent claims and safely removes the loser", async () => {
    const identity = createAlbumIdentityKey({ artists: ["MC-119 Concurrent Artist"], title: "MC-119 concurrent" })!;
    const first = await createAlbumVinylLayoutPlaceholder(pool, "MC-119 concurrent");
    const second = await createAlbumVinylLayoutPlaceholder(pool, "MC-119 concurrent");
    albumIds.push(first, second);

    const [firstOwner, secondOwner] = await Promise.all([
      ensureAlbumVinylLayoutIdentity(pool, identity, first),
      ensureAlbumVinylLayoutIdentity(pool, identity, second),
    ]);
    expect(firstOwner).toBe(secondOwner);
    const loser = firstOwner === first ? second : first;
    await deleteAlbumVinylLayoutPlaceholder(pool, loser);

    await expect(findAlbumByVinylLayoutIdentity(pool, identity)).resolves.toEqual({ albumId: firstOwner });
    const remaining = await pool.query("SELECT id FROM albums WHERE id = ANY($1::text[])", [[first, second]]);
    expect(remaining.rows).toHaveLength(1);
  });
});
