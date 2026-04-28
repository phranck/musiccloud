import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock: repository ─────────────────────────────────────────────────────────

const mockRepo = {
  findAlbumByUrl: vi.fn().mockResolvedValue(null),
  findAlbumByUpc: vi.fn().mockResolvedValue(null),
  findExistingAlbumByUpc: vi.fn().mockResolvedValue(null),
  persistAlbumWithLinks: vi.fn().mockResolvedValue({ albumId: "test-album-id", shortId: "ab1234" }),
  addLinksToAlbum: vi.fn().mockResolvedValue(undefined),
  loadAlbumByShortId: vi.fn().mockResolvedValue(null),
  findTrackPreviews: vi.fn().mockResolvedValue([]),
  upsertTrackPreview: vi.fn().mockResolvedValue(undefined),
  findAlbumPreviews: vi.fn().mockResolvedValue([]),
  upsertAlbumPreview: vi.fn().mockResolvedValue(undefined),
  // track methods (required by interface)
  findTrackByUrl: vi.fn(),
  findTrackByIsrc: vi.fn(),
  persistTrackWithLinks: vi.fn(),
  addLinksToTrack: vi.fn(),
  loadTrackByShortId: vi.fn(),
  getStats: vi.fn(),
};

vi.mock("../db/index.js", () => ({
  getRepository: vi.fn().mockResolvedValue(mockRepo),
}));

// ─── Mock: adapters ───────────────────────────────────────────────────────────

const MOCK_SOURCE_ALBUM = {
  upc: "094638246428",
  sourceService: "spotify" as const,
  sourceId: "6dVIqQ8qmQ5GBnJ9shOYGE",
  title: "Random Access Memories",
  artists: ["Daft Punk"],
  releaseDate: "2013-05-17",
  totalTracks: 13,
  artworkUrl: "https://example.com/artwork.jpg",
  label: "Columbia",
  webUrl: "https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE",
  tracks: [
    { title: "Give Life Back to Music", isrc: "GBUM71301166", trackNumber: 1, durationMs: 269000 },
    { title: "Giorgio by Moroder", isrc: "GBUM71301167", trackNumber: 2, durationMs: 540000 },
    { title: "Get Lucky", isrc: "GBUM71301168", trackNumber: 8, durationMs: 369000 },
  ],
};

const MOCK_DEEZER_ALBUM = {
  upc: "094638246428",
  sourceService: "deezer" as const,
  sourceId: "302127",
  title: "Random Access Memories",
  artists: ["Daft Punk"],
  releaseDate: "2013-05-17",
  totalTracks: 13,
  artworkUrl: "https://example.com/deezer-artwork.jpg",
  webUrl: "https://www.deezer.com/album/302127",
};

const mockSpotifyAdapter = {
  id: "spotify" as const,
  displayName: "Spotify",
  isAvailable: vi.fn().mockReturnValue(true),
  detectUrl: vi.fn().mockReturnValue(null),
  detectAlbumUrl: vi
    .fn()
    .mockImplementation((url: string) => (url.includes("spotify.com/album") ? "6dVIqQ8qmQ5GBnJ9shOYGE" : null)),
  getAlbum: vi.fn().mockResolvedValue(MOCK_SOURCE_ALBUM),
  findAlbumByUpc: vi.fn().mockResolvedValue(null),
  searchAlbum: vi.fn().mockResolvedValue({ found: false, confidence: 0, matchMethod: "search" }),
  albumCapabilities: { supportsUpc: true, supportsAlbumSearch: true, supportsTrackListing: true },
  capabilities: { supportsIsrc: true, supportsPreview: false, supportsArtwork: true },
  getTrack: vi.fn(),
  findByIsrc: vi.fn().mockResolvedValue(null),
  searchTrack: vi.fn().mockResolvedValue({ found: false, confidence: 0, matchMethod: "search" }),
};

