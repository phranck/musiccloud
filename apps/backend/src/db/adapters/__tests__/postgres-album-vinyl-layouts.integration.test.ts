import type { VinylLayout } from "@musiccloud/shared";
import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readVinylLayout, upsertVinylLayout } from "../postgres-albums.js";

/**
 * Exercises the positive, negative, and absent states of the Discogs vinyl
 * layout cache against a live Postgres database.
 *
 * The cache is keyed by album identity and owns no album row, so the fixture
 * inserts nothing but its own cache entries and removes exactly those.
 */
describe.skipIf(!process.env.DATABASE_URL)("vinyl layouts (integration)", () => {
  let pool: pgModule.Pool;
  const checkedIdentity = "mc-116 fixture artist::checked release";
  const uncheckedIdentity = "mc-116 fixture artist::unchecked release";
  const layout: VinylLayout = {
    discogsReleaseId: "15815903",
    sides: [
      {
        label: "A",
        tracks: [{ position: "A1", title: "The Sermon", durationMs: 1210000 }],
      },
    ],
  };

  beforeAll(() => {
    pool = new pgModule.Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool.query("DELETE FROM vinyl_layouts WHERE identity_key = ANY($1::text[])", [
      [checkedIdentity, uncheckedIdentity],
    ]);
    await pool.end();
  });

  it("round-trips a positive layout, a negative cache, and an unchecked identity", async () => {
    await upsertVinylLayout(pool, checkedIdentity, layout);
    await expect(readVinylLayout(pool, checkedIdentity)).resolves.toEqual(layout);

    await upsertVinylLayout(pool, checkedIdentity, null);
    await expect(readVinylLayout(pool, checkedIdentity)).resolves.toBeNull();

    await expect(readVinylLayout(pool, uncheckedIdentity)).resolves.toBeUndefined();
  });
});
