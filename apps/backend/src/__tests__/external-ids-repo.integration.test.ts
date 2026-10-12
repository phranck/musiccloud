import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeRepository, getRepository } from "../db/index.js";
import { generateShortId, generateTrackId } from "../lib/short-id.js";
import {
  connectRepositoriesToIntegrationDatabase,
  integrationDatabaseUrl,
  removePersistedCatalogRows,
} from "./integration-database.js";

/**
 * Hits a live Postgres pointed at by `TEST_DATABASE_URL`. Exercises the
 * `track_external_ids` and `album_external_ids` aggregation tables added
 * in migration 0019 plus the fallback paths in `findTrackByIsrc` /
 * `findAlbumByUpc`.
 *
 * The fixture persists a new track and album credited to an artist named for
 * this run, and afterAll removes all three. The external-id rows cascade with
 * their track or album.
 */
describe.skipIf(!integrationDatabaseUrl())("external-ids repository (integration)", () => {
  connectRepositoriesToIntegrationDatabase();

  const suffix = Math.random().toString(36).slice(2, 10);
  const artistName = `External Id Artist ${suffix}`;
  const isrc = `ITTEST${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const altIsrc = `ITALT${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const upc = `UPC${Math.random().toString(36).slice(2, 12).toUpperCase()}`;

  let client: pg.Client;
  const trackIds: string[] = [];
  const albumIds: string[] = [];

  beforeAll(async () => {
    client = new pg.Client({ connectionString: integrationDatabaseUrl() });
    await client.connect();
    const repo = await getRepository();

    const track = await repo.persistTrackWithLinks({
      sourceTrack: {
        title: "ext-id-test",
        artists: [artistName],
        isrc,
        sourceService: "spotify",
        sourceUrl: `https://open.spotify.com/track/${generateTrackId()}`,
      },
      links: [],
    });
    trackIds.push(track.trackId);

    const album = await repo.persistAlbumWithLinks({
      sourceAlbum: {
        title: "ext-id-album",
        artists: [artistName],
        upc,
        sourceService: "spotify",
        sourceUrl: `https://open.spotify.com/album/${generateTrackId()}`,
      },
      links: [],
    });
    albumIds.push(album.albumId);
  });

  afterAll(async () => {
    await removePersistedCatalogRows(client, { trackIds, albumIds, artistNames: [artistName] });
    await client.end();
    await closeRepository();
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
