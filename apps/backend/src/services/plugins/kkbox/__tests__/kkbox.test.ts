import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetTokenCache, kkboxAdapter } from "../adapter";

// =============================================================================
// Mock data
// =============================================================================

const MOCK_KKBOX_TRACK = {
  id: "9YlkyzQutUrZ0vUJG9",
  name: "Take on Me",
  duration: 225000,
  isrc: "NOA840500101",
  url: "https://www.kkbox.com/tw/en/song/9YlkyzQutUrZ0vUJG9",
  track_number: 1,
  explicitness: false,
  available_territories: ["TW", "HK", "JP", "SG"],
  album: {
    id: "album-123",
    name: "Hunting High and Low",
    url: "https://www.kkbox.com/tw/en/album/album-123",
    images: [
      { url: "https://i.kfs.io/album/tw/123,0v3/fit/160x160.jpg", width: 160, height: 160 },
      { url: "https://i.kfs.io/album/tw/123,0v3/fit/500x500.jpg", width: 500, height: 500 },
      { url: "https://i.kfs.io/album/tw/123,0v3/fit/300x300.jpg", width: 300, height: 300 },
    ],
  },
  artist: {
    id: "artist-456",
    name: "a-ha",
    url: "https://www.kkbox.com/tw/en/artist/artist-456",
  },
};

const MOCK_SEARCH_RESPONSE = {
  tracks: {
    data: [MOCK_KKBOX_TRACK],
    paging: { offset: 0, limit: 5 },
  },
};

const MOCK_TOKEN_RESPONSE = {
  access_token: "mock-token-123",
  expires_in: 3600,
  token_type: "bearer",
};

const MOCK_KKBOX_ALBUM = {
  id: "album-123",
  name: "Hunting High and Low",
  url: "https://www.kkbox.com/tw/en/album/album-123",
  release_date: "1985-06-01",
  images: [{ url: "https://i.kfs.io/album/tw/123,0v3/fit/500x500.jpg", width: 500, height: 500 }],
  artist: { id: "artist-456", name: "a-ha" },
  total_tracks: 10,
};

const MOCK_KKBOX_ARTIST = {
  id: "artist-456",
  name: "a-ha",
  url: "https://www.kkbox.com/tw/en/artist/artist-456",
  images: [{ url: "https://i.kfs.io/artist/456/fit/300x300.jpg", width: 300, height: 300 }],
};

/**
 * Answers the next fetches as KKBOX would: the OAuth token request first, then
 * the given API responses in order.
 */
function mockKkboxFetch(...apiResponses: Response[]): void {
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }));
  for (const response of apiResponses) fetchSpy.mockResolvedValueOnce(response);
}

// =============================================================================
// Setup: mock credentials + reset token cache
// =============================================================================

beforeEach(() => {
  vi.restoreAllMocks();
  _resetTokenCache();
  import.meta.env.KKBOX_CLIENT_ID = "test-client-id";
  import.meta.env.KKBOX_CLIENT_SECRET = "test-client-secret";
});

afterEach(() => {
  delete import.meta.env.KKBOX_CLIENT_ID;
  delete import.meta.env.KKBOX_CLIENT_SECRET;
  delete import.meta.env.KKBOX_TERRITORY;
});

// =============================================================================
// detectUrl
// =============================================================================

