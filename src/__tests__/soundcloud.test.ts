import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetClientIdCache, soundcloudAdapter } from "../services/adapters/soundcloud";

// =============================================================================
// Mock data
// =============================================================================

/** Mock SoundCloud internal API response for a single track */
const MOCK_SC_TRACK = {
  title: "Shake It Off",
  user: { username: "Taylor Swift", full_name: "Taylor Swift" },
  artwork_url: "https://i1.sndcdn.com/artworks-000-large.jpg",
  full_duration: 231863,
  duration: 30000,
  release_date: "2014-10-27T00:00:00Z",
  created_at: "2014-10-27T00:00:00Z",
  permalink_url: "https://soundcloud.com/taylorswift/shake-it-off",
  publisher_metadata: {
    isrc: "USCJY1431309",
    explicit: false,
  },
};

/** Mock search API response */
const MOCK_SEARCH_RESPONSE = {
  collection: [MOCK_SC_TRACK],
};

/** Mock SoundCloud homepage with hydration data (for client_id extraction) */
const MOCK_SC_HOMEPAGE = `
<html><body>
<script>window.__sc_hydration = [{"hydratable":"apiClient","data":{"id":"TestClientId123","isExpiring":false}}];</script>
</body></html>`;

/** Mock track page with hydration data (for HTML scraping fallback) */
const MOCK_HYDRATION_HTML = `
<html>
<head>
  <meta property="og:title" content="Shake It Off by Taylor Swift" />
</head>
<body>
<script>window.__sc_hydration = [{"hydratable":"sound","data":${JSON.stringify(MOCK_SC_TRACK)}}];</script>
</body>
</html>`;

/** Mock track page with only OG tags (no hydration data) */
const MOCK_OG_ONLY_HTML = `
<html>
<head>
  <meta property="og:title" content="Shake It Off" />
  <meta property="og:image" content="https://i1.sndcdn.com/artworks-og.jpg" />
  <meta property="og:url" content="https://soundcloud.com/taylorswift/shake-it-off" />
  <meta name="twitter:audio:artist_name" content="Taylor Swift" />
  <meta name="twitter:audio:duration" content="231863" />
</head>
<body></body>
</html>`;

const MOCK_EMPTY_HTML = `<html><head></head><body></body></html>`;

// =============================================================================
// Helper: mock fetch to handle client_id + API calls
// =============================================================================

/**
 * Sets up fetch mocks for API-based tests.
 * First call: SoundCloud homepage (client_id extraction)
 * Second call: the actual API call
 */
function mockApiCall(apiResponse: Response) {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  // First call: homepage for client_id
  fetchSpy.mockResolvedValueOnce(new Response(MOCK_SC_HOMEPAGE, { status: 200 }));
  // Second call: actual API endpoint
  fetchSpy.mockResolvedValueOnce(apiResponse);
  return fetchSpy;
}

// =============================================================================
// detectUrl
// =============================================================================

describe("SoundCloud: detectUrl", () => {
  it("should extract path from standard URL", () => {
    expect(soundcloudAdapter.detectUrl("https://soundcloud.com/taylorswift/shake-it-off")).toBe(
      "taylorswift/shake-it-off",
    );
  });

  it("should extract path from URL with www", () => {
    expect(soundcloudAdapter.detectUrl("https://www.soundcloud.com/taylorswift/shake-it-off")).toBe(
      "taylorswift/shake-it-off",
    );
  });

  it("should extract path from mobile URL", () => {
    expect(soundcloudAdapter.detectUrl("https://m.soundcloud.com/taylorswift/shake-it-off")).toBe(
      "taylorswift/shake-it-off",
    );
  });

  it("should strip query parameters", () => {
    expect(
      soundcloudAdapter.detectUrl("https://soundcloud.com/taylorswift/shake-it-off?si=abc123&utm_source=test"),
    ).toBe("taylorswift/shake-it-off");
  });

  it("should return null for playlist/set URL", () => {
    expect(soundcloudAdapter.detectUrl("https://soundcloud.com/taylorswift/sets/1989")).toBeNull();
  });

  it("should return null for user profile URL", () => {
    expect(soundcloudAdapter.detectUrl("https://soundcloud.com/taylorswift")).toBeNull();
  });

  it("should return null for non-SoundCloud URL", () => {
    expect(soundcloudAdapter.detectUrl("https://open.spotify.com/track/abc123")).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(soundcloudAdapter.detectUrl("")).toBeNull();
  });

  it("should handle HTTP URLs", () => {
    expect(soundcloudAdapter.detectUrl("http://soundcloud.com/taylorswift/shake-it-off")).toBe(
      "taylorswift/shake-it-off",
    );
  });
});

