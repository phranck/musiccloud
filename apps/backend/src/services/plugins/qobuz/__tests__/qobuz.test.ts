import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpstreamUnavailableError } from "../../../../lib/infra/upstream-unavailable";
import { _resetAppIdCache, _resetAuthTokenCache, _setAppIdForTest, qobuzAdapter } from "../adapter";

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

/** An answer whose body is not JSON, such as an HTML error page behind a 200. */
function mockUnreadableResponse(status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new SyntaxError("Unexpected token < in JSON at position 0")),
    text: () => Promise.resolve("<html>Bad gateway</html>"),
    headers: new Headers(),
  } as unknown as Response;
}

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  fetchMock.mockReset();
  _resetAppIdCache();
  _setAppIdForTest("123456789");
  _resetAuthTokenCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
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

  it("should throw when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(mockUnreadableResponse());

    await expect(qobuzAdapter.getTrack("59954869")).rejects.toBeInstanceOf(UpstreamUnavailableError);
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
  it("should find the track whose ISRC matches", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(MOCK_SEARCH_RESPONSE));

    const track = await qobuzAdapter.findByIsrc("USNLR1100709");

    expect(track?.sourceId).toBe("59954869");
    expect(track?.title).toBe("Bridge Of Light");
  });

  it("should return null when the answer holds no track with that ISRC", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(MOCK_SEARCH_RESPONSE));

    await expect(qobuzAdapter.findByIsrc("GBXXX0000000")).resolves.toBeNull();
  });

  it("should return null when Qobuz answers with an empty list", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ tracks: { items: [], total: 0 } }));

    await expect(qobuzAdapter.findByIsrc("GBXXX0000000")).resolves.toBeNull();
  });

  /**
   * A returned null is stored as a miss, and the resolver then skips Qobuz for
   * that track for a month. A lookup that failed must throw so that is not
   * recorded as a fact about the track.
   */
  it("should throw on an error status instead of answering not found", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({}, 500));

    await expect(qobuzAdapter.findByIsrc("USNLR1100709")).rejects.toThrow(/isrc-lookup failed: 500/);
  });

  it("should throw when Qobuz refuses the request as unauthorized", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: "error", code: 401 }, 401));

    await expect(qobuzAdapter.findByIsrc("USNLR1100709")).rejects.toThrow(/isrc-lookup failed: 401/);
  });

  it("should throw when Qobuz rate-limits the request", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({}, 429));

    await expect(qobuzAdapter.findByIsrc("USNLR1100709")).rejects.toThrow(/rate-limited/);
  });

  it("should throw when the request fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

    await expect(qobuzAdapter.findByIsrc("USNLR1100709")).rejects.toThrow();
  });

  it("should throw when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(mockUnreadableResponse());

    await expect(qobuzAdapter.findByIsrc("USNLR1100709")).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it("should throw when the answer has no track list", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: "error", message: "Service unavailable" }));

    await expect(qobuzAdapter.findByIsrc("USNLR1100709")).rejects.toBeInstanceOf(UpstreamUnavailableError);
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

  it("should throw on an error status instead of answering not found", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({}, 500));

    await expect(qobuzAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(/search failed: 500/);
  });

  it("should throw when Qobuz rate-limits the search", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({}, 429));

    await expect(qobuzAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(/rate-limited/);
  });

  it("should throw when the search request fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

    await expect(qobuzAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow();
  });

  it("should throw when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(mockUnreadableResponse());

    await expect(qobuzAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });

  it("should throw when the answer has no track list", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({}));

    await expect(qobuzAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
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

describe("Qobuz: findAlbumByUpc", () => {
  it("should find the album for a UPC", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ id: "0060253780968", title: "Happy Feet Two", upc: "0060253780968" }),
    );

    const album = await qobuzAdapter.findAlbumByUpc("0060253780968");

    expect(album?.title).toBe("Happy Feet Two");
    expect(album?.sourceId).toBe("0060253780968");
  });

  it("should return null when Qobuz answers 404 for the UPC", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: "error", code: 404, message: "No result matching given argument" }, 404),
    );

    await expect(qobuzAdapter.findAlbumByUpc("0000000000000")).resolves.toBeNull();
  });

  it("should throw on any other error status", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({}, 503));

    await expect(qobuzAdapter.findAlbumByUpc("0060253780968")).rejects.toThrow(/upc-lookup failed: 503/);
  });

  it("should throw when Qobuz rate-limits the lookup", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({}, 429));

    await expect(qobuzAdapter.findAlbumByUpc("0060253780968")).rejects.toThrow(/rate-limited/);
  });

  it("should throw when the lookup request fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

    await expect(qobuzAdapter.findAlbumByUpc("0060253780968")).rejects.toThrow();
  });

  it("should throw when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(mockUnreadableResponse());

    await expect(qobuzAdapter.findAlbumByUpc("0060253780968")).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it("should throw when the answer is not an album", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: "error", message: "Service unavailable" }));

    await expect(qobuzAdapter.findAlbumByUpc("0060253780968")).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});

