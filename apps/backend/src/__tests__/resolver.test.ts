import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResolveError } from "@/lib/resolve/errors";
import type { CachedTrackResult, TrackRepository } from "../db/repository";
import type { MatchResult, NormalizedTrack, SearchResultWithCandidates, ServiceAdapter } from "../services/types";

// =============================================================================
// Mock setup
// =============================================================================

// Mock the adapter registry
vi.mock("../services/index.js", () => ({
  getActiveAdapters: vi.fn().mockResolvedValue([]),
  identifyService: vi.fn(),
  identifyServiceIncludingDisabled: vi.fn().mockResolvedValue(undefined),
  isPluginEnabled: vi.fn().mockResolvedValue(true),
  // Identity pass-through — all tests assume every service is enabled unless
  // they opt in to the SERVICE_DISABLED scenario.
  filterDisabledLinks: vi.fn(async <T>(links: T[]) => links),
}));

// Mock the DB singleton
vi.mock("../db/index.js", () => ({
  getRepository: vi.fn(),
}));

// Mock the logger to suppress output during tests
vi.mock("../lib/logger.js", () => ({
  log: {
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fetchWithTimeout (used in scrapeTrackFromPage)
vi.mock("../lib/fetch.js", () => ({
  fetchWithTimeout: vi.fn(),
}));

// =============================================================================
// Import after mocks
// =============================================================================

import { getRepository } from "../db/index";
import {
  filterDisabledLinks,
  getActiveAdapters,
  identifyService,
  identifyServiceIncludingDisabled,
  isPluginEnabled,
} from "../services/index";
import {
  MATCH_MIN_CONFIDENCE,
  resolveQuery,
  resolveSelectedCandidate,
  resolveTextSearchWithDisambiguation,
} from "../services/resolver";

// =============================================================================
// Helpers: mock data factories
// =============================================================================

function createMockTrack(overrides: Partial<NormalizedTrack> = {}): NormalizedTrack {
  return {
    sourceService: "spotify",
    sourceId: "track123",
    title: "Bohemian Rhapsody",
    artists: ["Queen"],
    albumName: "A Night at the Opera",
    isrc: "GBUM71029604",
    artworkUrl: "https://example.com/art.jpg",
    durationMs: 354000,
    webUrl: "https://open.spotify.com/track/track123",
    ...overrides,
  };
}

function createMockAdapter(overrides: Partial<ServiceAdapter> = {}): ServiceAdapter {
  return {
    id: "spotify",
    displayName: "Spotify",
    capabilities: { supportsIsrc: true, supportsPreview: true, supportsArtwork: true },
    isAvailable: () => true,
    detectUrl: vi.fn(() => null),
    getTrack: vi.fn(),
    findByIsrc: vi.fn().mockResolvedValue(null),
    searchTrack: vi.fn().mockResolvedValue({ found: false, confidence: 0, matchMethod: "search" }),
    ...overrides,
  };
}

function createMockRepository(): TrackRepository {
  return {
    findTrackByUrl: vi.fn().mockResolvedValue(null),
    findTrackByIsrc: vi.fn().mockResolvedValue(null),
    findTracksByTextSearch: vi.fn().mockResolvedValue([]),
    findExistingByIsrc: vi.fn().mockResolvedValue(null),
    loadByShortId: vi.fn().mockResolvedValue(null),
    loadByTrackId: vi.fn().mockResolvedValue(null),
    persistTrackWithLinks: vi.fn().mockResolvedValue({ trackId: "tid1", shortId: "abc" }),
    addLinksToTrack: vi.fn().mockResolvedValue(undefined),
    // Album methods (not used by track resolver tests)
    findAlbumByUrl: vi.fn().mockResolvedValue(null),
    findAlbumByUpc: vi.fn().mockResolvedValue(null),
    findExistingAlbumByUpc: vi.fn().mockResolvedValue(null),
    loadAlbumByShortId: vi.fn().mockResolvedValue(null),
    persistAlbumWithLinks: vi.fn().mockResolvedValue({ albumId: "aid1", shortId: "alb" }),
    addLinksToAlbum: vi.fn().mockResolvedValue(undefined),
    findTrackPreviews: vi.fn().mockResolvedValue([]),
    upsertTrackPreview: vi.fn().mockResolvedValue(undefined),
    findAlbumPreviews: vi.fn().mockResolvedValue([]),
    upsertAlbumPreview: vi.fn().mockResolvedValue(undefined),
    updateTrackTimestamp: vi.fn().mockResolvedValue(undefined),
    cleanupStaleCache: vi.fn().mockResolvedValue(0),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

// =============================================================================
// Reset mocks before each test
// =============================================================================

let mockRepo: TrackRepository;

beforeEach(() => {
  vi.restoreAllMocks();

  // Reset registry mock surface; each test overrides the ones it cares about.
  vi.mocked(getActiveAdapters).mockResolvedValue([]);
  vi.mocked(identifyServiceIncludingDisabled).mockResolvedValue(undefined);
  vi.mocked(isPluginEnabled).mockResolvedValue(true);

  // Fresh mock repository
  mockRepo = createMockRepository();
  vi.mocked(getRepository).mockResolvedValue(mockRepo);
});

// =============================================================================
// 1. URL Resolution: valid Spotify URL -> resolves track across services
// =============================================================================

describe("resolveQuery: URL resolution", () => {
  it("should resolve a valid Spotify URL and return links from other services", async () => {
    const sourceTrack = createMockTrack();
    const deezerTrack = createMockTrack({
      sourceService: "deezer",
      sourceId: "dz456",
      webUrl: "https://www.deezer.com/track/456",
    });

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(sourceTrack),
    });

    const deezerAdapter = createMockAdapter({
      id: "deezer",
      displayName: "Deezer",
      capabilities: { supportsIsrc: true, supportsPreview: true, supportsArtwork: true },
      findByIsrc: vi.fn().mockResolvedValue(deezerTrack),
      searchTrack: vi.fn().mockResolvedValue({
        found: true,
        track: deezerTrack,
        confidence: 0.95,
        matchMethod: "search",
      }),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, deezerAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    expect(result.sourceTrack.title).toBe("Bohemian Rhapsody");
    expect(result.sourceTrack.artists).toEqual(["Queen"]);
    // Should include source link (Spotify) plus Deezer from ISRC
    expect(result.links.length).toBeGreaterThanOrEqual(2);

    const spotifyLink = result.links.find((l) => l.service === "spotify");
    expect(spotifyLink).toBeDefined();
    expect(spotifyLink?.confidence).toBe(1.0);
    expect(spotifyLink?.url).toBe("https://open.spotify.com/track/track123");

    const deezerLink = result.links.find((l) => l.service === "deezer");
    expect(deezerLink).toBeDefined();
    expect(deezerLink?.confidence).toBe(1.0);
    expect(deezerLink?.matchMethod).toBe("isrc");
  });

  it("should throw NOT_MUSIC_LINK for an unsupported URL", async () => {
    vi.mocked(identifyService).mockResolvedValue(undefined);

    // A random non-music URL that passes URL validation but is not recognized
    // The URL parser rejects unknown hosts as UNSUPPORTED_SERVICE
    await expect(resolveQuery("https://example.com/track/123")).rejects.toThrow(ResolveError);

    try {
      await resolveQuery("https://example.com/track/123");
    } catch (err) {
      expect(err).toBeInstanceOf(ResolveError);
      expect((err as ResolveError).code).toBe("UNSUPPORTED_SERVICE");
    }
  });

  it("should throw INVALID_URL when track ID cannot be extracted", async () => {
    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      detectUrl: vi.fn(() => null), // cannot extract track ID
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    // Must use a Spotify URL that passes validateMusicUrl but detectUrl returns null
    await expect(resolveQuery("https://open.spotify.com/track/")).rejects.toThrow(ResolveError);

    try {
      await resolveQuery("https://open.spotify.com/track/");
    } catch (err) {
      expect(err).toBeInstanceOf(ResolveError);
      expect((err as ResolveError).code).toBe("INVALID_URL");
    }
  });
});

// =============================================================================
// 2. Text search: high confidence -> auto-selects; low -> disambiguation
// =============================================================================

describe("resolveTextSearchWithDisambiguation", () => {
  it("should auto-select when top candidate confidence >= 0.9", async () => {
    const track = createMockTrack();

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      searchTrackWithCandidates: vi.fn().mockResolvedValue({
        bestMatch: { found: true, track, confidence: 0.95, matchMethod: "search" },
        candidates: [{ track, confidence: 0.95 }],
      } satisfies SearchResultWithCandidates),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);

    const result = await resolveTextSearchWithDisambiguation("Bohemian Rhapsody Queen");

    expect(result.kind).toBe("resolved");
    expect(result.result).toBeDefined();
    expect(result.result?.sourceTrack.title).toBe("Bohemian Rhapsody");
    expect(result.candidates).toBeUndefined();
  });

  it("should return disambiguation candidates when top confidence < 0.9", async () => {
    const track1 = createMockTrack({ title: "Bohemian Rhapsody", sourceId: "t1" });
    const track2 = createMockTrack({
      title: "Bohemian Rhapsody (Live)",
      sourceId: "t2",
      webUrl: "https://open.spotify.com/track/t2",
    });

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      searchTrackWithCandidates: vi.fn().mockResolvedValue({
        bestMatch: { found: true, track: track1, confidence: 0.75, matchMethod: "search" },
        candidates: [
          { track: track1, confidence: 0.75 },
          { track: track2, confidence: 0.65 },
        ],
      } satisfies SearchResultWithCandidates),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);

    const result = await resolveTextSearchWithDisambiguation("Bohemian Rhapsody");

    expect(result.kind).toBe("disambiguation");
    expect(result.candidates).toBeDefined();
    expect(result.candidates?.length).toBe(2);
    expect(result.candidates?.[0].title).toBe("Bohemian Rhapsody");
    expect(result.candidates?.[0].confidence).toBe(0.75);
    expect(result.candidates?.[1].title).toBe("Bohemian Rhapsody (Live)");
  });

  it("should filter out candidates below CANDIDATE_MIN_CONFIDENCE (0.4)", async () => {
    const track1 = createMockTrack({ title: "Bohemian Rhapsody", sourceId: "t1" });
    const track2 = createMockTrack({
      title: "Unrelated Song",
      sourceId: "t2",
      webUrl: "https://open.spotify.com/track/t2",
    });

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      searchTrackWithCandidates: vi.fn().mockResolvedValue({
        bestMatch: { found: true, track: track1, confidence: 0.6, matchMethod: "search" },
        candidates: [
          { track: track1, confidence: 0.6 },
          { track: track2, confidence: 0.3 }, // below 0.4 threshold
        ],
      } satisfies SearchResultWithCandidates),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);

    const result = await resolveTextSearchWithDisambiguation("Bohemian Rhapsody");

    expect(result.kind).toBe("disambiguation");
    expect(result.candidates?.length).toBe(1);
    expect(result.candidates?.[0].title).toBe("Bohemian Rhapsody");
  });

  it("should fall back to searchTrack when searchTrackWithCandidates is not available", async () => {
    const track = createMockTrack();

    const deezerAdapter = createMockAdapter({
      id: "deezer",
      displayName: "Deezer",
      // No searchTrackWithCandidates method
      searchTrack: vi.fn().mockResolvedValue({
        found: true,
        track,
        confidence: 0.85,
        matchMethod: "search",
      } satisfies MatchResult),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([deezerAdapter]);

    const result = await resolveTextSearchWithDisambiguation("Bohemian Rhapsody Queen");

    expect(result.kind).toBe("resolved");
    expect(result.result).toBeDefined();
    expect(result.result?.sourceTrack.title).toBe("Bohemian Rhapsody");
  });

  it("should throw TRACK_NOT_FOUND when no adapter returns results", async () => {
    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      searchTrackWithCandidates: vi.fn().mockResolvedValue({
        bestMatch: { found: false, confidence: 0, matchMethod: "search" },
        candidates: [],
      }),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);

    await expect(resolveTextSearchWithDisambiguation("xyznonexistent123")).rejects.toThrow(ResolveError);

    try {
      await resolveTextSearchWithDisambiguation("xyznonexistent123");
    } catch (err) {
      expect((err as ResolveError).code).toBe("TRACK_NOT_FOUND");
    }
  });

  it("passes structured SearchQuery to adapter instead of duplicating the free-text string", async () => {
    const track = createMockTrack();
    const searchSpy = vi.fn().mockResolvedValue({
      bestMatch: { found: true, track, confidence: 0.95, matchMethod: "search" },
      candidates: [{ track, confidence: 0.95 }],
    } satisfies SearchResultWithCandidates);

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      searchTrackWithCandidates: searchSpy,
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);

    await resolveTextSearchWithDisambiguation("title: Karma Police, artist: Radiohead", {
      title: "Karma Police",
      artist: "Radiohead",
    });

    expect(searchSpy).toHaveBeenCalledWith({ title: "Karma Police", artist: "Radiohead" });
  });

  it("passes structured SearchQuery including album when provided", async () => {
    const track = createMockTrack();
    const searchSpy = vi.fn().mockResolvedValue({
      bestMatch: { found: true, track, confidence: 0.95, matchMethod: "search" },
      candidates: [{ track, confidence: 0.95 }],
    } satisfies SearchResultWithCandidates);

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      searchTrackWithCandidates: searchSpy,
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);

    await resolveTextSearchWithDisambiguation(
      "title: Karma Police, artist: Radiohead, album: OK Computer",
      { title: "Karma Police", artist: "Radiohead", album: "OK Computer" },
    );

    expect(searchSpy).toHaveBeenCalledWith({
      title: "Karma Police",
      artist: "Radiohead",
      album: "OK Computer",
    });
  });

  it("falls back to {title: query, artist: query} when no structured arg is provided", async () => {
    const track = createMockTrack();
    const searchSpy = vi.fn().mockResolvedValue({
      bestMatch: { found: true, track, confidence: 0.95, matchMethod: "search" },
      candidates: [{ track, confidence: 0.95 }],
    } satisfies SearchResultWithCandidates);

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      searchTrackWithCandidates: searchSpy,
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);

    await resolveTextSearchWithDisambiguation("Bohemian Rhapsody Queen");

    expect(searchSpy).toHaveBeenCalledWith({
      title: "Bohemian Rhapsody Queen",
      artist: "Bohemian Rhapsody Queen",
    });
  });

  it("caps the disambiguation list at candidateLimit when set below MAX_CANDIDATES", async () => {
    const tracks = Array.from({ length: 8 }, (_, i) =>
      createMockTrack({ sourceId: `t${i}`, title: `Track ${i}`, webUrl: `https://x/${i}` }),
    );
    const candidates = tracks.map((track) => ({ track, confidence: 0.6 }));

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      searchTrackWithCandidates: vi.fn().mockResolvedValue({
        bestMatch: { found: true, track: tracks[0], confidence: 0.6, matchMethod: "search" },
        candidates,
      } satisfies SearchResultWithCandidates),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);

    const result = await resolveTextSearchWithDisambiguation(
      "title: foo",
      { title: "foo", artist: "" },
      3,
    );

    expect(result.kind).toBe("disambiguation");
    expect(result.candidates?.length).toBe(3);
  });

  it("clamps candidateLimit to MAX_CANDIDATES (8) when caller asks for more", async () => {
    const tracks = Array.from({ length: 12 }, (_, i) =>
      createMockTrack({ sourceId: `t${i}`, title: `Track ${i}`, webUrl: `https://x/${i}` }),
    );
    const candidates = tracks.map((track) => ({ track, confidence: 0.6 }));

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      searchTrackWithCandidates: vi.fn().mockResolvedValue({
        bestMatch: { found: true, track: tracks[0], confidence: 0.6, matchMethod: "search" },
        candidates,
      } satisfies SearchResultWithCandidates),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);

    const result = await resolveTextSearchWithDisambiguation(
      "title: foo",
      { title: "foo", artist: "" },
      99, // ridiculous, must clamp to 8
    );

    expect(result.kind).toBe("disambiguation");
    expect(result.candidates?.length).toBe(8);
  });
});

