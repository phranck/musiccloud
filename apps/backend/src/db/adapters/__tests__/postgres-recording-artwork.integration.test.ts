import { randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabaseUrl, removePersistedCatalogRows } from "../../../__tests__/integration-database.js";
import { PostgresAdapter } from "../postgres.js";

/** Real PostgreSQL checks use only this run's fixtures in the isolated integration database. */
describe.skipIf(!integrationDatabaseUrl())("recording artwork storage (integration)", () => {
  const artistName = `MC-artwork-${randomUUID()}`;
  const trackIds: string[] = [];
  const albumIds: string[] = [];
  let pool: Pool;
  let repository: PostgresAdapter;

  beforeAll(() => {
    pool = new Pool({ connectionString: integrationDatabaseUrl() });
    repository = new PostgresAdapter(pool);
  });

  afterAll(async () => {
    const cleanup = new Client({ connectionString: integrationDatabaseUrl() });
    try {
      await cleanup.connect();
      await removePersistedCatalogRows(cleanup, { trackIds, albumIds, artistNames: [artistName] });
    } finally {
      await cleanup.end();
      await pool.end();
    }
  });

  it.each([
    "track",
    "album",
  ] as const)("preserves concurrent %s covers, metadata, and the stored share id", async (kind) => {
    const original = "https://i.ytimg.com/vi/fixture/maxresdefault.jpg";
    const cover = "https://cdn-images.dzcdn.net/images/cover/fixture/1000x1000.jpg";
    const title = `Artwork fixture ${randomUUID()}`;
    const source = {
      title,
      artists: [artistName],
      artworkUrl: original,
      sourceService: "youtube",
      sourceUrl: `https://example.invalid/recording/${randomUUID()}`,
    };
    const persisted =
      kind === "track"
        ? await repository.persistTrackWithLinks({ sourceTrack: source, links: [] })
        : await repository.persistAlbumWithLinks({ sourceAlbum: source, links: [] });
    const id = "trackId" in persisted ? persisted.trackId : persisted.albumId;
    (kind === "track" ? trackIds : albumIds).push(id);

    await expect(repository.replaceRecordingArtwork(kind, id, original, null)).resolves.toBe(true);
    await expect(repository.replaceRecordingArtwork(kind, id, null, cover)).resolves.toBe(true);
    await expect(
      repository.replaceRecordingArtwork(kind, id, original, "https://example.invalid/stale.jpg"),
    ).resolves.toBe(false);

    const shared =
      kind === "track"
        ? await repository.loadByShortId(persisted.shortId)
        : await repository.loadAlbumByShortId(persisted.shortId);
    expect(shared?.shortId).toBe(persisted.shortId);
    const recording = shared && ("track" in shared ? shared.track : shared.album);
    expect(recording?.title).toBe(title);
    expect(recording?.artworkUrl).toBe(cover);
  });
});