describe("KKBOX: detectUrl", () => {
  it("should extract track ID from standard URL", () => {
    expect(kkboxAdapter.detectUrl("https://www.kkbox.com/tw/en/song/9YlkyzQutUrZ0vUJG9")).toBe("9YlkyzQutUrZ0vUJG9");
  });

  it("should extract track ID without www", () => {
    expect(kkboxAdapter.detectUrl("https://kkbox.com/hk/en/song/GqunaYAvHxj7OIbG8G")).toBe("GqunaYAvHxj7OIbG8G");
  });

  it("should extract track ID from Japanese locale", () => {
    expect(kkboxAdapter.detectUrl("https://www.kkbox.com/jp/ja/song/9YlkyzQutUrZ0vUJG9")).toBe("9YlkyzQutUrZ0vUJG9");
  });

  it("should extract track ID with HTTP", () => {
    expect(kkboxAdapter.detectUrl("http://www.kkbox.com/tw/tc/song/ABC123_-x")).toBe("ABC123_-x");
  });

  it("should return null for album URL", () => {
    expect(kkboxAdapter.detectUrl("https://www.kkbox.com/tw/en/album/abc123")).toBeNull();
  });

  it("should return null for artist URL", () => {
    expect(kkboxAdapter.detectUrl("https://www.kkbox.com/tw/en/artist/abc123")).toBeNull();
  });

  it("should return null for non-KKBOX URL", () => {
    expect(kkboxAdapter.detectUrl("https://open.spotify.com/track/abc123")).toBeNull();
  });
});

// =============================================================================
// getTrack
// =============================================================================

describe("KKBOX: getTrack", () => {
  it("should fetch and map track data correctly", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_KKBOX_TRACK), { status: 200 }));

    const track = await kkboxAdapter.getTrack("9YlkyzQutUrZ0vUJG9");

    expect(track.sourceService).toBe("kkbox");
    expect(track.sourceId).toBe("9YlkyzQutUrZ0vUJG9");
    expect(track.title).toBe("Take on Me");
    expect(track.artists).toEqual(["a-ha"]);
    expect(track.albumName).toBe("Hunting High and Low");
    expect(track.durationMs).toBe(225000);
    expect(track.isrc).toBe("NOA840500101");
    expect(track.isExplicit).toBe(false);
    expect(track.webUrl).toBe("https://www.kkbox.com/tw/en/song/9YlkyzQutUrZ0vUJG9");
  });

  it("should pick largest artwork image", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_KKBOX_TRACK), { status: 200 }));

    const track = await kkboxAdapter.getTrack("9YlkyzQutUrZ0vUJG9");
    expect(track.artworkUrl).toBe("https://i.kfs.io/album/tw/123,0v3/fit/500x500.jpg");
  });

  it("should throw on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    await expect(kkboxAdapter.getTrack("invalid")).rejects.toThrow("KKBOX track fetch failed: 404");
  });

  it("should throw on auth failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

    await expect(kkboxAdapter.getTrack("test")).rejects.toThrow("KKBOX token request failed: 401");
  });

  it("should handle missing credentials", async () => {
    delete import.meta.env.KKBOX_CLIENT_ID;
    delete import.meta.env.KKBOX_CLIENT_SECRET;

    await expect(kkboxAdapter.getTrack("test")).rejects.toThrow("KKBOX_CLIENT_ID and KKBOX_CLIENT_SECRET must be set");
  });
});

// =============================================================================
// findByIsrc
// =============================================================================