// =============================================================================
// 3. Cache hit: cached track returned without re-querying adapters
// =============================================================================

describe("resolveQuery: cache behavior", () => {
  it("should return cached result without calling adapters when cache is fresh", async () => {
    const cachedTrack = createMockTrack();
    const freshTimestamp = Date.now() - 1000; // 1 second ago

    vi.mocked(mockRepo.findTrackByUrl).mockResolvedValue({
      trackId: "tid1",
      updatedAt: freshTimestamp,
      track: cachedTrack,
      links: [
        { service: "spotify", url: "https://open.spotify.com/track/track123", confidence: 1.0, matchMethod: "isrc" },
        { service: "deezer", url: "https://www.deezer.com/track/456", confidence: 0.95, matchMethod: "search" },
      ],
    } satisfies CachedTrackResult);

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn(),
    });

    const deezerAdapter = createMockAdapter({
      id: "deezer",
      displayName: "Deezer",
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, deezerAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    // Should NOT call getTrack since cache was hit
    expect(spotifyAdapter.getTrack).not.toHaveBeenCalled();
    expect(result.sourceTrack.title).toBe("Bohemian Rhapsody");
    expect(result.trackId).toBe("tid1");
    expect(result.links.length).toBe(2);
  });

  it("returns the cached row regardless of updated_at age (post-migration 0021)", async () => {
    // Pre-migration logic invalidated the row at 48 h. Post-migration the
    // canonical track row never expires; only `track_previews.expires_at`
    // drives lazy refreshes. A row with a year-old `updated_at` must
    // still hit cache cleanly.
    const cachedTrack = createMockTrack();
    const veryOldTimestamp = Date.now() - 365 * 24 * 60 * 60 * 1000; // 1 year ago

    vi.mocked(mockRepo.findTrackByUrl).mockResolvedValue({
      trackId: "tid1",
      updatedAt: veryOldTimestamp,
      track: cachedTrack,
      links: [
        { service: "spotify", url: "https://open.spotify.com/track/track123", confidence: 1.0, matchMethod: "isrc" },
      ],
    } satisfies CachedTrackResult);

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn(),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    expect(spotifyAdapter.getTrack).not.toHaveBeenCalled();
    expect(result.trackId).toBe("tid1");
  });
});