describe("Qobuz: searchAlbum", () => {
  const query = { title: "Happy Feet Two", artist: "Various Artists" };

  it("should find an album", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        albums: { items: [{ id: "abc123", title: "Happy Feet Two", artist: { name: "Various Artists" } }], total: 1 },
      }),
    );

    const result = await qobuzAdapter.searchAlbum(query);

    expect(result.found).toBe(true);
    expect(result.album?.sourceId).toBe("abc123");
  });

  it("should return not found for empty results", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ albums: { items: [], total: 0 } }));

    const result = await qobuzAdapter.searchAlbum(query);

    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("should throw on an error status instead of answering not found", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({}, 500));

    await expect(qobuzAdapter.searchAlbum(query)).rejects.toThrow(/album search failed: 500/);
  });

  it("should throw when the search request fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

    await expect(qobuzAdapter.searchAlbum(query)).rejects.toThrow();
  });

  it("should throw when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(mockUnreadableResponse());

    await expect(qobuzAdapter.searchAlbum(query)).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it("should throw when the answer has no album list", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({}));

    await expect(qobuzAdapter.searchAlbum(query)).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});

describe("Qobuz: searchArtist", () => {
  it("should find an artist", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ artists: { items: [{ id: 118671, name: "P!nk" }], total: 1 } }));

    const result = await qobuzAdapter.searchArtist({ name: "P!nk" });

    expect(result.found).toBe(true);
    expect(result.artist?.sourceId).toBe("118671");
  });

  it("should return not found for empty results", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ artists: { items: [], total: 0 } }));

    const result = await qobuzAdapter.searchArtist({ name: "Nobody" });

    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("should throw on an error status instead of answering not found", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({}, 500));

    await expect(qobuzAdapter.searchArtist({ name: "P!nk" })).rejects.toThrow(/artist search failed: 500/);
  });

  it("should throw when the search request fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

    await expect(qobuzAdapter.searchArtist({ name: "P!nk" })).rejects.toThrow();
  });

  it("should throw when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(mockUnreadableResponse());

    await expect(qobuzAdapter.searchArtist({ name: "P!nk" })).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it("should throw when the answer has no artist list", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({}));

    await expect(qobuzAdapter.searchArtist({ name: "P!nk" })).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});

describe("Qobuz: login", () => {
  beforeEach(() => {
    vi.stubEnv("QOBUZ_EMAIL", "qobuz-test@example.invalid");
    vi.stubEnv("QOBUZ_PASSWORD", "not-a-real-password");
  });

  it("should send the user token with the request once logged in", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse({ user_auth_token: "test-user-token" }))
      .mockResolvedValueOnce(mockResponse({ tracks: { items: [], total: 0 } }));

    await qobuzAdapter.searchTrack({ title: "Test", artist: "Test" });

    const [, searchInit] = fetchMock.mock.calls[1];
    expect(searchInit.headers["X-User-Auth-Token"]).toBe("test-user-token");
  });

  /**
   * The catalog answers without a token, so a refused login costs the token
   * and nothing else. The request's own answer decides, and a request that
   * then fails throws on its own status.
   */
  it("goes on without a token when the login is refused", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse({ status: "error", code: 401 }, 401))
      .mockResolvedValueOnce(mockResponse({ tracks: { items: [], total: 0 } }));

    await expect(qobuzAdapter.searchTrack({ title: "Test", artist: "Test" })).resolves.toMatchObject({ found: false });
    const [, searchInit] = fetchMock.mock.calls[1];
    expect(searchInit.headers["X-User-Auth-Token"]).toBeUndefined();
  });

  it("goes on without a token when the login body is not JSON, and the request's failure still throws", async () => {
    fetchMock.mockResolvedValueOnce(mockUnreadableResponse()).mockResolvedValueOnce(mockResponse({}, 503));

    await expect(qobuzAdapter.findByIsrc("USNLR1100709")).rejects.toThrow(/503/);
  });
});
