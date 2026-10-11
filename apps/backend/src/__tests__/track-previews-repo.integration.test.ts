import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeRepository, getRepository } from "../db/index.js";
import { isSafeIntegrationDatabase } from "./integration-database.js";

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
    let albumShortId: string;

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
      albumShortId = album.shortId;
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

    it("picks an album's unexpired preview over an expired Deezer one", async () => {
      const repo = await getRepository();
      const expiredUrl = "https://cdnt-preview.dzcdn.net/api/1/1/album-expired.mp3?hdnea=exp=946684800~hmac=old";
      const permanentUrl = "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/album-permanent.m4a";

      await repo.upsertAlbumPreview(albumId, {
        service: "deezer",
        url: expiredUrl,
        expiresAt: new Date("2000-01-01T00:00:00Z"),
      });
      await repo.upsertAlbumPreview(albumId, { service: "apple-music", url: permanentUrl, expiresAt: null });

      const cached = await repo.findAlbumByUrl(albumSourceUrl);
      expect(cached?.album.topTrackPreviewUrl).toBe(permanentUrl);
      const shared = await repo.loadAlbumByShortId(albumShortId);
      expect(shared?.album.previewUrl).toBe(permanentUrl);
    });
  },
);