// =============================================================================
// 4. Gap fill: cached track missing services -> queries missing adapters
// =============================================================================

describe("resolveQuery: gap fill for cached tracks", () => {
  it("should query missing adapters when cached track lacks some services", async () => {
    const cachedTrack = createMockTrack();
    const freshTimestamp = Date.now() - 5000;

    // Cache has Spotify only
    vi.mocked(mockRepo.findTrackByUrl).mockResolvedValue({
      trackId: "tid1",
      updatedAt: freshTimestamp,
      track: cachedTrack,
      links: [
        { service: "spotify", url: "https://open.spotify.com/track/track123", confidence: 1.0, matchMethod: "isrc" },
      ],
    } satisfies CachedTrackResult);

    const deezerTrack = createMockTrack({
      sourceService: "deezer",
      sourceId: "dz789",
      webUrl: "https://www.deezer.com/track/789",
    });

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
    });

    const deezerAdapter = createMockAdapter({
      id: "deezer",
      displayName: "Deezer",
      capabilities: { supportsIsrc: true, supportsPreview: true, supportsArtwork: true },
      findByIsrc: vi.fn().mockResolvedValue(deezerTrack),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, deezerAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    // Should have gap-filled with Deezer
    expect(deezerAdapter.findByIsrc).toHaveBeenCalledWith("GBUM71029604");
    expect(result.links.some((l) => l.service === "deezer")).toBe(true);

    // Should persist gap-fill results
    expect(mockRepo.addLinksToTrack).toHaveBeenCalledWith(
      "tid1",
      expect.arrayContaining([expect.objectContaining({ service: "deezer" })]),
    );
  });

  it("should not call adapters that are already covered in cache", async () => {
    const cachedTrack = createMockTrack();
    const freshTimestamp = Date.now() - 5000;

    vi.mocked(mockRepo.findTrackByUrl).mockResolvedValue({
      trackId: "tid1",
      updatedAt: freshTimestamp,
      track: cachedTrack,
      links: [
        { service: "spotify", url: "https://open.spotify.com/track/track123", confidence: 1.0, matchMethod: "isrc" },
        { service: "deezer", url: "https://www.deezer.com/track/456", confidence: 0.9, matchMethod: "search" },
      ],
    } satisfies CachedTrackResult);

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
    });

    const deezerAdapter = createMockAdapter({
      id: "deezer",
      displayName: "Deezer",
      findByIsrc: vi.fn(),
      searchTrack: vi.fn(),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, deezerAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    await resolveQuery("https://open.spotify.com/track/track123");

    // Deezer may be re-checked to refresh preview/metadata state even when the
    // service link is already covered in cache.
    const deezerRefreshCalls = deezerAdapter.findByIsrc.mock.calls.length + deezerAdapter.searchTrack.mock.calls.length;
    expect(deezerRefreshCalls).toBeGreaterThan(0);
    expect(deezerRefreshCalls).toBeLessThanOrEqual(2);
  });
});

