import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetClientIdCache, soundcloudAdapter } from "../adapter";

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
// Helper: URL-routed fetch mock
// =============================================================================

const SC_HOMEPAGE_URL = "https://soundcloud.com";
const SC_API_HOST = "https://api-v2.soundcloud.com";

/** A routed response: body text plus an optional HTTP status (default 200). */
interface ScRoute {
  body: string;
  status?: number;
}

/**
 * Installs a URL-routed `fetch` mock for the SoundCloud adapter.
 *
 * The adapter issues up to three distinct requests per call — the homepage
 * (client_id extraction), the `api-v2` endpoint, and the track page (the HTML
 * scrape fallback) — and whether the homepage request fires depends on the
 * module-global client_id cache being warm. An order-based
 * `mockResolvedValueOnce` chain therefore desyncs whenever the cache state
 * shifts between tests: a drifting sequence eventually reads an exhausted mock
 * as `undefined`, which the adapter dereferences (`response.ok`) and throws —
 * the flaky CI failure this replaces. Routing by URL makes each response depend
 * only on which target is hit, never on call order or cache state. An unrouted
 * URL rejects so a genuinely drifting test fails loudly instead of silently.
 *
 * @param routes - Per-target responses. `homepage` defaults to the hydration
 *   HTML carrying a valid client_id; pass it explicitly to simulate a missing
 *   one. `api`/`page` are only needed for the requests a given test exercises.
 */
