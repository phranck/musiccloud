import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetCsrfTokenCache, _setCsrfTokenForTest, pandoraAdapter } from "../adapter";

// =============================================================================
// Mock data
// =============================================================================

/** Mock storeData with catalog annotations */
const MOCK_STORE_TRACK = {
  name: "Shake It Off (Taylor's Version)",
  artistName: "Taylor Swift",
  albumName: "1989 (Taylor's Version) (Deluxe)",
  duration: 219,
  durationMillis: 219200,
  trackNumber: 6,
  pandoraId: "TR:108141369",
  isrc: "USUG12306677",
  artistId: "AR:188587",
  albumId: "AL:28539904",
  icon: { artUrl: "images/dc/f3/85/29/923e4c5ea0f4de9da64084c7/_500W_500H.jpg" },
  shareableUrlPath: "/artist/taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6",
  explicitness: "NONE",
  type: "TR",
};

/** Mock JSON-LD structured data */
const MOCK_JSON_LD = {
  "@type": "MusicRecording",
  "@id": "TR:108141369",
  name: "Shake It Off (Taylor's Version)",
  byArtist: { "@type": "MusicGroup", name: "Taylor Swift", "@id": "AR:188587" },
  image: "https://content-images.p-cdn.com/images/dc/f3/85/29/923e4c5ea0f4de9da64084c7/_500W_500H.jpg",
  url: "https://www.pandora.com/artist/taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6",
};

/** Full mock HTML with both storeData and JSON-LD */
const MOCK_TRACK_HTML = `
<html>
<head>
<script type="application/ld+json">${JSON.stringify(MOCK_JSON_LD)}</script>
</head>
<body>
<script>
var storeData = {"v4/catalog/annotateObjects":[{"TR:108141369":${JSON.stringify(MOCK_STORE_TRACK)}}]};
</script>
</body>
</html>`;

/** Mock HTML with only JSON-LD (no storeData) */
const MOCK_JSONLD_ONLY_HTML = `
<html>
<head>
<script type="application/ld+json">${JSON.stringify(MOCK_JSON_LD)}</script>
</head>
<body></body>
</html>`;

/** Mock empty HTML */
const MOCK_EMPTY_HTML = `<html><head></head><body></body></html>`;

/** Mock search API response */
const MOCK_SEARCH_RESPONSE = {
  results: ["TR:108141369"],
  annotations: {
    "TR:108141369": MOCK_STORE_TRACK,
  },
};

// =============================================================================
// Helper: mock fetch for API-based tests
// =============================================================================

/**
 * Sets up fetch mock for search API tests.
 * CSRF token is injected directly (happy-dom doesn't support set-cookie headers).
 */
function mockApiCall(apiResponse: Response) {
  _setCsrfTokenForTest("TestCsrfToken123");
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  fetchSpy.mockResolvedValueOnce(apiResponse);
  return fetchSpy;
}

// =============================================================================
// detectUrl
// =============================================================================

describe("Pandora: detectUrl", () => {
  it("should extract path from standard track URL", () => {
    expect(
      pandoraAdapter.detectUrl(
        "https://www.pandora.com/artist/taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6",
      ),
    ).toBe("taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6");
  });

  it("should extract path from URL without www", () => {
    expect(
      pandoraAdapter.detectUrl(
        "https://pandora.com/artist/taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6",
      ),
    ).toBe("taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6");
  });

  it("should strip query parameters", () => {
    expect(
      pandoraAdapter.detectUrl(
        "https://www.pandora.com/artist/taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6?utm_source=share",
      ),
    ).toBe("taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6");
  });

  it("should handle HTTP URLs", () => {
    expect(
      pandoraAdapter.detectUrl(
        "http://www.pandora.com/artist/taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6",
      ),
    ).toBe("taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6");
  });

  it("should return null for artist-only URL", () => {
    expect(pandoraAdapter.detectUrl("https://www.pandora.com/artist/taylor-swift")).toBeNull();
  });

  it("should return null for station URL", () => {
    expect(pandoraAdapter.detectUrl("https://www.pandora.com/station/taylor-swift-radio/ST12345")).toBeNull();
  });

  it("should return null for non-Pandora URL", () => {
    expect(pandoraAdapter.detectUrl("https://open.spotify.com/track/abc123")).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(pandoraAdapter.detectUrl("")).toBeNull();
  });
});

// =============================================================================
// isAvailable
// =============================================================================

describe("Pandora: isAvailable", () => {
  it("should always return true (no credentials needed)", () => {
    expect(pandoraAdapter.isAvailable()).toBe(true);
  });
});

// =============================================================================
// capabilities
// =============================================================================

describe("Pandora: capabilities", () => {
  it("should not support ISRC lookup", () => {
    expect(pandoraAdapter.capabilities.supportsIsrc).toBe(false);
  });

  it("should not support preview URLs", () => {
    expect(pandoraAdapter.capabilities.supportsPreview).toBe(false);
  });

  it("should support artwork", () => {
    expect(pandoraAdapter.capabilities.supportsArtwork).toBe(true);
  });
});

// =============================================================================
// getTrack - full page (storeData + JSON-LD)
// =============================================================================