const mockDeezerAdapter = {
  id: "deezer" as const,
  displayName: "Deezer",
  isAvailable: vi.fn().mockReturnValue(true),
  detectUrl: vi.fn().mockReturnValue(null),
  detectAlbumUrl: vi.fn().mockReturnValue(null),
  getAlbum: vi.fn(),
  findAlbumByUpc: vi.fn().mockResolvedValue(MOCK_DEEZER_ALBUM),
  searchAlbum: vi.fn().mockResolvedValue({ found: false, confidence: 0, matchMethod: "search" }),
  albumCapabilities: { supportsUpc: true, supportsAlbumSearch: true, supportsTrackListing: true },
  capabilities: { supportsIsrc: true, supportsPreview: true, supportsArtwork: true },
  getTrack: vi.fn(),
  findByIsrc: vi.fn().mockResolvedValue(null),
  searchTrack: vi.fn().mockResolvedValue({ found: false, confidence: 0, matchMethod: "search" }),
};

const mockTidalAdapter = {
  id: "tidal" as const,
  displayName: "Tidal",
  isAvailable: vi.fn().mockReturnValue(true),
  detectUrl: vi.fn().mockReturnValue(null),
  detectAlbumUrl: vi.fn().mockReturnValue(null),
  getAlbum: vi.fn(),
  findAlbumByUpc: vi.fn().mockResolvedValue(null),
  searchAlbum: vi.fn().mockResolvedValue({
    found: true,
    album: {
      upc: "094638246428",
      sourceService: "tidal",
      sourceId: "123456",
      title: "Random Access Memories",
      artists: ["Daft Punk"],
      webUrl: "https://tidal.com/browse/album/123456",
    },
    confidence: 0.92,
    matchMethod: "search",
  }),
  albumCapabilities: { supportsUpc: true, supportsAlbumSearch: true, supportsTrackListing: true },
  capabilities: { supportsIsrc: true, supportsPreview: false, supportsArtwork: true },
  getTrack: vi.fn(),
  findByIsrc: vi.fn().mockResolvedValue(null),
  searchTrack: vi.fn().mockResolvedValue({ found: false, confidence: 0, matchMethod: "search" }),
};

// Mock adapter list
vi.mock("../services/index.js", () => ({
  getActiveAdapters: vi.fn().mockResolvedValue([mockSpotifyAdapter, mockDeezerAdapter, mockTidalAdapter]),
  identifyService: vi.fn(),
  identifyServiceIncludingDisabled: vi.fn().mockResolvedValue(undefined),
  isPluginEnabled: vi.fn().mockResolvedValue(true),
  filterDisabledLinks: vi.fn(async <T>(links: T[]) => links),
}));

