import { beforeEach, describe, expect, it, vi } from "vitest";
import { deezerAdapter } from "../adapter";

// =============================================================================
// Mock data
// =============================================================================

const MOCK_DEEZER_TRACK = {
  id: 3135556,
  title: "Harder, Better, Faster, Stronger",
  artist: { id: 27, name: "Daft Punk" },
  album: {
    id: 302127,
    title: "Discovery",
    cover_xl: "https://e-cdns-images.dzcdn.net/images/cover/xl.jpg",
    cover_big: "https://e-cdns-images.dzcdn.net/images/cover/big.jpg",
    release_date: "2001-03-12",
  },
  duration: 224,
  isrc: "GBDUW0000059",
  explicit_lyrics: false,
  preview: "https://cdns-preview.dzcdn.net/stream/preview.mp3",
  link: "https://www.deezer.com/track/3135556",
};

const MOCK_SEARCH_RESPONSE = {
  data: [MOCK_DEEZER_TRACK],
  total: 1,
};

// =============================================================================
// detectUrl
// =============================================================================

describe("Deezer: detectUrl", () => {
  it("should extract track ID from standard URL", () => {
    expect(deezerAdapter.detectUrl("https://www.deezer.com/track/3135556")).toBe("3135556");
  });

  it("should extract track ID from URL with locale", () => {
    expect(deezerAdapter.detectUrl("https://www.deezer.com/en/track/3135556")).toBe("3135556");
  });

  it("should extract track ID from URL with de locale", () => {
    expect(deezerAdapter.detectUrl("https://www.deezer.com/de/track/3135556")).toBe("3135556");
  });

  it("should extract track ID from URL without www", () => {
    expect(deezerAdapter.detectUrl("https://deezer.com/track/3135556")).toBe("3135556");
  });

  it("should return null for album URL (detectUrl is track-only)", () => {
    expect(deezerAdapter.detectUrl("https://www.deezer.com/album/302127")).toBeNull();
  });
});

// =============================================================================
// detectAlbumUrl
// =============================================================================

describe("Deezer: detectAlbumUrl", () => {
  it("should extract album ID from standard URL", () => {
    expect(deezerAdapter.detectAlbumUrl?.("https://www.deezer.com/album/302127")).toBe("302127");
  });

  it("should extract album ID from URL with locale", () => {
    expect(deezerAdapter.detectAlbumUrl?.("https://www.deezer.com/en/album/302127")).toBe("302127");
  });

  it("should extract album ID from URL without www", () => {
    expect(deezerAdapter.detectAlbumUrl?.("https://deezer.com/album/302127")).toBe("302127");
  });

  it("should return null for track URL", () => {
    expect(deezerAdapter.detectAlbumUrl?.("https://www.deezer.com/track/3135556")).toBeNull();
  });

  it("should return null for non-Deezer URL", () => {
    expect(deezerAdapter.detectAlbumUrl?.("https://open.spotify.com/album/abc123")).toBeNull();
  });
});

// =============================================================================
// isAvailable
// =============================================================================

describe("Deezer: isAvailable", () => {
  it("should always return true (public API)", () => {
    expect(deezerAdapter.isAvailable()).toBe(true);
  });
});

// =============================================================================
// capabilities
// =============================================================================

describe("Deezer: capabilities", () => {
  it("should support ISRC lookup", () => {
    expect(deezerAdapter.capabilities.supportsIsrc).toBe(true);
  });

  it("should support preview URLs", () => {
    expect(deezerAdapter.capabilities.supportsPreview).toBe(true);
  });

  it("should support artwork", () => {
    expect(deezerAdapter.capabilities.supportsArtwork).toBe(true);
  });
});

// =============================================================================
// getTrack
// =============================================================================

