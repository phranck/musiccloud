import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpstreamUnavailableError } from "../../../../lib/infra/upstream-unavailable";
import { deezerAdapter } from "../adapter";
import recordedAlbumSearch from "./fixtures/random-access-memories-search.json";

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
  it("rejects malformed direct recording metadata at the provider boundary", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ...MOCK_DEEZER_TRACK, duration: "invalid" })),
    );
    await expect(deezerAdapter.getTrack("3135556")).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

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
  it("rejects malformed identifier metadata instead of accepting a corrupt observation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ...MOCK_DEEZER_TRACK, isrc: 42 })),
    );
    await expect(deezerAdapter.findByIsrc("GBDUW0000059")).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

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

  /**
   * The resolver records a returned `null` as "Deezer does not carry this
   * track" for a month, so a server error has to throw instead.
   */
  it("throws on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Server Error", { status: 500 }));

    await expect(deezerAdapter.findByIsrc("GBDUW0000059")).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it("throws on a quota error envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { type: "Exception", message: "Quota limit exceeded", code: 4 } }), {
        status: 200,
      }),
    );

    await expect(deezerAdapter.findByIsrc("GBDUW0000059")).rejects.toBeInstanceOf(UpstreamUnavailableError);
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

  it("finds a recording through a validated clean-title fallback without changing its display metadata", async () => {
    const query = {
      title: "Hurt People feat. @marinalatorracaofficial of @BattleBeast",
      artist: "DARKK",
      artists: ["DARKK"],
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const text = new URL(String(input)).searchParams.get("q");
      return new Response(
        JSON.stringify({
          data:
            text === "DARKK Hurt People"
              ? [
                  {
                    ...MOCK_DEEZER_TRACK,
                    id: 4275996402,
                    title: "Hurt People",
                    artist: { id: 1, name: "DARKK" },
                    duration: 201,
                    isrc: "DEZC62699545",
                    link: "https://www.deezer.com/track/4275996402",
                  },
                ]
              : [],
        }),
        { status: 200 },
      );
    });

    const result = await deezerAdapter.searchTrack(query);

    expect(result.found).toBe(true);
    expect(result.track?.isrc).toBe("DEZC62699545");
    expect(query.title).toBe("Hurt People feat. @marinalatorracaofficial of @BattleBeast");
  });

  it.each([
    ["DARKK", "Hurt People"],
    ["Daft Punk", "One More Time"],
    ["Metallica", "Enter Sandman"],
    ["The Weeknd", "Blinding Lights"],
  ])("finds %s / %s after an empty structured search", async (artist, title) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify({
            data:
              new URL(String(input)).searchParams.get("q") === `${artist} ${title}`
                ? [
                    {
                      ...MOCK_DEEZER_TRACK,
                      title,
                      artist: { id: 1, name: artist },
                    },
                  ]
                : [],
          }),
          { status: 200 },
        ),
    );
    const result = await deezerAdapter.searchTrack({ title, artist });
    expect(result.found).toBe(true);
    expect(result.track?.artists).toEqual([artist]);
    expect(result.track?.title).toBe(title);
  });

  it.each([
    { title: "Hurt People", artist: "Unrelated Artist", duration: 200 },
    { title: "XYZ", artist: "DARKK", duration: 200 },
    { title: "Hurt People (Remix)", artist: "DARKK", duration: 200 },
    { title: "Hurt People", artist: "DARKK", duration: 251 },
    { title: "Hurt People", artist: "DARKK", duration: 200, sourceTitle: "Hurt People (feat. Marina) (Live)" },
  ])("rejects an incompatible broad-search recording: $title / $artist / $duration", async (candidate) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify({
            data: new URL(String(input)).searchParams.get("q")?.startsWith("artist:")
              ? []
              : [
                  {
                    ...MOCK_DEEZER_TRACK,
                    title: candidate.title,
                    artist: { id: 1, name: candidate.artist },
                    duration: candidate.duration,
                  },
                ],
          }),
          { status: 200 },
        ),
    );
    const result = await deezerAdapter.searchTrack({
      title: "sourceTitle" in candidate ? candidate.sourceTitle : "Hurt People",
      artist: "DARKK",
      durationMs: 200000,
    });
    expect(result.found).toBe(false);
  });

  it.each([
    { title: "" },
    { artist: { id: 27, name: "" } },
    { duration: -1 },
    { isrc: 42 },
    { album: { cover_xl: 42 } },
  ])("rejects malformed consumed recording metadata: %j", async (patch) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ data: [{ ...MOCK_DEEZER_TRACK, ...patch }] })),
    );
    await expect(
      deezerAdapter.searchTrack({ title: "Harder Better Faster Stronger", artist: "Daft Punk" }),
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it("rejects a malformed successful search reply instead of caching a clean miss", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ unexpected: [] }), { status: 200 }),
    );
    await expect(deezerAdapter.searchTrack({ title: "Hurt People", artist: "DARKK" })).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });

  it("should return not found for empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ data: [], total: 0 }), { status: 200 }),
    );

    const result = await deezerAdapter.searchTrack({
      title: "Nonexistent Song",
      artist: "Nobody",
    });

    expect(result.found).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("throws on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Error", { status: 500 }));

    await expect(deezerAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });

  it("throws on a quota error envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { type: "Exception", message: "Quota limit exceeded", code: 4 },
        }),
        { status: 200 },
      ),
    );

    await expect(deezerAdapter.searchTrack({ title: "Test", artist: "Test" })).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
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

  it("includes album: operator in q-string when query.album is provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 100,
              title: "Karma Police",
              duration: 261,
              link: "https://www.deezer.com/track/100",
              artist: { id: 1, name: "Radiohead" },
              album: { id: 10, title: "OK Computer", cover_medium: "https://cdn/cover.jpg" },
              isrc: "GBAYE9700001",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await deezerAdapter.searchTrack({
      title: "Karma Police",
      artist: "Radiohead",
      album: "OK Computer",
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("artist%3A%22Radiohead%22");
    expect(calledUrl).toContain("track%3A%22Karma%20Police%22");
    expect(calledUrl).toContain("album%3A%22OK%20Computer%22");
  });
});