function mockScFetch(routes: { homepage?: ScRoute; api?: ScRoute; page?: ScRoute }): void {
  const homepage = routes.homepage ?? { body: MOCK_SC_HOMEPAGE };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input instanceof URL ? input.href : String(input);
    if (url === SC_HOMEPAGE_URL) {
      return new Response(homepage.body, { status: homepage.status ?? 200 });
    }
    if (url.startsWith(SC_API_HOST)) {
      if (!routes.api) throw new Error(`Unexpected SoundCloud API call: ${url}`);
      return new Response(routes.api.body, { status: routes.api.status ?? 200 });
    }
    if (url.startsWith(`${SC_HOMEPAGE_URL}/`)) {
      if (!routes.page) throw new Error(`Unexpected SoundCloud page call: ${url}`);
      return new Response(routes.page.body, { status: routes.page.status ?? 200 });
    }
    throw new Error(`Unmocked SoundCloud fetch: ${url}`);
  });
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
    mockScFetch({ api: { body: JSON.stringify(MOCK_SC_TRACK) } });

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
    mockScFetch({ api: { body: JSON.stringify(MOCK_SC_TRACK) } });

    const track = await soundcloudAdapter.getTrack("taylorswift/shake-it-off");
    expect(track.durationMs).toBe(231863);
  });

  it("should replace -large with -t500x500 in artwork", async () => {
    mockScFetch({ api: { body: JSON.stringify(MOCK_SC_TRACK) } });

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
    mockScFetch({
      api: { body: "Not Found", status: 404 },
      page: { body: MOCK_HYDRATION_HTML },
    });

    const track = await soundcloudAdapter.getTrack("taylorswift/shake-it-off");
    expect(track.title).toBe("Shake It Off");
    expect(track.isrc).toBe("USCJY1431309");
  });

  it("should fall back to OG tags when no JSON is found", async () => {
    mockScFetch({
      api: { body: "Error", status: 500 },
      page: { body: MOCK_OG_ONLY_HTML },
    });

    const track = await soundcloudAdapter.getTrack("taylorswift/shake-it-off");
    expect(track.title).toBe("Shake It Off");
    expect(track.artists).toEqual(["Taylor Swift"]);
    expect(track.durationMs).toBe(231863);
  });

  it("should throw when page returns no usable data", async () => {
    mockScFetch({
      api: { body: "Error", status: 500 },
      page: { body: MOCK_EMPTY_HTML },
    });

    await expect(soundcloudAdapter.getTrack("broken/page")).rejects.toThrow("Could not extract track title");
  });

  it("should throw when page fetch fails", async () => {
    mockScFetch({
      api: { body: "Error", status: 500 },
      page: { body: "Not Found", status: 404 },
    });

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
    mockScFetch({ api: { body: JSON.stringify(MOCK_SEARCH_RESPONSE) } });

    const result = await soundcloudAdapter.searchTrack({
      title: "Shake It Off",
      artist: "Taylor Swift",
    });

    expect(result.found).toBe(true);
    expect(result.track).toBeDefined();
    expect(result.track?.title).toBe("Shake It Off");
    expect(result.matchMethod).toBe("search");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("should return not found for empty results", async () => {
    mockScFetch({ api: { body: JSON.stringify({ collection: [] }) } });

    const result = await soundcloudAdapter.searchTrack({
      title: "Nonexistent Song",
      artist: "Nobody",
    });

    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });

  /**
   * A search that returns "not found" makes the resolver skip SoundCloud for
   * this track for a month. SoundCloud answers an empty search with 200 and an
   * empty `collection`, so an error status means it did not answer and the
   * adapter throws, which the resolver does not remember.
   */
  it("throws when the search answers an error status", async () => {
    mockScFetch({ api: { body: "Error", status: 500 } });

    await expect(soundcloudAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(
      /track search failed: 500/,
    );
  });

  it("throws when the search is rate limited", async () => {
    mockScFetch({ api: { body: "Slow down", status: 429 } });

    await expect(soundcloudAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(/rate-limited/);
  });

  it("throws when a fresh client_id is rejected too", async () => {
    mockScFetch({ api: { body: "", status: 401 } });

    await expect(soundcloudAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(/401/);
  });

  it("scrapes a fresh client_id once when the cached one is rejected", async () => {
    let apiCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input instanceof URL ? input.href : String(input);
      if (url === SC_HOMEPAGE_URL) return new Response(MOCK_SC_HOMEPAGE);
      if (!url.startsWith(SC_API_HOST)) throw new Error(`Unmocked SoundCloud fetch: ${url}`);
      apiCalls++;
      return apiCalls === 1 ? new Response("", { status: 401 }) : Response.json({ collection: [], total_results: 0 });
    });

    await expect(soundcloudAdapter.searchTrack({ title: "Test", artist: "Test" })).resolves.toMatchObject({
      found: false,
    });
    expect(apiCalls).toBe(2);
  });

  it("throws when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input instanceof URL ? input.href : String(input);
      if (url === SC_HOMEPAGE_URL) return new Response(MOCK_SC_HOMEPAGE, { status: 200 });
      throw new Error("socket hang up");
    });

    await expect(soundcloudAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow();
  });

  it("throws when the body is not JSON", async () => {
    mockScFetch({ api: { body: "<html>maintenance</html>" } });

    await expect(soundcloudAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(/not JSON/);
  });

  it("throws when the body has no collection", async () => {
    mockScFetch({ api: { body: JSON.stringify({ error: "denied" }) } });

    await expect(soundcloudAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(
      /answered without a collection/,
    );
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
    mockScFetch({ api: { body: JSON.stringify(multiResults) } });

    const result = await soundcloudAdapter.searchTrack({
      title: "Shake It Off",
      artist: "Taylor Swift",
    });

    expect(result.found).toBe(true);
    expect(result.track?.title).toBe("Shake It Off");
  });

  it("should use free-text scoring when title equals artist", async () => {
    mockScFetch({ api: { body: JSON.stringify(MOCK_SEARCH_RESPONSE) } });

    const result = await soundcloudAdapter.searchTrack({
      title: "Taylor Swift Shake It Off",
      artist: "Taylor Swift Shake It Off",
    });

    expect(result.found).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it("throws when no client_id can be obtained", async () => {
    // Homepage returns no usable hydration, so the adapter never obtains a client_id.
    mockScFetch({ homepage: { body: "Error", status: 500 } });

    await expect(soundcloudAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(/no client_id/);
  });

  it("throws when the homepage carries no client_id in its hydration data", async () => {
    mockScFetch({ homepage: { body: "<html><body>No hydration here</body></html>" } });

    await expect(soundcloudAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(/no client_id/);
  });
});

// =============================================================================
// searchAlbum
// =============================================================================

describe("SoundCloud: searchAlbum", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetClientIdCache();
  });

  it("should return not found for empty results", async () => {
    mockScFetch({ api: { body: JSON.stringify({ collection: [] }) } });

    const result = await soundcloudAdapter.searchAlbum({ title: "Nonexistent Album", artist: "Nobody" });

    expect(result).toEqual({ found: false, confidence: 0, matchMethod: "search" });
  });

  it("throws when the search answers an error status", async () => {
    mockScFetch({ api: { body: "Error", status: 503 } });

    await expect(soundcloudAdapter.searchAlbum({ title: "1989", artist: "Taylor Swift" })).rejects.toThrow(
      /album search failed: 503/,
    );
  });

  it("throws when the body has no collection", async () => {
    mockScFetch({ api: { body: JSON.stringify({}) } });

    await expect(soundcloudAdapter.searchAlbum({ title: "1989", artist: "Taylor Swift" })).rejects.toThrow(
      /answered without a collection/,
    );
  });
});

// =============================================================================
// getAlbum
// =============================================================================

describe("SoundCloud: getAlbum", () => {
  const SET_PATH = "taylorswift/sets/1989";

  beforeEach(() => {
    vi.restoreAllMocks();
    _resetClientIdCache();
  });

  it("reports a set SoundCloud answers 404 for as not found", async () => {
    mockScFetch({ api: { body: "{}", status: 404 } });

    await expect(soundcloudAdapter.getAlbum(SET_PATH)).rejects.toThrow(/Album not found/);
  });

  it("throws the HTTP error rather than not found for another error status", async () => {
    mockScFetch({ api: { body: "Busy", status: 503 } });

    const error = await soundcloudAdapter.getAlbum(SET_PATH).catch((caught: unknown) => caught);

    expect((error as Error).message).toMatch(/album fetch failed: 503/);
    expect((error as Error).message).not.toMatch(/not found/i);
  });

  it("throws when the answer is not JSON", async () => {
    mockScFetch({ api: { body: "<html>maintenance</html>" } });

    await expect(soundcloudAdapter.getAlbum(SET_PATH)).rejects.toThrow(/not JSON/);
  });

  it("throws when the answer carries no title", async () => {
    mockScFetch({ api: { body: "{}" } });

    await expect(soundcloudAdapter.getAlbum(SET_PATH)).rejects.toThrow(/without a title/);
  });
});

// =============================================================================
// searchArtist
// =============================================================================

describe("SoundCloud: searchArtist", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetClientIdCache();
  });

  it("should return not found for empty results", async () => {
    mockScFetch({ api: { body: JSON.stringify({ collection: [] }) } });

    const result = await soundcloudAdapter.searchArtist({ name: "Nobody At All" });

    expect(result).toEqual({ found: false, confidence: 0, matchMethod: "search" });
  });

  it("throws when the search answers an error status", async () => {
    mockScFetch({ api: { body: "Error", status: 500 } });

    await expect(soundcloudAdapter.searchArtist({ name: "Taylor Swift" })).rejects.toThrow(/artist search failed: 500/);
  });

  it("throws when the body has no collection", async () => {
    mockScFetch({ api: { body: JSON.stringify({ error: "denied" }) } });

    await expect(soundcloudAdapter.searchArtist({ name: "Taylor Swift" })).rejects.toThrow(
      /answered without a collection/,
    );
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