describe("Pandora: getTrack (full page)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetCsrfTokenCache();
  });

  it("should extract track from storeData", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(MOCK_TRACK_HTML, { status: 200 }));

    const track = await pandoraAdapter.getTrack(
      "taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6",
    );

    expect(track.sourceService).toBe("pandora");
    expect(track.title).toBe("Shake It Off (Taylor's Version)");
    expect(track.artists).toEqual(["Taylor Swift"]);
    expect(track.isrc).toBe("USUG12306677");
    expect(track.durationMs).toBe(219200);
    expect(track.albumName).toBe("1989 (Taylor's Version) (Deluxe)");
    expect(track.artworkUrl).toContain("content-images.p-cdn.com");
    expect(track.webUrl).toContain("pandora.com");
  });

  it("should use durationMillis over duration * 1000", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(MOCK_TRACK_HTML, { status: 200 }));

    const track = await pandoraAdapter.getTrack(
      "taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6",
    );
    expect(track.durationMs).toBe(219200);
  });

  it("should build full artwork URL from relative path", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(MOCK_TRACK_HTML, { status: 200 }));

    const track = await pandoraAdapter.getTrack(
      "taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6",
    );
    expect(track.artworkUrl).toBe(
      "https://content-images.p-cdn.com/images/dc/f3/85/29/923e4c5ea0f4de9da64084c7/_500W_500H.jpg",
    );
  });
});

// =============================================================================
// getTrack - JSON-LD fallback
// =============================================================================

describe("Pandora: getTrack (JSON-LD fallback)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetCsrfTokenCache();
  });

  it("should fall back to JSON-LD when storeData is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(MOCK_JSONLD_ONLY_HTML, { status: 200 }));

    const track = await pandoraAdapter.getTrack(
      "taylor-swift/1989-taylors-version-deluxe/shake-it-off-taylors-version/TRvkjP9rvK3lnh6",
    );

    expect(track.title).toBe("Shake It Off (Taylor's Version)");
    expect(track.artists).toEqual(["Taylor Swift"]);
    expect(track.isrc).toBeUndefined();
  });

  it("should throw when page has no usable data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(MOCK_EMPTY_HTML, { status: 200 }));

    await expect(pandoraAdapter.getTrack("broken/album/track/TRabc123")).rejects.toThrow(
      "Could not extract track title",
    );
  });

  it("should throw when page fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

    await expect(pandoraAdapter.getTrack("some/album/track/TRabc123")).rejects.toThrow("page fetch failed: 403");
  });
});

// =============================================================================
// searchTrack
// =============================================================================

describe("Pandora: searchTrack", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetCsrfTokenCache();
  });

  it("should find track with structured query", async () => {
    mockApiCall(new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }));

    const result = await pandoraAdapter.searchTrack({
      title: "Shake It Off",
      artist: "Taylor Swift",
    });

    expect(result.found).toBe(true);
    expect(result.track).toBeDefined();
    expect(result.track?.title).toBe("Shake It Off (Taylor's Version)");
    expect(result.matchMethod).toBe("search");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("should return not found for empty results", async () => {
    mockApiCall(new Response(JSON.stringify({ results: [], annotations: {} }), { status: 200 }));

    const result = await pandoraAdapter.searchTrack({
      title: "Nonexistent Song",
      artist: "Nobody",
    });

    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("should return not found on API error", async () => {
    mockApiCall(new Response("Error", { status: 500 }));

    const result = await pandoraAdapter.searchTrack({
      title: "Test",
      artist: "Test",
    });

    expect(result.found).toBe(false);
  });

  it("should pick best match from multiple results", async () => {
    const multiResults = {
      results: ["TR:108141369", "TR:999999"],
      annotations: {
        "TR:108141369": MOCK_STORE_TRACK,
        "TR:999999": {
          ...MOCK_STORE_TRACK,
          name: "Something Else",
          artistName: "Other Artist",
          shareableUrlPath: "/artist/other/album/something/TR999",
        },
      },
    };
    mockApiCall(new Response(JSON.stringify(multiResults), { status: 200 }));

    const result = await pandoraAdapter.searchTrack({
      title: "Shake It Off",
      artist: "Taylor Swift",
    });

    expect(result.found).toBe(true);
    expect(result.track?.title).toBe("Shake It Off (Taylor's Version)");
  });

  it("should use free-text scoring when title equals artist", async () => {
    mockApiCall(new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }));

    const result = await pandoraAdapter.searchTrack({
      title: "Taylor Swift Shake It Off",
      artist: "Taylor Swift Shake It Off",
    });

    expect(result.found).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it("should gracefully handle missing CSRF token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 500 }));

    const result = await pandoraAdapter.searchTrack({
      title: "Test",
      artist: "Test",
    });

    expect(result.found).toBe(false);
  });
});

// =============================================================================
// findByIsrc (stub)
// =============================================================================

describe("Pandora: findByIsrc", () => {
  it("should always return null (no ISRC lookup)", async () => {
    const result = await pandoraAdapter.findByIsrc("USUG12306677");
    expect(result).toBeNull();
  });
});

// =============================================================================
// adapter metadata
// =============================================================================

describe("Pandora: adapter metadata", () => {
  it("should have correct id", () => {
    expect(pandoraAdapter.id).toBe("pandora");
  });

  it("should have correct displayName", () => {
    expect(pandoraAdapter.displayName).toBe("Pandora");
  });
});
