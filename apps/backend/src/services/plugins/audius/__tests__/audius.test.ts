import { beforeEach, describe, expect, it, vi } from "vitest";
import { audiusAdapter } from "../adapter";
import recordedAlbumSearch from "./fixtures/current-album-search.json";

// =============================================================================
// Mock data
// =============================================================================

const MOCK_AUDIUS_TRACK = {
  id: "QxamW",
  title: "Unlucky (Work in progress)",
  duration: 362,
  genre: "Electronic",
  mood: "Other",
  release_date: "2021-04-02T15:05:00Z",
  permalink: "/deadmau5/unlucky-work-in-progress-333797",
  slug: "unlucky-work-in-progress-333797",
  artwork: {
    "150x150": "https://audius.co/artwork/150x150.jpg",
    "480x480": "https://audius.co/artwork/480x480.jpg",
    "1000x1000": "https://audius.co/artwork/1000x1000.jpg",
  },
  user: {
    id: "LKdlD",
    handle: "deadmau5",
    name: "deadmau5",
  },
};

const MOCK_SEARCH_RESPONSE = {
  data: [MOCK_AUDIUS_TRACK],
};

const MOCK_TRACK_DETAIL_RESPONSE = {
  data: MOCK_AUDIUS_TRACK,
};

// =============================================================================
// detectUrl
// =============================================================================

describe("Audius: detectUrl", () => {
  it("should extract path from standard URL", () => {
    expect(audiusAdapter.detectUrl("https://audius.co/deadmau5/unlucky-work-in-progress-333797")).toBe(
      "deadmau5/unlucky-work-in-progress-333797",
    );
  });

  it("should extract path from URL without https", () => {
    expect(audiusAdapter.detectUrl("http://audius.co/deadmau5/unlucky-work-in-progress-333797")).toBe(
      "deadmau5/unlucky-work-in-progress-333797",
    );
  });

  it("should handle URL with query params", () => {
    expect(audiusAdapter.detectUrl("https://audius.co/deadmau5/some-track?ref=share")).toBe("deadmau5/some-track");
  });

  it("should return null for user profile URL (no track slug)", () => {
    expect(audiusAdapter.detectUrl("https://audius.co/deadmau5")).toBeNull();
  });

  it("should return null for non-Audius URL", () => {
    expect(audiusAdapter.detectUrl("https://open.spotify.com/track/abc123")).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(audiusAdapter.detectUrl("")).toBeNull();
  });
});

// =============================================================================
// capabilities
// =============================================================================

describe("Audius: capabilities", () => {
  it("should not support ISRC lookup", () => {
    expect(audiusAdapter.capabilities.supportsIsrc).toBe(false);
  });

  it("should not support preview URLs", () => {
    expect(audiusAdapter.capabilities.supportsPreview).toBe(false);
  });

  it("should support artwork", () => {
    expect(audiusAdapter.capabilities.supportsArtwork).toBe(true);
  });
});

// =============================================================================
// getTrack (resolve path)
// =============================================================================

describe("Audius: getTrack", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should resolve path via resolve endpoint and map track data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_TRACK_DETAIL_RESPONSE), { status: 200 }),
    );

    const track = await audiusAdapter.getTrack("deadmau5/unlucky-work-in-progress-333797");

    expect(track.sourceService).toBe("audius");
    expect(track.sourceId).toBe("QxamW");
    expect(track.title).toBe("Unlucky (Work in progress)");
    expect(track.artists).toEqual(["deadmau5"]);
    expect(track.durationMs).toBe(362000);
    expect(track.artworkUrl).toBe("https://audius.co/artwork/1000x1000.jpg");
    expect(track.webUrl).toBe("https://audius.co/deadmau5/unlucky-work-in-progress-333797");
  });

  it("should use resolve endpoint when trackId contains slash", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TRACK_DETAIL_RESPONSE), { status: 200 }));

    await audiusAdapter.getTrack("artist/track-slug");

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/resolve?url=");
  });

  it("should use direct endpoint when trackId is a hash", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_TRACK_DETAIL_RESPONSE), { status: 200 }));

    await audiusAdapter.getTrack("QxamW");

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/tracks/QxamW");
    expect(calledUrl).not.toContain("/resolve");
  });

  it("should convert duration from seconds to milliseconds", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { ...MOCK_AUDIUS_TRACK, duration: 180 } }), { status: 200 }),
    );

    const track = await audiusAdapter.getTrack("QxamW");
    expect(track.durationMs).toBe(180000);
  });

  it("should throw on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    await expect(audiusAdapter.getTrack("invalid")).rejects.toThrow();
  });

  it("should use 480x480 artwork as fallback when 1000x1000 is missing", async () => {
    const trackWithout1000 = {
      ...MOCK_AUDIUS_TRACK,
      artwork: { "150x150": "https://small.jpg", "480x480": "https://medium.jpg" },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ data: trackWithout1000 }), { status: 200 }),
    );

    const track = await audiusAdapter.getTrack("QxamW");
    expect(track.artworkUrl).toBe("https://medium.jpg");
  });
});

// =============================================================================
// getAlbum
// =============================================================================

/**
 * Audius answers a playlist, and therefore an album, with `data` as a list of
 * one entry, both through the resolve endpoint and through `/playlists/{id}`.
 * Fetched from the live API on 2026-10-11.
 */
