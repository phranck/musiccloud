import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResolveError } from "@/lib/resolve/errors";
import type { CachedTrackResult, SharePageDbResult, TrackRepository } from "../db/repository";
import { loadByTrackId as loadShareTrack } from "../lib/server/share-page.js";
import type { MatchResult, NormalizedTrack, SearchResultWithCandidates, ServiceAdapter } from "../services/types";

// =============================================================================
// Mock setup
// =============================================================================

// Mock the adapter registry
vi.mock("../services/index.js", () => ({
  getActiveAdapters: vi.fn().mockResolvedValue([]),
  identifyService: vi.fn(),
  findInactiveServiceFor: vi.fn().mockResolvedValue(null),
  // Identity pass-through — all tests assume every service is enabled unless
  // they opt in to the SERVICE_DISABLED scenario.
  filterDisabledLinks: vi.fn(async <T>(links: T[]) => links),
  isPluginAvailable: vi.fn(() => true),
}));

// Mock the DB singleton
vi.mock("../db/index.js", () => ({
  getRepository: vi.fn(),
}));

// Mock the logger to suppress output during tests
vi.mock("../lib/infra/logger.js", () => ({
  log: {
    debug: vi.fn(),
    error: vi.fn(),
    deviation: vi.fn(),
  },
}));

// Mock fetchWithTimeout (used in scrapeTrackFromPage)
vi.mock("../lib/infra/fetch.js", () => ({
  fetchWithTimeout: vi.fn(),
}));

// =============================================================================
// Import after mocks
// =============================================================================

import { getRepository } from "../db/index";
import { fetchWithTimeout } from "../lib/infra/fetch.js";
import { SERVICE_MISS_TTL_MS } from "../services/constants.js";
import { RESOLVE_RESPONSE_DEADLINE_MS } from "../services/fan-out-deadline.js";
import {
  filterDisabledLinks,
  findInactiveServiceFor,
  getActiveAdapters,
  identifyService,
  isPluginAvailable,
} from "../services/index";
import {
  MATCH_MIN_CONFIDENCE,
  persistLateTrackLinks,
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
    detectUrl: vi.fn(() => null),
    getTrack: vi.fn(),
    findByIsrc: vi.fn().mockResolvedValue(null),
    searchTrack: vi.fn().mockResolvedValue({ found: false, confidence: 0, matchMethod: "search" }),
    ...overrides,
  };
}

/**
 * Models the reported video metadata, including its prohibited legacy thumbnail.
 *
 * @returns A provider boundary fixture without invented ISRC or catalogue artwork.
 */
function createMockVideoAdapter(): ServiceAdapter {
  return createMockAdapter({
    id: "youtube",
    capabilities: { supportsIsrc: false, supportsPreview: false, supportsArtwork: false },
    detectUrl: vi.fn(() => "ImX2w6Ufj4w"),
    getTrack: vi.fn().mockResolvedValue(
      createMockTrack({
        sourceService: "youtube",
        sourceId: "ImX2w6Ufj4w",
        title: "Hurt People feat. @marinalatorracaofficial of @BattleBeast",
        artists: ["DARKK"],
        albumName: undefined,
        isrc: undefined,
        durationMs: 200000,
        artworkUrl: "https://i.ytimg.com/vi/ImX2w6Ufj4w/maxresdefault.jpg",
        webUrl: "https://www.youtube.com/watch?v=ImX2w6Ufj4w",
      }),
    ),
  });
}

function createMockRepository(): TrackRepository {
  return {
    findTrackByUrl: vi.fn().mockResolvedValue(null),
    findTrackByServiceLink: vi.fn().mockResolvedValue(null),
    findTrackByIsrc: vi.fn().mockResolvedValue(null),
    findTracksByTextSearch: vi.fn().mockResolvedValue([]),
    findExistingByIsrc: vi.fn().mockResolvedValue(null),
    loadByShortId: vi.fn().mockResolvedValue(null),
    loadByTrackId: vi.fn().mockResolvedValue(null),
    persistTrackWithLinks: vi.fn().mockResolvedValue({ trackId: "tid1", shortId: "abc" }),
    addLinksToTrack: vi.fn().mockResolvedValue(undefined),
    replaceRecordingArtwork: vi.fn().mockResolvedValue(true),
    addTrackExternalIds: vi.fn().mockResolvedValue(undefined),
    readServiceLinkMisses: vi.fn().mockResolvedValue([]),
    recordServiceLinkMisses: vi.fn().mockResolvedValue(undefined),
    clearServiceLinkMisses: vi.fn().mockResolvedValue(undefined),
    // Album methods (not used by track resolver tests)
    findAlbumByUrl: vi.fn().mockResolvedValue(null),
    findAlbumByServiceLink: vi.fn().mockResolvedValue(null),
    findAlbumByUpc: vi.fn().mockResolvedValue(null),
    findExistingAlbumByUpc: vi.fn().mockResolvedValue(null),
    loadAlbumByShortId: vi.fn().mockResolvedValue(null),
    persistAlbumWithLinks: vi.fn().mockResolvedValue({ albumId: "aid1", shortId: "alb" }),
    addLinksToAlbum: vi.fn().mockResolvedValue(undefined),
    readVinylLayout: vi.fn().mockResolvedValue(undefined),
    enrichVinylLayout: vi.fn().mockResolvedValue(undefined),
    findTrackPreviews: vi.fn().mockResolvedValue([]),
    upsertTrackPreview: vi.fn().mockResolvedValue(undefined),
    findAlbumPreviews: vi.fn().mockResolvedValue([]),
    upsertAlbumPreview: vi.fn().mockResolvedValue(undefined),
    updateTrackTimestamp: vi.fn().mockResolvedValue(undefined),
    cleanupStaleCache: vi.fn().mockResolvedValue(0),
  };
}

// =============================================================================
// Reset mocks before each test
// =============================================================================

let mockRepo: TrackRepository;

/**
 * Models cover storage independently of the resolver so a later share read
 * observes only successful compare-and-set writes, never a mutated read object.
 *
 * @param artworkUrl - The cover initially stored on this test's private row.
 */