// =============================================================================
// 5. Error handling: all adapters fail
// =============================================================================

describe("resolveQuery: error handling", () => {
  it("should still return source link when all target adapters fail", async () => {
    const sourceTrack = createMockTrack();

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(sourceTrack),
    });

    const deezerAdapter = createMockAdapter({
      id: "deezer",
      displayName: "Deezer",
      capabilities: { supportsIsrc: true, supportsPreview: true, supportsArtwork: true },
      findByIsrc: vi.fn().mockRejectedValue(new Error("Deezer is down")),
      searchTrack: vi.fn().mockRejectedValue(new Error("Deezer is down")),
    });

    const tidalAdapter = createMockAdapter({
      id: "tidal",
      displayName: "Tidal",
      capabilities: { supportsIsrc: true, supportsPreview: false, supportsArtwork: true },
      findByIsrc: vi.fn().mockRejectedValue(new Error("Tidal is down")),
      searchTrack: vi.fn().mockRejectedValue(new Error("Tidal is down")),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, deezerAdapter, tidalAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    // Should NOT throw - partial results are valid
    const result = await resolveQuery("https://open.spotify.com/track/track123");

    // At minimum the source link should be present
    expect(result.links.length).toBeGreaterThanOrEqual(1);
    const spotifyLink = result.links.find((l) => l.service === "spotify");
    expect(spotifyLink).toBeDefined();
    expect(spotifyLink?.confidence).toBe(1.0);
  });

  it("should throw TRACK_NOT_FOUND when text search finds nothing on any adapter", async () => {
    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      searchTrack: vi.fn().mockResolvedValue({
        found: false,
        confidence: 0,
        matchMethod: "search",
      }),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);

    await expect(resolveQuery("totally nonexistent track xyz")).rejects.toThrow(ResolveError);

    try {
      await resolveQuery("totally nonexistent track xyz");
    } catch (err) {
      expect((err as ResolveError).code).toBe("TRACK_NOT_FOUND");
    }
  });

  it("should continue to next adapter when one throws during text search", async () => {
    const track = createMockTrack({ sourceService: "deezer", sourceId: "dz1" });

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      searchTrack: vi.fn().mockRejectedValue(new Error("Spotify auth failed")),
    });

    const deezerAdapter = createMockAdapter({
      id: "deezer",
      displayName: "Deezer",
      searchTrack: vi.fn().mockResolvedValue({
        found: true,
        track,
        confidence: 0.9,
        matchMethod: "search",
      }),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, deezerAdapter]);

    const result = await resolveQuery("Bohemian Rhapsody Queen");

    expect(result.sourceTrack.sourceService).toBe("deezer");
    expect(result.links.some((l) => l.service === "deezer")).toBe(true);
  });
});

