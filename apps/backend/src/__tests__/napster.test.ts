import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { napsterAdapter } from "../services/adapters/napster";

// =============================================================================
// Mock data
// =============================================================================

const MOCK_NAPSTER_TRACK = {
  type: "track",
  id: "tra.262370664",
  name: "What A Wonderful World",
  artistName: "Louis Armstrong",
  albumName: "Jazz Universal",
  albumId: "alb.262370621",
  isrc: "USMC16758823",
  playbackSeconds: 137,
  isExplicit: false,
  previewURL: "https://listen.vo.llnwd.net/g3/preview.mp3",
  shortcut: "louis-armstrong/jazz-universal/what-a-wonderful-world",
};

const MOCK_TRACKS_RESPONSE = {
  tracks: [MOCK_NAPSTER_TRACK],
};

const MOCK_SEARCH_RESPONSE = {
  search: {
    data: {
      tracks: [MOCK_NAPSTER_TRACK],
    },
  },
  meta: {
    totalCount: 1,
  },
};

// =============================================================================
// detectUrl
// =============================================================================

describe("Napster: detectUrl", () => {
  it("should extract track ID from play.napster.com URL", () => {
    expect(napsterAdapter.detectUrl("https://play.napster.com/track/tra.262370664")).toBe("tra.262370664");
  });

  it("should extract track ID from web.napster.com URL", () => {
    expect(napsterAdapter.detectUrl("https://web.napster.com/track/tra.262370664")).toBe("tra.262370664");
  });

  it("should extract slug from app.napster.com URL", () => {
    expect(
      napsterAdapter.detectUrl("https://app.napster.com/artist/louis-armstrong/album/jazz/track/wonderful-world"),
    ).toBe("wonderful-world");
  });

  it("should return null for non-Napster URL", () => {
    expect(napsterAdapter.detectUrl("https://open.spotify.com/track/abc123")).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(napsterAdapter.detectUrl("")).toBeNull();
  });

  it("should return null for Napster URL without track path", () => {
    expect(napsterAdapter.detectUrl("https://napster.com/artist/louis-armstrong")).toBeNull();
  });
});

// =============================================================================
// isAvailable
// =============================================================================

describe("Napster: isAvailable", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete import.meta.env.NAPSTER_API_KEY;
  });

  it("should return true when API key is set", () => {
    import.meta.env.NAPSTER_API_KEY = "test-api-key";
    expect(napsterAdapter.isAvailable()).toBe(true);
  });

  it("should return false when API key is missing", () => {
    delete import.meta.env.NAPSTER_API_KEY;
    expect(napsterAdapter.isAvailable()).toBe(false);
  });
});

// =============================================================================
// capabilities
// =============================================================================

describe("Napster: capabilities", () => {
  it("should support ISRC lookup", () => {
    expect(napsterAdapter.capabilities.supportsIsrc).toBe(true);
  });

  it("should support preview URLs", () => {
    expect(napsterAdapter.capabilities.supportsPreview).toBe(true);
  });

  it("should support artwork", () => {
    expect(napsterAdapter.capabilities.supportsArtwork).toBe(true);
  });
});

// =============================================================================
// getTrack
// =============================================================================

describe("Napster: getTrack", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    import.meta.env.NAPSTER_API_KEY = "test-api-key";
  });

  afterEach(() => {
    delete import.meta.env.NAPSTER_API_KEY;
  });

  it("should fetch and map track data correctly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_TRACKS_RESPONSE), { status: 200 }),
    );

    const track = await napsterAdapter.getTrack("tra.262370664");

    expect(track.sourceService).toBe("napster");
    expect(track.sourceId).toBe("tra.262370664");
    expect(track.title).toBe("What A Wonderful World");
    expect(track.artists).toEqual(["Louis Armstrong"]);
    expect(track.albumName).toBe("Jazz Universal");
    expect(track.durationMs).toBe(137000);
    expect(track.isrc).toBe("USMC16758823");
    expect(track.isExplicit).toBe(false);
    expect(track.artworkUrl).toBe("https://api.napster.com/imageserver/v2/albums/alb.262370621/images/500x500.jpg");
    expect(track.previewUrl).toBe("https://listen.vo.llnwd.net/g3/preview.mp3");
    expect(track.webUrl).toBe("https://play.napster.com/track/tra.262370664");
  });

  it("should convert playbackSeconds to milliseconds", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ tracks: [{ ...MOCK_NAPSTER_TRACK, playbackSeconds: 300 }] }), { status: 200 }),
    );

    const track = await napsterAdapter.getTrack("tra.262370664");
    expect(track.durationMs).toBe(300000);
  });

  it("should throw on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    await expect(napsterAdapter.getTrack("tra.999")).rejects.toThrow("Napster getTrack failed: 404");
  });

  it("should throw for slug-based track IDs", async () => {
    await expect(napsterAdapter.getTrack("wonderful-world")).rejects.toThrow("slug-based track lookup not supported");
  });

  it("should include apikey in request URL", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TRACKS_RESPONSE), { status: 200 }));

    await napsterAdapter.getTrack("tra.262370664");

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("apikey=test-api-key");
  });
});

