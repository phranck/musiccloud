import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeRepository, getRepository } from "../db/index.js";

function isSafeIntegrationDatabase(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const databaseName = parsed.pathname.replace(/^\//, "").toLowerCase();
    const host = parsed.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || /(^|[_-])(test|integration)([_-]|$)/.test(databaseName);
  } catch {
    return false;
  }
}

describe.skipIf(!isSafeIntegrationDatabase(process.env.DATABASE_URL))(
  "track and album previews repository (integration)",
  () => {
    const suffix = Math.random().toString(36).slice(2, 10);
    const trackSourceUrl = `https://integration.test/track-preview/${suffix}`;
    const albumSourceUrl = `https://integration.test/album-preview/${suffix}`;
    const isrc = `ITPREV${suffix.toUpperCase()}`;
    const upc = `UPCPREV${suffix.toUpperCase()}`;

    let client: pg.Client;
    let trackId: string;
    let albumId: string;

    beforeAll(async () => {
      client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();

      const repo = await getRepository();
      const track = await repo.persistTrackWithLinks({
        sourceTrack: {
          title: `Preview Integration Track ${suffix}`,
          artists: ["Integration Test"],
          isrc,
          sourceService: "spotify",
          sourceUrl: trackSourceUrl,
        },
        links: [],
      });
      trackId = track.trackId;

      const album = await repo.persistAlbumWithLinks({
        sourceAlbum: {
          title: `Preview Integration Album ${suffix}`,
          artists: ["Integration Test"],
          upc,
          sourceService: "spotify",
          sourceUrl: albumSourceUrl,
        },
        links: [],
      });
      albumId = album.albumId;
    });

    afterAll(async () => {
      await client.query(`DELETE FROM service_links WHERE track_id = $1`, [trackId]);
      await client.query(`DELETE FROM short_urls WHERE track_id = $1`, [trackId]);
      await client.query(`DELETE FROM tracks WHERE id = $1`, [trackId]);

      await client.query(`DELETE FROM album_service_links WHERE album_id = $1`, [albumId]);
      await client.query(`DELETE FROM album_short_urls WHERE album_id = $1`, [albumId]);
      await client.query(`DELETE FROM albums WHERE id = $1`, [albumId]);

      await client.end();
      await closeRepository();
    });

    it("upserts one track preview row per service and replaces stale values", async () => {
      const repo = await getRepository();
      const oldExpiry = new Date("2000-01-01T00:00:00Z");
      const freshExpiry = new Date("2100-01-01T00:00:00Z");
      const oldUrl = "https://cdnt-preview.dzcdn.net/api/1/1/old.mp3?hdnea=exp=946684800~hmac=old";
      const freshUrl = "https://cdnt-preview.dzcdn.net/api/1/1/fresh.mp3?hdnea=exp=4102444800~hmac=fresh";

      await repo.upsertTrackPreview(trackId, { service: "deezer", url: oldUrl, expiresAt: oldExpiry });
      await repo.upsertTrackPreview(trackId, { service: "deezer", url: freshUrl, expiresAt: freshExpiry });

      const previews = await repo.findTrackPreviews(trackId);
      const deezerRows = previews.filter((row) => row.service === "deezer");
      expect(deezerRows).toHaveLength(1);
      expect(deezerRows[0].url).toBe(freshUrl);
      expect(deezerRows[0].expiresAt?.toISOString()).toBe(freshExpiry.toISOString());

      const cached = await repo.findTrackByUrl(trackSourceUrl);
      expect(cached?.track.previewUrl).toBe(freshUrl);
    });

    it("upserts one album preview row per service and replaces stale values", async () => {
      const repo = await getRepository();
      const oldExpiry = new Date("2000-01-01T00:00:00Z");
      const freshExpiry = new Date("2100-01-01T00:00:00Z");
      const oldUrl = "https://cdnt-preview.dzcdn.net/api/1/1/album-old.mp3?hdnea=exp=946684800~hmac=old";
      const freshUrl = "https://cdnt-preview.dzcdn.net/api/1/1/album-fresh.mp3?hdnea=exp=4102444800~hmac=fresh";

      await repo.upsertAlbumPreview(albumId, { service: "deezer", url: oldUrl, expiresAt: oldExpiry });
      await repo.upsertAlbumPreview(albumId, { service: "deezer", url: freshUrl, expiresAt: freshExpiry });

      const previews = await repo.findAlbumPreviews(albumId);
      const deezerRows = previews.filter((row) => row.service === "deezer");
      expect(deezerRows).toHaveLength(1);
      expect(deezerRows[0].url).toBe(freshUrl);
      expect(deezerRows[0].expiresAt?.toISOString()).toBe(freshExpiry.toISOString());

      const cached = await repo.findAlbumByUrl(albumSourceUrl);
      expect(cached?.album.topTrackPreviewUrl).toBe(freshUrl);
    });
  },
);
