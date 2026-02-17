import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CachedTrackResult, TrackRepository } from "../db/repository";
import { CACHE_TTL_MS } from "../lib/constants";
import { ResolveError } from "../lib/errors";
import type { MatchResult, NormalizedTrack, SearchResultWithCandidates, ServiceAdapter } from "../services/types";

// =============================================================================
// Mock setup
// =============================================================================

// Mock the adapter registry
vi.mock("../services/index.js", () => ({
  adapters: [] as ServiceAdapter[],
  identifyService: vi.fn(),
}));

// Mock the DB singleton
vi.mock("../db/index.js", () => ({
  getRepository: vi.fn(),
}));

// Mock Odesli
vi.mock("../services/odesli.js", () => ({
  resolveViaOdesli: vi.fn(),
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
import { adapters, identifyService } from "../services/index";
import { resolveViaOdesli } from "../services/odesli";
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

  // Clear the adapters array and re-populate
  (adapters as ServiceAdapter[]).length = 0;

  // Fresh mock repository
  mockRepo = createMockRepository();
  vi.mocked(getRepository).mockResolvedValue(mockRepo);

  // Odesli returns nothing by default
  vi.mocked(resolveViaOdesli).mockResolvedValue({ links: {} });
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

    (adapters as ServiceAdapter[]).push(spotifyAdapter, deezerAdapter);
    vi.mocked(identifyService).mockReturnValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    expect(result.sourceTrack.title).toBe("Bohemian Rhapsody");
    expect(result.sourceTrack.artists).toEqual(["Queen"]);
    // Should include source link (Spotify) plus Deezer from ISRC
    expect(result.links.length).toBeGreaterThanOrEqual(2);

    const spotifyLink = result.links.find((l) => l.service === "spotify");
    expect(spotifyLink).toBeDefined();
    expect(spotifyLink!.confidence).toBe(1.0);
    expect(spotifyLink!.url).toBe("https://open.spotify.com/track/track123");

    const deezerLink = result.links.find((l) => l.service === "deezer");
    expect(deezerLink).toBeDefined();
    expect(deezerLink!.confidence).toBe(1.0);
    expect(deezerLink!.matchMethod).toBe("isrc");
  });

  it("should throw NOT_MUSIC_LINK for an unsupported URL", async () => {
    vi.mocked(identifyService).mockReturnValue(undefined);

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

    (adapters as ServiceAdapter[]).push(spotifyAdapter);
    vi.mocked(identifyService).mockReturnValue(spotifyAdapter);

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

    (adapters as ServiceAdapter[]).push(spotifyAdapter);

    const result = await resolveTextSearchWithDisambiguation("Bohemian Rhapsody Queen");

    expect(result.kind).toBe("resolved");
    expect(result.result).toBeDefined();
    expect(result.result!.sourceTrack.title).toBe("Bohemian Rhapsody");
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

    (adapters as ServiceAdapter[]).push(spotifyAdapter);

    const result = await resolveTextSearchWithDisambiguation("Bohemian Rhapsody");

    expect(result.kind).toBe("disambiguation");
    expect(result.candidates).toBeDefined();
    expect(result.candidates!.length).toBe(2);
    expect(result.candidates![0].title).toBe("Bohemian Rhapsody");
    expect(result.candidates![0].confidence).toBe(0.75);
    expect(result.candidates![1].title).toBe("Bohemian Rhapsody (Live)");
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

    (adapters as ServiceAdapter[]).push(spotifyAdapter);

    const result = await resolveTextSearchWithDisambiguation("Bohemian Rhapsody");

    expect(result.kind).toBe("disambiguation");
    expect(result.candidates!.length).toBe(1);
    expect(result.candidates![0].title).toBe("Bohemian Rhapsody");
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

    (adapters as ServiceAdapter[]).push(deezerAdapter);

    const result = await resolveTextSearchWithDisambiguation("Bohemian Rhapsody Queen");

    expect(result.kind).toBe("resolved");
    expect(result.result).toBeDefined();
    expect(result.result!.sourceTrack.title).toBe("Bohemian Rhapsody");
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

    (adapters as ServiceAdapter[]).push(spotifyAdapter);

    await expect(resolveTextSearchWithDisambiguation("xyznonexistent123")).rejects.toThrow(ResolveError);

    try {
      await resolveTextSearchWithDisambiguation("xyznonexistent123");
    } catch (err) {
      expect((err as ResolveError).code).toBe("TRACK_NOT_FOUND");
    }
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

    (adapters as ServiceAdapter[]).push(spotifyAdapter, deezerAdapter);
    vi.mocked(identifyService).mockReturnValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    // Should NOT call getTrack since cache was hit
    expect(spotifyAdapter.getTrack).not.toHaveBeenCalled();
    expect(result.sourceTrack.title).toBe("Bohemian Rhapsody");
    expect(result.trackId).toBe("tid1");
    expect(result.links.length).toBe(2);
  });

  it("should re-query adapters when cache TTL has expired", async () => {
    const cachedTrack = createMockTrack();
    const expiredTimestamp = Date.now() - CACHE_TTL_MS - 1000; // past TTL

    // Cache lookup returns expired entry
    vi.mocked(mockRepo.findTrackByUrl).mockResolvedValue({
      trackId: "tid1",
      updatedAt: expiredTimestamp,
      track: cachedTrack,
      links: [
        { service: "spotify", url: "https://open.spotify.com/track/track123", confidence: 1.0, matchMethod: "isrc" },
      ],
    } satisfies CachedTrackResult);

    // Also make findTrackByIsrc return null so it doesn't short-circuit
    vi.mocked(mockRepo.findTrackByIsrc).mockResolvedValue(null);

    const sourceTrack = createMockTrack();
    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(sourceTrack),
    });

    (adapters as ServiceAdapter[]).push(spotifyAdapter);
    vi.mocked(identifyService).mockReturnValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    // Should call getTrack since cache was expired
    expect(spotifyAdapter.getTrack).toHaveBeenCalledWith("track123");
    expect(result.sourceTrack.title).toBe("Bohemian Rhapsody");
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

    (adapters as ServiceAdapter[]).push(spotifyAdapter, deezerAdapter);
    vi.mocked(identifyService).mockReturnValue(spotifyAdapter);

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

    (adapters as ServiceAdapter[]).push(spotifyAdapter, deezerAdapter);
    vi.mocked(identifyService).mockReturnValue(spotifyAdapter);

    await resolveQuery("https://open.spotify.com/track/track123");

    // Deezer adapter should NOT be called since it's already in cache
    expect(deezerAdapter.findByIsrc).not.toHaveBeenCalled();
    expect(deezerAdapter.searchTrack).not.toHaveBeenCalled();
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

    (adapters as ServiceAdapter[]).push(spotifyAdapter, deezerAdapter, tidalAdapter);
    vi.mocked(identifyService).mockReturnValue(spotifyAdapter);

    // Should NOT throw - partial results are valid
    const result = await resolveQuery("https://open.spotify.com/track/track123");

    // At minimum the source link should be present
    expect(result.links.length).toBeGreaterThanOrEqual(1);
    const spotifyLink = result.links.find((l) => l.service === "spotify");
    expect(spotifyLink).toBeDefined();
    expect(spotifyLink!.confidence).toBe(1.0);
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

    (adapters as ServiceAdapter[]).push(spotifyAdapter);

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

    (adapters as ServiceAdapter[]).push(spotifyAdapter, deezerAdapter);

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

    (adapters as ServiceAdapter[]).push(spotifyAdapter, tidalAdapter);
    vi.mocked(identifyService).mockReturnValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    expect(tidalAdapter.findByIsrc).toHaveBeenCalledWith("GBUM71029604");
    const tidalLink = result.links.find((l) => l.service === "tidal");
    expect(tidalLink).toBeDefined();
    expect(tidalLink!.confidence).toBe(1.0);
    expect(tidalLink!.matchMethod).toBe("isrc");
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

    (adapters as ServiceAdapter[]).push(spotifyAdapter, deezerAdapter);
    vi.mocked(identifyService).mockReturnValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    expect(deezerAdapter.findByIsrc).toHaveBeenCalledWith("GBUM71029604");
    expect(deezerAdapter.searchTrack).toHaveBeenCalled();

    const deezerLink = result.links.find((l) => l.service === "deezer");
    expect(deezerLink).toBeDefined();
    expect(deezerLink!.matchMethod).toBe("search");
    expect(deezerLink!.confidence).toBe(0.85);
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

    (adapters as ServiceAdapter[]).push(spotifyAdapter, soundcloudAdapter);
    vi.mocked(identifyService).mockReturnValue(spotifyAdapter);

    await resolveQuery("https://open.spotify.com/track/track123");

    // findByIsrc should NOT be called for SoundCloud (supportsIsrc = false)
    expect(soundcloudAdapter.findByIsrc).not.toHaveBeenCalled();
    expect(soundcloudAdapter.searchTrack).toHaveBeenCalled();
  });
});

