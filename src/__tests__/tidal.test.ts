import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tidalAdapter, _resetTokenCache } from "../services/adapters/tidal";

// =============================================================================
// Mock data
// =============================================================================

const MOCK_TIDAL_TRACK_RESOURCE = {
  id: "77640617",
  attributes: {
    title: "Blinding Lights",
    isrc: "USUG11904190",
    duration: 200,
    explicit: false,
    imageLinks: [
      { href: "https://resources.tidal.com/images/640x640.jpg", meta: { width: 640, height: 640 } },
      { href: "https://resources.tidal.com/images/1280x1280.jpg", meta: { width: 1280, height: 1280 } },
      { href: "https://resources.tidal.com/images/320x320.jpg", meta: { width: 320, height: 320 } },
    ],
  },
  relationships: {
    artists: { data: [{ id: "7553669" }] },
    albums: { data: [{ id: "123456" }] },
  },
};

const MOCK_INCLUDED = [
  {
    id: "7553669",
    type: "artists",
    attributes: { name: "The Weeknd" },
  },
  {
    id: "123456",
    type: "albums",
    attributes: { title: "After Hours" },
  },
];

const MOCK_TRACK_RESPONSE = {
  data: MOCK_TIDAL_TRACK_RESOURCE,
  included: MOCK_INCLUDED,
};

const MOCK_SEARCH_RESPONSE = {
  data: [MOCK_TIDAL_TRACK_RESOURCE],
  included: MOCK_INCLUDED,
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
  import.meta.env.TIDAL_CLIENT_ID = "test-client-id";
  import.meta.env.TIDAL_CLIENT_SECRET = "test-client-secret";
});

afterEach(() => {
  delete import.meta.env.TIDAL_CLIENT_ID;
  delete import.meta.env.TIDAL_CLIENT_SECRET;
});

// =============================================================================
// detectUrl
// =============================================================================

describe("Tidal: detectUrl", () => {
  it("should extract track ID from browse URL", () => {
    expect(tidalAdapter.detectUrl("https://tidal.com/browse/track/77640617")).toBe("77640617");
  });

  it("should extract track ID from listen URL", () => {
    expect(tidalAdapter.detectUrl("https://listen.tidal.com/track/77640617")).toBe("77640617");
  });

  it("should extract track ID from simple URL", () => {
    expect(tidalAdapter.detectUrl("https://tidal.com/track/77640617")).toBe("77640617");
  });

  it("should return null for album URL", () => {
    expect(tidalAdapter.detectUrl("https://tidal.com/browse/album/123456")).toBeNull();
  });

  it("should return null for playlist URL", () => {
    expect(tidalAdapter.detectUrl("https://tidal.com/browse/playlist/abc")).toBeNull();
  });

  it("should return null for non-Tidal URL", () => {
    expect(tidalAdapter.detectUrl("https://open.spotify.com/track/abc123")).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(tidalAdapter.detectUrl("")).toBeNull();
  });
});

// =============================================================================
// isAvailable
// =============================================================================

describe("Tidal: isAvailable", () => {
  it("should return true with credentials", () => {
    expect(tidalAdapter.isAvailable()).toBe(true);
  });

  it("should return false without credentials", () => {
    delete import.meta.env.TIDAL_CLIENT_ID;
    delete import.meta.env.TIDAL_CLIENT_SECRET;
    expect(tidalAdapter.isAvailable()).toBe(false);
  });

  it("should return false with only client ID", () => {
    delete import.meta.env.TIDAL_CLIENT_SECRET;
    expect(tidalAdapter.isAvailable()).toBe(false);
  });
});

// =============================================================================
// capabilities
// =============================================================================

describe("Tidal: capabilities", () => {
  it("should support ISRC lookup", () => {
    expect(tidalAdapter.capabilities.supportsIsrc).toBe(true);
  });

  it("should not support preview URLs", () => {
    expect(tidalAdapter.capabilities.supportsPreview).toBe(false);
  });

  it("should support artwork", () => {
    expect(tidalAdapter.capabilities.supportsArtwork).toBe(true);
  });
});

// =============================================================================
// getTrack
// =============================================================================