function mockStoredTrackArtwork(artworkUrl: string | null): void {
  const stored: SharePageDbResult = {
    trackId: "tid1",
    shortId: "existing-share",
    artists: ["DARKK"],
    artistCredits: [],
    artistDisplay: "DARKK",
    links: [],
    track: {
      title: "Hurt People",
      albumName: null,
      artworkUrl,
      durationMs: 200000,
      isrc: null,
      releaseDate: null,
      isExplicit: null,
      previewUrl: null,
    },
  };
  vi.mocked(mockRepo.loadByTrackId).mockImplementation(async () => structuredClone(stored));
  vi.mocked(mockRepo.replaceRecordingArtwork).mockImplementation(async (kind, id, expected, replacement) => {
    if (kind !== "track" || id !== stored.trackId || expected !== stored.track.artworkUrl) return false;
    stored.track.artworkUrl = replacement;
    return true;
  });
}

beforeEach(() => {
  vi.restoreAllMocks();

  // Reset registry mock surface; each test overrides the ones it cares about.
  vi.mocked(getActiveAdapters).mockResolvedValue([]);
  vi.mocked(findInactiveServiceFor).mockResolvedValue(null);

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
  it.each([true, false])("enriches an automatic cache hit with native candidates=%s", async (nativeCandidates) => {
    const track = createMockTrack();
    const match: MatchResult = { found: true, track, confidence: 0.95, matchMethod: "search" };
    const source = createMockAdapter({
      searchTrack: vi.fn().mockResolvedValue(match),
      ...(nativeCandidates
        ? {
            searchTrackWithCandidates: vi.fn().mockResolvedValue({
              bestMatch: match,
              candidates: [{ track, confidence: 0.95 }],
            }),
          }
        : {}),
    });
    const deezer = createMockAdapter({
      id: "deezer",
      findByIsrc: vi.fn().mockResolvedValue(
        createMockTrack({
          sourceService: "deezer",
          sourceId: "456",
          webUrl: "https://www.deezer.com/track/456",
        }),
      ),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([source, deezer]);
    vi.mocked(mockRepo.findTrackByIsrc).mockResolvedValue({
      trackId: "tid1",
      shortId: "existing-share",
      updatedAt: Date.now(),
      track,
      links: [{ service: "spotify", url: track.webUrl, confidence: 1, matchMethod: "source" }],
    });

    const result = await resolveTextSearchWithDisambiguation("Queen");

    expect(result.result?.links).toContainEqual(expect.objectContaining({ service: "deezer" }));
    expect(result.result?.shortId).toBe("existing-share");
  });

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

    await resolveTextSearchWithDisambiguation("title: Karma Police, artist: Radiohead, album: OK Computer", {
      title: "Karma Police",
      artist: "Radiohead",
      album: "OK Computer",
    });

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

    const result = await resolveTextSearchWithDisambiguation("title: foo", { title: "foo", artist: "" }, 3);

    expect(result.kind).toBe("disambiguation");
    expect(result.candidates?.length).toBe(3);
  });

  it("clamps candidateLimit to MAX_CANDIDATES (24) when caller asks for more", async () => {
    const tracks = Array.from({ length: 30 }, (_, i) =>
      createMockTrack({ sourceId: `t${i}`, title: `Track ${i}`, albumName: `Album ${i}`, webUrl: `https://x/${i}` }),
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
      99, // ridiculous, must clamp to 24
    );

    expect(result.kind).toBe("disambiguation");
    expect(result.candidates?.length).toBe(24);
  });

  it("diversifies disambiguation candidates by album before filling remaining slots", async () => {
    const tracks = [
      createMockTrack({ sourceId: "a1", title: "Same Album 1", albumName: "Same Album", webUrl: "https://x/a1" }),
      createMockTrack({ sourceId: "a2", title: "Same Album 2", albumName: "Same Album", webUrl: "https://x/a2" }),
      createMockTrack({ sourceId: "b1", title: "Other Album", albumName: "Other Album", webUrl: "https://x/b1" }),
      createMockTrack({ sourceId: "c1", title: "Third Album", albumName: "Third Album", webUrl: "https://x/c1" }),
    ];
    const candidates = tracks.map((track) => ({ track, confidence: 0.6 }));

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      searchTrackWithCandidates: vi.fn().mockResolvedValue({
        bestMatch: { found: true, track: tracks[0], confidence: 0.6, matchMethod: "search" },
        candidates,
      } satisfies SearchResultWithCandidates),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);

    const result = await resolveTextSearchWithDisambiguation("title: foo", { title: "foo", artist: "" }, 3);

    expect(result.kind).toBe("disambiguation");
    expect(result.candidates?.map((candidate) => candidate.albumName)).toEqual([
      "Same Album",
      "Other Album",
      "Third Album",
    ]);
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

  it("answers a link the database already holds while its service is down", async () => {
    vi.mocked(mockRepo.findTrackByServiceLink).mockResolvedValue({
      trackId: "known-track",
      updatedAt: Date.now() - 1000,
      track: createMockTrack({ sourceService: "deezer", webUrl: "https://www.deezer.com/track/456" }),
      links: [
        { service: "deezer", url: "https://www.deezer.com/track/456", confidence: 1.0, matchMethod: "source" },
        { service: "spotify", url: "https://open.spotify.com/track/track123", confidence: 1.0, matchMethod: "isrc" },
      ],
    } satisfies CachedTrackResult);

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockRejectedValue(new Error("Spotify is down")),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    expect(result.trackId).toBe("known-track");
    expect(mockRepo.findTrackByServiceLink).toHaveBeenCalledWith("spotify", "track123");
    expect(spotifyAdapter.getTrack).not.toHaveBeenCalled();
  });

  it("runs one resolve for two identical requests at once", async () => {
    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(createMockTrack()),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    const [first, second] = await Promise.all([
      resolveQuery("https://open.spotify.com/track/track123"),
      resolveQuery("https://open.spotify.com/track/track123?si=tracking"),
    ]);

    expect(spotifyAdapter.getTrack).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("carries the stored share id of a cache hit", async () => {
    vi.mocked(mockRepo.findTrackByUrl).mockResolvedValue({
      trackId: "tid1",
      shortId: "stored-short",
      updatedAt: Date.now() - 1000,
      track: createMockTrack(),
      links: [
        { service: "spotify", url: "https://open.spotify.com/track/track123", confidence: 1.0, matchMethod: "source" },
      ],
    } satisfies CachedTrackResult);
    const spotifyAdapter = createMockAdapter({ id: "spotify", detectUrl: vi.fn(() => "track123") });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    expect(result.shortId).toBe("stored-short");
  });

  it("looks a link up under the id its service's links are stored with", async () => {
    const appleAdapter = createMockAdapter({
      id: "apple-music",
      displayName: "Apple Music",
      detectUrl: vi.fn(() => "us:1623728917"),
      toCatalogId: (detectedId: string) => detectedId.split(":")[1],
      getTrack: vi.fn().mockResolvedValue(createMockTrack({ sourceService: "apple-music", sourceId: "1623728917" })),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([appleAdapter]);
    vi.mocked(identifyService).mockResolvedValue(appleAdapter);

    await resolveQuery("https://music.apple.com/us/album/heartthrob/1623728585?i=1623728917");

    expect(mockRepo.findTrackByServiceLink).toHaveBeenCalledWith("apple-music", "1623728917");
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

  it("does not refresh Deezer when a cached track has a fresh preview row", async () => {
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
    vi.mocked(mockRepo.findTrackPreviews).mockResolvedValue([
      {
        service: "deezer",
        url: "https://cdnt-preview.dzcdn.net/api/1/1/foo.mp3?hdnea=exp=4102444800~hmac=abc",
        expiresAt: new Date("2100-01-01T00:00:00Z"),
        observedAt: new Date(),
      },
    ]);

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

    expect(mockRepo.findTrackPreviews).toHaveBeenCalledWith("tid1");
    expect(deezerAdapter.findByIsrc).not.toHaveBeenCalled();
    expect(deezerAdapter.searchTrack).not.toHaveBeenCalled();
  });

  it("refreshes and persists Deezer preview when the cached preview row is expired", async () => {
    const cachedTrack = createMockTrack();
    const freshTimestamp = Date.now() - 5000;
    const freshPreviewUrl = "https://cdnt-preview.dzcdn.net/api/1/1/fresh.mp3?hdnea=exp=4102444800~hmac=abc";

    vi.mocked(mockRepo.findTrackByUrl).mockResolvedValue({
      trackId: "tid1",
      updatedAt: freshTimestamp,
      track: cachedTrack,
      links: [
        { service: "spotify", url: "https://open.spotify.com/track/track123", confidence: 1.0, matchMethod: "isrc" },
        { service: "deezer", url: "https://www.deezer.com/track/456", confidence: 0.9, matchMethod: "search" },
      ],
    } satisfies CachedTrackResult);
    vi.mocked(mockRepo.findTrackPreviews).mockResolvedValue([
      {
        service: "deezer",
        url: "https://cdnt-preview.dzcdn.net/api/1/1/old.mp3?hdnea=exp=946684800~hmac=abc",
        expiresAt: new Date("2000-01-01T00:00:00Z"),
        observedAt: new Date("1999-12-31T00:00:00Z"),
      },
    ]);

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
    });

    const deezerAdapter = createMockAdapter({
      id: "deezer",
      displayName: "Deezer",
      capabilities: { supportsIsrc: true, supportsPreview: true, supportsArtwork: true },
      findByIsrc: vi.fn().mockResolvedValue(
        createMockTrack({
          sourceService: "deezer",
          sourceId: "456",
          webUrl: "https://www.deezer.com/track/456",
          previewUrl: freshPreviewUrl,
        }),
      ),
    });

    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, deezerAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    expect(deezerAdapter.findByIsrc).toHaveBeenCalledWith("GBUM71029604");
    expect(mockRepo.upsertTrackPreview).toHaveBeenCalledWith(
      "tid1",
      expect.objectContaining({ service: "deezer", url: freshPreviewUrl }),
    );
    expect(result.sourceTrack.previewUrl).toBe(freshPreviewUrl);
  });
});

// =============================================================================
// 4b. Fruitless lookups are remembered, so a cached resolve stops paying for them
// =============================================================================

describe("resolveQuery: remembering services that had nothing", () => {
  const CACHED_SPOTIFY_LINK = {
    service: "spotify",
    url: "https://open.spotify.com/track/track123",
    confidence: 1.0,
    matchMethod: "isrc",
  };

  function cacheHitWithSpotifyOnly() {
    vi.mocked(mockRepo.findTrackByUrl).mockResolvedValue({
      trackId: "tid1",
      updatedAt: Date.now() - 5000,
      track: createMockTrack(),
      links: [CACHED_SPOTIFY_LINK],
    } satisfies CachedTrackResult);
  }

  function spotifyAndSilentDeezer() {
    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
    });
    const deezerAdapter = createMockAdapter({
      id: "deezer",
      displayName: "Deezer",
      capabilities: { supportsIsrc: true, supportsPreview: true, supportsArtwork: true },
      findByIsrc: vi.fn().mockResolvedValue(null),
      searchTrack: vi.fn().mockResolvedValue({ found: false, confidence: 0, matchMethod: "search" }),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, deezerAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);
    return { spotifyAdapter, deezerAdapter };
  }

  it("writes down a service that answered with nothing", async () => {
    cacheHitWithSpotifyOnly();
    spotifyAndSilentDeezer();

    await resolveQuery("https://open.spotify.com/track/track123");

    expect(mockRepo.recordServiceLinkMisses).toHaveBeenCalledWith("tid1", ["deezer"]);
  });

  /**
   * The point of the whole mechanism: without it this second resolve queries
   * Deezer again, and so does every one after it, for as long as the row lives.
   */
  it("does not ask a service whose miss is still fresh", async () => {
    cacheHitWithSpotifyOnly();
    const { deezerAdapter } = spotifyAndSilentDeezer();
    vi.mocked(mockRepo.readServiceLinkMisses).mockResolvedValue([
      { service: "deezer", checkedAt: new Date(Date.now() - 60_000) },
    ]);

    await resolveQuery("https://open.spotify.com/track/track123");

    expect(deezerAdapter.findByIsrc).not.toHaveBeenCalled();
    expect(deezerAdapter.searchTrack).not.toHaveBeenCalled();
  });

  it("asks again once the miss has aged past its window", async () => {
    cacheHitWithSpotifyOnly();
    const { deezerAdapter } = spotifyAndSilentDeezer();
    vi.mocked(mockRepo.readServiceLinkMisses).mockResolvedValue([
      { service: "deezer", checkedAt: new Date(Date.now() - SERVICE_MISS_TTL_MS - 60_000) },
    ]);

    await resolveQuery("https://open.spotify.com/track/track123");

    expect(deezerAdapter.findByIsrc).toHaveBeenCalled();
  });

  /**
   * A thrown lookup is an outage or a timeout, not an answer. Recording it
   * would take the service out for a month over a bad minute.
   */
  it("does not write down a lookup that failed", async () => {
    cacheHitWithSpotifyOnly();
    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
    });
    const deezerAdapter = createMockAdapter({
      id: "deezer",
      displayName: "Deezer",
      capabilities: { supportsIsrc: true, supportsPreview: true, supportsArtwork: true },
      findByIsrc: vi.fn().mockRejectedValue(new Error("Deezer unavailable")),
      searchTrack: vi.fn().mockRejectedValue(new Error("Deezer unavailable")),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, deezerAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    await resolveQuery("https://open.spotify.com/track/track123");

    expect(mockRepo.recordServiceLinkMisses).not.toHaveBeenCalledWith("tid1", expect.arrayContaining(["deezer"]));
  });

  it("removes the miss when a service finally does carry the track", async () => {
    cacheHitWithSpotifyOnly();
    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
    });
    const deezerAdapter = createMockAdapter({
      id: "deezer",
      displayName: "Deezer",
      capabilities: { supportsIsrc: true, supportsPreview: true, supportsArtwork: true },
      findByIsrc: vi
        .fn()
        .mockResolvedValue(
          createMockTrack({ sourceService: "deezer", sourceId: "dz789", webUrl: "https://www.deezer.com/track/789" }),
        ),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, deezerAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    await resolveQuery("https://open.spotify.com/track/track123");

    expect(mockRepo.clearServiceLinkMisses).toHaveBeenCalledWith("tid1", ["deezer"]);
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

  it("reports an outage, not a missing track, when every service failed the text search", async () => {
    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      searchTrack: vi.fn().mockRejectedValue(new Error("Spotify rate-limited (429)")),
    });
    const deezerAdapter = createMockAdapter({
      id: "deezer",
      searchTrack: vi.fn().mockRejectedValue(new Error("Deezer failed: 503")),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, deezerAdapter]);

    await expect(resolveQuery("Bohemian Rhapsody Queen")).rejects.toMatchObject({ code: "ALL_DOWN" });
  });

  it("reports an outage when every service failed the disambiguation search", async () => {
    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      searchTrackWithCandidates: vi.fn().mockRejectedValue(new Error("Spotify failed: 500")),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);

    await expect(resolveTextSearchWithDisambiguation("Bohemian Rhapsody")).rejects.toMatchObject({
      code: "ALL_DOWN",
    });
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
  it.each([
    "selected",
    "native-auto",
    "plain-auto",
    "url",
  ])("retains confirmed %s evidence when a second search would fail", async (entry) => {
    const original = await createMockVideoAdapter().getTrack("ImX2w6Ufj4w");
    const selected = createMockTrack({
      title: "Hurt People",
      artists: ["DARKK"],
      isrc: "DEZC62699545",
      sourceId: "2Ii7mUmPen9cMZPDdFjjPW",
      webUrl: "https://open.spotify.com/track/2Ii7mUmPen9cMZPDdFjjPW",
    });
    const match: MatchResult = { found: true, track: selected, confidence: 0.95, matchMethod: "search" };
    const source = createMockAdapter({
      detectUrl: vi.fn(() => selected.sourceId),
      getTrack: vi.fn().mockResolvedValue(selected),
      searchTrack: vi.fn().mockRejectedValue(new Error("A redundant search failed")),
      ...(entry === "native-auto"
        ? {
            searchTrackWithCandidates: vi
              .fn()
              .mockResolvedValue({ bestMatch: match, candidates: [{ track: selected, confidence: 0.95 }] }),
          }
        : {}),
    });
    if (entry === "plain-auto") vi.mocked(source.searchTrack).mockResolvedValueOnce(match);
    vi.mocked(identifyService).mockResolvedValue(source);
    vi.mocked(getActiveAdapters).mockResolvedValue([source]);
    vi.mocked(mockRepo.findTrackByIsrc).mockResolvedValue({
      trackId: "tid1",
      shortId: "existing-share",
      updatedAt: Date.now(),
      track: original,
      links: [{ service: "youtube", url: original.webUrl, confidence: 1, matchMethod: "source" }],
    });

    const result =
      entry === "selected"
        ? await resolveSelectedCandidate("spotify:2Ii7mUmPen9cMZPDdFjjPW")
        : entry === "url"
          ? await resolveQuery(selected.webUrl)
          : (await resolveTextSearchWithDisambiguation("Darkk")).result;

    expect(result?.links).toContainEqual(
      expect.objectContaining({
        service: "spotify",
        url: selected.webUrl,
        confidence: entry === "selected" || entry === "url" ? 1 : 0.95,
      }),
    );
    expect(result?.shortId).toBe("existing-share");
    expect(result?.sourceTrack.title).toBe(original.title);
    expect(result?.sourceTrack.isrc).toBeUndefined();
  });

  it("reuses and enriches a selected video source without an ISRC", async () => {
    const source = createMockVideoAdapter();
    const track = await source.getTrack("ImX2w6Ufj4w");
    const deezer = createMockAdapter({
      id: "deezer",
      searchTrack: vi.fn().mockResolvedValue({
        found: true,
        confidence: 0.9,
        matchMethod: "search",
        track: {
          sourceService: "deezer",
          sourceId: "4275996402",
          title: "Hurt People",
          artists: ["DARKK"],
          isrc: "DEZC62699545",
          webUrl: "https://www.deezer.com/track/4275996402",
        },
      }),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([source, deezer]);
    vi.mocked(mockRepo.findTrackByUrl).mockResolvedValue({
      trackId: "tid1",
      shortId: "existing-share",
      updatedAt: Date.now(),
      track,
      links: [{ service: "youtube", url: track.webUrl, confidence: 1, matchMethod: "source" }],
    });

    const result = await resolveSelectedCandidate("youtube:ImX2w6Ufj4w");

    expect(result.shortId).toBe("existing-share");
    expect(result.links).toContainEqual(expect.objectContaining({ service: "deezer" }));
  });

  it("fills missing destinations when a selected candidate hits the ISRC cache", async () => {
    const track = createMockTrack();
    const source = createMockAdapter({ getTrack: vi.fn().mockResolvedValue(track) });
    const deezer = createMockAdapter({
      id: "deezer",
      findByIsrc: vi.fn().mockResolvedValue(
        createMockTrack({
          sourceService: "deezer",
          sourceId: "456",
          webUrl: "https://www.deezer.com/track/456",
        }),
      ),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([source, deezer]);
    vi.mocked(mockRepo.findTrackByIsrc).mockResolvedValue({
      trackId: "tid1",
      shortId: "existing-share",
      updatedAt: Date.now(),
      track,
      links: [{ service: "spotify", url: track.webUrl, confidence: 1, matchMethod: "source" }],
    });

    const result = await resolveSelectedCandidate("spotify:track123");

    expect(result.links).toContainEqual(expect.objectContaining({ service: "deezer" }));
    expect(result.shortId).toBe("existing-share");
  });

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
  it.each([
    "https://youtu.be/ImX2w6Ufj4w",
    "https://www.youtube.com/watch?v=ImX2w6Ufj4w",
    "https://music.youtube.com/watch?v=ImX2w6Ufj4w",
  ])("derives one recording destination when the source is %s", async (url) => {
    const source = createMockVideoAdapter();
    vi.mocked(getActiveAdapters).mockResolvedValue([source]);
    vi.mocked(identifyService).mockResolvedValue(source);
    const result = await resolveQuery(url);
    expect(result.links.filter((link) => link.service === "youtube-music")).toEqual([
      expect.objectContaining({
        url: "https://music.youtube.com/watch?v=ImX2w6Ufj4w",
        confidence: 1,
        matchMethod: "source",
      }),
    ]);
  });

  it("adds and persists the missing derived destination on cached re-resolution", async () => {
    const source = createMockVideoAdapter();
    const track = await source.getTrack("ImX2w6Ufj4w");
    vi.mocked(mockRepo.findTrackByUrl).mockResolvedValue({
      trackId: "tid1",
      shortId: "existing-share",
      updatedAt: Date.now(),
      track,
      links: [{ service: "youtube", url: track.webUrl, confidence: 0.85, matchMethod: "search" }],
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([source]);
    const result = await resolveQuery(track.webUrl);
    expect(result.shortId).toBe("existing-share");
    expect(result.sourceTrack.artworkUrl).toBeUndefined();
    expect(result.links.filter((link) => link.service === "youtube-music")).toHaveLength(1);
    expect(result.links.find((link) => link.service === "youtube-music")?.externalId).toBe("ImX2w6Ufj4w");
    expect(mockRepo.addLinksToTrack).toHaveBeenCalledWith("tid1", [
      expect.objectContaining({ service: "youtube-music", confidence: 0.85, matchMethod: "search" }),
    ]);
  });

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

    // The fallback is recognisable by its match method, which is what a
    // consumer filters on to keep only links that point at the recording.
    const ytFallback = result.links.find((l) => l.service === "youtube");
    expect(ytFallback).toBeDefined();
    expect(ytFallback?.matchMethod).toBe("search-fallback");
    expect(ytFallback?.url).toContain("music.youtube.com/search");
    expect(ytFallback?.confidence).toBe(0.5);

    // A real text-search match and a fallback must not share a method, or
    // the two become indistinguishable in the response.
    expect(result.links.filter((l) => l.matchMethod === "search")).not.toContain(ytFallback);
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
  it("does not emit a disabled video destination on a fresh resolve", async () => {
    const source = createMockAdapter({
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(createMockTrack()),
    });
    vi.mocked(identifyService).mockResolvedValue(source);
    vi.mocked(getActiveAdapters).mockResolvedValue([source]);
    vi.mocked(filterDisabledLinks).mockImplementation(async <T extends { service: string }>(links: T[]) =>
      links.filter((link) => link.service !== "youtube" && link.service !== "youtube-music"),
    );

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    expect(result.links.map((link) => link.service)).toEqual(["spotify"]);
  });

  it("should throw SERVICE_DISABLED when the source service is inactive", async () => {
    // The link belongs to a plugin that is switched off or lacks credentials,
    // so the resolver must surface SERVICE_DISABLED rather than falling
    // through to NOT_MUSIC_LINK.
    vi.mocked(findInactiveServiceFor).mockResolvedValue("spotify");
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

    // The plugin is active, so the check finds nothing and does not short-circuit.
    vi.mocked(findInactiveServiceFor).mockResolvedValue(null);
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");
    expect(result.links.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// 14. Response deadline: slow services do not hold the response
// =============================================================================

describe("resolveQuery: response deadline", () => {
  it.each([false, true])("persists a unique music destination for a late video match with cache=%s", async (cached) => {
    const video = await createMockVideoAdapter().getTrack("ImX2w6Ufj4w");
    const sourceTrack: NormalizedTrack = {
      ...video,
      sourceService: "spotify",
      sourceId: "2Ii7mUmPen9cMZPDdFjjPW",
      title: "Hurt People",
      isrc: "DEZC62699545",
      artworkUrl: "https://i.scdn.co/image/recording-cover",
      durationMs: 201000,
      webUrl: "https://open.spotify.com/track/2Ii7mUmPen9cMZPDdFjjPW",
    };
    const slowVideo = deferred<MatchResult>();
    const source = createMockAdapter({
      detectUrl: vi.fn(() => sourceTrack.sourceId),
      getTrack: vi.fn().mockResolvedValue(sourceTrack),
    });
    const youtube = createMockAdapter({
      id: "youtube",
      capabilities: { supportsIsrc: false, supportsPreview: false, supportsArtwork: false },
      searchTrack: vi.fn().mockReturnValue(slowVideo.promise),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([source, youtube]);
    vi.mocked(identifyService).mockResolvedValue(source);
    if (cached)
      vi.mocked(mockRepo.findTrackByUrl).mockResolvedValue({
        trackId: "tid1",
        shortId: "existing-share",
        updatedAt: Date.now(),
        track: sourceTrack,
        links: [{ service: "spotify", url: sourceTrack.webUrl, confidence: 1, matchMethod: "source" }],
      });
    const pending = resolveQuery(sourceTrack.webUrl);
    await vi.advanceTimersByTimeAsync(RESOLVE_RESPONSE_DEADLINE_MS);
    const result = await pending;
    expect(result.links.filter((link) => link.service === "youtube-music")).toHaveLength(0);

    slowVideo.resolve({ found: true, track: video, confidence: 0.85, matchMethod: "search" });
    if (result.lateLinks) await persistLateTrackLinks("tid1", result.lateLinks);
    await vi.waitFor(() =>
      expect(mockRepo.addLinksToTrack).toHaveBeenCalledWith(
        "tid1",
        expect.arrayContaining([
          expect.objectContaining({
            service: "youtube-music",
            externalId: "ImX2w6Ufj4w",
            url: "https://music.youtube.com/watch?v=ImX2w6Ufj4w",
          }),
        ]),
      ),
    );
  });

  it("persists identifiers observed only by late recording matches", async () => {
    await persistLateTrackLinks(
      "tid1",
      Promise.resolve([
        {
          service: "deezer",
          displayName: "Deezer",
          confidence: 1,
          matchMethod: "isrc",
          url: "https://www.deezer.com/track/4275996402",
          isrc: "DEZC62699545",
        },
      ]),
    );
    expect(mockRepo.addTrackExternalIds).toHaveBeenCalledWith("tid1", [
      { idType: "isrc", idValue: "DEZC62699545", sourceService: "deezer" },
    ]);
  });

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((settle) => {
      resolve = settle;
    });
    return { promise, resolve };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers at the deadline without a slow service and stores its link once it arrives", async () => {
    const sourceTrack = createMockTrack();
    const tidalTrack = createMockTrack({
      sourceService: "tidal",
      sourceId: "tidal789",
      webUrl: "https://tidal.com/browse/track/tidal789",
    });
    const slowTidal = deferred<NormalizedTrack | null>();

    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(sourceTrack),
    });
    const deezerAdapter = createMockAdapter({
      id: "deezer",
      displayName: "Deezer",
      findByIsrc: vi
        .fn()
        .mockResolvedValue(
          createMockTrack({ sourceService: "deezer", sourceId: "dz1", webUrl: "https://www.deezer.com/track/1" }),
        ),
    });
    const tidalAdapter = createMockAdapter({
      id: "tidal",
      displayName: "Tidal",
      findByIsrc: vi.fn().mockReturnValue(slowTidal.promise),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, deezerAdapter, tidalAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    const pending = resolveQuery("https://open.spotify.com/track/track123");
    await vi.advanceTimersByTimeAsync(RESOLVE_RESPONSE_DEADLINE_MS);
    const result = await pending;

    expect(result.links.map((l) => l.service)).toContain("deezer");
    expect(result.links.map((l) => l.service)).not.toContain("tidal");
    expect(result.lateLinks).toBeDefined();

    slowTidal.resolve(tidalTrack);
    await persistLateTrackLinks("tid1", result.lateLinks as Promise<never>);

    expect(mockRepo.addLinksToTrack).toHaveBeenCalledWith(
      "tid1",
      expect.arrayContaining([expect.objectContaining({ service: "tidal", matchMethod: "isrc" })]),
    );
  });

  it("answers a cache hit at the deadline and stores the slow service's link in the background", async () => {
    vi.mocked(mockRepo.findTrackByUrl).mockResolvedValue({
      trackId: "tid1",
      updatedAt: Date.now() - 5000,
      track: createMockTrack(),
      links: [
        { service: "spotify", url: "https://open.spotify.com/track/track123", confidence: 1.0, matchMethod: "isrc" },
      ],
    } satisfies CachedTrackResult);
    const slowDeezer = deferred<NormalizedTrack | null>();
    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
    });
    const deezerAdapter = createMockAdapter({
      id: "deezer",
      displayName: "Deezer",
      findByIsrc: vi.fn().mockReturnValue(slowDeezer.promise),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, deezerAdapter]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    const pending = resolveQuery("https://open.spotify.com/track/track123");
    await vi.advanceTimersByTimeAsync(RESOLVE_RESPONSE_DEADLINE_MS);
    const result = await pending;

    expect(result.links.map((l) => l.service)).toEqual(["spotify"]);
    expect(mockRepo.addLinksToTrack).not.toHaveBeenCalled();

    slowDeezer.resolve(
      createMockTrack({ sourceService: "deezer", sourceId: "dz9", webUrl: "https://www.deezer.com/track/9" }),
    );
    await vi.waitFor(() =>
      expect(mockRepo.addLinksToTrack).toHaveBeenCalledWith(
        "tid1",
        expect.arrayContaining([expect.objectContaining({ service: "deezer" })]),
      ),
    );
  });

  it("does not wait for the deadline when every service has answered", async () => {
    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      displayName: "Spotify",
      detectUrl: vi.fn(() => "track123"),
      getTrack: vi.fn().mockResolvedValue(createMockTrack()),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([spotifyAdapter, createMockAdapter({ id: "deezer" })]);
    vi.mocked(identifyService).mockResolvedValue(spotifyAdapter);

    const result = await resolveQuery("https://open.spotify.com/track/track123");

    expect(result.lateLinks).toBeUndefined();
  });
});

// =============================================================================
// 15. Artwork: Apple's covers are never kept
// =============================================================================

describe("resolveQuery: artwork", () => {
  it.each([
    ["tidal", undefined],
    ["youtube", undefined],
    ["tidal", "DEZC62699545"],
  ] as const)("retains provenance and unique destinations for scraped %s with identifier %s", async (service, isrc) => {
    const source = createMockAdapter({
      id: service,
      detectUrl: vi.fn(() => (service === "tidal" ? "559761174" : "ImX2w6Ufj4w")),
      getTrack: vi.fn().mockRejectedValue(new Error("Source configuration became unavailable")),
    });
    const catalogueTrack: NormalizedTrack = {
      sourceService: "apple-music",
      sourceId: "6810290307",
      title: "Hurt People",
      artists: ["DARKK"],
      isrc,
      webUrl: "https://music.apple.com/jp/album/hurt-people-feat-marina-la-torraca/6810290305?i=6810290307",
    };
    const catalogue = createMockAdapter({
      id: "apple-music",
      searchTrack: vi.fn().mockResolvedValue({
        found: true,
        confidence: 0.9,
        matchMethod: "search",
        track: catalogueTrack,
      }),
    });
    if (isrc) {
      const original = await createMockVideoAdapter().getTrack("ImX2w6Ufj4w");
      vi.mocked(mockRepo.findTrackByIsrc).mockResolvedValue({
        trackId: "tid1",
        shortId: "existing-share",
        updatedAt: Date.now(),
        track: original,
        links: [{ service: "youtube", url: original.webUrl, confidence: 1, matchMethod: "source" }],
      });
    }
    vi.mocked(identifyService).mockResolvedValue(source);
    vi.mocked(isPluginAvailable).mockReturnValueOnce(false);
    vi.mocked(getActiveAdapters).mockResolvedValue([catalogue]);
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      new Response(
        '<meta property="og:title" content="Hurt People by DARKK on Tidal"><meta property="og:image" content="https://example.com/catalogue-cover.jpg">',
      ),
    );

    const result = await resolveQuery(
      service === "tidal" ? "https://tidal.com/track/559761174" : "https://youtu.be/ImX2w6Ufj4w",
    );

    expect(result.sourceTrack.artworkUrl).toBe(
      service === "tidal" ? "https://example.com/catalogue-cover.jpg" : undefined,
    );
    expect(new Set(result.links.map((link) => link.service)).size).toBe(result.links.length);
    if (isrc) {
      expect(result.shortId).toBe("existing-share");
      expect(result.links.map((link) => link.service)).toEqual(expect.arrayContaining(["apple-music", "tidal"]));
    }
  });

  it("recovers a cover from an already linked recording without waiting for preview expiry", async () => {
    const source = createMockVideoAdapter();
    const track = await source.getTrack("ImX2w6Ufj4w");
    const cover = "https://cdn-images.dzcdn.net/images/cover/release/1000x1000.jpg";
    mockStoredTrackArtwork(track.artworkUrl ?? null);
    const deezer = createMockAdapter({
      id: "deezer",
      detectUrl: vi.fn(() => "4275996402"),
      getTrack: vi.fn().mockResolvedValue({
        sourceService: "deezer",
        sourceId: "4275996402",
        title: "Hurt People",
        artists: ["DARKK"],
        artworkUrl: cover,
        durationMs: 201000,
        webUrl: "https://www.deezer.com/track/4275996402",
      }),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([source, deezer]);
    vi.mocked(mockRepo.findTrackByUrl).mockResolvedValue({
      trackId: "tid1",
      shortId: "existing-share",
      updatedAt: Date.now(),
      track,
      links: [
        { service: "youtube", url: track.webUrl, confidence: 1, matchMethod: "source" },
        { service: "deezer", url: "https://www.deezer.com/track/4275996402", confidence: 0.9, matchMethod: "search" },
      ],
    });
    vi.mocked(mockRepo.findTrackPreviews).mockResolvedValue([
      { service: "deezer", url: "https://example.test/preview.mp3", expiresAt: null, observedAt: new Date() },
    ]);

    const result = await resolveQuery("https://youtu.be/ImX2w6Ufj4w");
    const shared = await loadShareTrack("tid1", "https://example.test");

    expect(result.sourceTrack.artworkUrl).toBe(cover);
    expect(shared?.track.artworkUrl).toBe(cover);
    expect(shared?.shortId).toBe("existing-share");
  });

  it.each([
    ["https://i.ytimg.com/vi/ImX2w6Ufj4w/maxresdefault.jpg", "https://i.scdn.co/image/recording-cover"],
    [
      "https://cdn-images.dzcdn.net/images/cover/existing/1000x1000.jpg",
      "https://cdn-images.dzcdn.net/images/cover/existing/1000x1000.jpg",
    ],
  ])("keeps the correct persisted cover on a share read after a late match from %s", async (storedCover, expectedCover) => {
    mockStoredTrackArtwork(storedCover);
    await persistLateTrackLinks(
      "tid1",
      Promise.resolve([
        {
          service: "spotify",
          displayName: "Spotify",
          confidence: 0.85,
          matchMethod: "search",
          url: "https://open.spotify.com/track/2Ii7mUmPen9cMZPDdFjjPW",
          artworkUrl: "https://i.scdn.co/image/recording-cover",
        },
      ]),
    );

    const shared = await loadShareTrack("tid1", "https://example.test");

    expect(shared?.track.artworkUrl).toBe(expectedCover);
    expect(shared?.shortId).toBe("existing-share");
  });

  it("uses catalogue artwork instead of a source video thumbnail", async () => {
    const source = createMockVideoAdapter();
    const catalogue = createMockAdapter({
      id: "spotify",
      searchTrack: vi.fn().mockResolvedValue({
        found: true,
        confidence: 0.85,
        matchMethod: "search",
        track: createMockTrack({
          title: "Hurt People",
          artists: ["DARKK"],
          artworkUrl: "https://i.scdn.co/image/recording-cover",
        }),
      }),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([source, catalogue]);
    vi.mocked(identifyService).mockResolvedValue(source);
    const result = await resolveQuery("https://www.youtube.com/watch?v=ImX2w6Ufj4w");
    expect(result.sourceTrack.artworkUrl).toBe("https://i.scdn.co/image/recording-cover");
  });

  it("keeps no recording cover when only a source video thumbnail exists", async () => {
    const source = createMockVideoAdapter();
    vi.mocked(getActiveAdapters).mockResolvedValue([source]);
    vi.mocked(identifyService).mockResolvedValue(source);
    const result = await resolveQuery("https://www.youtube.com/watch?v=ImX2w6Ufj4w");
    expect(result.sourceTrack.artworkUrl).toBeUndefined();
  });

  const APPLE_COVER = "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/aa/bb/cc/source/640x640bb.jpg";
  const SPOTIFY_COVER = "https://i.scdn.co/image/ab67616d0000b273";
  const DEEZER_COVER = "https://e-cdns-images.dzcdn.net/images/cover/abc/1000x1000-000000-80-0-0.jpg";
  const APPLE_URL = "https://music.apple.com/us/album/heartthrob/1623728585?i=1623728917";

  function appleSource() {
    const appleAdapter = createMockAdapter({
      id: "apple-music",
      displayName: "Apple Music",
      detectUrl: vi.fn(() => "us:1623728917"),
      toCatalogId: (detectedId: string) => detectedId.split(":")[1],
      getTrack: vi.fn().mockResolvedValue(
        createMockTrack({
          sourceService: "apple-music",
          sourceId: "1623728917",
          artworkUrl: APPLE_COVER,
          webUrl: APPLE_URL,
        }),
      ),
    });
    vi.mocked(identifyService).mockResolvedValue(appleAdapter);
    return appleAdapter;
  }

  it("replaces an Apple source's cover with the one Spotify returned for its link", async () => {
    const appleAdapter = appleSource();
    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      findByIsrc: vi.fn().mockResolvedValue(createMockTrack({ artworkUrl: SPOTIFY_COVER })),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([appleAdapter, spotifyAdapter]);

    const result = await resolveQuery(APPLE_URL);

    expect(result.sourceTrack.artworkUrl).toBe(SPOTIFY_COVER);
    expect(spotifyAdapter.findByIsrc).toHaveBeenCalledTimes(1);
  });

  it("keeps no cover for an Apple source when no other service has one", async () => {
    const appleAdapter = appleSource();
    const spotifyAdapter = createMockAdapter({ id: "spotify" });
    const deezerAdapter = createMockAdapter({ id: "deezer", displayName: "Deezer" });
    vi.mocked(getActiveAdapters).mockResolvedValue([appleAdapter, spotifyAdapter, deezerAdapter]);

    const result = await resolveQuery(APPLE_URL);

    expect(result.sourceTrack.artworkUrl).toBeUndefined();
  });

  it("skips an Apple cover on a link and asks Deezer by ISRC, never Apple", async () => {
    const tidalAdapter = createMockAdapter({
      id: "tidal",
      displayName: "Tidal",
      detectUrl: vi.fn(() => "tidal789"),
      getTrack: vi.fn().mockResolvedValue(
        createMockTrack({
          sourceService: "tidal",
          sourceId: "tidal789",
          artworkUrl: undefined,
          webUrl: "https://tidal.com/browse/track/tidal789",
        }),
      ),
    });
    const appleAdapter = createMockAdapter({
      id: "apple-music",
      displayName: "Apple Music",
      findByIsrc: vi
        .fn()
        .mockResolvedValue(
          createMockTrack({ sourceService: "apple-music", sourceId: "1623728917", artworkUrl: APPLE_COVER }),
        ),
    });
    const deezerAdapter = createMockAdapter({
      id: "deezer",
      displayName: "Deezer",
      findByIsrc: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(createMockTrack({ sourceService: "deezer", artworkUrl: DEEZER_COVER })),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([tidalAdapter, appleAdapter, deezerAdapter]);
    vi.mocked(identifyService).mockResolvedValue(tidalAdapter);

    const result = await resolveQuery("https://tidal.com/browse/track/tidal789");

    expect(result.sourceTrack.artworkUrl).toBe(DEEZER_COVER);
    expect(appleAdapter.findByIsrc).toHaveBeenCalledTimes(1);
    expect(deezerAdapter.findByIsrc).toHaveBeenCalledTimes(2);
  });

  it("borrows a link's cover for a text search hit that has none", async () => {
    const appleAdapter = createMockAdapter({
      id: "apple-music",
      displayName: "Apple Music",
      searchTrack: vi.fn().mockResolvedValue({
        found: true,
        track: createMockTrack({ sourceService: "apple-music", sourceId: "1623728917", artworkUrl: undefined }),
        confidence: 0.9,
        matchMethod: "search",
      } satisfies MatchResult),
    });
    const spotifyAdapter = createMockAdapter({
      id: "spotify",
      findByIsrc: vi.fn().mockResolvedValue(createMockTrack({ artworkUrl: SPOTIFY_COVER })),
    });
    vi.mocked(getActiveAdapters).mockResolvedValue([appleAdapter, spotifyAdapter]);

    const result = await resolveQuery("Bohemian Rhapsody Queen");

    expect(result.sourceTrack.sourceService).toBe("apple-music");
    expect(result.sourceTrack.artworkUrl).toBe(SPOTIFY_COVER);
  });
});