// =============================================================================
// 7. Odesli fallback: Apple Music gap-fill via Odesli
// =============================================================================

describe("resolveQuery: Odesli Apple Music gap-fill", () => {
  it("should add Apple Music link via Odesli when no adapter provides it", async () => {
    const sourceTrack = createMockTrack();

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(sourceTrack),
    });

    (adapters as ServiceAdapter[]).push(spotifyAdapter);
    vi.mocked(identifyService).mockReturnValue(spotifyAdapter);

    vi.mocked(resolveViaOdesli).mockResolvedValue({
      links: {
        "apple-music": {
          url: "https://music.apple.com/us/album/bohemian-rhapsody/1440806041?i=1440806768",
          entityUniqueId: "am123",
        },
      },
    });

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    const appleLink = result.links.find((l) => l.service === "apple-music");
    expect(appleLink).toBeDefined();
    expect(appleLink!.url).toBe("https://music.apple.com/us/album/bohemian-rhapsody/1440806041?i=1440806768");
    expect(appleLink!.matchMethod).toBe("odesli");
    expect(appleLink!.confidence).toBe(0.9);
  });

  it("should not call Odesli if Apple Music link already exists", async () => {
    const sourceTrack = createMockTrack();
    const appleMusicTrack = createMockTrack({
      sourceService: "apple-music",
      sourceId: "am1",
      webUrl: "https://music.apple.com/us/album/bohemian-rhapsody/12345?i=67890",
    });

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(sourceTrack),
    });

    const appleMusicAdapter = createMockAdapter({
      id: "apple-music",
      displayName: "Apple Music",
      capabilities: { supportsIsrc: false, supportsPreview: false, supportsArtwork: true },
      searchTrack: vi.fn().mockResolvedValue({
        found: true,
        track: appleMusicTrack,
        confidence: 0.9,
        matchMethod: "search",
      }),
    });

    (adapters as ServiceAdapter[]).push(spotifyAdapter, appleMusicAdapter);
    vi.mocked(identifyService).mockReturnValue(spotifyAdapter);

    await resolveQuery("https://open.spotify.com/track/track123");

    // Odesli should not be called when apple-music already has a link
    expect(resolveViaOdesli).not.toHaveBeenCalled();
  });

  it("should handle Odesli failure gracefully and keep existing links", async () => {
    const sourceTrack = createMockTrack();

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(sourceTrack),
    });

    (adapters as ServiceAdapter[]).push(spotifyAdapter);
    vi.mocked(identifyService).mockReturnValue(spotifyAdapter);
    vi.mocked(resolveViaOdesli).mockRejectedValue(new Error("Odesli API down"));

    // Should NOT throw
    const result = await resolveQuery("https://open.spotify.com/track/track123");

    // Source link should still be present
    expect(result.links.some((l) => l.service === "spotify")).toBe(true);
    expect(result.sourceTrack.title).toBe("Bohemian Rhapsody");
  });
});