describe("Tidal: getTrack", () => {
  it("should fetch and map track data correctly", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_TRACK_RESPONSE), { status: 200 }),
      );

    const track = await tidalAdapter.getTrack("77640617");

    expect(track.sourceService).toBe("tidal");
    expect(track.sourceId).toBe("77640617");
    expect(track.title).toBe("Blinding Lights");
    expect(track.artists).toEqual(["The Weeknd"]);
    expect(track.albumName).toBe("After Hours");
    expect(track.durationMs).toBe(200000);
    expect(track.isrc).toBe("USUG11904190");
    expect(track.isExplicit).toBe(false);
    expect(track.webUrl).toBe("https://tidal.com/browse/track/77640617");
  });

  it("should pick largest artwork image", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_TRACK_RESPONSE), { status: 200 }),
      );

    const track = await tidalAdapter.getTrack("77640617");
    expect(track.artworkUrl).toBe("https://resources.tidal.com/images/1280x1280.jpg");
  });

  it("should convert duration from seconds to milliseconds", async () => {
    const trackWith300s = {
      ...MOCK_TRACK_RESPONSE,
      data: {
        ...MOCK_TIDAL_TRACK_RESOURCE,
        attributes: { ...MOCK_TIDAL_TRACK_RESOURCE.attributes, duration: 300 },
      },
    };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(trackWith300s), { status: 200 }),
      );

    const track = await tidalAdapter.getTrack("77640617");
    expect(track.durationMs).toBe(300000);
  });

  it("should throw on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response("Not Found", { status: 404 }),
      );

    await expect(tidalAdapter.getTrack("999999")).rejects.toThrow("Tidal getTrack failed: 404");
  });

  it("should throw on auth failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );

    await expect(tidalAdapter.getTrack("77640617")).rejects.toThrow("Tidal token request failed: 401");
  });

  it("should handle missing credentials", async () => {
    delete import.meta.env.TIDAL_CLIENT_ID;
    delete import.meta.env.TIDAL_CLIENT_SECRET;

    await expect(tidalAdapter.getTrack("77640617")).rejects.toThrow(
      "TIDAL_CLIENT_ID and TIDAL_CLIENT_SECRET must be set",
    );
  });
});

// =============================================================================
// findByIsrc
// =============================================================================

describe("Tidal: findByIsrc", () => {
  it("should find track by ISRC", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }),
      );

    const track = await tidalAdapter.findByIsrc("USUG11904190");

    expect(track).not.toBeNull();
    expect(track!.title).toBe("Blinding Lights");
    expect(track!.isrc).toBe("USUG11904190");
    expect(track!.sourceService).toBe("tidal");
  });

  it("should return null when ISRC is not found", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );

    const track = await tidalAdapter.findByIsrc("INVALID000000");
    expect(track).toBeNull();
  });

  it("should return null on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response("Server Error", { status: 500 }),
      );

    const track = await tidalAdapter.findByIsrc("USUG11904190");
    expect(track).toBeNull();
  });
});

// =============================================================================
// searchTrack
// =============================================================================

describe("Tidal: searchTrack", () => {
  it("should find track with structured query", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }),
      );

    const result = await tidalAdapter.searchTrack({
      title: "Blinding Lights",
      artist: "The Weeknd",
    });

    expect(result.found).toBe(true);
    expect(result.track).toBeDefined();
    expect(result.matchMethod).toBe("search");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("should return not found for empty results", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );

    const result = await tidalAdapter.searchTrack({
      title: "Nonexistent Song",
      artist: "Nobody",
    });

    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("should return not found on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response("Error", { status: 500 }),
      );

    const result = await tidalAdapter.searchTrack({
      title: "Test",
      artist: "Test",
    });

    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });
});

// =============================================================================
// Token management
// =============================================================================

describe("Tidal: token management", () => {
  it("should reuse cached token for subsequent requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_TOKEN_RESPONSE), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_TRACK_RESPONSE), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_TRACK_RESPONSE), { status: 200 }),
      );

    await tidalAdapter.getTrack("77640617");
    await tidalAdapter.getTrack("77640617");

    // Token should be fetched only once (1 token + 2 API calls = 3 total)
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

// =============================================================================
// metadata
// =============================================================================

describe("Tidal: adapter metadata", () => {
  it("should have correct id", () => {
    expect(tidalAdapter.id).toBe("tidal");
  });

  it("should have correct displayName", () => {
    expect(tidalAdapter.displayName).toBe("Tidal");
  });
});
