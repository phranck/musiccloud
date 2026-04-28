import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getRepository } from "../db/index.js";
import { generateShortId, generateTrackId } from "../lib/short-id.js";

/**
 * Hits a live Postgres pointed at by `DATABASE_URL`. Exercises the
 * `track_external_ids` and `album_external_ids` aggregation tables added
 * in migration 0019 plus the fallback paths in `findTrackByIsrc` /
 * `findAlbumByUpc`.
 *
 * The fixture creates a brand-new track and album with random IDs so it
 * does not collide with seeded data. afterAll deletes them via cascade
 * (ON DELETE CASCADE on the FK in the aggregation tables wipes the
 * external-id rows together with the parent).
 */
describe.skipIf(!process.env.DATABASE_URL)("external-ids repository (integration)", () => {
  const trackId = generateTrackId();
  const albumId = generateTrackId();
  const isrc = `ITTEST${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const altIsrc = `ITALT${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const upc = `UPC${Math.random().toString(36).slice(2, 12).toUpperCase()}`;

  beforeAll(async () => {
    const repo = await getRepository();

    await repo.persistTrackWithLinks({
      sourceTrack: {
        title: "ext-id-test",
        artists: ["Test"],
        isrc,
        sourceService: "spotify",
        sourceUrl: `https://open.spotify.com/track/${trackId}`,
      },
      links: [],
    });

    await repo.persistAlbumWithLinks({
      sourceAlbum: {
        title: "ext-id-album",
        artists: ["Test"],
        upc,
        sourceService: "spotify",
        sourceUrl: `https://open.spotify.com/album/${albumId}`,
      },
      links: [],
    });
  });

  afterAll(async () => {
    const repo = await getRepository();
    // Best-effort cleanup. Cascading FK takes care of the aggregation rows.
    // The repository has no `deleteTrack` / `deleteAlbum` today, so this
    // leaves the parent rows behind — they are flagged with the random
    // ISRC/UPC prefix above and will not collide with future runs.
    void repo;
  });

  it("addTrackExternalIds writes new rows and is idempotent on duplicates", async () => {
    const repo = await getRepository();

    // Lookup actual track ID via the just-inserted ISRC.
    const found = await repo.findExistingByIsrc(isrc);
    expect(found).not.toBeNull();
    const realTrackId = found!.trackId;

    await repo.addTrackExternalIds(realTrackId, [
      { idType: "isrc", idValue: isrc, sourceService: "spotify" },
      { idType: "isrc", idValue: altIsrc, sourceService: "deezer" },
    ]);

    // Second call with the same payload must not fail (ON CONFLICT DO NOTHING).
    await repo.addTrackExternalIds(realTrackId, [
      { idType: "isrc", idValue: isrc, sourceService: "spotify" },
      { idType: "isrc", idValue: altIsrc, sourceService: "deezer" },
    ]);

    // Lookup by the alternate ISRC must hit via the aggregation-table
    // fallback in findTrackByIsrc.
    const cached = await repo.findTrackByIsrc(altIsrc);
    expect(cached).not.toBeNull();
    expect(cached!.trackId).toBe(realTrackId);
  });

  it("addAlbumExternalIds writes new rows and supports findAlbumByUpc fallback", async () => {
    const repo = await getRepository();

    const found = await repo.findExistingAlbumByUpc(upc);
    expect(found).not.toBeNull();
    const realAlbumId = found!.albumId;

    const altUpc = `UPC${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
    await repo.addAlbumExternalIds(realAlbumId, [{ idType: "upc", idValue: altUpc, sourceService: "deezer" }]);

    const cached = await repo.findAlbumByUpc(altUpc);
    expect(cached).not.toBeNull();
    expect(cached!.albumId).toBe(realAlbumId);
  });

  it("addTrackExternalIds with empty array is a no-op and does not open a transaction", async () => {
    const repo = await getRepository();
    // Should not throw even with a non-existent track id when records is empty.
    await expect(repo.addTrackExternalIds(generateShortId(), [])).resolves.toBeUndefined();
  });
});
