import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetTokenCache, kkboxAdapter } from "../services/adapters/kkbox";

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
// isAvailable
// =============================================================================

describe("KKBOX: isAvailable", () => {
  it("should return true with credentials", () => {
    expect(kkboxAdapter.isAvailable()).toBe(true);
  });

  it("should return false without credentials", () => {
    delete import.meta.env.KKBOX_CLIENT_ID;
    delete import.meta.env.KKBOX_CLIENT_SECRET;
    expect(kkboxAdapter.isAvailable()).toBe(false);
  });

  it("should return false with only client ID", () => {
    delete import.meta.env.KKBOX_CLIENT_SECRET;
    expect(kkboxAdapter.isAvailable()).toBe(false);
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

    await expect(kkboxAdapter.getTrack("invalid")).rejects.toThrow("KKBOX getTrack failed: 404");
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
  it("should find track by ISRC", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }));

    const track = await kkboxAdapter.findByIsrc("NOA840500101");

    expect(track).not.toBeNull();
    expect(track!.title).toBe("Take on Me");
    expect(track!.isrc).toBe("NOA840500101");
    expect(track!.sourceService).toBe("kkbox");
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

  it("should return null on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response("Server Error", { status: 500 }));

    const track = await kkboxAdapter.findByIsrc("NOA840500101");
    expect(track).toBeNull();
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

  it("should return not found on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response("Error", { status: 500 }));

    const result = await kkboxAdapter.searchTrack({
      title: "Test",
      artist: "Test",
    });

    expect(result.found).toBe(false);
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