// =============================================================================
// 8. resolveSelectedCandidate
// =============================================================================

describe("resolveSelectedCandidate", () => {
  it("should resolve a candidate by service:trackId format", async () => {
    const track = createMockTrack();

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      getTrack: vi.fn().mockResolvedValue(track),
    });

    (adapters as ServiceAdapter[]).push(spotifyAdapter);

    const result = await resolveSelectedCandidate("spotify:track123");

    expect(spotifyAdapter.getTrack).toHaveBeenCalledWith("track123");
    expect(result.sourceTrack.title).toBe("Bohemian Rhapsody");

    const spotifyLink = result.links.find((l) => l.service === "spotify");
    expect(spotifyLink).toBeDefined();
    expect(spotifyLink!.confidence).toBe(1.0);
  });

  it("should throw INVALID_URL for malformed candidate ID", async () => {
    await expect(resolveSelectedCandidate("invalid-no-colon")).rejects.toThrow(ResolveError);

    try {
      await resolveSelectedCandidate("invalid-no-colon");
    } catch (err) {
      expect((err as ResolveError).code).toBe("INVALID_URL");
    }
  });

  it("should throw SERVICE_DOWN when adapter is not available", async () => {
    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      isAvailable: () => false,
    });

    (adapters as ServiceAdapter[]).push(spotifyAdapter);

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

    (adapters as ServiceAdapter[]).push(spotifyAdapter);
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

    (adapters as ServiceAdapter[]).push(spotifyAdapter, youtubeAdapter);
    vi.mocked(identifyService).mockReturnValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    const ytMusicLink = result.links.find((l) => l.service === "youtube-music");
    expect(ytMusicLink).toBeDefined();
    expect(ytMusicLink!.url).toBe("https://music.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(ytMusicLink!.confidence).toBe(0.85);
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

    (adapters as ServiceAdapter[]).push(spotifyAdapter, deezerAdapter);
    vi.mocked(identifyService).mockReturnValue(spotifyAdapter);

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
    (adapters as ServiceAdapter[]).push(spotifyAdapter);
    vi.mocked(identifyService).mockReturnValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    // YouTube search fallback should be present with isSearchFallback=true
    const ytFallback = result.links.find((l) => l.service === "youtube" && l.isSearchFallback);
    expect(ytFallback).toBeDefined();
    expect(ytFallback!.url).toContain("music.youtube.com/search");
    expect(ytFallback!.confidence).toBe(0.5);
  });
});

// =============================================================================
// 13. Unavailable adapters are skipped
// =============================================================================

describe("resolveQuery: adapter availability", () => {
  it("should skip unavailable adapters during cross-service resolution", async () => {
    const sourceTrack = createMockTrack();

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(sourceTrack),
    });

    const tidalAdapter = createMockAdapter({
      id: "tidal",
      displayName: "Tidal",
      isAvailable: () => false, // not available
      findByIsrc: vi.fn(),
      searchTrack: vi.fn(),
    });

    (adapters as ServiceAdapter[]).push(spotifyAdapter, tidalAdapter);
    vi.mocked(identifyService).mockReturnValue(spotifyAdapter);

    await resolveQuery("https://open.spotify.com/track/track123");

    // Tidal should NOT be called since it's unavailable
    expect(tidalAdapter.findByIsrc).not.toHaveBeenCalled();
    expect(tidalAdapter.searchTrack).not.toHaveBeenCalled();
  });
});