const MOCK_AUDIUS_ALBUM = {
  id: "P5wZ0",
  playlist_name: "the black album",
  is_album: true,
  permalink: "/medmc/album/the-black-album",
  artwork: { "480x480": "https://audius.co/artwork/album-480.jpg" },
  user: { id: "u1", handle: "medmc", name: "MedMC" },
  track_count: 12,
};

describe("Audius: getAlbum", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves an album link through the resolve endpoint", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [MOCK_AUDIUS_ALBUM] }), { status: 200 }));

    const album = await audiusAdapter.getAlbum("medmc/album/the-black-album");

    expect(fetchSpy.mock.calls[0][0] as string).toContain("/resolve?url=");
    expect(album).toMatchObject({
      sourceService: "audius",
      sourceId: "P5wZ0",
      title: "the black album",
      artists: ["MedMC"],
      totalTracks: 12,
      webUrl: "https://audius.co/medmc/album/the-black-album",
    });
  });

  it("resolves an album by its id", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [MOCK_AUDIUS_ALBUM] }), { status: 200 }),
    );

    await expect(audiusAdapter.getAlbum("P5wZ0")).resolves.toMatchObject({ title: "the black album" });
  });

  it("reports a playlist that is not an album as not found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ ...MOCK_AUDIUS_ALBUM, is_album: false }] }), { status: 200 }),
    );

    await expect(audiusAdapter.getAlbum("medmc/playlist/the-black-album")).rejects.toThrow(/Album not found/);
  });

  it("reports an empty answer as not found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));

    await expect(audiusAdapter.getAlbum("P5wZ0")).rejects.toThrow(/Album not found/);
  });
});

describe("Audius: explicit album search", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the documented album collection for the verified native release", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(recordedAlbumSearch));
    const result = await audiusAdapter.searchAlbum({ title: "The Lost Concert #1", artist: "Euphoryn" });
    expect(result).toMatchObject({
      found: true,
      album: { sourceId: "P7zg5N1", title: "The Lost Concert #1", artists: ["Euphoryn"], totalTracks: 7 },
    });
    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.pathname).toBe("/v1/search/full");
    expect(url.searchParams.get("kind")).toBe("albums");
    expect(url.searchParams.get("query")).toBe("Euphoryn The Lost Concert #1");
  });

  it("accepts a completed empty album collection", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ data: { albums: [] } }));
    await expect(audiusAdapter.searchAlbum({ title: "Absent", artist: "Nobody" })).resolves.toMatchObject({
      found: false,
    });
  });

  it("rejects a missing album collection rather than claiming absence", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ data: {} }));
    await expect(audiusAdapter.searchAlbum({ title: "The Lost Concert #1", artist: "Euphoryn" })).rejects.toThrow();
  });
});

// =============================================================================
// findByIsrc
// =============================================================================

describe("Audius: findByIsrc", () => {
  it("should always return null (ISRC not supported)", async () => {
    const track = await audiusAdapter.findByIsrc("GBDUW0000059");
    expect(track).toBeNull();
  });
});

// =============================================================================
// searchTrack
// =============================================================================

describe("Audius: searchTrack", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should find track with structured query", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }),
    );

    const result = await audiusAdapter.searchTrack({
      title: "Unlucky (Work in progress)",
      artist: "deadmau5",
    });

    expect(result.found).toBe(true);
    expect(result.track).toBeDefined();
    expect(result.matchMethod).toBe("search");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("should return not found for empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));

    const result = await audiusAdapter.searchTrack({
      title: "Nonexistent Song",
      artist: "Nobody",
    });

    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });

  /**
   * Audius answers a search without results with an empty list, so an error
   * status is an outage. Returning "not found" would make the resolver skip
   * Audius for that track for a month.
   */
  it("throws when the search fails rather than answering not found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 500 }));

    await expect(audiusAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toThrow(/500/);
  });

  it("throws when the album search fails rather than answering not found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 429 }));

    await expect(audiusAdapter.searchAlbum({ title: "Test", artist: "Test" })).rejects.toThrow(/429/);
  });

  it("answers not found for an empty search result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ data: [] }));

    await expect(audiusAdapter.searchTrack({ title: "Test", artist: "Test" })).resolves.toMatchObject({
      found: false,
    });
  });

  it("should use combined query when title equals artist (free text)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }));

    await audiusAdapter.searchTrack({
      title: "deadmau5 Unlucky",
      artist: "deadmau5 Unlucky",
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/tracks/search?query=");
  });

  it("should pick best match from multiple results", async () => {
    const multiResults = {
      data: [
        MOCK_AUDIUS_TRACK,
        { ...MOCK_AUDIUS_TRACK, id: "Xyz", title: "Something Else", user: { id: "1", handle: "other", name: "Other" } },
      ],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(multiResults), { status: 200 }));

    const result = await audiusAdapter.searchTrack({
      title: "Unlucky (Work in progress)",
      artist: "deadmau5",
    });

    expect(result.found).toBe(true);
    expect(result.track?.title).toBe("Unlucky (Work in progress)");
  });
});

// =============================================================================
// metadata
// =============================================================================

describe("Audius: adapter metadata", () => {
  it("should have correct id", () => {
    expect(audiusAdapter.id).toBe("audius");
  });

  it("should have correct displayName", () => {
    expect(audiusAdapter.displayName).toBe("Audius");
  });
});