// =============================================================================
// isAvailable
// =============================================================================

describe("SoundCloud: isAvailable", () => {
  it("should always return true (no credentials needed)", () => {
    expect(soundcloudAdapter.isAvailable()).toBe(true);
  });
});

// =============================================================================
// capabilities
// =============================================================================

describe("SoundCloud: capabilities", () => {
  it("should not support ISRC lookup", () => {
    expect(soundcloudAdapter.capabilities.supportsIsrc).toBe(false);
  });

  it("should not support preview URLs", () => {
    expect(soundcloudAdapter.capabilities.supportsPreview).toBe(false);
  });

  it("should support artwork", () => {
    expect(soundcloudAdapter.capabilities.supportsArtwork).toBe(true);
  });
});

// =============================================================================
// getTrack - API path
// =============================================================================

describe("SoundCloud: getTrack (API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetClientIdCache();
  });

  it("should resolve track via internal API", async () => {
    mockApiCall(new Response(JSON.stringify(MOCK_SC_TRACK), { status: 200 }));

    const track = await soundcloudAdapter.getTrack("taylorswift/shake-it-off");

    expect(track.sourceService).toBe("soundcloud");
    expect(track.sourceId).toBe("taylorswift/shake-it-off");
    expect(track.title).toBe("Shake It Off");
    expect(track.artists).toEqual(["Taylor Swift"]);
    expect(track.isrc).toBe("USCJY1431309");
    expect(track.durationMs).toBe(231863);
    expect(track.isExplicit).toBe(false);
    expect(track.artworkUrl).toBe("https://i1.sndcdn.com/artworks-000-t500x500.jpg");
    expect(track.webUrl).toBe("https://soundcloud.com/taylorswift/shake-it-off");
  });

  it("should use full_duration over duration", async () => {
    mockApiCall(new Response(JSON.stringify(MOCK_SC_TRACK), { status: 200 }));

    const track = await soundcloudAdapter.getTrack("taylorswift/shake-it-off");
    expect(track.durationMs).toBe(231863);
  });

  it("should replace -large with -t500x500 in artwork", async () => {
    mockApiCall(new Response(JSON.stringify(MOCK_SC_TRACK), { status: 200 }));

    const track = await soundcloudAdapter.getTrack("taylorswift/shake-it-off");
    expect(track.artworkUrl).toContain("t500x500");
    expect(track.artworkUrl).not.toContain("-large");
  });
});

// =============================================================================
// getTrack - HTML fallback
// =============================================================================