describe("KKBOX: findByIsrc", () => {
  it("searches the ISRC field through the isrc: prefix", async () => {
    mockKkboxFetch(Response.json({ tracks: { data: [MOCK_KKBOX_TRACK] } }));

    await expect(kkboxAdapter.findByIsrc("NOA840500101")).resolves.toMatchObject({ isrc: "NOA840500101" });
    const searchUrl = String(vi.mocked(globalThis.fetch).mock.calls[1][0]);
    expect(new URL(searchUrl).searchParams.get("q")).toBe("isrc:NOA840500101");
  });

  it("should find track by ISRC", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }));

    const track = await kkboxAdapter.findByIsrc("NOA840500101");

    expect(track).not.toBeNull();
    expect(track?.title).toBe("Take on Me");
    expect(track?.isrc).toBe("NOA840500101");
    expect(track?.sourceService).toBe("kkbox");
  });

  it("should return null when ISRC is not found", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tracks: { data: [] } }), { status: 200 }));

    const track = await kkboxAdapter.findByIsrc("INVALID000000");
    expect(track).toBeNull();
  });

  it("should return null when ISRC not in results", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }));

    const track = await kkboxAdapter.findByIsrc("DIFFERENT00001");
    expect(track).toBeNull();
  });

  /**
   * An error status is an outage. Answering null would make the resolver
   * record a miss and skip KKBOX for that track for a month.
   */
  it("should throw on HTTP error", async () => {
    mockKkboxFetch(new Response("Server Error", { status: 500 }));

    await expect(kkboxAdapter.findByIsrc("NOA840500101")).rejects.toThrow(/500/);
  });

  it("should throw when KKBOX rate-limits the lookup", async () => {
    mockKkboxFetch(new Response("Too Many Requests", { status: 429 }));

    await expect(kkboxAdapter.findByIsrc("NOA840500101")).rejects.toThrow(/429/);
  });

  it("should throw when the request fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }))
      .mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(kkboxAdapter.findByIsrc("NOA840500101")).rejects.toThrow();
  });

  it("should throw when the body is not JSON", async () => {
    mockKkboxFetch(new Response("<html>maintenance</html>", { status: 200 }));

    await expect(kkboxAdapter.findByIsrc("NOA840500101")).rejects.toThrow(/not JSON/);
  });

  it("should throw when the body carries an error instead of the tracks list", async () => {
    mockKkboxFetch(Response.json({ error: { message: "Invalid Authentication", code: 0 } }));

    await expect(kkboxAdapter.findByIsrc("NOA840500101")).rejects.toThrow(/without the tracks list/);
  });
});

// =============================================================================
// searchTrack
// =============================================================================

describe("KKBOX: searchTrack", () => {
  it("should find track with structured query", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }));

    const result = await kkboxAdapter.searchTrack({
      title: "Take on Me",
      artist: "a-ha",
    });

    expect(result.found).toBe(true);
    expect(result.track).toBeDefined();
    expect(result.track?.title).toBe("Take on Me");
    expect(result.matchMethod).toBe("search");
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it("should return not found for empty results", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tracks: { data: [] } }), { status: 200 }));

    const result = await kkboxAdapter.searchTrack({
      title: "Nonexistent Song",
      artist: "Nobody",
    });

    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("should throw on HTTP error", async () => {
    mockKkboxFetch(new Response("Error", { status: 500 }));

    await expect(kkboxAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(/500/);
  });

  it("should throw when the body is not JSON", async () => {
    mockKkboxFetch(new Response("<html>maintenance</html>", { status: 200 }));

    await expect(kkboxAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(/not JSON/);
  });

  it("should throw when the body has no tracks list", async () => {
    mockKkboxFetch(Response.json({}));

    await expect(kkboxAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(
      /without the tracks list/,
    );
  });

  it("should use free-text scoring when title equals artist", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }));

    const result = await kkboxAdapter.searchTrack({
      title: "a-ha Take on Me",
      artist: "a-ha Take on Me",
    });

    expect(result.found).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it("should pick best match from multiple results", async () => {
    const otherTrack = {
      ...MOCK_KKBOX_TRACK,
      id: "other-id",
      name: "Take Me Away",
      artist: { id: "other", name: "Other Artist", url: "" },
      isrc: "OTHER0000001",
    };

    const multiResponse = {
      tracks: {
        data: [MOCK_KKBOX_TRACK, otherTrack],
        paging: { offset: 0, limit: 5 },
      },
    };

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(multiResponse), { status: 200 }));

    const result = await kkboxAdapter.searchTrack({
      title: "Take on Me",
      artist: "a-ha",
    });

    expect(result.found).toBe(true);
    expect(result.track?.title).toBe("Take on Me");
    expect(result.track?.artists).toEqual(["a-ha"]);
  });
});

// =============================================================================
// getAlbum / searchAlbum
// =============================================================================