describe("Deezer: getTrack", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should fetch and map track data correctly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_DEEZER_TRACK), { status: 200 }),
    );

    const track = await deezerAdapter.getTrack("3135556");

    expect(track.sourceService).toBe("deezer");
    expect(track.sourceId).toBe("3135556");
    expect(track.title).toBe("Harder, Better, Faster, Stronger");
    expect(track.artists).toEqual(["Daft Punk"]);
    expect(track.albumName).toBe("Discovery");
    expect(track.durationMs).toBe(224000);
    expect(track.isrc).toBe("GBDUW0000059");
    expect(track.isExplicit).toBe(false);
    expect(track.artworkUrl).toBe("https://e-cdns-images.dzcdn.net/images/cover/xl.jpg");
    expect(track.previewUrl).toBe("https://cdns-preview.dzcdn.net/stream/preview.mp3");
    expect(track.webUrl).toBe("https://www.deezer.com/track/3135556");
  });

  it("should convert duration from seconds to milliseconds", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ...MOCK_DEEZER_TRACK, duration: 180 }), { status: 200 }),
    );

    const track = await deezerAdapter.getTrack("3135556");
    expect(track.durationMs).toBe(180000);
  });

  it("should throw on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    await expect(deezerAdapter.getTrack("999999")).rejects.toThrow("Deezer track fetch failed: 404");
  });

  it("should throw on Deezer API error response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { type: "DataException", message: "no data", code: 800 },
        }),
        { status: 200 },
      ),
    );

    await expect(deezerAdapter.getTrack("999999")).rejects.toThrow(/Deezer: Track not found: 999999 \(no data\)/);
  });

  it("should use cover_big as fallback when cover_xl is missing", async () => {
    const trackWithoutXl = {
      ...MOCK_DEEZER_TRACK,
      album: { ...MOCK_DEEZER_TRACK.album, cover_xl: undefined },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(trackWithoutXl), { status: 200 }));

    const track = await deezerAdapter.getTrack("3135556");
    expect(track.artworkUrl).toBe("https://e-cdns-images.dzcdn.net/images/cover/big.jpg");
  });
});

// =============================================================================
// findByIsrc
// =============================================================================

describe("Deezer: findByIsrc", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should find track by ISRC", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_DEEZER_TRACK), { status: 200 }),
    );

    const track = await deezerAdapter.findByIsrc("GBDUW0000059");

    expect(track).not.toBeNull();
    expect(track?.title).toBe("Harder, Better, Faster, Stronger");
    expect(track?.isrc).toBe("GBDUW0000059");
    expect(track?.sourceService).toBe("deezer");
  });

  it("should return null when ISRC is not found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { type: "DataException", message: "no data", code: 800 },
        }),
        { status: 200 },
      ),
    );

    const track = await deezerAdapter.findByIsrc("INVALID000000");
    expect(track).toBeNull();
  });

  it("should return null on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Server Error", { status: 500 }));

    const track = await deezerAdapter.findByIsrc("GBDUW0000059");
    expect(track).toBeNull();
  });
});

// =============================================================================
// searchTrack
// =============================================================================

describe("Deezer: searchTrack", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should find track with structured query", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }),
    );

    const result = await deezerAdapter.searchTrack({
      title: "Harder Better Faster Stronger",
      artist: "Daft Punk",
    });

    expect(result.found).toBe(true);
    expect(result.track).toBeDefined();
    expect(result.matchMethod).toBe("search");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("should return not found for empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [], total: 0 }), { status: 200 }),
    );

    const result = await deezerAdapter.searchTrack({
      title: "Nonexistent Song",
      artist: "Nobody",
    });

    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("should return not found on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 500 }));

    const result = await deezerAdapter.searchTrack({
      title: "Test",
      artist: "Test",
    });

    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("should return not found on Deezer API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { type: "Exception", message: "Quota limit exceeded", code: 4 },
        }),
        { status: 200 },
      ),
    );

    const result = await deezerAdapter.searchTrack({
      title: "Test",
      artist: "Test",
    });

    expect(result.found).toBe(false);
  });

  it("should use free-text query when title equals artist", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }));

    await deezerAdapter.searchTrack({
      title: "Daft Punk Harder Better",
      artist: "Daft Punk Harder Better",
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/search/track?q=");
    expect(calledUrl).not.toContain("artist%3A");
  });

  it("should pick best match from multiple results", async () => {
    const multiResults = {
      data: [
        MOCK_DEEZER_TRACK,
        { ...MOCK_DEEZER_TRACK, id: 999, title: "Something Else", artist: { id: 1, name: "Other" } },
      ],
      total: 2,
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(multiResults), { status: 200 }));

    const result = await deezerAdapter.searchTrack({
      title: "Harder Better Faster Stronger",
      artist: "Daft Punk",
    });

    expect(result.found).toBe(true);
    expect(result.track?.title).toBe("Harder, Better, Faster, Stronger");
  });
});