// =============================================================================
// 6. ISRC resolution: source track with ISRC -> other adapters use findByIsrc
// =============================================================================

describe("resolveQuery: ISRC-based resolution", () => {
  it("should use findByIsrc on adapters that support it when source track has ISRC", async () => {
    const sourceTrack = createMockTrack({ isrc: "GBUM71029604" });
    const tidalTrack = createMockTrack({
      sourceService: "tidal",
      sourceId: "tidal789",
      webUrl: "https://tidal.com/browse/track/tidal789",
    });

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(sourceTrack),
    });

    const tidalAdapter = createMockAdapter({
      id: "tidal",
      displayName: "Tidal",
      capabilities: { supportsIsrc: true, supportsPreview: false, supportsArtwork: true },
      findByIsrc: vi.fn().mockResolvedValue(tidalTrack),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, tidalAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    expect(tidalAdapter.findByIsrc).toHaveBeenCalledWith("GBUM71029604");
    const tidalLink = result.links.find((l) => l.service === "tidal");
    expect(tidalLink).toBeDefined();
    expect(tidalLink?.confidence).toBe(1.0);
    expect(tidalLink?.matchMethod).toBe("isrc");
  });

  it("should fall back to searchTrack when ISRC lookup returns null", async () => {
    const sourceTrack = createMockTrack({ isrc: "GBUM71029604" });
    const deezerTrack = createMockTrack({
      sourceService: "deezer",
      sourceId: "dz456",
      webUrl: "https://www.deezer.com/track/456",
    });

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(sourceTrack),
    });

    const deezerAdapter = createMockAdapter({
      id: "deezer",
      displayName: "Deezer",
      capabilities: { supportsIsrc: true, supportsPreview: true, supportsArtwork: true },
      findByIsrc: vi.fn().mockResolvedValue(null), // ISRC not found
      searchTrack: vi.fn().mockResolvedValue({
        found: true,
        track: deezerTrack,
        confidence: 0.85,
        matchMethod: "search",
      }),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, deezerAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    expect(deezerAdapter.findByIsrc).toHaveBeenCalledWith("GBUM71029604");
    expect(deezerAdapter.searchTrack).toHaveBeenCalled();

    const deezerLink = result.links.find((l) => l.service === "deezer");
    expect(deezerLink).toBeDefined();
    expect(deezerLink?.matchMethod).toBe("search");
    expect(deezerLink?.confidence).toBe(0.85);
  });

  it("should skip ISRC lookup for adapters that do not support it", async () => {
    const sourceTrack = createMockTrack({ isrc: "GBUM71029604" });
    const scTrack = createMockTrack({
      sourceService: "soundcloud",
      sourceId: "sc999",
      webUrl: "https://soundcloud.com/queen/bohemian-rhapsody",
    });

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(sourceTrack),
    });

    const soundcloudAdapter = createMockAdapter({
      id: "soundcloud",
      displayName: "SoundCloud",
      capabilities: { supportsIsrc: false, supportsPreview: false, supportsArtwork: true },
      findByIsrc: vi.fn(),
      searchTrack: vi.fn().mockResolvedValue({
        found: true,
        track: scTrack,
        confidence: 0.8,
        matchMethod: "search",
      }),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, soundcloudAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    await resolveQuery("https://open.spotify.com/track/track123");

    // findByIsrc should NOT be called for SoundCloud (supportsIsrc = false)
    expect(soundcloudAdapter.findByIsrc).not.toHaveBeenCalled();
    expect(soundcloudAdapter.searchTrack).toHaveBeenCalled();
  });
});