// Import AFTER mocks are set up
const { resolveAlbumUrl, resolveAlbumTextSearch } = await import("../services/album-resolver.js");

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AlbumResolver: resolveAlbumUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo.findAlbumByUrl.mockResolvedValue(null);
    mockRepo.findAlbumByUpc.mockResolvedValue(null);
    mockSpotifyAdapter.getAlbum.mockResolvedValue(MOCK_SOURCE_ALBUM);
    mockSpotifyAdapter.findAlbumByUpc.mockResolvedValue(null);
    mockDeezerAdapter.findAlbumByUpc.mockResolvedValue(MOCK_DEEZER_ALBUM);
    mockTidalAdapter.findAlbumByUpc.mockResolvedValue(null);
    mockTidalAdapter.searchAlbum.mockResolvedValue({
      found: true,
      album: {
        upc: "094638246428",
        sourceService: "tidal",
        sourceId: "123456",
        title: "Random Access Memories",
        artists: ["Daft Punk"],
        webUrl: "https://tidal.com/browse/album/123456",
      },
      confidence: 0.92,
      matchMethod: "search",
    });
  });

  it("should resolve an album URL and return cross-service links", async () => {
    const result = await resolveAlbumUrl("https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE");

    expect(result.sourceAlbum.title).toBe("Random Access Memories");
    expect(result.sourceAlbum.artists).toEqual(["Daft Punk"]);
    expect(result.sourceAlbum.upc).toBe("094638246428");
    expect(result.links.length).toBeGreaterThan(0);
  });

  it("should include source service as first link with confidence 1.0", async () => {
    const result = await resolveAlbumUrl("https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE");

    const spotifyLink = result.links.find((l) => l.service === "spotify");
    expect(spotifyLink).toBeDefined();
    expect(spotifyLink?.confidence).toBe(1.0);
    expect(spotifyLink?.matchMethod).toBe("upc");
  });

  it("should use UPC lookup for cross-service resolution", async () => {
    const result = await resolveAlbumUrl("https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE");

    const deezerLink = result.links.find((l) => l.service === "deezer");
    expect(deezerLink).toBeDefined();
    expect(deezerLink?.matchMethod).toBe("upc");
    expect(deezerLink?.confidence).toBe(1.0);
  });

  it("should fall back to search when UPC lookup returns null", async () => {
    const result = await resolveAlbumUrl("https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE");

    const tidalLink = result.links.find((l) => l.service === "tidal");
    expect(tidalLink).toBeDefined();
    expect(tidalLink?.matchMethod).toBe("search");
    expect(tidalLink?.confidence).toBeGreaterThan(0.6);
  });

  it("should return cached result when cache hit", async () => {
    const cachedAlbum = {
      album: MOCK_SOURCE_ALBUM,
      albumId: "cached-id",
      links: [{ service: "deezer", url: "https://www.deezer.com/album/302127", confidence: 1.0, matchMethod: "upc" }],
      updatedAt: Date.now() - 1000, // 1 second old, well within TTL
    };
    mockRepo.findAlbumByUrl.mockResolvedValue(cachedAlbum);

    const result = await resolveAlbumUrl("https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE");

    expect(result.albumId).toBe("cached-id");
    expect(mockSpotifyAdapter.getAlbum).not.toHaveBeenCalled();
  });

  it("should throw NOT_MUSIC_LINK for unrecognized album URL", async () => {
    await expect(resolveAlbumUrl("https://www.example.com/album/123")).rejects.toThrow("Unrecognized album URL");
  });

  it("should throw SERVICE_DOWN when getAlbum fails", async () => {
    mockSpotifyAdapter.getAlbum.mockRejectedValue(new Error("API error"));

    await expect(resolveAlbumUrl("https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE")).rejects.toThrow(
      "Failed to fetch album from spotify",
    );
  });
});

describe("AlbumResolver: resolveAlbumTextSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo.findAlbumByUpc.mockResolvedValue(null);
    mockSpotifyAdapter.searchAlbum.mockResolvedValue({
      found: true,
      album: MOCK_SOURCE_ALBUM,
      confidence: 0.95,
      matchMethod: "search",
    });
    mockDeezerAdapter.findAlbumByUpc.mockResolvedValue(MOCK_DEEZER_ALBUM);
    mockTidalAdapter.findAlbumByUpc.mockResolvedValue(null);
    mockTidalAdapter.searchAlbum.mockResolvedValue({
      found: true,
      album: {
        upc: "094638246428",
        sourceService: "tidal",
        sourceId: "123456",
        title: "Random Access Memories",
        artists: ["Daft Punk"],
        webUrl: "https://tidal.com/browse/album/123456",
      },
      confidence: 0.88,
      matchMethod: "search",
    });
  });

  it("should resolve a text query to an album", async () => {
    const result = await resolveAlbumTextSearch("Random Access Memories Daft Punk");

    expect(result.sourceAlbum.title).toBe("Random Access Memories");
    expect(result.links.length).toBeGreaterThan(0);
  });

  it("should try Spotify first (best album search)", async () => {
    await resolveAlbumTextSearch("Random Access Memories");

    expect(mockSpotifyAdapter.searchAlbum).toHaveBeenCalled();
  });

  it("should throw TRACK_NOT_FOUND when no adapter finds an album", async () => {
    mockSpotifyAdapter.searchAlbum.mockResolvedValue({ found: false, confidence: 0, matchMethod: "search" });
    mockDeezerAdapter.searchAlbum.mockResolvedValue({ found: false, confidence: 0, matchMethod: "search" });
    mockTidalAdapter.searchAlbum.mockResolvedValue({ found: false, confidence: 0, matchMethod: "search" });

    await expect(resolveAlbumTextSearch("Nonexistent Album Nobody")).rejects.toThrow(
      "No album found for the search query",
    );
  });

  it("should use UPC cache dedup when search finds an album with known UPC", async () => {
    const cachedResult = {
      album: MOCK_SOURCE_ALBUM,
      albumId: "cached-upc-id",
      links: [{ service: "deezer", url: "https://www.deezer.com/album/302127", confidence: 1.0, matchMethod: "upc" }],
      updatedAt: Date.now() - 5000,
    };
    mockRepo.findAlbumByUpc.mockResolvedValue(cachedResult);

    const result = await resolveAlbumTextSearch("Random Access Memories");
    expect(result.albumId).toBe("cached-upc-id");
  });
});