// =============================================================================
// searchTrackWithCandidates
// =============================================================================

describe("Deezer: searchTrackWithCandidates", () => {
  it("returns ranked candidates sorted by confidence descending", async () => {
    const multiResults = {
      data: [
        // Position 0: weak title match — relies on free-text decay (0.85)
        {
          ...MOCK_DEEZER_TRACK,
          id: 100,
          title: "Get Lucky",
          artist: { id: 27, name: "Daft Punk" },
        },
        // Position 1: exact title match — structured query path scores higher
        MOCK_DEEZER_TRACK,
      ],
      total: 2,
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(multiResults), { status: 200 }));

    const result = await deezerAdapter.searchTrackWithCandidates({
      title: "Harder, Better, Faster, Stronger",
      artist: "Daft Punk",
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    for (let i = 1; i < result.candidates.length; i++) {
      expect(result.candidates[i - 1].confidence).toBeGreaterThanOrEqual(result.candidates[i].confidence);
    }
  });

  it("free-text path scores by position decay (0.85, 0.80, 0.75, ...)", async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      ...MOCK_DEEZER_TRACK,
      id: 1000 + i,
      title: `Track ${i}`,
      artist: { id: i, name: `Artist ${i}` },
    }));
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ data: items, total: 5 }), { status: 200 }));

    const freeText = "anything goes";
    const result = await deezerAdapter.searchTrackWithCandidates({
      title: freeText,
      artist: freeText,
    });

    // Free-text decay: top candidate is 0.85, last is at least 0.4 floor.
    expect(result.candidates[0].confidence).toBeCloseTo(0.85, 5);
    expect(result.candidates.at(-1)!.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it("returns empty candidates on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("nope", { status: 500 }));

    const result = await deezerAdapter.searchTrackWithCandidates({
      title: "x",
      artist: "y",
    });

    expect(result.candidates).toEqual([]);
    expect(result.bestMatch.found).toBe(false);
  });

  it("returns empty candidates when Deezer returns API error envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { type: "DataException", message: "no", code: 800 } }), { status: 200 }),
    );

    const result = await deezerAdapter.searchTrackWithCandidates({
      title: "x",
      artist: "y",
    });

    expect(result.candidates).toEqual([]);
    expect(result.bestMatch.found).toBe(false);
  });

  it("returns empty candidates when Deezer returns no items", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [], total: 0 }), { status: 200 }),
    );

    const result = await deezerAdapter.searchTrackWithCandidates({
      title: "Nonexistent",
      artist: "Nobody",
    });

    expect(result.candidates).toEqual([]);
    expect(result.bestMatch.found).toBe(false);
  });

  it("caps the candidate list at MAX_CANDIDATES (8)", async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      ...MOCK_DEEZER_TRACK,
      id: 2000 + i,
      title: `Track ${i}`,
      artist: { id: i, name: `Artist ${i}` },
    }));
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ data: items, total: 10 }), { status: 200 }));

    const result = await deezerAdapter.searchTrackWithCandidates({
      title: "free text",
      artist: "free text",
    });

    expect(result.candidates.length).toBeLessThanOrEqual(8);
  });

  it("emits limit=10 in the search URL", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [], total: 0 }), { status: 200 }));

    await deezerAdapter.searchTrackWithCandidates({ title: "x", artist: "y" });

    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("limit=10");
  });
});

// =============================================================================
// metadata
// =============================================================================

describe("Deezer: adapter metadata", () => {
  it("should have correct id", () => {
    expect(deezerAdapter.id).toBe("deezer");
  });

  it("should have correct displayName", () => {
    expect(deezerAdapter.displayName).toBe("Deezer");
  });
});