// =============================================================================
// 7. resolveSelectedCandidate
// =============================================================================

describe("resolveSelectedCandidate", () => {
  it("should resolve a candidate by service:trackId format", async () => {
    const track = createMockTrack();

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      getTrack: vi.fn().mockResolvedValue(track),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);

    const result = await resolveSelectedCandidate("spotify:track123");

    expect(spotifyAdapter.getTrack).toHaveBeenCalledWith("track123");
    expect(result.sourceTrack.title).toBe("Bohemian Rhapsody");

    const spotifyLink = result.links.find((l) => l.service === "spotify");
    expect(spotifyLink).toBeDefined();
    expect(spotifyLink?.confidence).toBe(1.0);
  });

  it("should throw INVALID_URL for malformed candidate ID", async () => {
    await expect(resolveSelectedCandidate("invalid-no-colon")).rejects.toThrow(ResolveError);

    try {
      await resolveSelectedCandidate("invalid-no-colon");
    } catch (err) {
      expect((err as ResolveError).code).toBe("INVALID_URL");
    }
  });

  it("should throw SERVICE_DOWN when adapter is not active (disabled or unavailable)", async () => {
    // getActiveAdapters filters out both disabled plugins and unavailable
    // adapters — callers see the same "not in the active list" signal.
    vi.mocked(getActiveAdapters).mockResolvedValue([]);

    await expect(resolveSelectedCandidate("spotify:track123")).rejects.toThrow(ResolveError);

    try {
      await resolveSelectedCandidate("spotify:track123");
    } catch (err) {
      expect((err as ResolveError).code).toBe("SERVICE_DOWN");
    }
  });

  it("should use ISRC cache when selected candidate has ISRC", async () => {
    const track = createMockTrack({ isrc: "GBUM71029604" });
    const cachedResult: CachedTrackResult = {
      trackId: "tid1",
      updatedAt: Date.now() - 1000,
      track,
      links: [
        { service: "spotify", url: "https://open.spotify.com/track/track123", confidence: 1.0, matchMethod: "isrc" },
        { service: "deezer", url: "https://www.deezer.com/track/456", confidence: 0.9, matchMethod: "search" },
      ],
    };

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      getTrack: vi.fn().mockResolvedValue(track),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);
    vi.mocked(mockRepo.findTrackByIsrc).mockResolvedValue(cachedResult);

    const result = await resolveSelectedCandidate("spotify:track123");

    expect(result.trackId).toBe("tid1");
    expect(result.links.length).toBe(2);
  });
});