describe("Deezer: album search contract", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("finds the existing album when the structured provider query is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const query = new URL(String(input)).searchParams.get("q");
      return Response.json(query === "Daft Punk Random Access Memories" ? recordedAlbumSearch : { data: [], total: 0 });
    });
    const result = await deezerAdapter.searchAlbum({ title: "Random Access Memories", artist: "Daft Punk" });
    expect(result.found).toBe(true);
    expect(result.album?.sourceId).toBe("6575789");
    expect(result.album?.title).toBe("Random Access Memories");
    expect(result.album?.artists).toEqual(["Daft Punk"]);
  });
});

// =============================================================================
// searchTrackWithCandidates
// =============================================================================

describe("Deezer: searchTrackWithCandidates", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

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
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ data: items, total: 5 }), { status: 200 }),
    );

    const freeText = "anything goes";
    const result = await deezerAdapter.searchTrackWithCandidates({
      title: freeText,
      artist: freeText,
    });

    // Free-text decay: top candidate is 0.85, last is at least 0.4 floor.
    expect(result.candidates[0].confidence).toBeCloseTo(0.85, 5);
    expect(result.candidates.at(-1)!.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it("throws on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("nope", { status: 500 }));

    await expect(deezerAdapter.searchTrackWithCandidates({ title: "x", artist: "y" })).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });

  it("returns empty candidates when Deezer returns API error envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
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
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ data: [], total: 0 }), { status: 200 }),
    );

    const result = await deezerAdapter.searchTrackWithCandidates({
      title: "Nonexistent",
      artist: "Nobody",
    });

    expect(result.candidates).toEqual([]);
    expect(result.bestMatch.found).toBe(false);
  });

  it("caps the candidate list at MAX_CANDIDATES (24)", async () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      ...MOCK_DEEZER_TRACK,
      id: 2000 + i,
      title: `Track ${i}`,
      artist: { id: i, name: `Artist ${i}` },
    }));
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ data: items, total: 30 }), { status: 200 }),
    );

    const result = await deezerAdapter.searchTrackWithCandidates({
      title: "free text",
      artist: "free text",
    });

    expect(result.candidates.length).toBeLessThanOrEqual(24);
  });

  it("emits limit=24 in the search URL", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(JSON.stringify({ data: [], total: 0 }), { status: 200 }));

    await deezerAdapter.searchTrackWithCandidates({ title: "x", artist: "y" });

    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("limit=24");
  });

  it("includes album: operator in q-string when query.album is provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 100,
              title: "Karma Police",
              duration: 261,
              link: "https://www.deezer.com/track/100",
              artist: { id: 1, name: "Radiohead" },
              album: { id: 10, title: "OK Computer", cover_medium: "https://cdn/cover.jpg" },
              isrc: "GBAYE9700001",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await deezerAdapter.searchTrackWithCandidates!({
      title: "Karma Police",
      artist: "Radiohead",
      album: "OK Computer",
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("album%3A%22OK%20Computer%22");
  });
});

// =============================================================================
// artist pictures
// =============================================================================

/** The stock picture for an artist without one, under the empty-string MD5, where Deezer's CDN redirects the empty-hash form. */
const SILHOUETTE = "https://e-cdns-images.dzcdn.net/images/artist/d41d8cd98f00b204e9800998ecf8427e/1000x1000.jpg";

describe("Deezer: artist pictures", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("gives an artist without a picture no image in getArtist, so another service's picture is used", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 27, name: "Daft Punk", picture_xl: SILHOUETTE, picture_big: SILHOUETTE }), {
        status: 200,
      }),
    );

    const artist = await deezerAdapter.getArtist("27");

    expect(artist.name).toBe("Daft Punk");
    expect(artist.imageUrl).toBeUndefined();
  });

  it("gives the best search hit without a picture no image in searchArtist", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: 27, name: "Daft Punk", picture_xl: SILHOUETTE }] }), {
        status: 200,
      }),
    );

    const result = await deezerAdapter.searchArtist({ name: "Daft Punk" });

    expect(result.found).toBe(true);
    expect(result.artist?.imageUrl).toBeUndefined();
  });

  it("gives an artist whose picture has the empty hash Deezer's API sends no image in getArtist", async () => {
    const emptyHash = (size: number) => `https://cdn-images.dzcdn.net/images/artist//${size}x${size}-000000-80-0-0.jpg`;
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 81722612,
          name: "Demo Band",
          picture_xl: emptyHash(1000),
          picture_big: emptyHash(500),
          picture_medium: emptyHash(250),
        }),
        { status: 200 },
      ),
    );

    expect((await deezerAdapter.getArtist("81722612")).imageUrl).toBeUndefined();
  });

  it("keeps a real picture", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 27, name: "Daft Punk", picture_xl: "https://cdn/daft-punk.jpg" }), {
        status: 200,
      }),
    );

    expect((await deezerAdapter.getArtist("27")).imageUrl).toBe("https://cdn/daft-punk.jpg");
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