describe("KKBOX: getAlbum", () => {
  it("should report a missing album as not found", async () => {
    mockKkboxFetch(Response.json({ error: { message: "Album does not exist", code: 2 } }, { status: 404 }));

    await expect(kkboxAdapter.getAlbum("missing")).rejects.toThrow(/Album not found: missing/);
  });

  it("should throw the HTTP status of a failed album fetch instead of reporting it as not found", async () => {
    mockKkboxFetch(new Response("Server Error", { status: 500 }));

    await expect(kkboxAdapter.getAlbum("album-123")).rejects.toThrow(/500/);
  });
});

describe("KKBOX: searchAlbum", () => {
  const query = { title: "Hunting High and Low", artist: "a-ha" };

  it("should find the album and attach its track listing", async () => {
    mockKkboxFetch(
      Response.json({ albums: { data: [MOCK_KKBOX_ALBUM] } }),
      Response.json(MOCK_KKBOX_ALBUM),
      Response.json({ data: [{ id: "t1", name: "Take on Me", duration: 225000, isrc: "NOA840500101", url: "" }] }),
    );

    const result = await kkboxAdapter.searchAlbum(query);

    expect(result.found).toBe(true);
    expect(result.album?.title).toBe("Hunting High and Low");
    expect(result.album?.tracks?.[0].isrc).toBe("NOA840500101");
  });

  it("should return not found for empty results", async () => {
    mockKkboxFetch(Response.json({ albums: { data: [] } }));

    const result = await kkboxAdapter.searchAlbum(query);

    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("should throw on HTTP error", async () => {
    mockKkboxFetch(new Response("Unavailable", { status: 503 }));

    await expect(kkboxAdapter.searchAlbum(query)).rejects.toThrow(/503/);
  });

  it("should throw when the request fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }))
      .mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(kkboxAdapter.searchAlbum(query)).rejects.toThrow();
  });

  it("should keep the search result when fetching the full album fails", async () => {
    mockKkboxFetch(
      Response.json({ albums: { data: [MOCK_KKBOX_ALBUM] } }),
      new Response("Server Error", { status: 500 }),
    );

    const result = await kkboxAdapter.searchAlbum(query);

    expect(result.found).toBe(true);
    expect(result.album?.sourceId).toBe("album-123");
  });
});

// =============================================================================
// searchArtist
// =============================================================================

describe("KKBOX: searchArtist", () => {
  it("should find the artist", async () => {
    mockKkboxFetch(Response.json({ artists: { data: [MOCK_KKBOX_ARTIST] } }));

    const result = await kkboxAdapter.searchArtist({ name: "a-ha" });

    expect(result.found).toBe(true);
    expect(result.artist?.sourceId).toBe("artist-456");
  });

  it("should return not found for empty results", async () => {
    mockKkboxFetch(Response.json({ artists: { data: [] } }));

    const result = await kkboxAdapter.searchArtist({ name: "Nobody" });

    expect(result.found).toBe(false);
  });

  it("should throw on HTTP error", async () => {
    mockKkboxFetch(new Response("Error", { status: 500 }));

    await expect(kkboxAdapter.searchArtist({ name: "a-ha" })).rejects.toThrow(/500/);
  });
});

// =============================================================================
// Token management
// =============================================================================

describe("KKBOX: token management", () => {
  it("should reuse cached token for subsequent requests", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_KKBOX_TRACK), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_KKBOX_TRACK), { status: 200 }));

    await kkboxAdapter.getTrack("9YlkyzQutUrZ0vUJG9");
    await kkboxAdapter.getTrack("9YlkyzQutUrZ0vUJG9");

    // Token should be fetched only once (1 token + 2 API calls = 3 total)
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

// =============================================================================
// Metadata
// =============================================================================

describe("KKBOX: adapter metadata", () => {
  it("should have correct id", () => {
    expect(kkboxAdapter.id).toBe("kkbox");
  });

  it("should have correct displayName", () => {
    expect(kkboxAdapter.displayName).toBe("KKBOX");
  });

  it("should support ISRC", () => {
    expect(kkboxAdapter.capabilities.supportsIsrc).toBe(true);
  });
});