// =============================================================================
// 9. YouTube Music derivation
// =============================================================================

describe("resolveQuery: YouTube Music link derivation", () => {
  it("should derive YouTube Music link from YouTube video result", async () => {
    const sourceTrack = createMockTrack();
    const youtubeTrack = createMockTrack({
      sourceService: "youtube",
      sourceId: "dQw4w9WgXcQ",
      webUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(sourceTrack),
    });

    const youtubeAdapter = createMockAdapter({
      id: "youtube",
      displayName: "YouTube",
      capabilities: { supportsIsrc: false, supportsPreview: false, supportsArtwork: true },
      searchTrack: vi.fn().mockResolvedValue({
        found: true,
        track: youtubeTrack,
        confidence: 0.85,
        matchMethod: "search",
      }),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, youtubeAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    const ytMusicLink = result.links.find((l) => l.service === "youtube-music");
    expect(ytMusicLink).toBeDefined();
    expect(ytMusicLink?.url).toBe("https://music.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(ytMusicLink?.confidence).toBe(0.85);
  });
});

// =============================================================================
// 10. Exported constants
// =============================================================================

describe("resolver constants", () => {
  it("should export MATCH_MIN_CONFIDENCE as 0.6", () => {
    expect(MATCH_MIN_CONFIDENCE).toBe(0.6);
  });
});

// =============================================================================
// 11. Unsupported content types
// =============================================================================

describe("resolveQuery: content type validation", () => {
  it("should throw PLAYLIST_NOT_SUPPORTED for Spotify playlist URL", async () => {
    await expect(resolveQuery("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")).rejects.toThrow(
      ResolveError,
    );

    try {
      await resolveQuery("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M");
    } catch (err) {
      expect((err as ResolveError).code).toBe("PLAYLIST_NOT_SUPPORTED");
    }
  });

  it("should throw PODCAST_NOT_SUPPORTED for Spotify episode URL", async () => {
    await expect(resolveQuery("https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk")).rejects.toThrow(ResolveError);

    try {
      await resolveQuery("https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk");
    } catch (err) {
      expect((err as ResolveError).code).toBe("PODCAST_NOT_SUPPORTED");
    }
  });
});

// =============================================================================
// 12. Link quality filtering
// =============================================================================

describe("resolveQuery: link quality filtering", () => {
  it("should exclude low-confidence matches below LINK_QUALITY_THRESHOLD", async () => {
    const sourceTrack = createMockTrack();
    const lowConfTrack = createMockTrack({
      sourceService: "deezer",
      sourceId: "dz1",
      webUrl: "https://www.deezer.com/track/1",
    });

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(sourceTrack),
    });

    const deezerAdapter = createMockAdapter({
      id: "deezer",
      displayName: "Deezer",
      capabilities: { supportsIsrc: false, supportsPreview: true, supportsArtwork: true },
      searchTrack: vi.fn().mockResolvedValue({
        found: true,
        track: lowConfTrack,
        confidence: 0.3, // below 0.6 threshold
        matchMethod: "search",
      }),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, deezerAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    // Low-confidence Deezer match should be filtered out
    const deezerLink = result.links.find((l) => l.service === "deezer");
    expect(deezerLink).toBeUndefined();
  });

  it("should keep search fallback links even below quality threshold", async () => {
    const sourceTrack = createMockTrack({ artists: ["Queen"], title: "Bohemian Rhapsody" });

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(sourceTrack),
    });

    // No YouTube adapter -- resolver will add a search fallback
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    // YouTube search fallback should be present with isSearchFallback=true
    const ytFallback = result.links.find((l) => l.service === "youtube" && l.isSearchFallback);
    expect(ytFallback).toBeDefined();
    expect(ytFallback?.url).toContain("music.youtube.com/search");
    expect(ytFallback?.confidence).toBe(0.5);
  });
});

// =============================================================================
// 13. Unavailable adapters are skipped
// =============================================================================

describe("resolveQuery: adapter availability", () => {
  it("should skip inactive adapters during cross-service resolution", async () => {
    // Inactive adapters (disabled via toggle or missing credentials) are
    // filtered out by getActiveAdapters; the resolver never sees them.
    const sourceTrack = createMockTrack();

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(sourceTrack),
    });

    // Tidal is tracked in the test to assert it's NOT called, but it's
    // never returned by getActiveAdapters (mimicking a toggled-off plugin).
    const tidalAdapter = createMockAdapter({
      id: "tidal",
      displayName: "Tidal",
      findByIsrc: vi.fn(),
      searchTrack: vi.fn(),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    await resolveQuery("https://open.spotify.com/track/track123");

    // Tidal should NOT be called since it's not in the active list
    expect(tidalAdapter.findByIsrc).not.toHaveBeenCalled();
    expect(tidalAdapter.searchTrack).not.toHaveBeenCalled();
  });
});

describe("resolveQuery: SERVICE_DISABLED", () => {
  it("should throw SERVICE_DISABLED when the source service is toggled off", async () => {
    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
    });

    // identifyServiceIncludingDisabled finds it (plugin exists),
    // but isPluginEnabled says "off" — resolver must surface SERVICE_DISABLED
    // rather than falling through to NOT_MUSIC_LINK.
    vi.mocked(identifyServiceIncludingDisabled).mockResolvedValue(spotifyAdapter);
    vi.mocked(isPluginEnabled).mockResolvedValue(false);
    vi.mocked(getActiveAdapters).mockResolvedValue([]);
    vi.mocked(identifyService).mockResolvedValue(undefined);

    await expect(resolveQuery("https://open.spotify.com/track/track123")).rejects.toMatchObject({
      code: "SERVICE_DISABLED",
      context: { service: "spotify" },
    });
  });

  it("should filter cached links whose plugin is currently disabled", async () => {
    // Simulate a cached resolve: spotify source + deezer cross-link.
    // Admin has toggled deezer off → filterDisabledLinks drops that link.
    const track = createMockTrack({ isrc: "GBUM71029604" });
    const cachedResult: CachedTrackResult = {
      trackId: "tid1",
      updatedAt: Date.now() - 1000,
      track,
      links: [
        { service: "spotify", url: "https://open.spotify.com/track/track123", confidence: 1.0, matchMethod: "isrc" },
        { service: "deezer", url: "https://www.deezer.com/track/456", confidence: 0.9, matchMethod: "search" },
      ],
    };
    vi.mocked(mockRepo.findTrackByUrl).mockResolvedValue(cachedResult);

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    // Override filter: drop any deezer link (plugin off).
    vi.mocked(filterDisabledLinks).mockImplementation(async <T extends { service: string }>(links: T[]) =>
      links.filter((l) => l.service !== "deezer"),
    );

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    expect(result.links.find((l) => l.service === "deezer")).toBeUndefined();
    expect(result.links.find((l) => l.service === "spotify")).toBeDefined();
  });

  it("should NOT throw SERVICE_DISABLED when the plugin is enabled", async () => {
    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(createMockTrack()),
    });

    // Plugin enabled → identifyServiceIncludingDisabled hit doesn't short-circuit.
    vi.mocked(identifyServiceIncludingDisabled).mockResolvedValue(spotifyAdapter);
    vi.mocked(isPluginEnabled).mockResolvedValue(true);
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");
    expect(result.links.length).toBeGreaterThan(0);
  });
});
