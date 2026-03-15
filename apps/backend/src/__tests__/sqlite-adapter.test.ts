import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteAdapter } from "../db/adapters/sqlite";
import type { PersistTrackData } from "../db/repository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrackData(
  overrides: Partial<PersistTrackData["sourceTrack"]> = {},
  links: PersistTrackData["links"] = [],
): PersistTrackData {
  return {
    sourceTrack: {
      title: "Bohemian Rhapsody",
      artists: ["Queen"],
      albumName: "A Night at the Opera",
      isrc: "GBUM71029604",
      artworkUrl: "https://example.com/art.jpg",
      durationMs: 354000,
      releaseDate: "1975-10-31",
      isExplicit: false,
      previewUrl: "https://example.com/preview.mp3",
      sourceService: "spotify",
      sourceUrl: "https://open.spotify.com/track/abc123",
      ...overrides,
    },
    links:
      links.length > 0
        ? links
        : [
            {
              service: "spotify",
              url: "https://open.spotify.com/track/abc123",
              confidence: 1.0,
              matchMethod: "isrc",
              externalId: "abc123",
            },
            {
              service: "deezer",
              url: "https://www.deezer.com/track/456",
              confidence: 0.95,
              matchMethod: "search",
              externalId: "456",
            },
          ],
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("SqliteAdapter", () => {
  let adapter: SqliteAdapter;

  beforeEach(() => {
    adapter = new SqliteAdapter(":memory:");
  });

  afterEach(async () => {
    await adapter.close();
  });

  // =========================================================================
  // persistTrackWithLinks
  // =========================================================================

  describe("persistTrackWithLinks", () => {
    it("stores track + links and returns trackId + shortId", async () => {
      const data = makeTrackData();
      const result = await adapter.persistTrackWithLinks(data);

      expect(result.trackId).toBeDefined();
      expect(result.trackId.length).toBe(21);
      expect(result.shortId).toBeDefined();
      expect(result.shortId.length).toBe(5);

      // Verify track is actually retrievable
      const cached = await adapter.findTrackByIsrc("GBUM71029604");
      expect(cached).not.toBeNull();
      expect(cached?.track.title).toBe("Bohemian Rhapsody");
      expect(cached?.track.artists).toEqual(["Queen"]);
      expect(cached?.links).toHaveLength(2);
    });

    it("updates existing track (same ISRC) instead of creating duplicate", async () => {
      const data1 = makeTrackData();
      const result1 = await adapter.persistTrackWithLinks(data1);

      // Persist again with same ISRC but a new link
      const data2 = makeTrackData({}, [
        {
          service: "tidal",
          url: "https://tidal.com/track/789",
          confidence: 0.9,
          matchMethod: "search",
          externalId: "789",
        },
      ]);
      const result2 = await adapter.persistTrackWithLinks(data2);

      // Should reuse the same trackId and shortId
      expect(result2.trackId).toBe(result1.trackId);
      expect(result2.shortId).toBe(result1.shortId);

      // Should now have 3 links total (spotify + deezer + tidal)
      const cached = await adapter.findTrackByIsrc("GBUM71029604");
      expect(cached).not.toBeNull();
      expect(cached?.links).toHaveLength(3);

      const services = cached?.links.map((l) => l.service).sort();
      expect(services).toEqual(["deezer", "spotify", "tidal"]);
    });
  });

  // =========================================================================
  // findTrackByUrl
  // =========================================================================

  describe("findTrackByUrl", () => {
    it("returns cached track with links for known URL", async () => {
      const data = makeTrackData();
      await adapter.persistTrackWithLinks(data);

      const result = await adapter.findTrackByUrl("https://open.spotify.com/track/abc123");
      expect(result).not.toBeNull();
      expect(result?.track.title).toBe("Bohemian Rhapsody");
      expect(result?.track.artists).toEqual(["Queen"]);
      expect(result?.trackId).toBeDefined();
      expect(result?.updatedAt).toBeGreaterThan(0);
      expect(result?.links).toHaveLength(2);
      expect(result?.links.some((l) => l.service === "spotify")).toBe(true);
      expect(result?.links.some((l) => l.service === "deezer")).toBe(true);
    });

    it("returns null for unknown URL", async () => {
      const result = await adapter.findTrackByUrl("https://open.spotify.com/track/unknown");
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // findTrackByIsrc
  // =========================================================================

  describe("findTrackByIsrc", () => {
    it("returns cached track for known ISRC", async () => {
      const data = makeTrackData();
      await adapter.persistTrackWithLinks(data);

      const result = await adapter.findTrackByIsrc("GBUM71029604");
      expect(result).not.toBeNull();
      expect(result?.track.title).toBe("Bohemian Rhapsody");
      expect(result?.track.sourceService).toBe("cached");
      expect(result?.links).toHaveLength(2);
    });

    it("returns null for unknown ISRC", async () => {
      const result = await adapter.findTrackByIsrc("UNKNOWN00000");
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // addLinksToTrack
  // =========================================================================

  describe("addLinksToTrack", () => {
    it("adds new service links to existing track", async () => {
      const data = makeTrackData();
      const { trackId } = await adapter.persistTrackWithLinks(data);

      await adapter.addLinksToTrack(trackId, [
        {
          service: "youtube",
          url: "https://www.youtube.com/watch?v=xyz",
          confidence: 0.85,
          matchMethod: "search",
          externalId: "xyz",
        },
      ]);

      const cached = await adapter.findTrackByIsrc("GBUM71029604");
      expect(cached).not.toBeNull();
      expect(cached?.links).toHaveLength(3);

      const ytLink = cached?.links.find((l) => l.service === "youtube");
      expect(ytLink).toBeDefined();
      expect(ytLink?.url).toBe("https://www.youtube.com/watch?v=xyz");
      expect(ytLink?.confidence).toBe(0.85);
      expect(ytLink?.matchMethod).toBe("search");
    });

    it("does not create duplicates for same service", async () => {
      const data = makeTrackData();
      const { trackId } = await adapter.persistTrackWithLinks(data);

      // Try to add a spotify link again (already exists from initial persist)
      await adapter.addLinksToTrack(trackId, [
        {
          service: "spotify",
          url: "https://open.spotify.com/track/different",
          confidence: 0.99,
          matchMethod: "isrc",
        },
      ]);

      const cached = await adapter.findTrackByIsrc("GBUM71029604");
      expect(cached).not.toBeNull();
      // Should still be 2, not 3 (unique index on track_id+service)
      expect(cached?.links).toHaveLength(2);

      // The original URL should be preserved (onConflictDoNothing)
      const spotifyLink = cached?.links.find((l) => l.service === "spotify");
      expect(spotifyLink?.url).toBe("https://open.spotify.com/track/abc123");
    });
  });

  // =========================================================================
  // cleanupStaleCache
  // =========================================================================

  describe("cleanupStaleCache", () => {
    it("removes entries older than TTL", async () => {
      // Insert a track and manually set its updated_at far in the past
      const data = makeTrackData({ isrc: "STALE0000001" });
      await adapter.persistTrackWithLinks(data);

      // Manually backdate updated_at to make it stale (> TTL ago).
      // The track has no short_url, so it won't be protected from cleanup.
      // But persistTrackWithLinks always creates a short_url. We need to
      // delete it to test cleanup behavior (cleanup only deletes tracks
      // without short_urls).

      // Actually, looking at cleanupStaleCache: it only deletes tracks
      // that have NO short_url. Let's create a track without a short_url
      // by inserting directly.

      // Use a second adapter instance to insert a "cache-only" track
      // (one without short_url). We can do this by inserting manually.
      const adapter2 = new SqliteAdapter(":memory:");

      // Insert track + link via raw SQL to avoid short_url creation
      const pastTime = Date.now() - 100_000; // 100 seconds ago
      const rawDb = (adapter2 as unknown as { sqlite: Database.Database }).sqlite;
      rawDb
        .prepare(`
        INSERT INTO tracks (id, title, artists, isrc, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
        .run("stale-track-1", "Stale Song", '["Old Artist"]', "STALEISRC001", pastTime, pastTime);

      rawDb
        .prepare(`
        INSERT INTO service_links (id, track_id, service, url, confidence, match_method, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
        .run("link-1", "stale-track-1", "spotify", "https://spotify.com/stale", 1.0, "isrc", pastTime);

      // Verify it exists before cleanup
      const before = await adapter2.findTrackByIsrc("STALEISRC001");
      expect(before).not.toBeNull();

      // Cleanup with a very short TTL (anything older than 50 seconds)
      const deleted = await adapter2.cleanupStaleCache(50_000);
      expect(deleted).toBeGreaterThan(0);

      // Verify it's gone
      const after = await adapter2.findTrackByIsrc("STALEISRC001");
      expect(after).toBeNull();

      await adapter2.close();
    });

    it("keeps entries newer than TTL", async () => {
      // Insert a cache-only track (no short_url) that is recent
      const rawDb = (adapter as unknown as { sqlite: Database.Database }).sqlite;
      const now = Date.now();

      rawDb
        .prepare(`
        INSERT INTO tracks (id, title, artists, isrc, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
        .run("fresh-track-1", "Fresh Song", '["New Artist"]', "FRESHISRC001", now, now);

      rawDb
        .prepare(`
        INSERT INTO service_links (id, track_id, service, url, confidence, match_method, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
        .run("link-fresh-1", "fresh-track-1", "spotify", "https://spotify.com/fresh", 1.0, "isrc", now);

      // Cleanup with a 1-hour TTL (track was just created)
      const deleted = await adapter.cleanupStaleCache(60 * 60 * 1000);
      expect(deleted).toBe(0);

      // Verify it still exists
      const result = await adapter.findTrackByIsrc("FRESHISRC001");
      expect(result).not.toBeNull();
      expect(result?.track.title).toBe("Fresh Song");
    });
  });

  // =========================================================================
  // loadByShortId
  // =========================================================================

  describe("loadByShortId", () => {
    it("returns share page data with track + links", async () => {
      const data = makeTrackData();
      const { shortId } = await adapter.persistTrackWithLinks(data);

      const result = await adapter.loadByShortId(shortId);
      expect(result).not.toBeNull();
      expect(result?.shortId).toBe(shortId);
      expect(result?.track.title).toBe("Bohemian Rhapsody");
      expect(result?.track.albumName).toBe("A Night at the Opera");
      expect(result?.track.artworkUrl).toBe("https://example.com/art.jpg");
      expect(result?.track.durationMs).toBe(354000);
      expect(result?.track.isrc).toBe("GBUM71029604");
      expect(result?.track.releaseDate).toBe("1975-10-31");
      expect(result?.track.isExplicit).toBe(false);
      expect(result?.artists).toEqual(["Queen"]);
      expect(result?.artistDisplay).toBe("Queen");
      expect(result?.links).toHaveLength(2);
      expect(result?.links.some((l) => l.service === "spotify")).toBe(true);
      expect(result?.links.some((l) => l.service === "deezer")).toBe(true);
    });

    it("returns null for unknown shortId", async () => {
      const result = await adapter.loadByShortId("XXXXX");
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // findTracksByTextSearch
  // =========================================================================

  describe("findTracksByTextSearch", () => {
    it("finds track by title via FTS5", async () => {
      await adapter.persistTrackWithLinks(makeTrackData());

      // Also add a second track to verify we get the right one
      await adapter.persistTrackWithLinks(
        makeTrackData(
          {
            title: "Yesterday",
            artists: ["The Beatles"],
            isrc: "GBAYE0000001",
            sourceUrl: "https://open.spotify.com/track/yesterday",
          },
          [
            {
              service: "spotify",
              url: "https://open.spotify.com/track/yesterday",
              confidence: 1.0,
              matchMethod: "isrc",
            },
          ],
        ),
      );

      const results = await adapter.findTracksByTextSearch("Bohemian");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].title).toBe("Bohemian Rhapsody");
      expect(results[0].artists).toEqual(["Queen"]);

      // Should not include "Yesterday"
      const titles = results.map((r) => r.title);
      expect(titles).not.toContain("Yesterday");
    });
  });

  // =========================================================================
  // findExistingByIsrc
  // =========================================================================

  describe("findExistingByIsrc", () => {
    it("returns trackId + shortId for known ISRC", async () => {
      const data = makeTrackData();
      const { trackId, shortId } = await adapter.persistTrackWithLinks(data);

      const result = await adapter.findExistingByIsrc("GBUM71029604");
      expect(result).not.toBeNull();
      expect(result?.trackId).toBe(trackId);
      expect(result?.shortId).toBe(shortId);
    });

    it("returns null for unknown ISRC", async () => {
      const result = await adapter.findExistingByIsrc("NONEXISTENT0");
      expect(result).toBeNull();
    });
  });
});