// =============================================================================
// findByIsrc
// =============================================================================

describe("Napster: findByIsrc", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    import.meta.env.NAPSTER_API_KEY = "test-api-key";
  });

  afterEach(() => {
    delete import.meta.env.NAPSTER_API_KEY;
  });

  it("should find track by ISRC", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_TRACKS_RESPONSE), { status: 200 }),
    );

    const track = await napsterAdapter.findByIsrc("USMC16758823");

    expect(track).not.toBeNull();
    expect(track?.title).toBe("What A Wonderful World");
    expect(track?.isrc).toBe("USMC16758823");
    expect(track?.sourceService).toBe("napster");
  });

  it("should return null when ISRC is not found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ tracks: [] }), { status: 200 }));

    const track = await napsterAdapter.findByIsrc("INVALID000000");
    expect(track).toBeNull();
  });

  it("should return null on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Server Error", { status: 500 }));

    const track = await napsterAdapter.findByIsrc("USMC16758823");
    expect(track).toBeNull();
  });

  it("should use ISRC endpoint", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TRACKS_RESPONSE), { status: 200 }));

    await napsterAdapter.findByIsrc("USMC16758823");

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/tracks/isrc/USMC16758823");
  });
});

// =============================================================================
// searchTrack
// =============================================================================

describe("Napster: searchTrack", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    import.meta.env.NAPSTER_API_KEY = "test-api-key";
  });

  afterEach(() => {
    delete import.meta.env.NAPSTER_API_KEY;
  });

  it("should find track with structured query", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }),
    );

    const result = await napsterAdapter.searchTrack({
      title: "What A Wonderful World",
      artist: "Louis Armstrong",
    });

    expect(result.found).toBe(true);
    expect(result.track).toBeDefined();
    expect(result.matchMethod).toBe("search");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("should return not found for empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ search: { data: { tracks: [] } }, meta: { totalCount: 0 } }), { status: 200 }),
    );

    const result = await napsterAdapter.searchTrack({
      title: "Nonexistent Song",
      artist: "Nobody",
    });

    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("should return not found on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 500 }));

    const result = await napsterAdapter.searchTrack({
      title: "Test",
      artist: "Test",
    });

    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("should use combined query for free-text search", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }));

    await napsterAdapter.searchTrack({
      title: "Louis Armstrong Wonderful World",
      artist: "Louis Armstrong Wonderful World",
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/search?query=");
    expect(calledUrl).toContain("type=track");
  });

  it("should pick best match from multiple results", async () => {
    const multiResults = {
      search: {
        data: {
          tracks: [
            MOCK_NAPSTER_TRACK,
            { ...MOCK_NAPSTER_TRACK, id: "tra.999", name: "Something Else", artistName: "Other" },
          ],
        },
      },
      meta: { totalCount: 2 },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(multiResults), { status: 200 }));

    const result = await napsterAdapter.searchTrack({
      title: "What A Wonderful World",
      artist: "Louis Armstrong",
    });

    expect(result.found).toBe(true);
    expect(result.track?.title).toBe("What A Wonderful World");
  });
});

// =============================================================================
// metadata
// =============================================================================

describe("Napster: adapter metadata", () => {
  it("should have correct id", () => {
    expect(napsterAdapter.id).toBe("napster");
  });

  it("should have correct displayName", () => {
    expect(napsterAdapter.displayName).toBe("Napster");
  });
});
