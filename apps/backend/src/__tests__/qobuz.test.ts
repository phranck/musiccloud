import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetAppIdCache, _setAppIdForTest, qobuzAdapter } from "../services/adapters/qobuz";

// =============================================================================
// Mock data
// =============================================================================

const MOCK_TRACK_RESPONSE = {
  id: 59954869,
  title: "Bridge Of Light",
  duration: 246,
  isrc: "USNLR1100709",
  performer: { id: 118671, name: "P!nk" },
  parental_warning: false,
  album: {
    title: "Happy Feet Two (Music from The Motion Picture)",
    released_at: 1321920000, // 2011-11-22
    image: {
      small: "https://static.qobuz.com/images/covers/ac/mm/gp5oorip9mmac_50.jpg",
      thumbnail: "https://static.qobuz.com/images/covers/ac/mm/gp5oorip9mmac_230.jpg",
      large: "https://static.qobuz.com/images/covers/ac/mm/gp5oorip9mmac_600.jpg",
    },
  },
};

const MOCK_SEARCH_RESPONSE = {
  tracks: {
    total: 42,
    items: [
      {
        id: 59954869,
        title: "Bridge Of Light",
        duration: 246,
        isrc: "USNLR1100709",
        performer: { id: 118671, name: "P!nk" },
        album: {
          title: "Happy Feet Two",
          image: { large: "https://static.qobuz.com/images/covers/ac/mm/gp5oorip9mmac_600.jpg" },
        },
      },
      {
        id: 99999999,
        title: "Something Else",
        duration: 180,
        performer: { id: 999, name: "Other Artist" },
        album: { title: "Other Album" },
      },
    ],
  },
};

// =============================================================================
// Mocks
// =============================================================================

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  _resetAppIdCache();
  _setAppIdForTest("123456789");
});

describe("Qobuz: detectUrl", () => {
  it("should detect open.qobuz.com track URL", () => {
    expect(qobuzAdapter.detectUrl("https://open.qobuz.com/track/59954869")).toBe("59954869");
  });

  it("should detect play.qobuz.com track URL", () => {
    expect(qobuzAdapter.detectUrl("https://play.qobuz.com/track/59954869")).toBe("59954869");
  });

  it("should handle URL with query params", () => {
    expect(qobuzAdapter.detectUrl("https://open.qobuz.com/track/59954869?from=share")).toBe("59954869");
  });

  it("should return null for album URL", () => {
    expect(qobuzAdapter.detectUrl("https://open.qobuz.com/album/12345")).toBeNull();
  });

  it("should return null for non-Qobuz URL", () => {
    expect(qobuzAdapter.detectUrl("https://open.spotify.com/track/abc")).toBeNull();
  });

  it("should return null for playlist URL", () => {
    expect(qobuzAdapter.detectUrl("https://play.qobuz.com/playlist/12345")).toBeNull();
  });
});

// =============================================================================
// detectAlbumUrl
// =============================================================================

describe("Qobuz: detectAlbumUrl", () => {
  it("should extract album ID from open.qobuz.com", () => {
    expect(qobuzAdapter.detectAlbumUrl?.("https://open.qobuz.com/album/0060253780968")).toBe("0060253780968");
  });

  it("should extract album ID from play.qobuz.com", () => {
    expect(qobuzAdapter.detectAlbumUrl?.("https://play.qobuz.com/album/0060253780968")).toBe("0060253780968");
  });

  it("should handle URL with query params", () => {
    expect(qobuzAdapter.detectAlbumUrl?.("https://open.qobuz.com/album/12345?from=share")).toBe("12345");
  });

  it("should return null for track URL", () => {
    expect(qobuzAdapter.detectAlbumUrl?.("https://open.qobuz.com/track/59954869")).toBeNull();
  });

  it("should return null for non-Qobuz URL", () => {
    expect(qobuzAdapter.detectAlbumUrl?.("https://open.spotify.com/album/abc123")).toBeNull();
  });
});

describe("Qobuz: getTrack", () => {
  it("should resolve track via API", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(MOCK_TRACK_RESPONSE));

    const track = await qobuzAdapter.getTrack("59954869");

    expect(track.title).toBe("Bridge Of Light");
    expect(track.artists).toEqual(["P!nk"]);
    expect(track.albumName).toBe("Happy Feet Two (Music from The Motion Picture)");
    expect(track.durationMs).toBe(246000); // 246 seconds * 1000
    expect(track.isrc).toBe("USNLR1100709");
    expect(track.artworkUrl).toBe("https://static.qobuz.com/images/covers/ac/mm/gp5oorip9mmac_600.jpg");
    expect(track.webUrl).toBe("https://open.qobuz.com/track/59954869");
    expect(track.sourceService).toBe("qobuz");
    expect(track.releaseDate).toBe("2011-11-22");
  });

  it("should throw on HTTP error", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({}, 404));

    await expect(qobuzAdapter.getTrack("99999")).rejects.toThrow("Qobuz track fetch failed: 404");
  });

  it("should throw when response has no title", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 123 }));

    await expect(qobuzAdapter.getTrack("123")).rejects.toThrow("Qobuz: Track not found: 123");
  });

  it("should handle missing album artwork gracefully", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        ...MOCK_TRACK_RESPONSE,
        album: { title: "Test", image: {} },
      }),
    );

    const track = await qobuzAdapter.getTrack("59954869");
    expect(track.artworkUrl).toBeUndefined();
  });
});

describe("Qobuz: findByIsrc", () => {
  it("should return null (no ISRC lookup endpoint)", async () => {
    const result = await qobuzAdapter.findByIsrc("USNLR1100709");
    expect(result).toBeNull();
  });
});

describe("Qobuz: searchTrack", () => {
  it("should find track with structured query", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(MOCK_SEARCH_RESPONSE));

    const result = await qobuzAdapter.searchTrack({ title: "Bridge Of Light", artist: "P!nk" });

    expect(result.found).toBe(true);
    expect(result.track?.title).toBe("Bridge Of Light");
    expect(result.track?.artists).toEqual(["P!nk"]);
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(result.matchMethod).toBe("search");
  });

  it("should return not found for empty results", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ tracks: { items: [], total: 0 } }));

    const result = await qobuzAdapter.searchTrack({ title: "Nonexistent Song", artist: "Nobody" });

    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("should return not found on HTTP error", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({}, 500));

    const result = await qobuzAdapter.searchTrack({ title: "Test", artist: "Test" });

    expect(result.found).toBe(false);
  });

  it("should pick best match from multiple results", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(MOCK_SEARCH_RESPONSE));

    const result = await qobuzAdapter.searchTrack({ title: "Bridge Of Light", artist: "P!nk" });

    expect(result.found).toBe(true);
    expect(result.track?.title).toBe("Bridge Of Light");
    // Should NOT pick "Something Else" by "Other Artist"
  });

  it("should use free-text scoring when title equals artist", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(MOCK_SEARCH_RESPONSE));

    const result = await qobuzAdapter.searchTrack({ title: "P!nk Bridge Of Light", artist: "P!nk Bridge Of Light" });

    expect(result.found).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it("should convert duration from seconds to milliseconds", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        tracks: {
          items: [{ id: 1, title: "Test", duration: 180, performer: { name: "Artist" }, album: {} }],
        },
      }),
    );

    const result = await qobuzAdapter.searchTrack({ title: "Test", artist: "Artist" });

    if (result.found && result.track) {
      expect(result.track.durationMs).toBe(180000);
    }
  });
});