describe("AlbumResolver: artwork fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo.findAlbumByUrl.mockResolvedValue(null);
    mockRepo.findAlbumByUpc.mockResolvedValue(null);
  });

  it("should fill missing artwork from cross-service result (e.g. Tidal source)", async () => {
    const tidalAlbumNoArtwork = {
      ...MOCK_SOURCE_ALBUM,
      sourceService: "tidal" as const,
      sourceId: "999",
      artworkUrl: undefined,
      webUrl: "https://tidal.com/browse/album/999",
    };

    mockTidalAdapter.detectAlbumUrl.mockImplementation((url: string) =>
      url.includes("tidal.com/album") ? "999" : null,
    );
    mockTidalAdapter.getAlbum.mockResolvedValue(tidalAlbumNoArtwork);

    // Spotify finds the album via UPC with artwork
    mockSpotifyAdapter.findAlbumByUpc.mockResolvedValue({
      ...MOCK_SOURCE_ALBUM,
      artworkUrl: "https://i.scdn.co/image/fallback-artwork.jpg",
    });
    mockDeezerAdapter.findAlbumByUpc.mockResolvedValue(MOCK_DEEZER_ALBUM);

    const result = await resolveAlbumUrl("https://tidal.com/album/999");

    expect(result.sourceAlbum.artworkUrl).toBe("https://i.scdn.co/image/fallback-artwork.jpg");
  });

  it("should keep existing artwork and not overwrite it", async () => {
    mockSpotifyAdapter.getAlbum.mockResolvedValue(MOCK_SOURCE_ALBUM);
    mockDeezerAdapter.findAlbumByUpc.mockResolvedValue(MOCK_DEEZER_ALBUM);
    mockTidalAdapter.findAlbumByUpc.mockResolvedValue(null);
    mockTidalAdapter.searchAlbum.mockResolvedValue({ found: false, confidence: 0, matchMethod: "search" });

    const result = await resolveAlbumUrl("https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE");

    expect(result.sourceAlbum.artworkUrl).toBe("https://example.com/artwork.jpg");
  });
});

describe("AlbumResolver: ISRC-based inference", () => {
  it("should skip ISRC inference when source album has no tracks", async () => {
    const albumWithoutTracks = { ...MOCK_SOURCE_ALBUM, tracks: undefined };
    mockSpotifyAdapter.getAlbum.mockResolvedValue(albumWithoutTracks);
    mockDeezerAdapter.findAlbumByUpc.mockResolvedValue(null);
    mockDeezerAdapter.searchAlbum.mockResolvedValue({ found: false, confidence: 0, matchMethod: "search" });

    mockRepo.findAlbumByUrl.mockResolvedValue(null);
    mockRepo.findAlbumByUpc.mockResolvedValue(null);

    // Should not throw, just return no deezer link
    const result = await resolveAlbumUrl("https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE");
    const deezerLink = result.links.find((l) => l.service === "deezer");
    expect(deezerLink).toBeUndefined();
  });
});