describe("SoundCloud: getTrack (HTML fallback)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetClientIdCache();
  });

  it("should fall back to HTML scraping when API fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    // client_id fetch
    fetchSpy.mockResolvedValueOnce(new Response(MOCK_SC_HOMEPAGE, { status: 200 }));
    // API resolve fails
    fetchSpy.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
    // HTML scrape
    fetchSpy.mockResolvedValueOnce(new Response(MOCK_HYDRATION_HTML, { status: 200 }));

    const track = await soundcloudAdapter.getTrack("taylorswift/shake-it-off");
    expect(track.title).toBe("Shake It Off");
    expect(track.isrc).toBe("USCJY1431309");
  });

  it("should fall back to OG tags when no JSON is found", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    // client_id fetch
    fetchSpy.mockResolvedValueOnce(new Response(MOCK_SC_HOMEPAGE, { status: 200 }));
    // API resolve fails
    fetchSpy.mockResolvedValueOnce(new Response("Error", { status: 500 }));
    // HTML scrape (OG only)
    fetchSpy.mockResolvedValueOnce(new Response(MOCK_OG_ONLY_HTML, { status: 200 }));

    const track = await soundcloudAdapter.getTrack("taylorswift/shake-it-off");
    expect(track.title).toBe("Shake It Off");
    expect(track.artists).toEqual(["Taylor Swift"]);
    expect(track.durationMs).toBe(231863);
  });

  it("should throw when page returns no usable data", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response(MOCK_SC_HOMEPAGE, { status: 200 }));
    fetchSpy.mockResolvedValueOnce(new Response("Error", { status: 500 }));
    fetchSpy.mockResolvedValueOnce(new Response(MOCK_EMPTY_HTML, { status: 200 }));

    await expect(soundcloudAdapter.getTrack("broken/page")).rejects.toThrow("Could not extract track title");
  });

  it("should throw when page fetch fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response(MOCK_SC_HOMEPAGE, { status: 200 }));
    fetchSpy.mockResolvedValueOnce(new Response("Error", { status: 500 }));
    fetchSpy.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    await expect(soundcloudAdapter.getTrack("nonexistent/track")).rejects.toThrow("page fetch failed: 404");
  });
});

// =============================================================================
// searchTrack
// =============================================================================

describe("SoundCloud: searchTrack", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetClientIdCache();
  });

  it("should find track with structured query", async () => {
    mockApiCall(new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }));

    const result = await soundcloudAdapter.searchTrack({
      title: "Shake It Off",
      artist: "Taylor Swift",
    });

    expect(result.found).toBe(true);
    expect(result.track).toBeDefined();
    expect(result.track!.title).toBe("Shake It Off");
    expect(result.matchMethod).toBe("search");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("should return not found for empty results", async () => {
    mockApiCall(new Response(JSON.stringify({ collection: [] }), { status: 200 }));

    const result = await soundcloudAdapter.searchTrack({
      title: "Nonexistent Song",
      artist: "Nobody",
    });

    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("should return not found on API error", async () => {
    mockApiCall(new Response("Error", { status: 500 }));

    const result = await soundcloudAdapter.searchTrack({
      title: "Test",
      artist: "Test",
    });

    expect(result.found).toBe(false);
  });

  it("should pick best match from multiple results", async () => {
    const multiResults = {
      collection: [
        MOCK_SC_TRACK,
        {
          ...MOCK_SC_TRACK,
          title: "Something Else",
          user: { username: "Other" },
          permalink_url: "https://soundcloud.com/other/something",
        },
      ],
    };
    mockApiCall(new Response(JSON.stringify(multiResults), { status: 200 }));

    const result = await soundcloudAdapter.searchTrack({
      title: "Shake It Off",
      artist: "Taylor Swift",
    });

    expect(result.found).toBe(true);
    expect(result.track!.title).toBe("Shake It Off");
  });

  it("should use free-text scoring when title equals artist", async () => {
    mockApiCall(new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }));

    const result = await soundcloudAdapter.searchTrack({
      title: "Taylor Swift Shake It Off",
      artist: "Taylor Swift Shake It Off",
    });

    expect(result.found).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it("should gracefully handle missing client_id", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 500 }));

    const result = await soundcloudAdapter.searchTrack({
      title: "Test",
      artist: "Test",
    });

    expect(result.found).toBe(false);
  });
});

// =============================================================================
// findByIsrc (stub)
// =============================================================================

describe("SoundCloud: findByIsrc", () => {
  it("should always return null (no ISRC lookup)", async () => {
    const result = await soundcloudAdapter.findByIsrc("USCJY1431309");
    expect(result).toBeNull();
  });
});

// =============================================================================
// adapter metadata
// =============================================================================

describe("SoundCloud: adapter metadata", () => {
  it("should have correct id", () => {
    expect(soundcloudAdapter.id).toBe("soundcloud");
  });

  it("should have correct displayName", () => {
    expect(soundcloudAdapter.displayName).toBe("SoundCloud");
  });
});
