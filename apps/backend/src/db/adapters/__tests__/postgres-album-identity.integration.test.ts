import type { VinylLayout } from "@musiccloud/shared";
import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAlbumIdentityKey } from "../../../services/album-identity.js";
import { readVinylLayout, upsertVinylLayout } from "../postgres-albums.js";

/**
 * Exercises the artist-qualified identity that keys the layout cache against
 * the local database.
 *
 * The property under test is that two releases sharing a title but not a
 * primary artist never share a layout. Both keys are built through
 * {@link createAlbumIdentityKey} rather than written out, so the test follows
 * the normalisation instead of restating it.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL)("album identity vinyl cache (integration)", () => {
  let pool: pgModule.Pool;
  const title = "MC-119 shared-title fixture";
  const firstIdentity = createAlbumIdentityKey({ artists: ["MC-119 First Artist"], title }) as string;
  const secondIdentity = createAlbumIdentityKey({ artists: ["MC-119 Second Artist"], title }) as string;
  const layout: VinylLayout = {
    discogsReleaseId: "10013707",
    sides: [{ label: "A", tracks: [{ position: "A1", title: "Fixture", durationMs: 1_000 }] }],
  };

  beforeAll(() => {
    pool = new pgModule.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  });

  afterAll(async () => {
    await pool.query("DELETE FROM vinyl_layouts WHERE identity_key = ANY($1::text[])", [
      [firstIdentity, secondIdentity],
    ]);
    await pool.end();
  });

  it("shares a layout only with the matching primary artist, never by title alone", async () => {
    expect(firstIdentity).not.toBe(secondIdentity);

    await upsertVinylLayout(pool, firstIdentity, layout);

    await expect(readVinylLayout(pool, firstIdentity)).resolves.toEqual(layout);
    await expect(readVinylLayout(pool, secondIdentity)).resolves.toBeUndefined();
  });
});
